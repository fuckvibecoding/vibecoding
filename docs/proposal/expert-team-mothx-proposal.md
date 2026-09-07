# MothX 主角团（Expert Team）落地方案

> 状态: Implemented（Phase 1–6 均已完成；实施与验证记录见 §15）
> 日期: 2026-09-06（实施状态同步于同日）
> 参考:
> - 原 `expert-team-wrapper-scheme.md`（厂商"桌面 Host + Agent CLI"主角团封装方案逆向调研）：**已于 2026-09-06 并入本提案**，本提案是主角团功能的唯一实施文档。产品理念与生态溯源见 §1，生态包格式与转换规则见 §5/§12；厂商 Host 机制（远程分发、volatile plugin switch、env 门控、Host 侧成员状态机）均由 §3 的 MothX 原生机制取代，不再单独成文
> - `codex-lead-subagent-research.md`：lead↔subagent 机制调研归档（§7/§9 语义设计依据）
> - `enable-supervisor-mode.md` §16（ESM 现状）、`session-fork-and-message-branch-proposal.md`（Implemented）、`dynamic-workflows-javascript-proposal.md`（能力声明参照）、`AGENTS.md`（架构不变量，§11 对照）

---

## 1. 目标与非目标

**来源与生态**（承自已并入的厂商方案调研）：产品理念来自对某厂商桌面 Host 在通用 Agent CLI 之上封装主角团的逆向分析；其生态实测 427 个专家包（375 个 agent 型 + 52 个 team 型，如 SoftwareCompany、CloudOpsTeam、TradingAgentTeam、GPTResearcherTeam），全部是"manifest + 人设 Markdown"的纯内容包，可按 §12 转换规则机械移植进本提案格式——这是"主角团 = 内容包、发布即上线"的生态依据。厂商 Host 的实现机制（每会话 CLI 进程、REST 插件切换、env 门控、Host 状态机）不适用于 MothX，已由 §3 架构原生替代。

主角团 = 可分发的人设内容包 × 「命名 agent 定义」运行时原语 × ESM 目标治理 × 三端薄投影。核心原则：

1. **编排零代码**：团队 SOP 全部写进 lead 人设提示词，运行时只出通用原语；
2. 上线/调整一个主角团 = 发布一个内容包，不改运行时代码；
3. 专家身份是**会话级**状态（header 持久化、fork 切换），不污染全局；
4. 成员触达与唤醒语义由**运行时结构保证**（完成通知、邮箱边界投递、无唤醒），不依赖提示词纪律；
5. 事件唯一语义源，TUI/WebUI/desktop/channels 只做薄投影。

### 目标

- 一等 expert bundle 格式与独立 ExpertCenter（本地目录源，接口预留 remote 位）。
- 「命名 agent 定义」（AgentDef）通用原语：人设 + 声明式能力覆盖，供给 `subagent_spawn`、lead 提示词叠加与 roster 注入；专家包是第一个供给方。
- 会话级专家绑定、fork 式切换、team 型强制多代理能力（单次解析、不可降级）。
- 成员完成触达：完成通知包络 + 内存邮箱迭代边界投递 + `subagent_wait` 有界合流 + 无唤醒语义（§9）。
- 与 ESM 正交组合：长任务治理、质量关卡、空闲续跑全部复用既有机制。
- TUI → WebUI → desktop(ACP) 依次落地；种子专家包 `software-company`。

### 非目标 / 不做

- 远程专家市场、下载/解压、企业专属清单（ExpertCenter 接口预留，本期零远程代码）。
- 嵌套团队、成员直连通信（结构禁止）。
- **零新表、零新 canonical 事件类型、零新 run 状态机**：邮箱为内存态（通知随会话历史自然持久化）；waiting 不加专属事件（tool_call 投影已足够）。
- 后续扩展（§14）：成员级 model 覆盖、`subagent_report`、wait 的 steering 提前返回、stats expert 维度、成员详情转录视图、成员复活/驻留。
- 每会话多专家组合（一会话一专家，切换走 fork）；channels 专属 UX（绑定天然可用，投影最小）。

---

## 2. 决策记录

| # | 议题 | 结论 |
|---|------|------|
| 1 | 专家包格式 | 新建一等 expert bundle，不复用/扩展 skill 包格式 |
| 2 | 分发 | 独立 ExpertCenter 服务；本期本地写死（目录源 + 内置种子包），不做远程仓库 |
| 3 | 成员人设注入 | 一等 AgentDef 运行时原语，禁止 `system_prompt_extra` 字符串搬运 |
| 4 | 换专家语义 | 复用已有 session fork：消息边界开新分支绑定新专家，旧分支身份与历史完整保留 |
| 5 | 落地顺序 | TUI → WebUI → desktop(ACP)；一个核心、所有 UI 薄封装 |
| 6 | 长任务治理 | 与 ESM 正交组合；用量治理尊重 ESM 预算移除决议（观测量 + usage_limited 熔断） |
| 7 | 成员完成唤醒 | 完成通知从不直接唤醒 lead；运行中靠邮箱迭代边界投递 + wait 合流；自主续跑仅由「会话空闲 + 目标活跃」触发（§9，依据见调研归档） |
| 8 | ESM objective 创建权 | 不变量保持：**只有用户**可经 `/esm`（或 UI 等价入口）创建目标 |
| 9 | 成员能力覆盖粒度 | 参照 workflow 模式：`AgentTask` 同款声明式字段（mode/tools/max_iterations/work_dir），运行时强制、受会话策略约束 |
| 10 | 种子包 | 移植 `software-company`（lead + PM/架构/工程师/QA）作为格式与编排参照实现 |
| 11 | 改造范围 | 只吸收 lead↔subagent 精髓，不全盘改造：现状已承载的一律复用（并发治理=`SubAgentPolicy`、审批转发、fork、事件持久化），不吸收清单见调研归档 §4 |

---

## 3. 总体架构与变更面

