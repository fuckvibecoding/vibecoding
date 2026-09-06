# Desktop ACP 前端重构：ACP 能力缺口与分阶段开发计划

> Date: 2026-09-06（2026-09-06 修订：Phase 0 完成，整理为后续开发计划）
> Status: 已采纳（Phase 0–3 已完成并验收；仅 Phase 4 保留为后续调研）
> 关联: `docs/proposal/acp-capability-gap.md`（历史对照）、`docs/proposal/desktop-client-packaging-proposal.md`、`desktop/README.md`
> 界面参考: workbuddy 桌面原型（38px 标题栏 / 220px 侧边栏 / 22px 状态栏，任务状态机 + 计划/工具/制品卡片）

## 0. 一页总览

### 0.1 工作目录边界校正（2026-09）

Desktop 不再把 ACP 子进程的启动目录协商为全局 `workspace` 根，也不再通过“附加目录”或重启进程来给会话目录授权。该做法把连接实现细节错误提升为了产品级工作目录边界。

- Desktop 设置中的目录现在只是**新会话默认工作目录**，保存在 Desktop 本地 UI store；修改它不会重启 ACP、筛选 session，或改写已存在 session。
- 每个 session 持久化并使用自己的 `cwd`；打开、发送、分叉与显式修改都以该 session 的 `cwd` 为准。
- 默认情况下 Desktop 不在 `initialize` 中发送 `_meta.mothx.workspace`，因此 ACP 保持其原有的按请求 `cwd` 工作方式，用户可以选择任意本机目录。若产品需要目录限制，应由 MothX 的显式安全策略承担，而不是由 Desktop 的连接启动路径承担。
- `mothx/workspace/extend` 仍是 ACP 的可选兼容扩展，但 Desktop 不将其作为工作目录模型或权限系统使用。

本节优先于文中此前有关“主工作区”“附加目录”“切换工作区需重启”的 Desktop 表述。

### 0.2 历史会话树边界（2026-09）

Desktop 左侧“任务”是全局历史会话树，而不是当前目录的 session 过滤器，也不再以独立“项目管理页”承载项目功能：

- `mothx/session/listAll` 是跨所有 cwd 的唯一历史目录；它在 cursor 分页**之前**支持项目、未分组与 `ID/标题/cwd/项目名` 查询。Desktop 按需加载页面，不能循环预取固定页数或假装已经拿到全量历史。
- 项目仅是折叠组织组：`mothx/projects/list` 提供项目和 canonical `sessionCount`，项目展开后才加载对应 session；项目删除保留 session 并清空 `projectId`。
- “最近”是全局最近 session 的投影，可与项目组重复；“未分组”只表示 `projectId=null`。树的展开状态与已加载页仅存在 renderer 内存，绝不写入 Desktop store。
- 项目与会话操作全部复用 `mothx/projects/*`、`mothx/session/setMeta`、`mothx/session/setTitle`、`mothx/session/setWorkDir`、`session/fork`、`session/delete`；移动项目不改 cwd，改 cwd 不改项目。
- 需要全量搜索与批量浏览时进入“历史管理”视图；它仍调用同一个 `mothx/session/listAll` 和 `nextCursor`，不是第二套会话索引。

### 0.3 供应商与模型边界（2026-09）

Desktop 的“供应商与模型”设置与 WebUI 对齐为两层，且都不是 Electron 本地状态：

- **全局默认值**（default provider/model/thinking）是 `settings.json` 的全局配置，只决定之后新建 session 的初始绑定；修改它绝不覆盖已存在 session 的 provider、model、mode 或 cwd。
- **会话内选择**始终由 `SessionRuntime.ConfigOptions` / `SetConfigOption` 处理，ACP、WebUI、TUI 与 channel 都走同一个持久化 Runtime 配置变更；Desktop 只投影 `session/set_config_option`。
- **供应商目录与自定义模型**通过 `mothx/manage/providers/*` 投影同一份 `config.ProviderConfig` 和 `providerfactory.ResolvedModels`。ACP 返回脱敏后的可编辑配置，写入走 `config.SaveGlobalSettingsPatch`；Desktop 不读写 settings.json、不持久化 provider/model，也不重建模型目录。
- API key、provider headers 和 response metadata 都不从 ACP 返回。编辑现有 provider 时，未显式提交的密钥/敏感头字段保持原值；模型发现仅产生草稿，必须显式保存后才进入所有 Runtime 共享的 catalog。

Desktop 已彻底重构为纯 ACP 技术栈：Electron 主进程 spawn 打包内 `mothx acp` 子进程（stdio NDJSON JSON-RPC，ACP v1 + `mothx.dev` 扩展），前端为独立的 `desktop/renderer/`（与 `ui/` 完全分离，无 serve/HTTP 通道）。重构中遇到的 ACP 缺口按 P0/P1/P2 分级；P0 已由独立 mothx 进程补全并端到端验收（见附录实施记录）。

| 阶段 | 目标 | 协议/代码面 | 执行方式 | 状态 |
| --- | --- | --- | --- | --- |
| Phase 0 | desktop 纯 ACP 重构 + P0 缺口（制品投影/获取、prompt 能力声明、审批超时） | `desktop/**`、`internal/acp`、`internal/agentruntime/artifact.go`、`internal/session/artifacts.go`、`internal/dao/attachments.go`、`cmd/mothx` | 本仓库重构 + 独立 mothx 进程工作单 #1 | ✅ 完成验收 |
| Phase 1 | 协议补齐：运行状态/置顶与项目/动态工作区/决策 deadline/resume 制品重放/sub-agent 事件/工具结果图片/附件清单 | `internal/acp`、`internal/agentruntime`、`internal/session`、`internal/dao`（均 additive） | 独立 mothx 进程工作单 #2 | ✅ 完成验收（见附录 A 工作单 #2 记录） |
| Phase 2 | desktop 体验完善：协议化状态点、全局历史会话树/项目组织、每会话 cwd、制品库、审批倒计时、sub-agent 卡片、剪贴板图片、e2e smoke | `desktop/renderer/**`、`desktop/main/**`、`desktop/scripts/e2e-smoke.mjs` | 本仓库 | ✅ 完成（typecheck/build/test/e2e 绿；项目树与历史分页复用 ACP canonical 查询） |
| Phase 3 | 管理面：settings/onboarding、skills 启停、MCP 管理、cron 自动化、stats、memory 的 ACP 扩展方法组 + desktop 对应视图 | `internal/acp`（`mothx/manage/*`，复用 internal 服务单源）、`desktop/renderer` 视图 | 独立 mothx 进程工作单 #3 + 本仓库集成 | ✅ 完成（phase3-verify 21/21 PASS；设置页/自动化视图集成完毕） |
| Phase 4 | 云端/远程任务目标（原型"云端任务"开关） | 调研提案：A2A 分发 / serve+ACP-WebSocket 桥 / 远程 acp | 调研文档 + 原型 | ⬜ 调研 |

执行约定：每个工作单由一个独立 `mothx -P -M yolo` 进程执行，范围/禁改/验证/实施记录四要素齐备（模板见 §3.4）；desktop 侧集成与 UI 一律在本仓库完成。所有协议变更保持 ACP v1、仅 additive，客户端以 `initialize` 返回的 `_meta.mothx.dev.features` 做能力发现并 gate UI。

## 1. 背景与现状基线

### 1.1 desktop 架构（Phase 0 后）

- 主进程 `desktop/main/acp-client.ts` 是唯一 ACP client：请求/响应关联、`session/update` 与 `_mothx/session_event` 通知分发、`session/request_permission` / `mothx/requestQuestion` 反向请求应答、崩溃退避重启、`MOTHX_ACP_ERROR` 启动错误解析。
- 渲染进程经 preload `window.mothx` 桥访问：`acp.invoke/notify/respond/getState/restart/onEvent` + `desktop.*`（目录/文件选择、base64 读文件、本地 store、窗口控制、openPath、日志）。
- 本地 store（`desktop-store.json`）只保存 ACP 不拥有的 UI 状态：主题、语言、新会话默认目录及其历史；项目、session 归属、置顶、工作目录和历史分页均由 ACP/session 持久化或 renderer 临时状态承担。
- ACP 子进程启动目录仅是首次启动时的 Desktop 本地默认值；**新会话可使用该默认目录或显式选择任意目录**，并以所选目录创建 session。标题栏 folder 控件用于显式选择下一个 session 的目录；设置页只管理新会话默认目录。已有 session 一律使用自身持久化的 cwd。

### 1.2 ACP 能力基线（Phase 0 后）

方法：`initialize`、`session/new|load|resume|fork|list|close|delete|prompt|cancel|set_mode|set_config_option`、`mothx/session/setTitle|delete`、`mothx/doctor`、`mothx/attachment/fetch`、`$/cancel_request`。
通知：`session/update`（`user_message_chunk`、`agent_message_chunk`、`agent_thought_chunk`、`tool_call`、`tool_call_update`（含 diff）、`plan`、`artifact`、`usage_update`、`available_commands_update`、`config_option_update`、`current_mode_update`、`session_info_update`）、`_mothx/session_event`（terminal/status/retry/compaction/turn）。
反向请求：`session/request_permission`、`mothx/requestQuestion`（或标准 `elicitation/create`）。
能力：`promptCapabilities{image,audio,embeddedContext}=true`；`sessionCapabilities{close,delete,list,resume,fork,additionalDirectories}`；`_meta.mothx.dev.features` 含 `artifactProjection`、`attachmentFetch` 等发现键。
配置目录（`configOptions`）：`provider`、`model`、`mode`、`thinking_level`、`sandbox`、`browser`、`web_search`。

### 1.3 可复用的既有地基（Phase 1/3 直接接线，不新建存储）

