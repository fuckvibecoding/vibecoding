# Codex lead↔subagent 机制调查（rust-v0.142.5）

> 状态: Research Archive（`expert-team-mothx-proposal.md` 的机制设计依据，只读归档）
> 日期: 2026-09-06
> 对象: `openai/codex` 标签 `rust-v0.142.5`（ESM 提案引用的同一版本），`codex-rs/` 目录
> 方式: `git clone --depth 1 --filter=blob:none --sparse --branch rust-v0.142.5`（经代理 `http://127.0.0.1:7890`），checkout 位于 `tmp/codex-src`，保留至专家团 Phase 2 结束供实现对照
> 旁证: 本机 `~/.codex/goals_1.sqlite`（goal mode 为已发布特性，thread_goals SQLite 持久化），与源码阅读一致

调查目的：为 MothX 专家团方案确定"成员完成如何触达 lead、lead 何时被自主唤醒"以及 lead↔subagent 关系各面的参照实现。以下路径均相对 `codex-rs/`。

## 1. 唤醒与续跑机制

| 事实 | 出处 |
|---|---|
| 两档投递模式：`send_message`=QueueOnly（"delivered promptly. Does not trigger a new turn."），`followup_task`=TriggerTurn（唤醒空闲目标；运行中目标在消息边界/工具调用完成后尽快投递） | `core/src/tools/handlers/multi_agents_v2/message_tool.rs`（MessageDeliveryMode）、`multi_agents_spec.rs` |
| `followup_task` 禁止指向 root（"Follow-up tasks can't target the root agent"） | `multi_agents_v2/message_tool.rs` handle_message_string_tool |
| 成员终态 → 自动完成通知入父邮箱，固定 `trigger_turn=false`（**完成从不唤醒**） | `core/src/agent/control.rs:464-486` |
| 完成通知内容：Completed(含最终消息)/Errored(截断+下一步动作提示)/Shutdown/NotFound；Running/Interrupted 不产生通知 | `core/src/session_prefix.rs:27-44` |
| 唤醒调度器：仅当存在 trigger_turn 待处理邮件且会话空闲（active_turn 互斥检查）才开合成 turn；Interrupted abort 后复查 | `core/src/tasks/mod.rs:453-492,525-527`（maybe_start_turn_for_pending_work*） |
| 只有 UserInput 与 trigger_turn 邮件能启动 turn | `core/src/agent/control/execution.rs:96-99`（op_starts_turn） |
| 运行中 turn 在迭代边界 drain 邮箱（"delivered promptly" 的实现；按投递序；邮箱为内存态 InputQueue，持久化发生在消息进入历史时） | `core/src/session/input_queue.rs:197-225`（get_pending_input → drain_mailbox_input_items） |
| `wait_agent`：阻塞等待任一邮箱活动/用户 steering 提前返回/超时（配置 min 2.5s、max 120s、default 30s）；只返回摘要不返回内容；发 CollabWaitingBegin/End 事件 | `core/src/tools/handlers/multi_agents_v2/wait.rs` |
| 共享空闲 gate：PendingTriggerTurn 让位、Plan 模式拒绝、busy 拒绝；空闲 turn 预留后三次复查 trigger 邮箱 | `core/src/session/inject.rs:36-130`（try_start_turn_if_idle） |
| thread-idle 生命周期仅在 active turn 清空且无 trigger 待处理邮件时发出（goal 续跑的唯一驱动点） | `core/src/tasks/mod.rs:780-800`、`core/src/tasks/lifecycle.rs:41-56` |
| goal mode：`on_thread_idle` → `continue_if_idle`；单信号量锁跨"读目标→开 run"窗口；要求 goal.status==Active；gate 拒绝仅记 debug（下次空闲再试，无重试循环） | `ext/goal/src/extension.rs:154-168`、`ext/goal/src/runtime.rs:359-415` |
| 目标在 turn 进行中设立 → steering 注入活跃 turn，不新开 run | `ext/goal/src/runtime.rs:417-430`（inject_active_turn_steering → inject_if_running） |
| `spawn_agent`：`agent_type`=命名 role（配置层机制：developer_instructions 人设/reasoning effort/超时；内置 awaiter、explorer + 用户 TOML role 文件）；`fork_turns=none/all/N` 传递上下文；全历史 fork 禁 role/model 覆盖；非阻塞返回 canonical task_name+nickname | `multi_agents_v2/spawn.rs`、`core/src/agent/role.rs`、`core/src/agent/builtins/*.toml` |
| v2 允许嵌套 spawn；并发 cap `max_concurrent_threads_per_session` | `multi_agents_spec.rs` spawn_agent_tool_description_v2、`core/src/config/config_tests.rs:10113-10188` |
| LLM 面向调度纪律：wait 节俭、仅关键路径阻塞；成员运行时做非重叠本地工作；禁止反射式反复 wait；委派需具体、有界、写集不相交 | `multi_agents_spec.rs` spawn_agent_tool_description（usage hints） |
| 代理间消息加密入 rollout | `InterAgentCommunication::new_encrypted`、`multi_agents_spec.rs`（.with_encrypted()） |