```
┌────────────────────────── 内容层（数据，非代码） ──────────────────────────┐
│ ExpertCenter（独立服务域）                                                  │
│   Source 抽象: LocalDirectorySource（本期唯一实现）                          │
│     builtin（go:embed 种子包） < ~/.mothx/experts/ < <project>/.mothx/experts/ │
│   [预留] RemoteSource：届时复用 skillhub 安全 zip/信任域机制，服务保持独立      │
│ Expert Bundle = expert.json(manifest) + agents/*.md(人设) + skills/ avatars/ │
└──────────────────────────────────┬─────────────────────────────────────────┘
                                   │ 装载（会话绑定 expertId 时）
┌────────────────────────────── Runtime 核心 ────────────────────────────────┐
│ internal/expert: bundle 加载/校验/manifest 解析/人设解析（AgentDef 供给方）    │
│ internal/agentruntime:                                                     │
│   ResolveSource/ResolvePolicy: expertId → 身份/能力/工具单次解析              │
│     · team 型 → 强制装配 AgentManager + subagent 工具集（不可降级）           │
│   SessionRuntime/Builder: AgentDef 注册表装配、lead 人设叠加、roster 注入      │
│   steering 组合点: 成员邮箱 drain + 适配器 steering 源合并（单点接线）         │
│ internal/agent: subagent_spawn(member) + subagent_wait（唯一新增工具）；      │
│                 完成通知格式化 + 成员邮箱（内存态）                           │
│ internal/esm: 续跑 run 携 lead 人设 + roster；目标设立双路                    │
│ canonical 事件: 子代理事件已带 AgentID；补 memberId/expertId 与展示快照       │
│ 持久化: session.Header 增 ExpertID 字段；sessions/sub_session 加 expert_id     │
│         列迁移（零新表；完成通知仍经 steering 随会话历史持久化）                │
└──────────────────────────────────┬─────────────────────────────────────────┘
                                   │ 同一事件流，仅投影不同
┌────────────────────────────── 薄适配器层 ───────────────────────────────────┐
│ TUI: /expert 命令、roster/成员状态、ESM 面板复用                              │
│ WebUI(serve): 专家面板、成员卡片（zh/en）、/esm 指令入口复用                   │
│ desktop(ACP): set_config_option/mothx.dev 扩展、session/fork（已有）、卡片投影 │
│ channels: 绑定可用（同一 Runtime 路径），投影最小化                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

变更面一览：

| 变更面 | 性质 | 内容 |
|---|---|---|
| `internal/expert` | 新域 | bundle 格式/校验、LocalDirectorySource、AgentDef 解析 |
| `internal/agentruntime` | 修改 | expertId 绑定解析、AgentDef 注册表装配、lead 叠加与 roster 注入、steering 组合点、team 强制多代理 |
| `internal/agent` | 修改 | `subagent_spawn.member` 参数与能力覆盖映射、`subagent_wait` 新工具、完成通知格式化、内存邮箱 |
| `internal/esm` | 修改 | 续跑 run 携 lead 人设 + roster、目标设立双路、critic/audit 工具隔离核查 |
| `internal/session`(+`internal/dao`) | 修改 | `session.Header.ExpertID` 字段与 `sessions`/`sub_session.expert_id` v41 迁移；DAO 负责读写与 fork 继承 |
| canonical 事件 | 修改 | spawn/进度/终态事件补 memberId/expertId/显示名/emoji/role 的不可变展示快照（无新事件类型） |
| TUI / WebUI / desktop / CLI | 修改 | §10 薄投影 + `/expert`、`--expert`、serve API、ACP config option |
| `experts/` 种子包 | 新增 | software-company + 单专家种子（go:embed builtin） |

### 3.1 默认路径不变性（未绑定专家 = 零行为变化）

主角团全部能力为 opt-in：不设置 expertId 的会话，TUI/WebUI/desktop 的启动与使用与今日完全一致。

| 面 | 不变性保证 |
|---|---|
| TUI 默认启动 | 无专家目录扫描（ExpertCenter 列表懒加载：`/expert` 与面板访问才触发）；subagent 工具仍由 `--multi-agent` 门控（现状 main_util.go:113 / factory.go:209 不动）；`/expert` 是附加命令，`--expert` 是附加 flag |
| 系统提示词 | 身份段/roster 段仅在绑定 expertId 时注入；未绑定会话的提示词逐字节不变（frozen prompt 与双标记缓存策略不受影响） |
| 工具面 | `subagent_spawn.member` 为可选附加参数，缺省行为不变；`subagent_wait` 仅随 team 绑定会话的 subagent 工具集注册；delegate/workflow/ESM 的既有工具与参数不变 |
| 策略 | `SubAgentPolicy` 默认值不变（MaxChildren=5 等），仅 team 绑定时按解析调参；team 强制多代理只对绑定会话生效，普通会话仍由 `--multi-agent`/会话能力决定 |
| 事件 | memberId/expertId/显示名/emoji/role 是子代理事件的**附加字段**（仅多代理会话产生）；默认会话无新事件类型；渲染端对未知字段宽容（既有 Data JSON 附加字段先例） |
| 数据 | `session.Header.ExpertID` 为 omitempty 附加字段；SQLite 以 v41 `add_sessions_expert_id` 迁移补齐 `sessions` 与 `sub_session` 的 `expert_id` 列，旧会话可读；零新表 |
| ESM | 无专家时 `/esm` 用法完全如旧（角色流水线/guidance/断路器不变）；只有 team 绑定 + 目标活跃的续跑 run 才携 lead 人设 |
| WebUI/desktop | 专家面板是附加视图（Sidebar 新入口，不动既有视图）；ACP config option 是附加项（旧客户端忽略、新客户端对旧运行时降级，既有 desktop 降级模式）；"思考中"判定对非 team 会话保持现有逻辑 |
| channels | 不受影响（不设置 expertId，强制 yolo 与绑定策略照旧） |
| 启动性能/体积 | 启动路径零新增工作；内置种子包为纯文本人设包（KB 级），体积影响可忽略 |

唯一触碰所有会话的共享接线：**agentruntime steering 组合点**（邮箱 drain + 适配器源合并，经 BuildAgent 路径）。不变性契约：无邮箱源注册时为行为 no-op，TUI 既有 ESM steering 的供给与顺序保持不变；用跨入口契约测试固化（含「默认会话 steering 序列不变」「默认会话工具集不变」用例）。

---

## 4. 分发层：ExpertCenter（本地写死，接口预留 remote）

- 新域 `internal/expert` 拥有 bundle 格式、装载、校验与 ExpertCenter source 抽象（`List / Get / Install` 形状）；**本期唯一实现是本地目录源，无任何网络代码**。
- 目录与优先级（skills 同款分层，低优先级被高优先级同名 shadow）：
  1. builtin：仓库 `experts/` 目录下的种子包，`go:embed` 进二进制（纯文本人设包，头像可选）；
  2. 全局：`~/.mothx/experts/{bundleName}/`；
  3. 项目：`<project>/.mothx/experts/{bundleName}/`。
- manifest 带 `schemaVersion`，装载时校验：结构完整性（lead 存在、memberAgents 与 agents/*.md 一一对应）、frontmatter 可解析、能力字段合法（mode 枚举、tools 为已知工具名）；校验失败的包列入 List 但标记 `invalid` 并附原因，不静默丢弃。
- 信任边界设在装载源：人设即系统提示词（这是特性），本期只有用户自管的本地目录与内置种子；未来 remote source 落地时必须复用 skillhub 已验证的安全机制（zip-slip/symlink/大小限制/信任域/安全扫描摘要），企业清单语义参照 `skillhub-market-protocol.md`，服务保持独立。

---

## 5. 格式层：Expert Bundle 契约

```
software-company/
├── expert.json                  ← manifest（一等格式）
├── agents/
│   ├── software-team-lead.md    ← lead 人设（role: lead）
│   ├── software-product-manager.md
│   ├── software-architect.md
│   ├── software-engineer.md
│   └── software-qa-engineer.md
├── skills/                      ← 可选，包内技能（装载进会话 skills，走既有 skills 通道）
└── avatars/                     ← 可选，成员卡片头像
```

`expert.json`（字段兼容既有生态包机械转换，转换规则见 §12.2）：

```jsonc
{
  "schemaVersion": 1,
  "name": "software-company",
  "expertType": "team",                     // "agent" | "team"（生态包的 "skill" 型不进本格式，见下）
  "agentName": "software-team-lead",        // agent 型必填（指向 agents/*.md 唯一人设）；team 型与 teamInfo.leadAgent 一致，保留以兼容生态包机械转换
  "displayName": { "zh": "一人公司", "en": "Software Company" },
  "categoryId": "engineering",
  "quickPrompts": [ { "zh": "…", "en": "…" } ],
  "defaultInitPrompt": { "zh": "…", "en": "…" },
  "teamInfo": {                             // team 型必填
    "leadAgent": "software-team-lead",
    "memberAgents": ["software-product-manager", "software-architect",
                     "software-engineer", "software-qa-engineer"]
  },
  "members": [                              // 纯 UI 人设元数据，运行时不消费
    { "id": "software-team-lead", "name": { "zh": "齐活林", "en": "Qi" },
      "profession": { "zh": "交付总监" }, "avatar": "avatars/lead.png", "role": "lead" },
    { "id": "software-engineer", "name": { "zh": "…", "en": "…" }, "role": "member" }
  ]
}
```

`agents/*.md` frontmatter（人设 + 能力；能力字段 = workflow `AgentTask` 的声明式对应，决策 9）：

```yaml
---
name: software-engineer          # 必须与文件名/manifest memberAgents 一致
description: 按设计文档批量实现代码，保持全局一致性
role: member                     # lead | member
emoji: 🔧
color: "#4A90D9"
vibe: 严谨、一次写完、不脚手架
mode: yolo                       # 可选；缺省继承会话策略解析结果
tools: [read, write, edit, bash, grep, find]   # 可选；缺省 = 会话默认工具集减去编排类工具
max_iterations: 80               # 可选；缺省用 SubAgentPolicy 默认
---
（正文 = 角色系统提示词：输入契约、工作模式、交付规范…）
```

能力覆盖生效规则（与"forced yolo 只控制 mode"同一原则）：frontmatter 能力在**会话策略边界内**生效——sandbox 等级、审批策略、高危命令硬保护、渠道强制模式一律来自会话解析结果，人设声明不得放宽；`mode` 声明经与 session mode 相同的策略解析（plan 会话中的成员声明 yolo 不产生写权限升级；裁剪规则以策略测试固化）。

- `expertType: "agent"`（单专家包）：必须声明 `agentName` 指向 agents/*.md 中的唯一人设（修复与 wrapper scheme 的规格缺口：无 teamInfo.leadAgent 时的人设指针）；只有人设叠加，无 roster/强制多代理；可带 `skills/`。
- 绑定 expert 后，`skills/` 与全局/项目技能进入**同一个** Runtime-owned `skills.Manager`：目录包按既有目录加载，内置包由 `fs.FS` 加载，随后覆盖同名普通技能；`skill_ref` 仍是唯一按需读取入口。未绑定 expert 不加载专家包技能。
- 生态包中 `expertType: "skill"` 型专家**不进 expert bundle 格式**：纯技能包由既有 skills/skillhub 机制承载，避免两套技能分发语义；转换器遇 skill 型包时应拒绝并提示走 skillhub。
- loader 只认 `expert.json` + `agents/*.md`，包内多余文件一律忽略。

---

## 6. 注入层：AgentDef 原语与会话绑定

### 6.1 AgentDef 原语（专家无关的通用能力）

- SessionRuntime 装配资源时（与 skills/contextfiles/MCP 同层），若会话绑定 expertId，由 `internal/expert` 解析 bundle，把 lead + members 装载进**会话级 AgentDef 注册表**（内存态，load/replay 时从 bundle 确定性重建，不入库）。
- **lead 定义** → BuildAgent 提示词叠加通道：专属"Expert Identity"段注入系统提示词（单一注入点在 system prompt builder，顺序：基础规则 → Expert Identity → 项目上下文；不允许适配器各自拼装）。
- **身份段权威性**：Expert Identity 与调度规范是运行时注入的权威内容——身份只因绑定/解绑/fork 而改变，用户文本、工具描述、成员产出都不能在 run 中改变它；注入段自带显式标记与"先前身份段作废"语义，避免叠加矛盾指令。
- **member 定义** → `subagent_spawn` 新增可选参数 `member: "<def-id>"`：运行时按 ID 从注册表解析人设提示词 + 能力覆盖（§5 规则），构造 AgentOptions 的路径与 workflow `Host.RunAgent(AgentTask)` 同构。无效 ID = 工具错误（成员命名由 schema 强制，不是提示词纪律）。`task` 参数语义不变。
- **roster 注入**：绑定 team 型专家时，系统提示词自动追加成员名册段（id、显示名、emoji、description）+ 调度规范（§7 工具规范），随 BuildAgent 一次成型（静态定义名册；成员存活状态由事件 + 邮箱承担，不逐 turn 重建）。
- 结构不变量（无需提示词维持）：成员 = 子代理，禁止嵌套 spawn（既有 registry 过滤），成员无同级消息通道 → hub-and-spoke 物理成立；绑定即建团，不存在建团工具。
- **成员邮箱与运行中投递**：成员终态由运行时自动格式化完成通知，入会话级成员邮箱（**内存态，runtime 属主，零新表**；通知经 steering 注入即入会话历史、自然持久可回放；进程退出时未投递结果由已进父 run 事件流的子事件兜底，与既有"TUI 瞬态子代理重启不恢复"债务同界、不加深）。lead run 进行中，邮箱在 agent loop 迭代边界经 `GetSteeringMessages` 钩子 drain 投递。**现状校正**：该钩子今日仅 TUI 接线（ESM steering 源，`tui/runtime.go:101`），本方案在 agentruntime 增加单一 steering 组合点（邮箱 drain + 适配器源合并，一处接线），全端生效，符合 One input/content path。完成结果"尽快送达"但不打断进行中的工具调用，lead 无需 LLM 轮询搬运结果；`subagent_status` 保留为显式查询。
- **完成通知包络**（语义参照调研归档 §1 FINAL_ANSWER）：`消息类型 + 成员 id/显示名 + 终态 + 载荷摘要`；截断 token 预算（参考值：总预算 1000、包络预留 100、错误载荷 900）；错误附下一步动作提示（= 按 AgentDef 重新 spawn）；注入带机器可读标记，**永不冒充用户意图**。
- **`subagent_wait`（唯一新增工具）**：lead 关键路径需要结果时调用；阻塞至任一邮箱活动或超时（有界默认，参考值 default 30s / min 2.5s / max 120s，配置化）；只返回活动摘要不返回内容（内容走邮箱 drain，天然批量合并）。UI 无需专属事件：wait 本身是一次工具调用，三端既有 tool_call 投影足以渲染"等待成员中"。
- **不做，列后续扩展**：`subagent_report`（成员→lead 中途消息——反馈回路已由"成员提前结束 + 完成结果说明"覆盖）；成员复活/驻留；wait 的 steering 提前返回；waiting 专属 canonical 事件。
- **并发治理**：复用既有 `SubAgentPolicy`（MaxChildren=5、TotalTimeout、Validate 已实现，`internal/agent/subagent.go:691-715`），team 绑定时按策略解析调参；不新造 cap 机制。
- 该原语的后续供给方（本期不做，形状已兼容）：用户自定义 agents 目录、ESM 角色人设、workflow phase 引用命名定义。

### 6.2 会话绑定与切换

- `expertId` 持久化在 `session.Header`，并由 `sessions`/`sub_session.expert_id` 列（v41 migration、DAO-only 读写）作为重开与 fork 的权威索引；replay/load 自动恢复身份；**一会话一专家**。
- 绑定/切换入口全部收敛到 agentruntime 单次解析（TUI `/expert bind`、serve session API、ACP config option 只是入口投影）：
  - 新会话绑定：创建时携带 expertId；
  - 已有会话"切换"：只能调用 Runtime-owned `ForkWithExpert`/`ForkSession`（消息边界 `AtSeq` = 当前进度）→ 新分支绑定新 expertId → 旧分支身份与历史原样保留（上下文延续 + 人设不串）。`SessionRuntime.SetExpert` 对两个非空且不同的 ID 返回 `ErrExpertSwitchRequiresFork`，不允许原地替换；
  - 会话中途解绑（expertId 置空）：重建 Agent 清除身份段与 roster；已产生的历史消息不动。
- team 型绑定 → ResolvePolicy 强制该会话装配 AgentManager + subagent 工具集（等效 `--multi-agent` 能力，按会话粒度），任何适配器/请求参数不得降级（强制 yolo 不可降级的同款纪律）；agent 型不改变工具能力。
- 消耗治理：绑定 team 型时 UI 提示"团队消耗通常为单专家数倍"；不新造预算机制（§8）；stats 的 expert 维度查询列后续。

---

## 7. 编排层：lead SOP 与成员提示词（零编排代码）

SOP 全部是种子包内的提示词内容，运行时不为任何团队流程写代码：

- **工作流路由**（lead 收到请求先判断）：⚡ 快速模式（≤10 源文件/单页应用/小游戏：工程师一次写完 → QA 验证）；🔧 BugFix 快捷路径（工程师定位修复 → QA 回归）；🏗️ 标准 SOP（PM 出 PRD → 架构师设计+任务分解 → 工程师批量编码+全局一致性审查 → QA 测试+智能路由判定，最多 2 轮）；📋 部分工作流（仅 PRD / 仅架构评审 / 仅测试…）。
- **质量反馈回路**：QA 发现源码 Bug → 回派工程师；架构师发现 PRD 歧义 → 回派 PM；工程师发现设计问题 → 回派架构师。多轮循环 = 每轮按 AgentDef 重新 spawn（成员瞬态）。交付级完成判定另走 ESM critic/audit 运行时关卡（§8），提示词关卡与运行时关卡双层。
- **交付规范**：TL;DR、文件清单、下一步建议；仅在用户明确要求时落盘 `deliverables/<team>/<项目>-delivery-<date>.md`。架构师产出必须 **decision-complete**（实现者无需再做任何决策，可直接交给工程师成员执行）。
- **保留的提示词纪律**：禁止 lead 代写成员专业产出、禁止模拟成员发言。（其余纪律已由结构保证：绑定即建团、成员 ID 由 schema 强制、禁止嵌套 + 无同级通道 = hub-and-spoke 物理成立。）

工具使用规范（写入 roster 注入段与 lead 提示词）：

| 场景 | 工具 |
|---|---|
| 派发成员任务 | `subagent_spawn(member:"<id>", task:…)` |
| 关键路径等待结果 | `subagent_wait`（节俭使用，仅被阻塞时） |
| 显式查询成员状态 | `subagent_status` |
| 向运行中成员补充指令 | `subagent_send` |
| 清理已结束成员 | `subagent_destroy` |

调度纪律（吸收调研归档 §1 的 LLM 面向纪律文本）：wait 节俭、仅关键路径阻塞；成员运行期间 lead 做非重叠本地工作；禁止反射式反复 wait；委派任务须具体、有界、写集不相交。

成员提示词（输入契约、ALL-AT-ONCE 编码模式、禁止脚手架 CLI 等）随人设包内容维护。编排纪律的运行时兜底：`SubAgentPolicy`（超时/迭代上限/MaxChildren）对成员同样生效。

---

## 8. 治理层：与 ESM 正交组合

职责划分：**主角团 = run 内分工**（人设、roster、SOP）；**ESM = 跨 run 目标治理**（续跑、验证、断路器、审计、guidance）。组合规则：

- objective 创建权不变量：**仅用户** `/esm`（TUI/WebUI 同命令集）创建/编辑/恢复目标；lead LLM、运行时、专家绑定都不得自动立目标。绑定 team 专家后用户发起交付型任务时，UI 给"建议 /esm 立目标"提示（提示不自动化）。
- 目标设立双路：会话空闲时立目标 → 立即走空闲续跑 gate；lead run 进行中立目标 → 经既有 ESM `SteeringMessage` 注入活跃 run，不新开 run。
- ESM 活跃 + 绑定 team 专家时，Supervisor 驱动的续跑 run **以 lead 人设 + 完整 roster 执行**：worker 角色运行可用 `subagent_spawn(member=…)` 调度成员；critic/audit 保持隔离只读、**不**获得成员调度工具（避免放大 ESM 已知问题 #5 的工具可见性债务）。
- 质量关卡：lead 报 `complete_candidate` → 隔离 critic/audit 独立验证 → 连续拒绝断路器（3 次 → pause）。团队 SOP 负责"把活分对"，ESM 负责"没干完不许说干完"。
- 用量治理不新造机制（尊重 2026-09-03 预算移除决议）：`TokensUsed/TimeUsedMS` 观测量、`usage_limited` provider 配额熔断、绑定时消耗倍数提示。
- guidance 队列语义不变（持久队列，用户补充说明注入下一个角色 run）；成员邮箱为内存态、独立生命周期（入队/边界 drain/失败保留），两者不混用、不新增表。

---

## 9. 成员完成触达与唤醒语义

设计依据：吸收 Codex multi_agents_v2/goal mode 实测精髓——完成通知从不直接唤醒 lead，自主续跑仅由「空闲 + 目标活跃」驱动（完整证据与取舍见 `codex-lead-subagent-research.md`）。**四通道 + 三禁止**：

| 情况 | 机制 |
|---|---|
| A. lead run 进行中 | 成员终态 → 运行时格式化完成通知入成员邮箱 → agent loop 迭代边界经 steering 组合点 drain 投递（不打断进行中的工具调用）；关键路径 lead 调 `subagent_wait` 阻塞合流。lead 不需要 LLM 轮询搬运结果 |
| B. 会话空闲 + ESM 目标活跃 | run 结束 → 会话空闲 → ESM 既有空闲续跑判定（单锁、`ResolveUnattendedMode`、断路器）启动携 lead 人设的续跑 run；续跑 run 输入 drain 携带邮箱中未投递的完成通知。**空闲转换是唯一自主唤醒源，成员事件自身永不开 run** |
| C. 会话空闲 + 无目标（对话型使用） | 不自主（无目标即无续跑）；邮箱保留，用户下一次发言的 run 开头经 steering 通道注入 digest（系统注入上下文，非伪造用户消息） |
| D. 决策等待 / 用户取消 / run 终态 | 永不续跑（DecisionService/终态既有不变量）；邮箱保留，决议后或 replay 时恢复可见 |

三禁止（结构性，非提示词纪律）：

1. 成员终态事件不得直接启动任何 run——不存在「成员事件唤醒源」；
2. 成员→lead 无唤醒通道；lead 只被「目标续跑」或用户输入启动；
3. 邮箱 drain 只发生在 run 输入边界（迭代边界 / run 启动），永不构造工具调用中段的 provider 内容。

批量与去重无需专门机制：邮箱按投递序 drain，一次边界天然合并 N 个成员的完成通知。

实现落点：成员邮箱为会话级内存态（runtime 属主），投递的通知经 steering 注入进入会话历史、随既有持久化路径落盘，**邮箱本身无新表/无 migration**（专家绑定的 `expert_id` 列迁移见 §3/§6）；steering 组合点在 agentruntime 单点接线（现状 `GetSteeringMessages` 仅 TUI，见 §6.1）；空闲续跑判定由 TUI 调度器与 serve `esmCoordinator` 共享（不加深执行载体不对称债务，成员运行沿用会话既有子代理载体）；完成通知投递随事件投影，三端薄投影。

---

## 10. 呈现层：canonical 事件与三端薄投影

- canonical 事件扩展一次、三端消费：子代理事件已带 AgentID 转发（`ForwardChildAgentEvent`），补充 `memberId`（AgentDef id）、`expertId`、人设展示元数据（显示名/emoji/role，取自 manifest `members[]`）到 spawn/进度/终态事件；`subagent_wait` 不加专属事件（tool_call 投影已足够）；`EventRunFinished` 仍是唯一终态。
- **任何适配器不建成员状态机**：UI 只做"事件 → 卡片/行"的投影与既有 replay 对齐（句柄唯一、终态唯一，无去重/settle 补丁需求）。
- **审批/提问的成员归属**：子审批转发到父对话面是既有机制（`internal/agent/subagent.go` 审批事件转发携 AgentID），仅需补 memberId/显示名/emoji 人设元数据，UI 渲染为"【工程师】请求执行 xxx"而非匿名审批。
- **成员详情转录视图（后续增强）**：WebUI/desktop 成员卡片点开 → 该成员完整事件流回放；数据源基本就绪（转发的子事件进父 run 的 `session_run_events` 持久化，AgentID 归属字段实现时核对补齐）。
- 落地顺序（一个核心，UI 薄封装）：
  1. **TUI**：`/expert`（list/show/bind/unbind/switch=fork）；绑定 team 后 statusline 显示专家与成员状态摘要；成员 spawn/终态作为转录块进 scrollback（既有纪律：仅活跃流式内容留在管理视图）；团队目标复用既有 ESM 面板与 `/esm` 命令集。
  2. **WebUI(serve)**：专家面板（列表/详情/人设卡片、消耗提示）、会话 expertId 绑定与 fork 切换入口、成员卡片（`members[]` 人设对齐渲染：中文名/职业/头像/role/实时状态）、"思考中"判定只看 team member 终态证据；zh/en 双语文案。
  3. **desktop(ACP)**：`session/set_config_option` 扩展（或 `mothx.dev` 专属 option）承载 expertId；切换走已有 `session/fork`；成员卡片投影 `session/update` 里同一 canonical 事件；desktop 主进程保持纯 ACP 客户端，零业务状态。
  4. channels：绑定经 serve API 天然可用，消息投影最小（成员状态不展开）；强制 yolo 等既有渠道策略不受专家绑定影响（能力覆盖只在策略边界内生效，§5）。
- 自定义专家：用户把包放进 `~/.mothx/experts/` 或 `<project>/.mothx/experts/` 即生效（LocalDirectorySource 懒扫描，无需 watcher）；WebUI 专家面板入口支持灰度开关；企业自建专家（专属清单/网关下载）归 remote ExpertCenter 独立提案（§14）。
- CLI print 模式：`--expert <id>` 一次性绑定（薄入口，同一解析路径），随 TUI 阶段落地。

---

## 11. 架构规则符合性（AGENTS.md 逐条对照）

| 不变量 | 本方案的落点 |
|---|---|
| One construction path | AgentDef 注册表、lead 叠加、roster 注入全部在 SessionRuntime/Builder 资源装配；无适配器级 agent.Config 拼装、无 agent.New |
| One execution/lifecycle path | 成员 = 既有 subagent 体系（AgentManager）；空闲续跑 = 既有 ESM Supervisor/协调器（成员事件不直接开 run）；无新 run 状态机 |
| One source-of-truth resolver | expertId → 身份/能力/工具/强制多代理 由 ResolveSource/ResolvePolicy 单次解析；各入口只投影 |
| One session/resource owner | bundle 装载与注册表生命周期归 SessionRuntime；Shutdown 一并释放；ExpertID 走 session 域 |
| One database access path | 核心路径零新表：邮箱为内存态，完成通知随会话历史持久化；ExpertID 走 session.Header 同款字段（channel binding 先例），如需查询列则追加 migration + internal/dao 属主 |
| One decision model | 情况 D 显式服从 DecisionService：决策等待期不续跑、不复活 |
| One event semantic model | memberId/expertId 扩展进 canonical 事件一次；SSE/WebSocket/JSON-RPC/Bubble Tea 均为投影；无新事件类型 |
| One input/content path | 无新输入模型；完成通知/digest 经运行时 steering 组合点（GetSteeringMessages）注入，不经适配器拼 provider 内容 |
| Attachment/artifact lifecycle | 不触碰；deliverables 落盘走既有文件工具 + publish_artifact 语义 |
| Policy, not forks | team 强制多代理 = 会话策略（forced yolo 同款）；无适配器默认值 |
| 守卫与契约测试 | `internal/architecture` 增加：AgentDef 解析仅存在于 runtime 核心、member 参数不经适配器改写；跨入口契约测试覆盖 TUI/CLI/WebUI/ACP/Channel：canonical 事件、memberId、Run 归属、终态一致，仅渲染不同 |

---

## 12. 种子专家包与生态转换

### 12.1 种子包：software-company 移植

- 内容：lead（交付总监）+ PM/架构师/工程师/QA 四成员；SOP 按 §7 规范编写（工作流路由、反馈回路、交付规范、decision-complete 架构产出）；人设元数据（中文名/职业/emoji）齐备。
- 作为 builtin 源随二进制分发，同时是格式参照实现与集成测试 fixture（bundle 校验、绑定、spawn member、roster、fork 切换、邮箱投递、wait 合流、ESM 组合全部用它做端到端用例）。
- 第二个种子（agent 型单专家，验证 `expertType: "agent"` 路径）从简：一个 frontend-developer 风格人设 + 包内 skill。

### 12.2 生态包转换规则（厂商 plugin 包 → expert bundle）

| 厂商包（源） | expert bundle（目标） |
|---|---|
| `.<cli>-plugin/plugin.json` | `expert.json`：`name/expertType/agentName/teamInfo/members/displayName/quickPrompts/defaultInitPrompt/categoryId` 字段语义直迁；补 `schemaVersion: 1` |
| `agents/*.md`（frontmatter：name/description/color/emoji/vibe；正文=人设提示词） | 直接迁移；补 `role` 字段（lead 判定 = teamInfo.leadAgent 或 agentName）；可选补能力字段（mode/tools/max_iterations，缺省继承会话策略） |
| `skills/` | 直接迁移（走既有 skills 通道装载进会话） |
| `avatars/` | 直接迁移（成员卡片头像）；`license/` 保留原样（loader 忽略） |
| `settings.json`（厂商遗留，`{agent: "…"}` 全局覆盖，曾致会话外串脏） | 丢弃（MothX loader 只认 expert.json + agents/*.md，天然免疫此 hack） |
| `expertType: "skill"` 型包 | 拒绝转换，提示走既有 skills/skillhub 机制（§5） |
| COS 清单（expert_center.json / internal・external 专属清单）/ 企业网关下载 | 本期无对应：LocalDirectorySource 三层目录即清单；远程清单/企业网关归独立提案（§14） |

转换是离线工具/脚本职责（不进运行时）；首个转换对象即 software-company 种子（§12.1）。厂商包的 lead SOP 提示词内容（铁律/工作流路由/成员输入契约）按 §7 规格改写：工具名换为 subagent_* 体系、删除建团/命名/直连类铁律（结构已保证）、QA 关卡对接 ESM critic/audit 双层语义。

---

## 13. 分阶段实施清单

**Phase 1 — 核心原语（无 UI）**
1. `internal/expert`：bundle 格式、校验、LocalDirectorySource（builtin/全局/项目三层 + shadow）、AgentDef 解析；
2. SessionRuntime/Builder：ExpertID header 绑定、注册表装配、lead 叠加、roster 注入；ResolvePolicy：team 强制多代理能力；
3. `internal/agent`：`subagent_spawn.member` 参数 + 能力覆盖映射（workflow AgentTask 同构）+ 策略边界裁剪；`subagent_wait`（有界阻塞合流，只回摘要）；并发治理复用 `SubAgentPolicy`（仅调参）；
4. agentruntime steering 组合点（邮箱 drain + 适配器 steering 源合并，单点接线，全端生效）；canonical 事件补 memberId/expertId/人设展示元数据；
5. 种子包（software-company + 单专家）与 fixture；
6. 测试：bundle 校验/策略边界/绑定-重建/fork 切换/事件元数据；`go test ./internal/architecture` 守卫更新。

**Phase 2 — 治理与触达（核心）**
7. 成员邮箱（内存态，runtime 属主：入队/边界 drain/失败保留）与完成通知格式化（结果摘要/错误截断+下一步提示/取消，包络按 §6.1）；零 migration；
8. ESM 组合：续跑 run 携 lead 人设 + roster；空闲续跑 gate 与邮箱 drain 衔接（续跑输入携带未投递通知）；目标设立双路；critic/audit 工具隔离核查；
9. TUI 调度器与 serve esmCoordinator 接同一判定；跨载体一致性测试（含"成员事件不直接开 run"守卫用例）。

**Phase 3 — TUI**
10. `/expert` 命令族、statusline/转录投影、消耗提示、`--expert` CLI flag；ESM 面板复用核查。

**Phase 4 — WebUI**
11. serve API（专家列表/详情/绑定/fork 切换）、专家面板与成员卡片（zh/en）、思考中判定、`/esm` 建议提示。

**Phase 5 — desktop(ACP)**
12. config option 扩展、fork 切换接线、成员卡片投影；主进程零业务状态核查。

**Phase 6 — 文档与发布**
13. `docs/en|zh` 用户文档、changelog（双语，全量 + online 两对文件）、proposal 状态更新为 Implemented 并回填差异（ESM 提案 §16 先例）。

每阶段验收含：跨入口契约测试（AGENTS.md 要求）+ `make test` 相关包 + `go test ./internal/architecture`。

---

## 14. 风险与开放问题

1. **SOP 提示词的模型间可靠性**：结构保证已接管建团/命名/直连纪律，剩余纪律（禁代写、工作流路由）依赖提示词；缓解 = 种子包端到端用例 + roster 注入的调度规范段；不同 provider 的路由准确率需实测调优。
2. **token 消耗放大**：team + ESM 续跑叠加时消耗显著；治理 = 观测量、usage_limited 熔断、绑定提示、目标创建权在用户（决策 8）。不引入新预算机制（既有决议）。
3. **执行载体不对称（既有债务）**：TUI 瞬态子代理无租约、重启不自动恢复续跑；本方案不加深也不解决（邮箱同为内存态、与该债务同界），成员运行沿用会话既有载体；WebUI 路径天然 durable。
4. **人设提示词 = 注入面**：信任边界在装载源（本期本地 + 内置）；remote source 落地前必须补 skillhub 级安全机制与扫描摘要展示。
5. **成员 mode/tools 覆盖与 plan 会话交互**：裁剪规则需策略测试固化（plan 会话中成员不得获得写能力等），避免"人设声明绕过模式语义"。
6. 开放/后续扩展：成员级 model 覆盖；`subagent_report`；wait 的 steering 提前返回与 waiting 专属事件；stats expert 维度查询；成员详情转录视图；desktop 成员卡片视觉规格（Phase 5 前定）；channels 投影最小形态细化；remote ExpertCenter 时间表与企业清单接入（独立提案）；成员复活/驻留语义。

---

## 15. 实施状态（随进度更新）

### 15.1 已合入并验证（2026-09-06）

**任务 A+D — `internal/expert` 包 + `experts/` 种子包（执行者实现，主代理审查通过）**

- [x] 类型全集（LocalizedText/MemberMeta/TeamInfo/Manifest/Frontmatter/AgentDef/Bundle）与规格 A1 一致；Bundle 附 SkillsDir/SkillsFS，并由 Runtime 装配进同一 skills.Manager（含内置 fs.FS 读取与 `skill_ref`）；
- [x] 手写 frontmatter 解析器（零新依赖）：引号/行内与块列表/注释/CRLF/CJK；未闭合 frontmatter、非法 max_iterations 报错；
- [x] LoadBundle/LoadBundleFS 校验规则 1-7 全实现（Invalid+Reason 与 IO error 分离；skill 型拒绝；role 判定 manifest 优先）；
- [x] Center 三层源（builtin<global<project，name shadow，懒扫描，路径穿越防护）；
- [x] 种子包：software-company（team 型，lead SOP 含铁律/工具表/调度纪律/四路由/反馈回路/交付规范/hub-and-spoke，四成员人设齐，工程师带能力字段示例）+ frontend-developer（agent 型 + 包内 skill）+ experts/embed.go；
- [x] 测试：12 顶层 + 37 子测试，-race 绿。

**任务 C — `internal/agent` 成员原语（执行者实现，主代理审查通过）**

- [x] MemberDef/MemberDefRegistry（保序、nil-safe）；AgentManager 字段 Members/Mailbox/ExpertID + SetMemberContext；
- [x] MemberMailbox：Enqueue/HasPending/DrainSteering（[MEMBER_COMPLETION] 包络、rune 截断 3500/错误 3000+下一步提示、经 provider.NewSystemInjectedUserMessage 注入、不冒充用户意图）/PendingSummary/WaitForActivity；drain 同时清 activity 信号防 stale 唤醒；
- [x] subagent_spawn 可选 member 参数：MemberDef 是不可放宽的能力上限；显式参数只能进一步收窄 tools、降低 iterations，并不得提升 mode 或越过声明的 work_dir；未绑定/未知 id 工具报错（附已知列表）；人设注入 SystemPromptExtra；终态入邮箱（done/error/canceled/incomplete；delegate 同步路径不入）；
- [x] subagent_wait 新工具（包内常量 2500/120000/30000，不进 settings schema；摘要不含 payload；nil mailbox 短路）+ 注册 + 子代理 Remove 清单同步；
- [x] events.go 增 MemberID/ExpertID/MemberDisplayName/MemberEmoji/MemberRole；ForwardChildAgentEvent 可变参 ChildEventMeta 传播不可变展示快照（既有调用点行为不变）；
- [x] 测试：mailbox/memberdef/spawn member/wait/events 全套绿；既有用例零回归；
- [x] 附带：3 个既有测试的 1s 等待预算放宽到 10s（干净 HEAD 基线确认为 -race 既有抖动，test-only 改动）。

**任务 B — session 持久化 + agentruntime 装配 + 适配器（执行者配额耗尽，主代理直接实现）**

- [x] 数据层：schema.go 两处 CREATE TABLE + requiredSchema 白名单；migrations.go v41 `add_sessions_expert_id`（sessions+sub_session，避开已发布的 36–40 版本号，addColumnIfMissing 既有模式）；dao/session.go 记录/INSERT/SELECT/Header/映射全加 expert_id，新增 UpdateSessionExpertID；dao/fork.go InsertSessionFrom 复制 expert_id；
- [x] session 域：Header.ExpertID（omitempty，旧数据可读）；load 从 DB 列恢复；SessionInfo.ExpertID；Manager.SetExpertBinding（内存 header + DB 持久，镜像 channel binding 模式）/GetExpertID；ForkOptions.ExpertID 覆盖（JSONL header + 子 DB 行双路径；nil=继承源绑定）；
- [x] 提示词管线：agent.Config + SystemPromptOptions 的 ExpertIdentity/ExpertRoster；渲染位 = Project Rules 之后、Context from project files 之前（基础规则→身份→项目上下文）；factory 仅主代理（ParentID==""）注入；
- [x] `agentruntime/expert.go`：ExpertBinding（含 Team bool）、refreshExpertBinding（缺失/无效包 = 硬错，不静默降级）、SetExpert（非空替换拒绝并要求 Fork）、ForkWithExpert、ExpertState/TeamExpertActive、SubAgentToolsEnabled、SessionHasTeamExpert、composeExpertIdentity（含权威性声明段）/composeExpertRoster、composeSteering；
- [x] SessionRuntime 增 Expert/Mailbox/ExpertCenter；两个装配点（Builder.Build、AttachRuntime）均在 registry hooks 前完成 mailbox 创建 + 绑定解析；
- [x] buildAgent：team 强制 MultiAgent、identity/roster 注入 cfg、GetSteeringMessages = composeSteering(mailbox, adapter)（双 nil 时仍为 nil，默认会话形态不变）；NewAgentManager：MultiAgentEnabled 强制、factory 专家两字段、绑定存在时 SetMemberContext；
- [x] 5 个注册点全部改用 runtime 单一谓词：main.go RegistryHook、openaiapi×3（含 else remove 分支语义自洽）、acp、dispatcher（后两处用 SessionHasTeamExpert(workDir,mgr)，acp openSessionRuntime 将 manager 打开前置于 registry 构建，二者无相互依赖）；
- [x] Phase 1 专项测试（B4 规格全项覆盖）：绑定解析（项目层 fixture，identity/roster 内容与成员能力映射断言）、缺失/无效包硬错、SetExpert bind/unbind 持久化、ForkOptions.ExpertID 三分支（保留/覆盖/解绑，含原分支不变断言）、SetExpertBinding 重开恢复、SubAgentToolsEnabled/SessionHasTeamExpert 真值表、projectExpertBuild team 强制、composeSteering 适配器保序/邮箱追加/双 nil 保持 nil/SystemInjected 标记/二次迭代不重复投递、提示词段落顺序（rules→identity→roster→context）+ 默认会话无专家段落、factory 仅主代理注入；
- [x] 全量验收：go build ✓；go vet（internal/... cmd/...）✓；`make build` 产出 bin/mothx ✓；go test -count=1 全绿：session 60s（含新用例）、agent 21s、agentruntime 46s、expert、architecture 守卫、serve 全子包、acp、cmd；
- [x] **Phase 1 行为 e2e（常驻测试 `internal/agentruntime/expert_seed_e2e_test.go`，非一次性脚本）**：用真实内置种子包跑通全链路并逐项断言——header 持久绑定 → 运行时装配（identity 含「一人公司」SOP 与铁律原文；roster 含四位成员中文显示名司南/墨矩/柯德/甄严、subagent_wait 与 hub-and-spoke 规范；工程师真实能力字段 mode=yolo/6 工具/max_iterations=80 全透传）→ 适配器同款接线（NewAgentManager + 门控注册，含 subagent_wait 在工具面）→ BuildAgent + 真实 spawn 工具执行（member:"software-engineer"）→ 子代理跑完 → 运行时邮箱收到 `[MEMBER_COMPLETION]`（SystemInjected、携显示名柯德、status: done、结果文本）→ 原地切换被拒绝并要求 Fork → 解绑（绑定/持久化/能力强制全部回收）；另有 ForkWithExpert 测试断言新分支绑定目标专家、源分支不变。
- [x] **二进制冒烟（真实用户环境，独立于仓库单测）**：`bin/mothx --version` ✓；`bin/mothx doctor` 在真实 `~/.mothx` 配置上全部检查通过 ✓；`bin/mothx -P` 默认路径（无专家绑定）单发运行退出码 0 ✓（顺带验证 v41 迁移在真实会话库上成功创建/打开会话）；注：`stats` 会拉起 dashboard 服务，不适用无头冒烟，未纳入。
- [x] 回归验证（既有套件全绿）：go build ./... ✓；go vet（session/dao/agentruntime/agent/serve/acp/cmd）✓；go test -count=1：agentruntime 29.6s ✓、session 56.5s ✓、dao ✓、agent 21.8s ✓、expert ✓、**architecture 守卫 ✓**、workflow ✓、serve 全部子包（含 channels 25s、openaiapi 54s）✓、acp 29.7s ✓、cmd 4.2s ✓。

**后续审查闭环 — 跨入口重装配与 ESM team worker（2026-09-06）**

- [x] 延后绑定路径不再只替换 `Manager`：`BindSession`、`UnbindSession` 与 `SetExpert` 统一经 Runtime 重解析 bundle、重装 context/skills、更新 `skill_ref`；WebUI 重开已绑定会话可恢复 expert identity、包内 skills 和 team capability；
- [x] ACP/Channels 的 team expert 改用会话级 `AgentManager`（roster/mailbox 不再挂在进程全局 manager），并在 registry 最终化后重注册 `subagent_*`；WebUI 同样用 Runtime 能力谓词创建该会话 manager；三端均有已绑定 `software-company` 的回归断言；
- [x] ESM worker 的独立 registry 由 Agent Core 在 `AgentManager` 边界注入同一会话的 `subagent_*` 与 mailbox steering；仅 `worker` + team binding 开启，critic/audit/recovery 保持 `MultiAgent=false` 和既有只读工具过滤；
- [x] 新增 lazy bind、SetExpert skills、WebUI/ACP/Channels session manager、manager-created ESM lead 的 focused tests；`-race ./internal/agentruntime` 与 architecture guard 通过。

**后续审查闭环 — 运行中 ESM 目标更新（2026-09-06）**

- [x] `internal/esm.SteeringSource` 成为 run 作用域、版本去重的核心投影：仅在 objective 首次观察到或持久化版本变化时生成一条 system-injected steering；暂停/阻塞/完成态不注入。它不创建 run，适配器只负责空闲续跑调度；
- [x] TUI 正在运行时允许 `/esm <objective>`、`/esm edit` 与 `/esm guide`，但拒绝会破坏当前 run 语义的 pause/resume/clear；创建/编辑不 reset Agent、不改写 live registry，而是在下一 agent-loop 边界注入 steering，并把原前台 run 纳入 ESM 完成后的续跑链；
- [x] WebUI 的普通 BuildAgent 路径（chat、runs、background、command compaction）以及 ACP/Channel 的普通 prompt run 全部接入同一 source；`esmCoordinator` 在前台 execution lease 存在时可取消地等待，而不再因一次 `TryLock`/admission 冲突静默丢弃用户请求的后续 continuation；
- [x] 回归：ESM 核心版本去重/暂停恢复、TUI 运行中创建及编辑（含不改 live registry）、WebUI/ACP/Channel 注入、协调器等待并可取消，均有测试；相关 ESM/TUI/WebUI `-race` 通过。

### 15.2 已完成（Phase 6 文档与发布记录）

1. [x] Phase 6：已补齐 `docs/en|zh/expert-teams.md` 主角团使用文档，并在双语 getting-started、CLI reference、全量 changelog 与 online changelog 中同步主角绑定、fork 切换、团队成员和 ESM 续跑说明。

**Phase 3 — TUI/CLI 专家入口（2026-09-06）**

- [x] `/expert list|show <id>|bind <id>|unbind|switch <id>`：列表与详情均经 Runtime 的只读发现接口；绑定/解绑仅调用 `SessionRuntime.SetExpert`；非空切换仅调用 `ForkWithExpert` 并打开子会话，源会话身份不改写；活跃前台或成员任务时拒绝身份变更；
- [x] TUI 绑定 team 后根据 Runtime 的强制能力重建会话 `AgentManager` 与 `subagent_*` 投影，解绑后在无显式多代理开关时回收；session 切换同样重装配，避免旧会话 team roster 泄漏到新会话；
- [x] TUI statusline 显示单专家或团队摘要；成员 start/terminal canonical event 以转录块投影，活动摘要只利用既有 `agentActivity` 记录；绑定 team 时提示并行成员的消耗风险；
- [x] root CLI `--expert <id>`：新建/指定会话均在 Runtime 组装完成、`AgentManager` 创建之前完成绑定，team 能力、identity/roster 与工具面复用同一路径；
- [x] 覆盖测试：内置包 list/show、绑定/解绑持久化、强制子代理工具、fork 切换与源分支不变、成员 start/terminal 投影、活跃态拦截、CLI flag 解析和 runtime 装配。

**Phase 4 — Serve/WebUI（2026-09-06）**

- [x] Serve API：`GET /api/experts`、`GET /api/experts/{id}`、`GET/PATCH /api/sessions/{id}/expert`；发现与详情均委托 agentruntime，绑定经 `SessionRuntime.SetExpert`，并以 mutation lease 拦截运行中会话；
- [x] 既有 `POST /api/sessions/{id}/fork` 增可选 `expertId`，显式专家切换先由源 SessionRuntime 校验 bundle，再走 `ForkWithExpert`；保留现有幂等键、完成 turn 边界、源分支不变和统一错误码语义；
- [x] WebUI 新增双语“主角团”导航页：会话选择、主角列表/详情、成员人设卡片、当前绑定、team 消耗提示、绑定/解绑及 fork-switch；运行中会话在界面与 API 两层均拒绝身份变更；
- [x] 实时成员卡片：`AgentManager` 在创建命名成员时保留 member/expert 不可变展示快照，`GET /api/sessions/{id}/subagents` 与 WebSocket 转录投影同一快照；专家页仅轮询当前绑定 team 的实际 member 记录来显示工作中/终态，绝不由 session busy 推断“思考中”，也不建立独立成员状态机；
- [x] 覆盖测试与构建：成员 metadata 在 Core/Serve external projection/API projection 均有断言；`go test ./internal/serve/openaiapi ./internal/serve ./internal/agentruntime`、`ui npm test`、`ui npm run build` 通过。

Phase 1 完成状态：核心后端 + 数据层 + 装配层 + 适配器门控 + 种子包 + 专项测试全部合入并验收通过（§15.1）。

### 15.3 实施偏差记录（相对规格，均为现状驱动的最小调整）

- ACP/dispatcher 在 registry 构建期不存在 SessionRuntime（runtime 更晚装配），无法用 `SubAgentToolsEnabled(rt,…)` → 新增同包单一实现 `SessionHasTeamExpert(workDir, manager)`（读 header 绑定+解包判 team）；解析失败此处保守返 false，权威解析仍在 runtime 装配期硬错上报，不破坏「一处解析」原则；
- 绑定持久权威 = `sessions.expert_id` DB 列（load/reopen 恢复、fork 继承）；JSONL EntrySession header 记录创建/分叉时定格、不随行变更（与 channel binding 同款模式，SetSessionBinding 同样只改内存+DB）；
- Mailbox 每会话统一创建（空 drain 返 nil，默认会话 no-op）；仅专家绑定时接入 AgentManager，未绑定会话的 spawn 不写邮箱；
- ExpertBinding 用 `Team bool` 字段代替多处 `expert.TypeTeam` 比较，避免装配层重复感知包枚举；
- internal/expert 注释语言统一为英文（仓库惯例）；InvalidReason 面向用户文案保留中文，双语化归 Phase 4 WebUI 文案层。
- `ApplyRegistryHooks` 不再持有 Runtime 锁调用适配器回调，允许 hook 读取 Runtime-owned 能力谓词；TUI 仍在 hook 外取得 `SubAgentToolsEnabled` 的装配快照，并有超时回归测试，避免默认（未显式 `--multi-agent`）启动自锁。
- Runtime 构建 Agent/AgentManager 时以其 `session.Manager.GetSessionDir()` 覆盖传入 settings 的会话目录，保证子代理与父 run 落在同一持久化库；此前测试暴露的全局默认目录回退会导致子代理状态分叉，现以真实专家 spawn e2e 覆盖。

### 15.4 当前工作树审计（2026-09-06）

本节区分“本提案范围的实现状态”与“当前未提交工作树是否可整体验收”；前者不能因后者的无关改动而被误判为已发布。

- [x] **Phase 1 核心逐项对照**：expert bundle/三层加载、session `expert_id` 持久化与 fork 继承、Runtime 的 identity/roster/skills 重装配、team 强制多代理、命名成员 spawn/wait/mailbox、事件展示元数据、种子包和 ESM worker lead+roster 路径均存在对应实现和 focused/e2e 测试；
- [x] **本轮 Phase 2 对照**：运行中目标的版本化 steering 已经经 Runtime 的 `GetSteeringMessages` 组合点投影到 TUI、WebUI、ACP、Channel；TUI/WebUI 的目标创建/编辑路径与 Serve coordinator 的前台 lease 等待均有回归；
- [x] **Phase 2 空闲续跑 gate 契约**：TUI 在前台 run、压缩、审批/提问、输入队列或编辑框仍有用户输入时不创建 ESM continuation；Serve 对 paused objective 在进入 role supervisor 前返回且不创建 durable role run。两端共同以 `Objective.CanAutoRun` 为状态门，成员终态本身从不是启动源；
- [x] **Phase 3 TUI/CLI 对照**：TUI 已有 `/expert` 命令、专家/团队状态栏摘要、成员生命周期转录块和 team 消耗提示；root CLI 已有 `--expert`，均经 Runtime 的绑定/分叉与强制 team 能力路径，未新增适配器状态机；
- [x] **Phase 4 对照**：Serve 已有 Runtime-owned expert list/detail/bind API 与 `fork expertId` 覆盖；WebUI 已有专家面板、成员人设卡片与绑定/分叉入口。成员实时状态从同一 `AgentManager`/canonical child-event 展示快照投影，绝不由 session busy 推断“思考中”；它们不直接改 session header 或解析专家目录；
- [x] **Phase 5 ACP/Desktop 对照**：Runtime 把 expert 暴露为 session config option；ACP 只转交 `SetExpert`，初次绑定/解绑原地重装配 session-scoped manager，非空身份切换则经 `session/fork expertId` 调用 `ForkWithExpert`。Desktop 仅渲染同一 option、在切换时请求 fork，并把 canonical 子代理事件的人设名称/emoji/role 投影为成员卡片；主进程未增加业务状态；
- [x] **Phase 6 文档与发布记录**：双语主角团用户文档已经新增；getting-started、CLI reference、全量 changelog 与 online changelog 均已同步，涵盖绑定、fork 切换、团队成员、成员终态边界与 ESM 空闲续跑；
- [x] **ACP 构建阻塞修复**：SkillHub market 校验不再调用仅存在于测试文件的错误数据辅助函数；生产路径复制结构化错误数据并补上 `markets[n]` 位置，`cmd/mothx` 已可重新构建；
- [x] **运行时锁边界修复**：为支持绑定后重装配，`BindSession`/`UnbindSession` 会在调用重装配前释放 Runtime 锁；实现现已保证各路径恰好释放一次，避免双重解锁。lazy bind 重装配与 ACP registry hook 回归覆盖了该路径；
- [x] **运行中控制语义已统一**：TUI 与 WebUI 都拒绝在普通前台/外部 run 活跃时执行 pause/resume/clear，仍允许 create/edit/guide 作为下一循环边界的 steering。WebUI 的 pause/clear 可先显式取消本进程拥有的 ESM continuation，释放其 lease 后二次核验；HTTP 返回 `409 Conflict`。TUI 活跃 run 与 WebUI 活跃前台/受控 continuation 的回归已覆盖；
- [x] **成员终态不触发 run 守卫**：TUI 的成员终态保持前台 lead ESM run 的 tracking、`isThinking` 与 active objective 不变，因而不能进入 `finishESMRun`/空闲续跑；Serve 的外部成员终态只投影 child history/status，既不会创建 `esmCoordinator`，也不会改变 active objective。两条专门回归测试锁定该边界。