- **置顶/项目持久化已存在**：`session_metadata(session_id, project_id, pinned, updated_at)` 与 `projects` 表（migration 25），API 在 `internal/session/projects.go`（`ListProjects/CreateProject/RenameProject/DeleteProject/SetSessionMetadata/GetSessionMetadata`）。缺的只是 ACP 投影。
- **run 存储**：`internal/agentruntime/run_queries.go`（`GetDurableRun/GetActiveDurableRun`）；"每会话最近一次 run"需 additive DAO 查询。
- **附件存储**：`internal/session` 附件服务 + `internal/dao/attachments.go`（含 Phase 0 新增 `ListBySessionStatus`）；`mothx/attachment/fetch` 已走 `AttachmentService.Open`（归属/过期/哈希校验）。
- **cron**：`internal/cron` 的 `CronStore` + `Scheduler`（`Start/Stop/IsRunning/SetCompletionObserver`），serve 已接 `/api/cron`；ACP 进程内可同源接入。
- **stats**：`internal/stats` 的 DB 查询与 summary/timeseries handler，serve 已接 `/api/stats/`。
- **管理面端点参照**：serve 的 `/api/settings`、`/api/mcp`、`/api/memory`、`/api/skillhub/`、`/api/models/catalog`、`/api/provider/models|test`、`/api/projects`、`/api/attachments/` —— Phase 3 的 ACP 方法组语义与其对齐，实现复用同一批 internal 服务（单源，不复制逻辑）。

## 2. 缺口清单（Phase 0 后复核）

| # | 缺口 | 用户影响 | 当前降级 | 目标阶段 |
| --- | --- | --- | --- | --- |
| G1 | 会话最近 run 状态不在 `session/list` | 侧边栏状态点重启后丢失 | 本地 store 观察值 | Phase 1.1 |
| G2 | 置顶/项目无 ACP 投影（持久化层已有） | 置顶重启后丢失、无项目分组 | 本地 store 置顶 | Phase 1.2 |
| G3 | 工作区窗口不可动态扩展 | 切工作区=重启子进程（会话可恢复，但打断进行中的多会话） | 重启 | Phase 1.3 |
| G4 | 审批/提问无 deadline 提醒 | 用户不知道决策何时过期 | 30m 超时兜底 | Phase 1.4 |
| G5 | `session/resume` 不重放制品 | resume 路径制品卡片缺失 | 仅 load 重放 | Phase 1.5 |
| G6 | sub-agent 事件不投影 | multi-agent 进度不可见 | 父会话工具卡片 | Phase 1.6 |
| G7 | 工具结果图片只发文本 | 截图/图像结果不可预览 | 文本描述 | Phase 1.7 |
| G8 | 无附件元数据清单方法 | 制品库视图无法跨 turn 列举 | 仅运行时 artifact 事件 | Phase 1.8 |
| G9 | 管理面（settings/onboarding、skills 启停、MCP、cron、stats、memory）无 ACP 通道 | 设置/自动化/统计视图是占位 | doctor + 占位视图 | Phase 3 |
| G10 | 云端/远程任务目标无运行时 | 原型"云端任务"置灰 | 置灰 | Phase 4 |

Phase 0 已关闭：制品投影+获取+load 重放（P0-1）、prompt 能力声明（P0-2）、审批/提问超时可配置（P0-3）。
Phase 1 已关闭：G1–G8（工作单 #2，见附录 A）；Phase 3 已关闭：G9（工作单 #3，见附录 A）。剩余 G10（Phase 4 调研）。

Phase 1 已关闭：G1–G8（工作单 #2，`§4.1–§4.8` 全部落地并含进程级 wire 验收；见附录 A）。

## 3. 总体设计原则

### 3.1 协议原则

- ACP 版本号保持 1；一切新增=新方法或 additive 字段/`_meta`；既有字段语义不变。
- 能力发现统一走 `initialize._meta.mothx.dev.features`（Phase 1/3 每新增一组方法追加发现键，如 `runStatus`、`sessionMeta`、`workspaceExtend`、`attachmentList`、`manageSettings`、`manageCron`…）；desktop 按发现键 gate 视图与按钮，未实现时显示缺口占位（现状自动化/资料库视图的模式）。
- 错误统一结构化：`error.data.code` 稳定机器码（沿用 `attachment_not_found` 模式）+ 人类可读 message。

### 3.2 架构红线（继承 AGENTS.md）

- 一个 Agent Core / 一个 front-end-neutral Runtime / 薄适配器：新协议方法只是 `internal/agentruntime`、`internal/session`、`internal/cron`、`internal/stats`、`internal/skills` 既有服务的投影，禁止在 `internal/acp` 内复制业务逻辑或新建存储。
- DAO-only SQL：新查询一律 additive 进 `internal/dao`，schema 变更只进 `internal/session/migrations.go` 追加条目。
- 附件/制品生命周期保持 Runtime-owned；ACP 只读投影与受控获取，禁止 adapter 本地扫描。
- `internal/architecture` 守卫随每次改动运行。

### 3.3 管理面路由决策（G9）

| 方案 | 描述 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- | --- |
| A. ACP 扩展方法组 `mothx/manage/*` | 在 ACP 进程内把管理操作实现为扩展方法，复用 internal 服务单源 | 纯 ACP 技术栈不变；权限/审计集中在一个通道；desktop 无需第二通道 | 方法数较多（约 15 个） | ✅ 采纳 |
| B. `mothx/http` 进程内隧道复用 serve mux | ACP 返回本地隧道句柄，renderer 经 IPC 代理 fetch | 端点现成、批量 | desktop 重新引入 HTTP/token 面；与"纯 ACP"目标冲突；安全面扩大 | ❌ 否决（保留为 serve 侧第三方集成路径） |
| C. desktop 直读 `~/.mothx/settings.json` | 渲染/主进程直接读写配置文件 | 零协议改动 | 绕过配置校验与并发写保护；密钥处理失控 | ❌ 否决 |

密钥安全模型：`mothx/manage/settings/get` 与 `mothx/manage/providers/list` 只返回掩码值（`sk-***abc`）；写入走 `mothx/manage/settings/patch` 或 `mothx/manage/providers/save` 的白名单字段；provider 连通性验证走 `mothx/manage/providers/test`（复用 `/api/provider/test` 同源逻辑），响应不含密钥。`headers` 与 `responses` 中可能包含秘密，不在 ACP provider 配置投影中返回。

### 3.4 独立 mothx 进程工作单模板

```
范围限定：<允许改动的包/文件清单>
禁止：<禁改目录（desktop/、ui/ 等）、禁改语义、禁 git commit/push、禁长驻进程>
任务：<编号列表，每项含协议设计引用（本文 §4/§6 小节）>
验证：go build ./... ; go test <包清单> -count=1 ; go test ./internal/architecture ; gofmt/vet
记录：在本文档"附录 A 实施记录"追加：改动文件、要点、测试结果、遗留项
```

冲突控制：工作单只碰 `internal/**` 与 `cmd/mothx`；desktop 集成只在本仓库主流程做；同一文件不被两个执行者同时持有（工作单期间本仓库不改 `internal/acp`）。

## 4. Phase 1 — 协议补齐（工作单 #2）

### 4.1 G1 会话运行状态

- `session/list` 每个 `listedSession._meta` 增加：
  ```json
  { "messageCount": 12, "lastRun": { "runId": "run_x", "status": "completed", "startedAt": "...", "finishedAt": "...", "active": false } }
  ```
  `status ∈ running|completed|failed|cancelled|incomplete`；`active=true` 表示存在未终态 run（跨进程可见）。
- 运行中状态变化补投影：`_mothx/session_event {event:"run_status", sessionId, runId, status}`（begin/finish 时各发一次，与 terminal 事件并存不替代）。
- 实现：`internal/dao` additive `ListLatestRunsBySessions(ctx, sessionIDs)`（窗口函数或分组取最新，稳定排序）；`internal/session` 暴露只读投影；ACP `handleListSessions` 组装。`GetActiveDurableRun` 用于 active 标记。
- 测试：wire 级——prompt 进行中 list 得 `active:true/running`；终态后 list 得终态；无 run 会话无 `lastRun` 键。

### 4.2 G2 置顶与项目投影

- 新方法 `mothx/session/setMeta`：`{sessionId, pinned?: bool, projectId?: string|null}` → `session.SetSessionMetadata`；响应 `{pinned, projectId, updatedAt}`；并发发 `session_info_update`（`_meta.pinned`）。
- `session/list._meta` 增加 `pinned: bool`、`projectId: string|null`。
- 项目 CRUD：`mothx/projects/list|create|rename|delete` → `internal/session/projects.go` 同源函数；`list` 返回 `[{id,name,createdAt,updatedAt,sessionCount?}]`。
- 测试：setMeta 后 list 透传；fork 继承 pinned=0（既有 DAO 行为）；delete project 后会话 projectId 置空（ON DELETE SET NULL）。

### 4.3 G3 工作区动态扩展

- 新方法 `mothx/workspace/extend`：`{additionalDirectories: string[]}` → 校验绝对路径、去重、上限 16 个、`EvalSymlinks` 归一后并入 `s.workspaceAdditionalDirectories`；响应 `{cwd, additionalDirectories}`；发 `_mothx/session_event {event:"workspace", ...}`。
- 安全：只允许扩大窗口；`cwd` 不可变；已打开会话的 registry 同步 `SetAdditionalDirectories`（沿用 `setSessionAdditionalDirectories`）。
- desktop：设置页"附加目录"管理 + 切主工作区仍走重启（语义清晰），附加目录免重启。
- 测试：extend 后 resource_link 可引用新目录文件；越权路径（相对/非绝对）拒绝；会话工具可读新目录。

### 4.4 G4 决策 deadline 提醒

- `requestPermission`/`requestQuestion` 发出后，在 `min(60s, timeout/2)` 与 `timeout-60s` 时发 `_mothx/session_event {event:"decision_deadline", requestId, kind, deadline, remainingMs}`（定时器随决策解决/取消清理）。
- 测试：短超时（2s）配置下收到 deadline 事件且解决后不再收到。

### 4.5 G5 resume 制品重放