## 2. lead ↔ subagent 关系全貌

| 关系面 | 实测事实 | 出处 |
|---|---|---|
| 结构与身份 | 代理树用 canonical AgentPath（`/root/task1/task_3`）；相对名按调用者自身 path 解析；nickname 从 role 候选名单预留（冲突加后缀）；AgentMetadata{path, nickname, role, last_task_message}；path/nickname/slot 均 RAII 预留-提交 | `core/src/agent/registry.rs`、`agent_resolver.rs`、`control.rs:290-303` |
| 上下文继承 | 子配置 = 父有效配置 + 从**活跃 turn** 刷新 model/provider/reasoning/developer_instructions/approval_policy/permission_profile(sandbox)/cwd（注释明言防止子与父在审批/沙箱/cwd 上不一致）；environments/exec_policy 一并继承 | `multi_agents_common.rs` build_agent_shared_config / apply_spawn_agent_runtime_overrides、`control/spawn.rs:232-240` |
| 历史传递 | `fork_turns=none/all/N`；全历史 fork 禁 agent_type/model/reasoning 覆盖；forked rollout 过滤旧 usage hint 并注入 `subagent_usage_hint_text`（root/subagent 提示分流） | `spawn.rs:439-498`、reject_full_fork_spawn_overrides |
| lead 感知成员 | ① 每 turn world state 注入存活子代理名册（受 include_environment_context 门控）；② `list_agents`（path 前缀过滤、排序）；③ FINAL_ANSWER 完成包络（assistant-role contextual fragment：`Message Type: FINAL_ANSWER / Task name / Sender / Payload`，截断预算 1000/包络 100/错误 900，错误附 ERROR_NEXT_ACTION）；④ wait_agent 摘要 + CollabWaiting 事件；v1 旧路径为 `<subagent_notification>` user-role JSON 片段 | `session/mod.rs:3041-3051`、`context/inter_agent_completion_message.rs`、`context/subagent_notification.rs`、`session_prefix.rs` |
| 成员感知 lead | 初始任务以 InterAgentCommunication（加密）从父 path 送达；canonical 名随消息告知；可 send_message 给父/兄弟（queue-only）；不可 followup_task 指向 root | `spawn.rs`、`message_tool.rs` |
| 状态模型 | 事件派生：TurnStarted→Running；TurnComplete→Completed(携 last_agent_message)；abort(Interrupted/BudgetLimited)→Interrupted（**非终态**）；Error→Errored；ShutdownComplete→Shutdown；is_final 排除 PendingInit/Running/Interrupted | `core/src/agent/status.rs` |
| 生命周期耦合 | 成员为常驻线程：V2Residency LRU（容量满先卸载，无法卸载才 AgentLimitReached；消息前 ensure_v2_agent_loaded 重载）；`interrupt_agent` 只中断当前 turn、代理保留；`close_agent`(v1) 标记持久 spawn edge Closed 并关闭自身+全部存活后代；shutdown 前先 flush 子 rollout；`resume_agent_from_rollout` 可连带恢复后代 | `control/residency.rs`、`control/legacy.rs`、`control/spawn.rs:523-600` |
| spawn 授权模式 | MultiAgentMode None / ExplicitRequestOnly / Proactive——可重复注入的 developer-role 片段，后续注入显式作废先前 | `context/multi_agent_mode_instructions.rs` |
| 并发治理 | 会话级 cap + V2 子代理会话 execution-limited（专用限流器）+ residency 容量三层叠加 | `control/execution.rs:80-107`、`residency.rs` |

## 3. 审批路由、模式注入、生命周期收口