- `handleResumeSession` 两分支在响应前调用既有 `replayGeneratedArtifacts`（与 load 同）。
- 测试：close→resume→收到历史 artifact 更新。

### 4.6 G6 sub-agent 事件

- `handleAgentEvent` 不再丢弃 `ev.AgentID != ""` 的终态：投影 `_mothx/session_event {event:"subagent", sessionId, agentId, parentAgentId?, status:"started|completed|failed", title?}`；子代理文本/工具事件继续只归父会话流（避免双流）。
- 测试：multi-agent fixture 下收到 subagent started/completed 配对。

### 4.7 G7 工具结果图片

- `EventToolExecutionEnd` 的 `ev.ToolResult` 之外，若工具结果携带图片（imageproc/browser 的 structured 输出），在 `tool_call_update.content` 追加 `{type:"content", content:{type:"image", mimeType, data(base64)}}`；单图 ≤ 2MB、单更新 ≤ 4 图，超限降级为文本说明（含尺寸/路径）。
- 测试：fake 工具返回图片 → content 含 image block 且 base64 可解码一致。

### 4.8 G8 附件元数据清单

- 新方法 `mothx/attachment/list`：`{sessionId, status?: "generated"|"input"}` → `[{attachmentId, filename, kind, mediaType, size, status, runId, createdAt}]`（DAO `ListBySessionStatus` 扩展 status 可选全量）；不含内容。
- desktop 制品库视图数据源（Phase 2.4）。
- 测试：list 与 fetch 的 id 集合一致；跨会话 id 拒绝（fetch 已保证）。

### 4.9 Phase 1 验收基线

`go test ./internal/acp ./internal/agentruntime ./internal/session ./internal/dao ./internal/architecture -count=1` 全绿；每项含进程级 wire 测试；`_meta.mothx.dev.features` 追加 `runStatus,sessionMeta,projects,workspaceExtend,decisionDeadline,subagentEvents,toolResultImages,attachmentList`；desktop 未集成前旧客户端不受影响（additive）。

## 5. Phase 2 — desktop 体验完善（本仓库）

1. **状态点协议化**：sidebar 状态取 `session/list._meta.lastRun` 与当前运行投影，不以 Desktop store 作为 session 状态事实来源。
2. **全局历史树/项目**：左侧任务区显示项目折叠组、最近和未分组；项目与会话菜单只调用 `mothx/projects/*`/`mothx/session/setMeta` 等 canonical ACP 方法；独立项目页替换为可搜索、cursor 分页的历史管理视图。
3. **免重启附加目录**：设置页工作区区块增加"附加目录"增删（`mothx/workspace/extend`）；composer 附件允许选择附加目录内文件（resource_link）。
4. **制品库视图**：`mothx/attachment/list` 列举当前工作区各会话 generated 制品（按会话分组），点击 `mothx/attachment/fetch` → 图片预览模态/另存并 openPath；无 `attachmentList` 发现键时显示现状占位。
5. **审批倒计时**：permission/question 卡片显示 deadline 倒计时（`decision_deadline` 事件校准）；到期自动标记"已超时"。
6. **sub-agent 卡片**：chat 流内按 `agentId` 折叠分组嵌套卡片（标题/状态/耗时）。
7. **剪贴板图片**：composer 粘贴事件 → `clipboard.readImage` → base64 `resource` block（复用 P0-2 通道）；附件 chip 显示缩略图。
8. **能力开关 UI**：composer"权限"按钮弹出 sandbox/browser/web_search 开关（`configOptions` 已含这些 id，直接 `set_config_option`）。
9. **e2e smoke**：`desktop/scripts/e2e-smoke.mjs`——spawn 打包前 dist + 临时 workspace，断言日志 `bootstrap done view=home conn=ready`、`session/new` 往返、artifact 事件（复用 Phase 0 smoke 脚本资产）；接入 `npm test` 的可选目标 `npm run e2e`（CI 无显示环境时 skip 并提示）。
10. **i18n 补齐**：Phase 1/2 新增文案全量进 zh/en 字典。
11. **新建对话默认工作目录**（后续用户反馈追加，已完成）：目录选择只决定下一次 `session/new` 的 cwd 并写入本地 UI store；不协商全局 workspace、不扩展目录窗口、不重启 ACP，也不筛选 sidebar 历史。已有 session 的 `openSession/fork/setWorkDir` 始终使用其自身 cwd。
12. **对话框置前修复**（已完成）：`dialog.showOpenDialog` 传父窗口（`BrowserWindow.fromWebContents`），修复 Linux 下无 transient-for 关联导致目录/文件选择框落在主窗口后面的问题；顺带修复通用 CSS bug（作者级 `display:flex` 覆盖 `hidden` 属性，全局补 `[hidden]{display:none!important}`）。

验收：`npm run typecheck && npm run build && npm test`；真机（或有 DISPLAY 环境）截图核对首页/聊天/制品库/设置四视图；工作单 #2 的 wire 测试在集成后复跑。追加验收：`npm run verify:phase1`（16/16 PASS）、`npm run verify:phase3`（21/21 PASS）对重建后 vendor 运行时；e2e smoke 全绿；新建对话选目录流程与对话框置前经真机手动确认。

## 6. Phase 3 — 管理面（工作单 #3 + 本仓库集成）

### 6.1 方法组设计（`mothx/manage/*`，全部复用 internal 服务单源）

| 方法 | 入参 | 出参 | 复用 |
| --- | --- | --- | --- |
| `mothx/manage/settings/get` | `{}` | settings 视图模型（密钥掩码） | `internal/config` |
| `mothx/manage/settings/patch` | `{patch:{...白名单字段}}` | 新视图模型 | `config.SaveGlobalSettingsPatch` |
| `mothx/manage/providers/list` | `{}` | providers + factory model catalog + 脱敏可编辑 provider config | provider factory + `config.ResolveProviderConfig` |
| `mothx/manage/providers/save` | `{id,previousId?,provider,apiKey?}` | 刷新的同一 catalog | `config.SaveGlobalSettingsPatch`（保留未知/敏感 sibling 字段） |
| `mothx/manage/providers/delete` | `{id}` | 刷新的同一 catalog | 删除 global overlay；preset 回退默认，自定义 provider 删除 |
| `mothx/manage/providers/discover` | draft `{api,baseUrl,apiKey?,...}` | 未持久化 `models[]` 草稿 | `provider.DiscoverModels`（同 WebUI `/api/provider/models`） |
| `mothx/manage/providers/test` | `{provider}` | `{ok, latencyMs?, error?}` | 同 `/api/provider/test` 逻辑 |
| `mothx/manage/skills/list` | `{cwd?}` | skills（name/desc/enabled/source） | `internal/skills` Manager |
| `mothx/manage/skills/set` | `{name, enabled}` | 新状态 | skills Manager + settings 白名单 |
| `mothx/manage/mcp/list` / `set` | `{}`/`{servers:[...]}` | MCP 配置与连接状态 | settings mcp 段 + `internal/mcp` 状态 |
| `mothx/manage/cron/list|create|update|remove|run` | 同 `/api/cron` 语义 | jobs + 最近运行 | `internal/cron` Store/Scheduler（ACP 进程内启动 Scheduler，`Source=acp`） |
| `mothx/manage/stats/summary|timeseries` | `{from?,to?,group?}` | 同 `/api/stats/` 语义 | `internal/stats` DB 查询 |
| `mothx/manage/memory/get|put` | `{}`/`{content}` | memory.md 内容 | serve memory 同源读写 |

生命周期说明：cron Scheduler 随 ACP 进程存活=desktop 在线期间自动化在线；离线期间的到期任务按 `internal/cron` 既有 stale/claim 语义在下次启动补跑或跳过（文档化）；需要 7×24 自动化的用户指引使用 `mothx serve`/systemd（设置页提示）。

### 6.2 desktop 视图

- 设置页：provider/model 三段式（全局默认值、供应商脱敏配置、模型 CRUD/发现草稿）；已打开 session 的模型菜单仍只走 `session/set_config_option`。其余为 onboarding 向导（doctor 失败项 → providers/test → settings/patch 写密钥（输入框掩码））；skills 启停列表；MCP 编辑器；memory 编辑器。
- "自动化"视图实体化：cron 列表（运行/暂停/恢复/立即运行/删除）+ 新建表单（schedule/prompt/mode）。
- "统计"入口（设置页或状态栏点击）：summary 卡片 + timeseries 简易折线（canvas，无新依赖）。
- 发现键：`manageSettings,manageProviders,manageProviderConfig,manageSkills,manageMcp,manageCron,manageStats,manageMemory`。

### 6.3 验收

工作单 #3 wire 测试覆盖每个方法的正/负路径与密钥掩码断言（响应中不得出现明文密钥的模式扫描）；desktop 集成后自动化视图可创建并触发一个 1 分钟后到期的任务（测试用 `--question-timeout` 同风格的短周期 env）；`go test ./internal/architecture` 绿。

## 7. Phase 4 — 云端/远程任务目标（调研）

候选路线对比（产出 `docs/proposal/desktop-remote-target-proposal.md`）：

1. **A2A 分发**：desktop 作为 A2A client 将任务派发给远端 mothx agent；优点复用既有 a2a 栈；缺点会话/制品语义需映射。
2. **serve + ACP-WebSocket 桥**：远端 `mothx serve` 暴露 ACP-over-WS（stdio 帧透传），desktop 主进程以同一 `AcpClient` 抽象接 ws transport（transport 接口化是前置小改）；优点协议零改动、客户端复用；缺点需认证/隧道安全设计。
3. **远程 acp over ssh**：spawn `ssh host mothx acp` 作为子进程；优点零服务端改造；缺点密钥/文件附件语义受限。

推荐预研顺序 2 → 3 → 1。启用条件：transport 抽象 + 认证方案 + 制品/附件跨端获取语义定稿后，desktop"云端任务"开关解除置灰。

## 8. 里程碑与分工

| 里程碑 | 内容 | 执行者 | 出口条件 |
| --- | --- | --- | --- |
| M0 ✅ | Phase 0（本文附录 A） | 本仓库 + 进程 #1 | 端到端制品链路 PASS、截图、测试绿 |
| M1 ✅ | Phase 1 工作单 #2 | 独立 mothx 进程 | §4.9 验收基线（已达成，见附录 A） |
| M2 ✅ | Phase 2 集成 | 本仓库 | §5 验收 + e2e smoke（已达成） |
| M3 ✅ | Phase 3 工作单 #3 + 集成 | 独立 mothx 进程 + 本仓库 | §6.3 验收（已达成） |
| M4 | Phase 4 调研文档 | 本仓库/独立进程 | 提案评审通过 |

每个里程碑结束后更新本文档状态表与附录实施记录；缺口清单（§2）随关闭项销账。

## 9. 风险与回滚

- **协议兼容**：全部 additive；desktop 以 features 发现 gate，旧运行时自动降级（现状已验证：artifact 缺失时走 publish_artifact 工具卡片降级）。回滚= revert 工作单提交，desktop 无需改动。
- **并发冲突**：工作单期间本仓库冻结 `internal/acp`；desktop 侧只改 `desktop/**`。若必须同改，先合工作单再 rebase desktop 集成。
- **性能/体积**：base64 通道已有 10MB/2MB/4 图上限；`attachment/list` 分页（cursor 复用 session/list 模式）防大会话膨胀。
- **cron 生命周期**：desktop 离线=自动化离线，文档与 UI 明示；不承诺服务端语义（那是 serve 的职责）。
- **安全**：workspace extend 只扩不缩且绝对路径校验；settings patch 白名单；密钥只写不读；fetch/list 均经归属校验。
- **测试成本**：进程级 wire 测试沿用 Phase 0 模式（fake provider），单工作单新增 ≤ 8 个进程测试，控制 CI 时长。
- **环境/供应链**：本环境 github（codeload/releases）不可达——`npm ci` 因 `@electron/node-gyp`（electron-builder 传递依赖，git tarball）失败，electron 二进制改走 npmmirror。已用隔离目录仅装 esbuild/tsx/typescript/electron 恢复 build/test/e2e 能力（未改 lockfile）；**打包类命令（`npm run dist*`）需待 github 恢复后 `npm ci` 补齐 electron-builder**。发布前必须在全网络 runner 复跑 `make desktop-dist-dev-*`。

## 10. Phase 0 验收摘要（留档）

- 协议冒烟：initialize/doctor/list/new/setTitle/set_config_option/close/load/delete 全 PASS；`promptCapabilities` 全 true；features 含 `artifactProjection,attachmentFetch`。
- 端到端：真实 prompt → `write` + `publish_artifact` → `artifact` 更新（artifactId/filename/kind/mediaType/size/runId/status）→ `mothx/attachment/fetch` 逐字节一致 → close+load 重放同一 artifactId。
- desktop：`tsc --noEmit`、`npm run build`、`npm test`（4/4）绿；Electron 实跑截图确认首页/聊天重放/设置；运行状态按会话绑定（stop 按钮仅在该会话运行中显示）。

## 附录 A：实施记录（工作单 #1，Phase 0）

（由执行补全的 mothx 进程在此追加：改动文件、测试结果、遗留项）

### 2026-09-06 P0 补全（第二个 mothx 进程，仅 additive，ACP v1 兼容不变）

**改动文件清单**

生产代码：

- `internal/acp/acp.go`
  - P0-2：`handleInitialize` 的 `promptCapabilities` Image/Audio/EmbeddedContext 全部翻为 `true`（`promptToIngresses` 已实现这些 content block）；`_meta.mothx.dev` 追加 `artifactProjection`/`attachmentFetch` meta 键与 features 条目（additive，便于 client 能力发现）。
  - P0-3：`RunOptions` 新增 `PermissionTimeout`/`QuestionTimeout`（`time.Duration`，零值回退默认）；server 新增 `questionTimeout` 字段并在 `Run` 中接线两个字段；新增 `defaultPermissionTimeout`(30s)/`defaultQuestionTimeout`(5m) 常量与 `effectivePermissionTimeout()`/`effectiveQuestionTimeout()` 统一回退；`requestPermissionContext` 改用 `s.effectivePermissionTimeout()`（原 `permissionTimeout` 从未被赋值的接线缺口已补），`requestQuestion` 的 5 分钟硬编码（deadline、`timeoutMs` 投影、`time.After`）改用 `s.effectiveQuestionTimeout()`。
  - P0-1：`sessionUpdate` 增加 additive JSON 字段 `artifactId`/`filename`/`mediaType`/`runId`（camelCase，`kind`/`size`/`status` 复用既有字段）；`handlePrompt` 在 `BeginArtifactCollection` 成功后安装 collector 观察者，持久化成功即发 `session/update`：`sessionUpdate:"artifact"`、`status:"generated"`，携带 artifactId/filename/kind/mediaType/size/runId；新增扩展方法 `mothx/attachment/fetch`（`handleAttachmentFetch`），入参 `{sessionId, attachmentId}`，通过 Runtime-owned `agentruntime.AttachmentService.Open`（`internal/session`+DAO 路径，含会话归属/过期/哈希完整性校验，无任何 adapter 本地扫描）读取内容，返回 `{filename, mediaType, size, contentBase64}`；超过 10MB（与 `maxRequestBytes` 对齐）返回结构化错误 `attachment_too_large`（data 携带 size/maxBytes），不存在/不属于该会话返回 `attachment_not_found`，过期返回 `attachment_expired`，缺参返回 -32602；`session/load` 两个分支（已打开会话与重新打开）在消息重放后调用 `replayGeneratedArtifacts` 补发历史 generated 制品的 `artifact` 更新。
- `internal/agentruntime/artifact.go`：`ArtifactCollector` 新增 `SetObserver(func(SessionAttachment))`（additive、nil 安全，可传 nil 移除）；`Register` 在拷贝+落库+置 generated 成功并记账后回调观察者；观察者 panic 被 recover，不影响注册流程与已持久化的制品状态。
- `internal/session/artifacts.go`（新增）：`GeneratedArtifact` 只读投影与 `ListGeneratedArtifacts(ctx, sessionDir, sessionID)`，走 `OpenRootDB` → `internal/dao` 查询（与 `ListInputResourceEvents` 同构），无直接 SQL；供 ACP `session/load` 制品重放使用。
- `internal/dao/attachments.go`：additive `AttachmentDAO.ListBySessionStatus(ctx, sessionID, status)`（`session_id`+`status` 过滤，`created_at ASC, id ASC` 稳定排序），仅供上述 session 查询走 DAO 路径。
- `cmd/mothx/main.go`：`acp` 子命令新增 `--permission-timeout` / `--question-timeout` flag（Go duration 字符串）；`resolveACPTimeout(flag, env)` 按 flag > env（`MOTHX_ACP_PERMISSION_TIMEOUT` / `MOTHX_ACP_QUESTION_TIMEOUT`）解析，非法/非正值忽略并落到零值，由 acp 回退默认 30s / 5m；`acpOptions()` 注入 `RunOptions`。

测试文件：

- `internal/acp/acp_artifact_test.go`（新增）：initialize 能力声明与 `promptToIngresses` 实现一致性（image/audio/嵌入 resource/resource_link 均物化为 Runtime ingress，kind 正确）；超时默认值/配置值/负值回退；`requestPermissionContext`、`requestQuestion` 按配置 40ms 真实超时且 `timeoutMs` 投影一致；进程级 wire 测试 `TestACPStdioProcessArtifactProjectionFetchAndLoadReplay`：假 provider 驱动 `publish_artifact` 工具执行 → client 收到 `artifact` 更新（校验 artifactId/filename/kind/mediaType/size/runId/status）→ `mothx/attachment/fetch` 取回逐字节一致内容 → missing/跨会话/缺参结构化错误 → `session/close` 后 `session/load` 重放同一 artifactId；进程级 wire 测试 `TestACPStdioProcessImagePromptReachesProviderAsImageContent`：image block 经 Runtime 输入物化（manifest mediaType image/png），read 工具后以 `image_url` data URI（base64 与原图逐字符一致）进入 provider 请求。
- `internal/agentruntime/artifact_test.go`（新增）：观察者收到的是已持久化记录（service.Get 可读、status=generated）、观察者 panic 不影响注册与后续注册、SetObserver(nil) 可移除、nil collector 安全。
- `internal/session/artifacts_test.go`（新增）：`ListGeneratedArtifacts` 仅返回本会话 `generated` 行、按创建序、字段投影完整、空/未知会话安全。
- `cmd/mothx/main_acp_timeout_test.go`（新增）：`resolveACPTimeout` flag 优先、env 回退、非法值忽略、负值/零值归零；`mothx acp --permission-timeout/--question-timeout` 与 env 注入 `acp.RunOptions`。

**测试结果**（2026-09-06，linux amd64）

- `go build ./...` 通过。
- `go test ./internal/acp ./internal/agentruntime ./internal/session ./internal/architecture -count=1` 全绿（acp 17.3s / agentruntime 42.5s / session 55.8s / architecture 0.2s；架构守卫含 DAO-only SQL 与输入契约检查均通过）。
- `go test ./cmd/mothx ./internal/dao -count=1` 全绿。
- 新增用例定向 `-race`（agentruntime 制品/观察者 + acp 全部新测试含两个进程级 wire 测试）全绿。
- 改动文件 `gofmt -l` 干净；`go vet ./internal/acp ./internal/agentruntime ./internal/session ./internal/dao ./cmd/mothx` 无告警。

**遗留项**