| 关系面 | 实测事实 | 出处 |
|---|---|---|
| 模式权威注入 | collaboration mode = 可重复注入的 developer-role 片段（`<collaboration_mode>` 标签）；"模式只因新 developer 消息而改变，用户请求与工具描述都不能改变它"；四模板 default/execute/pair_programming/plan | `collaboration-mode-templates/templates/*.md`、`context/collaboration_mode_instructions.rs` |
| Plan 模式语义 | 严格禁 mutation 直至 developer 消息显式结束；用户要求执行 = "plan the execution"；计划须 decision-complete（"handed to another engineer or agent to be implemented right away"） | `templates/plan.md:3-40` |
| 子审批/沙箱继承 | approval_policy、permission_profile(sandbox)、cwd 从父活跃 turn 刷新；approvals_reviewer 一并继承 | `multi_agents_common.rs` apply_spawn_agent_runtime_overrides |
| 审批事件归属 | ExecApprovalRequestEvent 无 agent 身份字段；归属靠"事件在哪个线程流上" + ThreadData{agent_nickname, agent_role} 元数据 | `protocol/src/approvals.rs:218-275`、`app-server-protocol/src/protocol/v2/thread_data.rs:171-173` |
| UI 多线程路由 | TUI per-thread 事件通道、后台请求队列、agent 导航（可打开成员线程视图处理审批/看转录） | `tui/src/app/thread_routing.rs`、`background_requests.rs`、`agent_navigation.rs` |
| interrupt_agent 守卫 | root 不可被中断；不可自我中断（"return your result and let the parent interrupt you if needed"） | `multi_agents_v2/interrupt_agent.rs:30-90` |
| v2 无 close 工具 | v2 工具面 = spawn/send_message/followup_task/wait_agent/interrupt_agent/list_agents；成员常驻靠 LRU 卸载；close_agent 仅存于 v1 | `multi_agents_v2.rs`、`multi_agents/close_agent.rs` |
| 关闭/退出收口 | 线程关闭收集全子树（持久 spawn edge + 内存存活后代合并去重）；进程退出 `shutdown_all_threads_bounded(timeout)` 有界关停 | `thread_manager.rs:555-586,834` |

## 4. MothX 采纳结论

采纳的精髓（四件，落入 `expert-team-mothx-proposal.md`）：

1. **完成通知包络**（FINAL_ANSWER 语义：消息类型/成员身份/终态/载荷摘要，错误截断 + 下一步动作提示，机器可读标记、不冒充用户意图）→ 提案 §6.1；
2. **邮箱在 run 输入边界 drain**（内存态邮箱；运行中"尽快送达"不打断工具调用；持久化靠消息进入历史，无独立存储）→ 提案 §6.1/§9；
3. **wait 有界阻塞合流**（只回摘要不回内容；超时参考 default 30s/min 2.5s/max 120s）→ 提案 §6.1；
4. **无唤醒语义**（完成通知从不直接开 run；自主续跑仅"空闲 + 目标活跃"经共享 gate；排队结果搭续跑输入 drain 顺风车；目标设立双路 = 空闲续跑 / 活跃 run steering）→ 提案 §8/§9。

另采纳：调度纪律提示词（wait 节俭/非重叠本地工作/禁反射式 wait，提案 §7）、plan 模板 decision-complete 理念（提案 §12 架构师产出规范）、身份段权威性注入语义（提案 §6.1）。

有意不吸收（MothX 现状已覆盖或刻意差异）：

| Codex 机制 | MothX 取舍 |
|---|---|
| 成员常驻线程 + LRU 驻留 + rollout 复活（followup_task/resume_agent） | 成员瞬态，追加轮次 = 按 AgentDef 重新 spawn；复活/驻留列后续扩展 |
| 独立线程审批面 + 多线程导航 | 单对话面转发（`internal/agent/subagent.go` 已有审批转发携 AgentID）+ DecisionService 统一归属，补 memberId 人设元数据 |
| 并发三层治理 | 复用既有 `SubAgentPolicy`（MaxChildren/TotalTimeout/Validate），仅调参 |
| 代理树 canonical path/nickname 体系 | 扁平单层：AgentDef id + manifest 人设显示名 |
| 代理间消息加密 | 成员消息为普通会话内容（事件可回放），不加密 |
| v2 允许嵌套 spawn | 保持禁止嵌套不变量（hub-and-spoke 结构保证） |
| Plan 模式 gate 拒绝自主空闲工作 | 保持 MothX ESM 2026-09-03 决议（ResolveUnattendedMode 无值守续跑），不回退 |
| 逐 turn 动态 world-state 存活名册 | 静态定义 roster（BuildAgent 一次成型），存活状态由事件 + 邮箱承担 |
| MultiAgentMode 三档授权片段 | team 绑定即强制多代理（ResolvePolicy 单次解析，不可降级） |
| close 工具 + 子树收口 | `subagent_destroy` + 子 runCtx 派生自父（取消级联）+ `SessionRuntime.Shutdown` |