- P0-3 可选项「超时前 60s 发 `_mothx/session_event {event:"decision_deadline"}` 提醒」未实现（方案标注可裁剪）。
- desktop 侧不在本工作单范围：主进程 spawn 时注入 `MOTHX_ACP_PERMISSION_TIMEOUT=30m` / `MOTHX_ACP_QUESTION_TIMEOUT=30m`（或新 flag）、`desktop/main/acp-client.ts` 消费 `artifact` 更新与 `mothx/attachment/fetch` 渲染制品卡片，需按验收标准联调。
- `session/resume` 未补发制品重放（工作单仅要求 `session/load`）；如 desktop 恢复路径需要可后续 additive 补充。
- 制品 10MB fetch 上限按方案与 `maxRequestBytes` 对齐；>10MB 制品仅返回结构化错误，未提供分块/流式获取通道。
- P1/P2 各项（`lastRunStatus`、`mothx/session/setMeta`、workspace 动态切换、管理面、sub-agent 事件、工具结果图片、聚合 stats）均未在本次范围内。

### 2026-09-06 Phase 1 补全（工作单 #2，仅 additive，ACP v1 兼容不变）

**改动文件清单**

生产代码：

- `internal/acp/extensions.go`（新增）：Phase 1 全部扩展方法与投影的单源文件——`acpStructuredRPCError`（结构化错误，`error.data.code` 稳定机器码 + 人类可读 message，沿用 `attachment_not_found` 模式）；§4.1 `acpRunStatus`（canonical 状态 → `running|completed|failed|cancelled|incomplete` 映射：非终态一律 running，`timed_out/expired`→failed，`canceled`→cancelled）、`notifyRunStatus`、`sessionListLastRun`（`agentruntime.ListLatestDurableRunsBySessions` 批量取每会话最近 run + `GetActiveDurableRun` 判定 active，失败降级为空投影不阻塞 list）；§4.2 `handleSetSessionMeta`（absent/null/string 三态 projectId、与既有值合并后走 `session.SetSessionMetadata`，回读响应 `{pinned,projectId,updatedAt}`）、`notifySessionMetaInfo`（`session_info_update` 携带 `_meta.pinned/_meta.projectId`）、`sessionListMetadata`（批量 `session.ListSessionMetadata`）、`handleProjectsList|Create|Rename|Delete`（`internal/session/projects.go` 同源投影，list 含 `sessionCount`）；§4.3 `handleWorkspaceExtend`（绝对路径校验、`EvalSymlinks` 归一、存在性校验、去重合并、上限 16（`workspace_limit_exceeded`）、只扩不缩、cwd 不可变、已打开会话经 `setSessionAdditionalDirectories` + `registry.SetAdditionalDirectories` 同步、广播 `_mothx/session_event {event:"workspace",cwd,additionalDirectories}`（进程级窗口，无 sessionId））；§4.4 `scheduleDecisionDeadline`/`emitDecisionDeadline`（min(60s,timeout/2) 与 timeout-60s 两个提醒点，stop 随决策解决/取消/超时调用，goroutine 无泄漏）；§4.6 `observeSubagentEvent`/`emitSubagentEvent`/`clearSubagentProjections`（每 agentId 恰好一个 started + 一个终态；RunFinished success/incomplete→completed、error/canceled→failed、legacy Done→completed、Error→failed；parentAgentId 经 `AgentManager.Parent` 解析，可选）；§4.7 `acpToolImageContents`/`acpByteSize`（单图 ≤2MB（按 base64 解码长度）、单更新 ≤4 图、超限降级为文本说明含 mime/尺寸）；§4.8 `handleAttachmentList`（协议 status `generated|input` 映射 canonical `generated|accepted`，空=全量；元数据投影不含内容；跨会话天然隔离）。
- `internal/acp/acp.go`：dispatch 新增 `mothx/session/setMeta`、`mothx/projects/list|create|rename|delete`、`mothx/workspace/extend`、`mothx/attachment/list`；`initialize._meta.mothx.dev.features` 追加 `runStatus,sessionMeta,projects,workspaceExtend,decisionDeadline,subagentEvents,toolResultImages,attachmentList`（Phase 0 键保留）；server 新增 `subagents` 投影状态表（`Run` 中初始化，`shutdownSessionRuntime` 清理）；`handleResumeSession` 两分支响应前补调 `replayGeneratedArtifacts`（§4.5）；`handleListSessions` 每页组装 `_meta.pinned/projectId`（恒在，默认 false/null）与 `_meta.lastRun{runId,status,startedAt,finishedAt,active}`（无 run 的会话不带 lastRun 键）；`handleAgentEvent` 顶部对 `ev.AgentID != ""` 调 `observeSubagentEvent`（子代理文本/工具事件仍只归父会话流；子代理终态不再丢弃、改为 subagent 事件，父 terminal 投影保持不受子代理影响）；`EventToolExecutionEnd` 在文本块后、diff 前追加 `ev.ToolImages` 的 image content 块；`handlePrompt` 在 `BeginIntentDurable` 成功后发 `run_status running`、`finishEarly` 与运行 goroutine 终态持久化后发 `run_status <终态>`（在 prompt 响应之后、admission 锁释放之前发出，与 terminal 事件并存不替代）；`requestQuestion`/`requestPermissionContext` 在 `notifyRequest` 成功后 `defer` 挂载 deadline 提醒（permission 的 deadline 提为局部变量，语义不变）；`attachmentFetchRPCError` 改为 `acpStructuredRPCError(-32000,…)` 的薄封装（行为不变）。
- `internal/dao/run.go`：additive `RunDAO.LatestRunBySessions(ctx, sessionIDs)`——窗口函数 `ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY started_at DESC, rowid DESC)` 取每会话最近一次 run，输出按 session_id 稳定排序；DAO 内拥有全部 SQL。
- `internal/dao/projects.go`：additive `MetadataForSessions`（批量元数据，session_id 稳定排序）、`SessionCountsByProject`（每项目会话计数）、`ClearMetadataProject`（显式落实 schema 声明的 `ON DELETE SET NULL`——SQLite 未开启 foreign_keys pragma 时该 FK 为休眠语义）。
- `internal/dao/attachments.go`：additive `ListBySession(ctx, sessionID, status)`（status 空=全量，`created_at ASC, id ASC` 稳定排序）；既有 `ListBySessionStatus` 不变。
- `internal/session/run_store.go`：additive 只读投影 `ListLatestSessionRuns(ctx, sessionDir, sessionIDs)`（走 `openExistingSessionDB` → DAO，无 run 会话缺席）。
- `internal/session/projects.go`：`SessionMetadata` additive 字段 `UpdatedAt`（`GetSessionMetadata` 回读填充，写入路径语义不变）；additive `ListSessionMetadata`/`ProjectSessionCounts`；`DeleteProject` 删除前调用 `ClearMetadataProject` 使会话 projectId 置空（兑现 §4.2 验收「delete project 后会话 projectId 置空」，serve `/api/projects` 同源受益）。
- `internal/session/artifacts.go`：additive `ListSessionAttachments(ctx, sessionDir, sessionID, status)`（复用 `GeneratedArtifact` 行投影，抽出 `generatedArtifactFromRecord` 共享映射；`ListGeneratedArtifacts` 行为不变）。
- `internal/agentruntime/run_queries.go`：additive `ListLatestDurableRunsBySessions`（`session.ListLatestSessionRuns` 的适配器只读边界，与 `GetDurableRun/GetActiveDurableRun` 同型）。
- `agent/types.go`（公共 SDK，additive）：`Event.ToolImages []ToolImage` 与新类型 `ToolImage{MimeType,Data(base64)}`——§4.7 指定的图片携带点（既有事件无 structured 图片字段）。
- `internal/agent/events.go`：内部 `Event.ToolImages` 与内部 `ToolImage` 类型（additive）。
- `internal/agent/agent_context.go`：`toolResultImages(contents)` 从富工具结果（`ToolResult.Contents`，imageproc 处理后的 read 图片、image_generation、browser 截图共用该通道）提取 base64 原样载荷。
- `internal/agent/agent.go`：两处 `EventToolExecutionEnd` 发射点（正常执行与幂等复用路径）填充 `ToolImages`——这是「工具填充」的最小接线点：工具已把图片放入 `ToolResult.Contents`，事件层只做提取，不改任何工具。
- `internal/agent/bridge.go`：`EventToPublic` 映射 `ToolImages`（新增 `ToolImagesToPublic`，base64 原样透传）。
- `internal/agent/subagent.go`：`ForwardChildAgentEvent` 透传 `ToolImages`，子代理工具图片随父流投影保持一致。

测试文件：

- `internal/acp/acp_phase1_test.go`（新增，单元级）：`acpRunStatus` 全状态映射；`notifyRunStatus` 事件形状；`acpOptionalProjectID` absent/null/string/非法四态；setMeta/projects/attachment-list 参数与无 settings 的结构化错误码（`invalid_params`/`projects_unavailable`/`attachment_list_invalid_status`）；workspace extend 校验（相对路径/不存在目录/空入参拒绝且不污染窗口、合法合并去重、16 上限、符号链接 EvalSymlinks 归一）；deadline 提醒双点位发射 + stop 后不再发 + 立即 stop 不发 + 短超时只发首点（提醒点位为包级 var 仅供测试缩短）；subagent 投影（父事件不投影、首个子事件 started、canonical 终态恰好一次、legacy Done/Error 不重复、failed/canceled 映射、clear 后可复用）；`acpToolImageContents`（限制内透传、空 mime 回退、超限降级文本、空载荷跳过）；`handleAgentEvent` 端到端投影 image 块且 rawOutput 不携带 base64；initialize features 含全部 8 个新键且 Phase 0 键保留；`requestPermissionContext` 超时路径收到 approval deadline 提醒且解决后不再收到；引入线程安全 `syncedBuffer` 消除提醒 goroutine 与断言的缓冲区竞争。
- `internal/acp/acp_phase1_process_test.go`（新增，进程级 wire，6 个测试覆盖 §4.9 全部 8 项验收）：
  - `TestACPStdioProcessRunStatusProjectionAndEvents`（§4.1+§4.9 features）：阻塞 provider 下 prompt 进行中 `session/list` 得 `lastRun{active:true,status:running,startedAt,finishedAt:null}`、无 run 会话无 `lastRun` 键、默认 `pinned:false/projectId:null`；begin 时收到 `run_status running`；终态后收到 `run_status completed`（紧随 prompt 响应）且 terminal 事件并存；复查 list 得 `completed/active:false/finishedAt`；initialize features 含 8 个新键。
  - `TestACPStdioProcessSessionMetaProjectsAndFork`（§4.2）：projects create/list(sessionCount=0)/rename/delete；setMeta 响应 `{pinned,projectId,updatedAt}` + `session_info_update._meta.pinned/projectId` 广播 + list 透传；fork 继承 `pinned=false` 且继承 projectId（既有 DAO 行为）；delete project 后两会话 projectId 置空；`project_not_found`/`session_not_found` 结构化错误；`projectId:null` 显式清空且保留 pin。
  - `TestACPStdioProcessWorkspaceExtend`（§4.3）：initialize 协商窗口后，extend 前 prompt 引用新目录 resource_link 被拒（outside the negotiated workspace）；相对路径 extend 拒绝（`workspace_directory_invalid`）；合法 extend 响应 `{cwd,additionalDirectories}`（EvalSymlinks 归一）+ `workspace` 事件；extend 后同一 prompt 放行、resource_link 物化进 provider 请求、已打开会话的 read 工具可读新目录文件。
  - `TestACPStdioProcessDecisionDeadlineReminders`（§4.4）：`MOTHX_ACP_HELPER_QUESTION_TIMEOUT=4s` 下 question 反向请求后约 2s 收到 `decision_deadline{requestId,kind:"question",deadline,remainingMs∈(0,4000]}`；应答解决后直到 run 完成全程仅 1 条提醒（无泄漏、无迟到提醒）。
  - `TestACPStdioProcessResumeArtifactReplayAndAttachmentList`（§4.5+§4.8）：publish_artifact 制品 → close → resume（重新打开分支）重放同一 artifactId → 再次 resume（已打开分支）再次重放；`attachment/list` 返回 `{attachmentId,filename,kind,mediaType,size,status,runId,createdAt}` 且不含内容；`status:"generated"` 命中、`"input"` 为空；他会话/未知会话列表为空（跨会话隔离）；list 的 id 经 `attachment/fetch` 逐字节一致。
  - `TestACPStdioProcessSubagentEventsAndToolResultImages`（§4.6+§4.7）：multi-agent helper 下 delegate_subagent 驱动真实子代理——`subagent started/completed` 恰好一对、同 agentId、顺序正确、归属父会话；子代理终态未产生父 terminal（父 terminal 恰好一条 completed）；子代理文本仍走父会话流；vision 模型下 read 图片结果的 `tool_call_update.content` 含 image 块，base64 与原 PNG 逐字节一致。
- `internal/acp/acp_process_integration_test.go`：进程 helper additive 扩展——`MOTHX_ACP_HELPER_MULTI_AGENT`/`MOTHX_ACP_HELPER_QUESTION_TIMEOUT`/`MOTHX_ACP_HELPER_PERMISSION_TIMEOUT` 注入 `RunOptions`，默认零值保持既有进程测试行为不变。
- `internal/acp/acp_artifact_test.go`：既有 40ms 超时单测升级为逐行解析（输出现在含 additive 的 `decision_deadline` 提醒），并顺势断言提醒的 kind/requestId/deadline/remainingMs；fixture 换用 `syncedBuffer`。
- `internal/dao/run_projections_test.go`（新增）：`LatestRunBySessions` 每会话取最新、缺席会话不投影、空入参安全；`MetadataForSessions` 批量与稳定排序；`SessionCountsByProject` 计数与 `ClearMetadataProject` 清空（pin 保留）；`ListBySession` status 可选全量与创建序。
- `internal/session/phase1_projections_test.go`（新增）：`ListLatestSessionRuns`（含无 DB 目录降级为空）；`ListSessionMetadata`/`ProjectSessionCounts`/`GetSessionMetadata.UpdatedAt`；`DeleteProject` 后会话 projectId 置空且 pin 保留；`ListSessionAttachments` status 过滤与字段完整性。
- `internal/agentruntime/run_queries_test.go`：additive `ListLatestDurableRunsBySessions` 与 `GetActiveDurableRun` 的一致性用例。
- `internal/agent/bridge_test.go`：`toolResultImages` 提取（跳过文本/nil/空载荷）与 `EventToPublic` 的 `ToolImages` 原样透传。

**测试结果**（2026-09-06，linux amd64，go1.27）

- `go build ./...` 通过。
- `go test ./internal/acp ./internal/agentruntime ./internal/session ./internal/dao ./internal/architecture -count=1` 全绿（acp 26.6s / agentruntime 43.6s / session 56.5s / dao 2.6s / architecture 0.2s；架构守卫含 DAO-only SQL、输入契约与公共 SDK 边界检查均通过）。
- `go test ./internal/agent ./agent ./cmd/mothx ./internal/serve/openaiapi -count=1` 全绿（回归确认）。
- 新增用例定向 `-race` 全绿：dao/session/agentruntime/agent 新单测 + acp 全部 Phase 1 单测 + 6 个进程级 wire 测试（subagent 用例单独复跑 `-race` 亦绿）。
- 改动包 `gofmt -l` 干净；`go vet ./agent ./internal/agent ./internal/acp ./internal/dao ./internal/session ./internal/agentruntime` 无告警。

**实现要点与协议语义备忘**

- `run_status` 终态事件由 run finalizer 在 prompt 响应之后、admission 锁释放之前发出（客户端以事件而非响应顺序为准）；状态词汇经 `acpRunStatus` 收敛为 `running|completed|failed|cancelled|incomplete`。
- `attachment/list` 响应形状为 `{"attachments":[…]}`（对象包裹便于后续 additive 增加 cursor 分页）；协议过滤值 `input` 映射 canonical 持久化状态 `accepted`，响应中的 `status` 始终回 canonical 值（`accepted|generated|expired`）。
- `projects/list` 响应形状为 `{"projects":[{id,name,createdAt,updatedAt,sessionCount}]}`；`setMeta` 的 `projectId` 支持 absent（保留）/null（清空）/string（赋值）三态。
- `workspace` 事件为进程级窗口投影（不含 sessionId）；extend 对已打开会话为尽力同步（单会话失败记日志不阻断窗口扩展）。
- subagent 事件 `title` 字段暂未填充（AgentManager 状态无任务标题投影，属可选字段）；`parentAgentId` 在 manager 可解析时携带。

**遗留项**

- `attachment/list` 未做 cursor 分页（§9 风险项，响应已用对象包裹预留 additive 空间）；大会话全量返回。
- deadline 提醒仅挂接首发路径（`requestQuestion`/`requestPermissionContext`）；`replayPendingDecisionRequests` 重连补发路径未按持久化 deadline 余量重挂提醒。
- 子代理 `subagent` 事件无 `title`；desktop Phase 2.6 若需标题需 AgentManager 增投影（另行工作单）。
- §4.7 图片仅投影 `EventToolExecutionEnd`（含子代理转发）；`emitMessage` 的历史消息重放路径（load/resume）不重建图片块（持久化消息为文本+provider contents，重放语义未变）。
- `internal/session.DeleteProject` 现同步清空会话项目引用：这是兑现 schema 已声明的 `ON DELETE SET NULL`（SQLite foreign_keys pragma 未开启导致 FK 休眠），serve `/api/projects/delete` 行为随之对齐，属既有声明语义的落实而非新语义。
- desktop 侧集成（Phase 2 全部条目：状态点协议化、置顶/项目视图、免重启附加目录、制品库、审批倒计时、sub-agent 卡片等）不在本工作单范围；旧客户端未消费新键时行为不变（additive 已验证）。

### 2026-09-06 Phase 3 管理面（工作单 #3，仅 additive，ACP v1 兼容不变）

**改动文件清单**

生产代码：

- `internal/acp/manage.go`（新增）：§6.1 全部 17 个 `mothx/manage/*` 扩展方法的单源文件——`handleManageRequest` 路由表 + settings/providers/skills/mcp/cron/stats/memory 七组 handler。每个 handler 都是既有 internal 服务的薄投影：无业务逻辑复制、无 adapter 本地存储、无 internal/serve HTTP handler 依赖。密钥安全模型（§3.3）落在 `manageMaskSecret`（`sk-***abc` 形状，≤6 字符全掩码）、`manageSecretUsable`（`${ENV}`/`!shell` 未解析引用投影为无密钥 null）、`manageRedactSecrets`（出站错误消息对全部已配置密钥做防御性擦除）三个共享助手上。
- `internal/acp/acp.go`：dispatch `default` 分支增加 `mothx/manage/` 前缀路由（既有方法逐一 case 不变；未知 manage 方法返回结构化 `manage_method_not_found`，非 manage 前缀仍返回 -32601 原文案）；`initialize._meta.mothx.dev.features` 追加 `manageSettings,manageProviders,manageSkills,manageMcp,manageCron,manageStats,manageMemory`（Phase 0/1 键全部保留）；server 新增 `cronMu/cronScheduler/cronStore/cronAgentMgr` 四个管理面 cron 字段；`Run()` 增加 `defer srv.stopManageCron()`（LIFO：先停 cron 调度器再关会话运行时）。
- `internal/config/settings.go`：additive `SkillsSettings{Disabled []string}` 与 `Settings.Skills *SkillsSettings`（指针 + omitempty，稀疏文件不长出 `skills` 段，旧文件行为不变）；nil 安全只读访问器 `SkillsDisabled()`（返回副本）。
- `internal/config/mcp.go`：additive `MCPServer.Enabled *bool`（nil=启用，向后兼容既有 mcp.json）与 `MCPServerEnabled()` 判定助手。
- `internal/skills/skills.go`：启停机制的唯一过滤接线点——`Load()` 末尾 `applyConfiguredDisabledSkills()` 读取全局 `settings.skills.disabled`（`config.LoadGlobalSettingsSparse`），因此 TUI/serve/openaiapi/agentruntime/ACP 所有既有构造点无需改动即共享同一启停语义；`Get/List/ListBySource/Names/BuildSkillContext/BuildAllSkillsContext/LoadReference/ListReferences` 全部过滤 disabled；additive `ListAll()`（管理面投影含 disabled 条目）、`SetDisabledSkills()/DisabledSkills()/IsSkillDisabled()`（独立 RWMutex，管理面写入后进程内即时生效）。
- `internal/cron/scheduler.go`：additive `JobCompletionObserver` 类型 + `SetJobCompletionObserver`（job 粒度完成回调，携带 job 本体，与既有 session 粒度 observer 并存、语义不变）；additive `ErrJobAlreadyRunning` 哨兵与 `RunNow(id)`——立即手动触发：复用 cron 工具 run 动作的覆盖语义（重新 enable + 清空 last/next），再走 `claimJob`（SQLite `ClaimDue` 原子 stamp `last_run`/`running`，跨进程防重）+ `executeJobContext`（jobWG 追踪、stopCtx 可取消），执行结果经既有 `updateJob` 写回 `RunCount/LastStatus/LastError/NextRun`（`CronJob.LastRun` 字段与持久化本已存在，无需新增）。
- `internal/cron/schedule.go`：additive 导出 `NormalizeJobSchedule(job)`——mode 默认 yolo、仅接受 agent/yolo、空或 `@once` schedule 判定 one-shot、周期任务计算 `NextRun`；成为管理面创建/更新的规范化单源（serve 内既有私有同形函数保持只读不动）。
- `internal/provider/factory`、`internal/stats`：**无需改动**——`ResolvedModels/SortProviderIDs/Create` 与 `Open/Query/Summary/TimeSeries/ParseQueryParams` 均已导出，直接复用。

测试文件：

- `internal/acp/acp_manage_test.go`（新增，16 个单测）：掩码形状与占位符判定、redaction、settings get 掩码/空密钥 null/响应级密钥扫描、patch 白名单往返（defaultModel/mode/thinkingLevel/sandbox/webSearch 稀疏合并且兄弟字段保留、providerKey/providerBaseUrl 按 raw 合并保留 api/models 兄弟字段、轮换密钥落盘但 wire 只见掩码）、越权与非法值结构化错误（`memoryEnabled`→`settings_field_not_allowed`、`turbo` 模式→`settings_field_invalid` 等 8 例 + 拒绝不落盘断言）、providers list 目录投影、providers test 结构化路径（invalid_params/provider_not_found/ok:false 无密钥）、skills list/set 往返（live Manager 过滤 + ListAll 保留 + 稀疏段删除 + skill_not_found）、mcp list/set（env/header 值掩码、全量替换、按名合并保留 env 值落盘、`mcp_field_not_allowed`/`mcp_server_invalid`、空数组清空）、cron 白名单与规范化（`cron_field_not_allowed`/`cron_mode_invalid`/`cron_schedule_invalid`/`cron_field_invalid`）、stats query 映射（day 默认、date-only To 含全天、RFC3339 回退、`stats_group_invalid`/`stats_time_invalid`）、memory 往返/1MB 上限/serve.json 显式路径与 features.memory 投影、未知 manage 方法、initialize features 7 个新键 + Phase 0/1 键保留 + 协议版本不变。
- `internal/acp/acp_manage_process_test.go`（新增，3 个进程级 wire 测试，复用 `TestACPStdioProcessHelper` 子进程模式，`manageProcess` 记录全部 wire 消息做终局密钥模式扫描）：
  - `TestACPStdioProcessManageSettingsProvidersAndSecrets`：features 7 键；settings/get 掩码 `sk-***456`；patch 标量+开关落盘（sandbox/webSearch 稀疏合并）；`memoryEnabled` 越权拒绝；providerKey 轮换后设置文件含新密钥而全 transcript 无 `PLAINKEY/DOWNKEY/ROTKEY` 明文；providers/list 目录；providers/test fake provider ok（latencyMs 携带）+ 127.0.0.1:1 失败路（ok:false、error 无密钥）+ provider_not_found。
  - `TestACPStdioProcessManageSkillsMcpMemoryStats`：skills list（global+project 源、enabled 默认 true）→ set 停用 → list/settings.get/落盘 `skills.disabled` 三处一致 → skill_not_found → 重新启用后稀疏段删除；mcp/list envKeys 只有键名、值（`mcp-super-secret`/`hdr-secret`）全程不出现在 wire；mcp/set 全量替换（goner 移除、remote 新增、keeper env 值按名合并保留在磁盘）+ headers 字段拒绝；memory get 空态（path=全局 `~/.mothx/memory.md` 同源解析）→ put → get 往返 → 1MB+1 → `memory_too_large`；stats summary/timeseries 空态形状 + `stats_group_invalid`。
  - `TestACPStdioProcessManageCronRunCompletionAndStats`：cron/list 触发进程内 Scheduler 幂等启动（enabled/running=true）；create 校验三拒绝（`cron_mode_invalid`/`cron_schedule_invalid`/`cron_field_not_allowed`）；创建 disabled one-shot → `cron/run` 立即触发（fake provider SSE+usage）→ 收到 `_mothx/session_event {event:"cron_completed", jobId, status:"success"}`（全局任务无 sessionId 键）→ list 含 `lastRun`(RFC3339)/`lastStatus=success`/`runCount=1`/one-shot 自动停用；二次 run 覆盖已停用 one-shot（runCount=2）；周期任务 create（@daily 含 nextRun）→ update（改名/停用）→ `cron_job_not_found` → remove → 二次 remove/run not_found；随后 session/new+prompt（usage 落 request_stats）→ stats/summary sessions≥1、runs≥1、tokens.input≥11/output≥7 → timeseries 当日桶 runs/tokens/cost 形状；a2aToken 永不投影。
- `internal/skills/skills_disabled_test.go`（新增）：Load 应用全局 disabled（List/ListBySource/Names/Get/BuildSkillContext/BuildAllSkillsContext/LoadReference/ListReferences 全过滤、ListAll 保留）；SetDisabledSkills live 更新（trim/清空）；无 skills 段时行为与稀疏文件不变。
- `internal/config/manage_additions_test.go`（新增）：`skills.disabled` 稀疏往返（空 Settings 不长 skills 段、SaveGlobalSettingsPatch 写/删、SkillsDisabled nil 安全 + 副本语义）；`MCPServer.Enabled` legacy 无键默认启用、显式 false/true、SaveMCPConfig/LoadMCPConfig 往返、Normalize 不改启停。
- `internal/cron/manage_runnow_test.go`（新增）：NormalizeJobSchedule 全分支；RunNow 未 Start 也可手动执行（nil manager → job observer 收到 failed、lastRun 经 claim 落库、RunCount=1、one-shot 自动停用、二次 RunNow 覆盖）；session observer 对无会话任务不触发；RunNow 错误路径（missing/empty id、`ErrJobAlreadyRunning`、nil scheduler 安全）。

**实现要点与复用的单源函数**

- `settings/get|patch`：视图=`config.LoadSettings()`（与全部运行时同一加载器）；providers 数组经 `config.ResolveProviderConfig`+`providerfactory.ResolvedModels`+`SortProviderIDs`；掩码前的密钥解析复用 `Settings.ResolveKey`（env/shell 引用同工厂语义）。写路径全部经 `config.SaveGlobalSettingsPatch`；嵌套键（providers/sandbox/webSearch/skills）在 raw JSON 层合并（`manageRawGlobalSettings`/`manageMergeRawObject`），兄弟与未知字段字节级保留，稀疏文件不被默认值展开。`thinkingLevel`→`defaultThinkingLevel`、`defaultMode` 空值投影 yolo（产品默认规则不变）。
- `providers/list`：与 serve `/api/models/catalog` 同源——`providerfactory.ResolvedModels` × 排序后的 provider id 集合（`handleModelCatalog` 的同一对导出函数），无第二套目录逻辑。
- `providers/test`：与 serve `/api/provider/test` 同一探针语义（`providerfactory.Create` + 1-token `Chat` ping + StreamError/StreamDone 判定），按任务书收紧为 5s 超时并改从已存 settings 构建；响应/错误经 `manageRedactSecrets` 防御性擦除。
- `skills/list|set`：发现=`skills.NewManagerWithProjectDirs(settings.GetGlobalSkillsDir(), skills.ProjectSkillDirs(cwd))`（与 `agentruntime.LoadContextResources` 同构）；启停=全局 `settings.skills.disabled` 单一事实源，过滤接线在 `skills.Manager.Load()`，TUI/serve/ACP 行为一致；set 后 `SetDisabledSkills` live 应用到本进程运行时 Manager。
- `mcp/list|set`：`config.LoadMCPConfig/SaveMCPConfig/NormalizeMCPConfig`（全局 mcp.json，与 serve `/api/mcp` 同一 schema 与路径）；env/header 只投影键名列表，值永不上 wire；set 为全量替换 + 按名合并保留未白名单字段（因 list 掩码 env，纯替换会静默销毁密钥，合并语义已在响应/文档中固定）。
- `cron/*`：`cron.NewSQLiteCronStore`（sessions.db 同源）+ `cron.Scheduler`（Start/Stop/IsRunning 幂等，随 ACP 进程生命周期，首个 cron 管理调用懒启动）；job runner=既有 `executeJobContext` 瞬态 sub-agent 路径，mode/source 经 `agentruntime.ResolvePolicy(SourceCron, job.Mode, ModeYolo)` 独立解析（不继承 desktop 会话强制 yolo 语义）；AgentManager 经 `agentruntime.NewAgentManager` 规范构造路径懒建（`cronAgentMgr` 独立持有，不与多代理开关耦合）；`cron/run`=`Scheduler.RunNow`（claim 原子 stamp lastRun，跨进程防重）；完成投影 `_mothx/session_event {event:"cron_completed", sessionId?, jobId, status}`；请求形状对齐 serve `/api/cron`（白名单收敛为 name/schedule/prompt/mode/enabled，sessionId/workDir/a2a 字段由管理面自持：workDir=协商工作区、全局任务无会话绑定、a2aToken 永不投影）；tick 可用 `MOTHX_ACP_CRON_INTERVAL`（Go duration）缩短，默认 30s 与 serve/TUI 一致。
- `stats/summary|timeseries`：`stats.Open(sessions.db)`+`stats.Query`+`Summary/TimeSeries`（与 serve `/api/stats/` 同一 DAO 查询，只读）；参数映射复用 `stats.ParseQueryParams`（date-only To 含全天）+ RFC3339 additive 回退；timeseries 默认 group=day、窗口 14 天；summary.sessions 复用 `session.ListAllDetailed` 计数；DB 缺失投影空形状（与 serve 相同降级）。request_stats 无 cost 列 → `cost` 恒 0（见遗留项）。
- `memory/get|put`：`serve.LoadConfig()`（serve 配置加载器单源，非 HTTP handler）取 `memory.path`，未配置则回落全局 `~/.mothx/memory.md`（勘察结论：serve 默认 `Memory.Path=""`、`Features.Memory=true`）；读写/解析全部经 `memory.Store`（与 serve `/api/memory` 同源）；put 上限 1MB → `memory_too_large`（data 携带 size/maxBytes）；响应 `{size, updatedAt, path, source}`。
- 错误模型：全部经既有 `acpStructuredRPCError`，`error.data.code` 稳定机器码——`settings_field_not_allowed/settings_field_invalid/settings_unavailable/settings_save_failed/provider_not_found/provider_test_failed/skills_unavailable/skill_not_found/mcp_unavailable/mcp_field_not_allowed/mcp_server_invalid/cron_unavailable/cron_field_not_allowed/cron_field_invalid/cron_mode_invalid/cron_schedule_invalid/cron_job_not_found/cron_job_running/cron_run_failed/stats_group_invalid/stats_time_invalid/stats_unavailable/memory_too_large/memory_unavailable/manage_method_not_found/invalid_params`。

**测试结果**（2026-09-06，linux amd64，go1.27）

- `go build ./...` 通过。
- `go test ./internal/acp ./internal/config ./internal/skills ./internal/cron ./internal/stats ./internal/architecture -count=1` 全绿（acp 24.6s / config 0.15s / skills 0.12s / cron 14.3s / stats 4.9s / architecture 0.2s；架构守卫含 DAO-only SQL、Agent 构造与输入契约检查均通过）。
- 存量回归 `go test ./internal/serve/... ./cmd/mothx -count=1` 全绿（serve 11.9s / channels 21.6s / openaiapi 50.7s / hooks / webhook / cmd 3.9s——serve 行为不受影响）；额外回归 `./internal/tui ./internal/agentruntime` 全绿（skills 过滤接线消费方覆盖）。
- 新增用例定向 `-race` 全绿：acp 全部 manage 单测 + 3 个进程级 wire 测试（9.9s）、skills disabled 3 测、config additive 2 测、cron RunNow/Normalize 3 测。
- 改动文件 `gofmt -l` 干净；`go vet ./internal/acp ./internal/config ./internal/skills ./internal/cron ./internal/stats ./internal/provider/factory` 无告警。

**遗留项**

- **MCP enabled 运行时过滤未接线**：`MCPServer.Enabled` 已持久化并在 list/set 投影，但连接过滤点在 `internal/mcp.LoadConfiguredServers`（本工作单禁改范围外）；disabled 服务器在后续工作单接线前仍会被 ACP/serve/TUI 运行时连接。`config.MCPServerEnabled` 已备好判定单源。
- **stats cost 恒 0**：`request_stats` schema 无 cost 列（本工作单对 internal/stats 只读、不改 DAO/schema）；模型定价已存在于 catalog（`CostConfig`/`ModelPricing`），后续可经 additive DAO 查询联接计算。
- **memoryEnabled 不可 patch**：memory 特性门控归 serve.json（`features.memory`/`memory.enabled`）所有，settings.json 无对应 schema，为避免双事实源与死配置，patch 白名单拒绝该字段（`settings_field_not_allowed`）；settings/get 的 `memoryEnabled` 为只读投影（`serve.LoadConfig` 同源）。
- **settings/patch 不热替换 `s.settings`**：为避免无锁读者竞争，patch 只持久化全局文件；进程内热切换继续走 `session/set_config_option`，新默认值对新进程/新会话运行时生效。skills 启停是唯一 live 应用项（`SetDisabledSkills` 有独立锁）。
- **one-shot 粘滞语义**：`cron/update` 给 one-shot 任务补 schedule 不会清除 OneShot（与 serve/cron 工具既有行为一致）；周期任务需直接以 schedule 创建。
- **瞬态 cron run 不落 request_stats**：usage 记录依赖会话 Manager（`RecordUsage`），无会话绑定的管理面任务不产生 stats 行；stats 聚合口径为会话绑定请求。
- **调度器懒启动**：Scheduler 在首个 `mothx/manage/cron/*` 调用时 Start（幂等）；desktop 离线期间到期任务沿用 `internal/cron` 既有 stale/claim 语义（24h lease）在下次启动补跑或跳过，7×24 需求指引 serve/systemd（§6.1 生命周期说明）。
- **desktop 视图与集成（§6.2）不在本工作单范围**：设置页 onboarding/skills 启停/MCP 编辑器/memory 编辑器、自动化视图、统计入口按发现键 gate 由本仓库主流程完成；旧客户端未消费新键时行为不变（additive 已验证）。

### 2026-09-06 desktop UX 增量与验收 harness（本仓库主流程，Phase 1/3 集成后）

**改动文件清单**

- `desktop/renderer/src/state.ts`：`currentDir`/`dirConfirmed` 状态、`hasFeature()` 能力发现、`lastRun/pinned/projectId` 类型、subagent/deadline 转录项类型。
- `desktop/renderer/src/sessions.ts`：`chooseWorkingDirectory()`（新建对话先选目录：extend 免重启纳入窗口 / 老运行时 `acp.restart` 回退 / 取消即放弃）、`startNewTaskWithDirectory()`、`refreshSessions/openSession/forkSession/createSession` 全部改以 `currentDir` 或会话自身 cwd 为准。
- `desktop/renderer/src/composer.ts`：首发送前目录确认门控；剪贴板图片粘贴；能力开关弹窗（sandbox/browser/web_search）；附件允许附加目录内 resource_link。
- `desktop/renderer/src/sidebar.ts`：新建任务按钮改走先选目录；状态点协议化（`lastRun` 优先、store fallback）；项目筛选 chip；nav 触发 projects/library/automation/settings 的异步渲染。
- `desktop/renderer/src/projects.ts`、`library.ts`、`manage.ts`、`automation.ts`（新增）：项目视图、制品库视图、设置页管理面区块（providers/skills/mcp/memory/stats）、自动化视图（cron 全操作 + 新建模态）。
- `desktop/renderer/src/chat.ts`：sub-agent 卡片、审批/提问 deadline 倒计时 ticker、`openArtifactMeta(sessionId, …)` 供制品库复用、run_status/workspace/decision_deadline/subagent 事件投影。
- `desktop/renderer/index.html`、`styles.css`、`i18n.ts`：项目/自动化/设置管理面容器与 cron 模态；`[hidden]{display:none!important}` 通用修复；zh/en 文案约 100 键。
- `desktop/main/ipc.ts`：`showOpenDialog` 传父窗口（对话框置前/模态）。
- `desktop/scripts/phase1-verify.mjs`、`phase3-verify.mjs`（新增，`npm run verify:phase1|phase3`）：对 vendor 运行时的协议验收 harness（memory/mcp 往返均恢复原状、cron 测试任务用完即删）。
- `desktop/scripts/e2e-smoke.mjs`：启动前自清理残留 smoke 实例（匹配 `--no-sandbox` 标记），进程组 kill 防单实例锁残留。

**实现要点**

- 新建对话目录选择的协议语义：`session/new.cwd` 与 `_meta.mothx.workspace.cwd` 均取所选目录；目录不在协商窗口内时先 `mothx/workspace/extend`（只扩不缩），保证 ACP 服务端校验通过；无 `workspaceExtend` 发现键的老运行时回退 `acp.restart(dir)`（会话持久化可恢复）。
- 对话框置前根因：无父窗口的 `showOpenDialog` 在 Linux 下缺 transient-for 关联；传 `BrowserWindow.fromWebContents(event.sender)` 后模态置顶（用户真机确认）。
- `[hidden]` 修复根因：作者级 `display:flex`（gap-card/filter-chip/attach-row）覆盖 UA 的 `[hidden]{display:none}`；全局 `!important` 规则一次修复所有视图。

**测试结果**

- `npx tsc --noEmit`、`npm run build`、`npm test`（4/4）、`npm run e2e` 全绿（多次复跑）。
- `npm run verify:phase1` 16/16 PASS、`npm run verify:phase3` 21/21 PASS（对 Phase 1/3 合并后重建的 vendor 运行时）。
- 真机探针：项目视图/自动化视图/设置管理面区块的能力路径与降级路径均截图核对；新建对话弹原生目录选择器、对话框置前经用户手动确认。

**遗留项**

- 打包链路（electron-builder）受本环境 github 不可达影响未恢复，见 §9 环境/供应链风险；`dist*` 命令待全网 runner 复跑。
- 设置页"主工作区重启切换"与"新建对话选目录"两条路径并存，语义已在 README/§1.1 文档化；后续可考虑统一为单入口。
- 制品库视图按 `state.sessions` 前 25 个会话扫描 `attachment/list`（无跨会话单调用），大会话集下首屏耗时可感知；待 `attachment/list` cursor 分页（工作单 #3 遗留）后优化。
