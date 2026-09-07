# 知识库 MCP 与知识图谱索引方案

> Date: 2026-09-07 · Status: Migrating query path to MCP (K0 graph store and ACP management complete) · Owner: Agent Runtime / MCP / Desktop
> Related: `docs/proposal/desktop-acp-frontend-gap-proposal.md`, `docs/proposal/agent-core-runtime-unification-proposal.md`, `AGENTS.md`

## 0. 决策摘要

知识库不实现为一套通用 RAG、TUI 工具或 Agent Core 内置能力。一个知识库是一个由 ACP 管理、绑定到本地目录并通过标准 **MCP server** 暴露的可重建图谱索引；Desktop 是首个管理和配置它的界面：

- 知识的权威来源就是该知识库配置的工作目录，不额外要求用户上传或复制原始资料。
- 索引和问答都复用普通 Agent 与现有 Agent Runtime；知识库代理只是在受限策略下使用特定角色说明、工作目录、供应商、模型与模式。
- 主会话不接收整库文件，也没有知识库专用 Agent loop。会话通过常规 MCP 配置启用 Knowledge MCP 后，主 Agent 在正常 tool turn 中按需调用标准 MCP tool，并取得短小、可追溯的 evidence 结果。
- 索引采用**证据可追溯的知识图谱**而不是“把所有文件塞进 prompt”。快速查询由 SQLite 的实体/别名索引、倒排文本种子和有界图遍历完成；LLM 仅用于抽取、消歧和生成精炼答案，不承担数据库扫描或事实存储。
- Desktop 只投影管理和 MCP 配置；TUI、CLI、WebUI、Channel 只要连接同一个 MCP server 即可获得相同行为。`internal/agent` 不新增知识库模式、工具、系统提示或执行分支。

本方案中的“代理”不是新 Agent Core、不是新工具循环，也不是 Desktop renderer 内的 prompt 拼接器。它是一个由 `internal/agentruntime` 按既有构造与 durable Run 生命周期运行的、带明确角色上下文的普通 Agent session。

### 当前实现进度（2026-09-06）

- 已完成：知识库配置、不可变图谱快照、SQLite FTS 种子召回、有界节点/边投影、路径/符号链接保护、Desktop ACP 设置与管理面。
- 迁移中：此前的 `KnowledgeCapsule` / Librarian 预查询路径仅作为兼容桥。目标查询路径是 Knowledge MCP；查询不再配置 provider/model、不创建 Librarian Agent Run，也不占用主会话 admission。
- 已完成：手动扫描和 Cron 扫描均使用知识库专用 session 的 canonical Run；计划以 `manual`、`hourly`、`daily`、`weekly`、`monthly`、`@every` 或五段 cron 保存到既有 `internal/cron`，不使用 Electron timer。
- 已完成：知识库不再与 `sessions.db` 共用 SQLite。每个知识库在 `sessionDir/knowledge-bases/<knowledgeBaseId>.db` 中保存自己的配置、快照、FTS、图节点/边和 evidence；`sessions.db` 只保留普通 session、canonical Run 与审计。旧共享数据会在首次知识库访问时复制到对应单库并从会话库清除。
- 已完成：定时/手动索引先扫描受限文件清单并比较活动快照的完整 content hash 集合。完全未变化时复用原快照，记录 `knowledge_snapshot_reused` durable Run event，且不构造 Indexer provider、不调用模型、不写 FTS 或图数据；发现任意变化才建立新的 successor 快照。
- 已完成：发生部分变更时，Runtime 从活动快照复制未变化文件的 chunk、节点、同文件边与 evidence 到新快照，并生成新 row/node/chunk/edge ID；仅变更文件重新解析。没有完整同文件 evidence 的跨文件边不会被盲目复制，交由本轮受验证 Indexer 重建。
- 已完成：每个知识库仅保留一个活动图谱快照。新图谱在同一私有 SQLite transaction 中完整写入、切换 `active_snapshot_id` 后，旧快照的 FTS、chunk、节点、边与 evidence 一并清理；配置更新使快照失效时也会清理全部旧图谱。查询在 transaction 外使用已物化的有界投影，因此不会依赖已淘汰快照。
- 已完成：配置了 provider/model 的索引 Run 会在确定性基线后启动受限 Indexer Agent。它只能从已提供的节点和 chunk 中选择 `co_mentions`；Runtime 会再次验证两个既有标签同现、chunk/span 范围、节点类型和去重，才保存边与 evidence。模型原始 JSON 不写入会话 transcript。
- 当前边界：首版索引图谱由确定性文件/标题/代码声明和受验证 `co_mentions` 边组成并原子发布。实体归并、别名、`depends_on` 等语义关系和增量差异分析仍是下一迭代；在加入 candidate/status schema 前，模型的语义断言不能写为事实。

## 1. 背景与问题定义

当前 Desktop 的“资料库”实质是跨会话浏览 `publish_artifact` 产生的制品：前端按已加载会话逐个调用 `mothx/attachment/list`，点击后使用 `mothx/attachment/fetch` 读取内容。它不保存外部知识目录，不提供文档预处理、检索、引用、知识问答或主会话上下文节流。

用户需要的是另一类能力：

1. 指定一个本地目录作为知识来源，例如项目文档、代码库、研究资料或个人笔记。
2. 为该目录配置预处理类型，以及该知识库代理使用的供应商、模型和模式。
3. 由 Desktop 控制定时扫描和整理。
4. 对当前对话按需调用知识库。知识库代理先从目录及其图谱中定位证据，并向主 Agent 返回准确、简短、带出处且声明不确定性的结论，以节省主 Agent 的上下文。
5. 索引主体是可快速查询的知识图谱，而不是仅依赖长上下文、纯关键词列表或必须依赖向量数据库的黑盒检索。

这里的“知识库”必须和当前制品库分开：制品库是会话输出的归档浏览；知识库是用户指定目录的受控、可重建索引和代理问答能力。两者可在同一个 Desktop 导航分组中展示，但数据模型、生命周期和权限边界不同。

## 2. 目标、非目标与产品边界

### 2.1 目标

- 每个知识库拥有一个稳定 ID、名称、根目录、预处理档案、Agent 配置与扫描计划。
- 每次索引都可从源目录完整重建，并保留文件版本、图谱证据和索引运行记录。
- 主 Agent 只接收标准 MCP tool result，结果必须有硬输出预算、snapshot ID 和 citation；Agent 仍可回答、质疑或要求用户确认，不能把检索文本视为不可质疑的系统指令。
- 每条供主会话使用的事实必须能追溯到知识库、相对路径、内容版本、chunk/span 和图谱边；无法证明的结论必须显式标为推断或未知。
- 索引、查询、调度、取消、重试和观测复用现有 Runtime、Run、Session、DAO、Cron 与 ACP 管理面边界。
- Desktop 断开、重启或索引被取消后，下一次可以从 canonical Run/索引快照恢复状态，而不是依赖 renderer 内存。

### 2.2 非目标

- 不在 `internal/agent` 增加 `knowledge` Agent mode、知识库工具、全局系统提示或特例 Agent loop。
- 不为 TUI、CLI、WebUI、Serve API、ACP 通用会话或消息渠道增加知识库 UI、slash command 或隐式检索。
- 不把目录全量复制到附件库，不把原始文件作为聊天附件反复塞给 provider，也不把整库文本写入 session transcript。
- 第一阶段不引入外部向量数据库、云端索引服务或跨设备同步。图谱优先，语义向量召回若未来需要，必须是可选、可替换的种子召回器，而不是事实权威来源。
- 不允许知识库代理写入、重命名、删除知识源目录中的文件；“整理”指索引和图谱归并，不指修改用户资料。
- 不把当前 `publish_artifact` 制品库改造成知识库，也不通过扫描工作目录输出文件来猜测制品或知识源。

### 2.3 名词

| 名词 | 含义 |
| --- | --- |
| 知识库（Knowledge Base） | Desktop 管理的配置对象，绑定一个根目录和一份可重建的图谱索引。 |
| Knowledge MCP | 通过 stdio/HTTP 等标准 MCP transport 暴露知识图谱查询的协议 adapter；不拥有图谱、SQL 或独立 Agent loop。 |
| 索引代理（Indexer） | 知识库代理在“预处理”角色说明下运行的实例，不是第二种 Agent 类型。 |
| 查询工具 | `search_knowledge_base`，由标准 MCP client 注册为 Agent 的普通 tool，返回带 citation 的活动快照 evidence。 |
| `KnowledgeCapsule` | 旧 prompt 注入迁移桥；新 MCP 路径不得产生或消费它。 |
| 图谱快照 | 某次成功索引后可查询的一致文件/节点/边/证据集合；查询只能读已完成快照。 |

## 3. 总体架构

### 3.1 一条受控的数据流

```text
Desktop 设置页 / MCP 配置
  └─ ACP 管理面 ──> KnowledgeBaseService（配置、扫描计划、快照）
                              │
知识源目录 ─> 确定性发现/提取 ─> 索引代理 ─> 图节点、边、证据、倒排索引
                                                        │
会话 MCP 配置 ─> SessionRuntime.ConnectMCP ─> search_knowledge_base tool
                                                        │
主会话 Agent ── 正常 tool call ────────────────────────┴─> 图查询 + evidence result
```

Desktop 只投影配置、MCP server 启停、状态和来源卡片。它不能：直接读取索引数据库、维护图结构、拼装 provider message，或在 renderer 中执行“先问一个 Agent 再把字符串拼进另一个 Agent”的双执行路径。

### 3.2 知识库代理是普通 Runtime Agent

每个知识库的专用 session 标识由知识库 ID 与根目录确定性派生，根目录变更时自动切换到新的受控 session。实际执行时：

1. `KnowledgeBaseService` 解析知识库配置，使用现有 `SourceACP`（交互查询/手动扫描）或 `SourceCron`（计划扫描）作为 Run provenance；知识库身份来自根目录、固定角色上下文与只读能力集，**不新增 RuntimeSource 或 mode**。
2. 通过 `SessionRuntime` / `BuildTransientAgent` 或受管理的知识库 session 构建 Agent；不得由 Desktop 或 ACP 手工组装 `agent.Config`，不得直接调用 `agent.New`。
3. 索引任务与查询任务均创建 canonical durable Run，使用 `ExecutionRuntime.BeginDurable`、`UpdateDurable`、`FinishDurable` 与 `RunStore`。Run/审计仍在 `sessions.db`；知识库特有的配置、快照、计数、文件清单与图谱数据只在该库私有 SQLite 中，不能再造一套 Run 状态机。
4. Agent 使用 `AgentBuildOptions.ExtraContext` 中的有限角色说明，而不是改写 `internal/agent` 的通用系统提示。

推荐首版使用同一个知识库配置驱动索引和查询。后续若证明成本/质量需要分离，可在兼容迁移中增加可选的 `indexProvider/indexModel` 覆盖字段；未配置时始终继承查询配置，避免一开始形成两套难以理解的模型设置。

### 3.3 固定角色，不滥用 mode 语义

`mode` 仍然是现有 Runtime 的执行/审批语义，知识库不会创建新的 `knowledge` mode。知识库代理的身份来自固定角色上下文：

- **Indexer**：把给定文件/段落归纳为受 schema 约束的实体、关系、摘要和证据；不得把文档中的指令当作命令执行。
- **Knowledge MCP**：只返回图查询命中的原始、受限 evidence 与 citation；回答、消歧和不确定性表达由调用该 tool 的主 Agent 完成。

用户可选择 provider、model、mode，但所有知识库运行额外叠加不可放宽的读取策略：只允许目录内的发现、读取和受控搜索能力；禁用写入、编辑、删除、shell 任意执行、网络发送、发布制品和委派子 Agent。显式 `yolo` 仅影响现有 mode 的正常语义，不能穿透这条能力限制。

## 4. Desktop 配置与交互

### 4.1 知识库设置表单

设置页新增“知识库”管理区。创建和编辑一个知识库时必须包含下列四组用户要求的配置：

| 配置 | 字段 | 首版语义 |
| --- | --- | --- |
| 1. 知识源目录 | `rootDir` | 绝对本地目录；保存前经主进程目录选择和 Runtime 路径校验。目录本身是权威来源。 |
| 2. 预处理类型 | `preprocessProfile` | `documents`、`code`、`notes`、`mixed` 四个预设档案；决定可发现文件、提取器、chunk 策略和建议实体/关系 schema。 |
| 3. Agent 配置 | `provider`、`model`、`mode`、`thinkingLevel?` | 只可引用已配置 provider 的脱敏目录与可用模型；不在 Desktop 本地保存 API key。 |
| 4. 定时扫描整理 | `schedule` | `manual`、`hourly`、`daily`、`weekly` 或显式 cron；保存的是计划，不是 Electron 定时器。 |

当前字段包括 `name`、启用状态、目录、profile、provider/model/mode/thinking、计划、活动快照与图谱统计；首版已提供“立即扫描”和“删除配置及索引（保留源目录）”。忽略 glob、显式暂停、索引差异、下次运行时间和失败诊断投影属于后续管理面完善项。

删除知识库删除配置、索引和相关索引作业，保留专用 session/Run 审计记录；绝不删除用户选择的源目录。界面必须清楚显示这一点并要求确认。

### 4.2 对话中的调用方式

Desktop 在知识库设置卡中提供明确的“启用知识库 MCP”配置：一个 server 以 `mothx knowledge-mcp serve --knowledge-base <id>` 启动，并且只被授予配置中列出的知识库 ID。该卡只读写标准全局 `mcp.json` 的 MCP server 条目；ACP 在新建或重新加载会话时由 `SessionRuntime.ConnectConfiguredMCP` 统一加载启用条目。它不在 composer 查询知识库，也不把检索结果串接进 prompt；改变 MCP 配置后需新建或重新加载会话。

建议的交互状态：

- 未启用 MCP：主会话与今天完全一致，不产生知识库调用。
- 已启用但无成功快照：`search_knowledge_base` 返回结构化、可恢复的 MCP tool error；Agent 可提示用户扫描或继续完成不依赖知识库的任务。
- 查询完成：工具结果返回 snapshot ID、bounded evidence 和 citations；对话 UI 从标准 tool event 投影来源卡片，主 Agent 的正常输出保持单一流。
- 查询失败或超时：是当前主 Run 内的标准 MCP tool failure，遵循既有重试、取消和 terminal semantics；不能伪造成功上下文。

多知识库并用时，MCP server 的 allowlist 是唯一授权来源；Agent 每次 tool call 必须给出其中一个 `knowledgeBaseId`。单次结果实行统一的 evidence/大小预算，不让一个 server 查询未配置的库。

### 4.3 资料库视图的演进

现有“资料库 · 制品”视图改名或拆分为：

- **知识库**：配置的目录、索引状态、图谱概览、扫描/查询历史、来源浏览；本方案的主体。
- **制品**：保留今天的跨会话 `publish_artifact` 输出浏览功能。

两者不可混用 attachment ID、storage key 或生命周期。制品并不会自动进入知识库；若未来需要“将制品加入知识源”，必须由用户明确复制/导出到知识库目录或使用 Runtime-owned 的受控导入流程，并另行设计。

## 5. 预处理与知识图谱

### 5.1 预处理档案

| 档案 | 主要文件 | 抽取重点 | 常见节点/关系 |
| --- | --- | --- | --- |
| `documents` | Markdown、txt、HTML、受支持的 PDF/Office 提取文本 | 标题层级、术语、结论、日期、规范 | 概念、文档、章节、要求；`defines`、`requires`、`supersedes`、`references` |
| `code` | Go、TS/JS、Python、JSON/YAML、SQL、Markdown | 模块、符号、配置、调用、依赖、测试 | 模块、符号、配置、命令；`declares`、`calls`、`imports`、`configured_by`、`tested_by` |
| `notes` | Markdown、txt、日记/会议纪要 | 主题、决策、行动项、人物、时间 | 主题、决策、任务、日期；`decides`、`blocks`、`follows_up`、`mentions` |
| `mixed` | 上述受支持格式的安全并集 | 先按文件类型分派，再用通用实体 schema 汇总 | 档案特定关系加上 `related_to`、`contradicts`、`supports` |

档案不是任意 prompt 模板。它是受版本控制的提取/验证规则：允许哪些扩展名、忽略哪些目录、如何分块、可生成哪些节点/边类型、每类字段如何校验。以后增加档案必须有 schema 版本、迁移和回归样本，避免用户模型输出决定数据库结构。

默认忽略 `.git/`、依赖与构建产物目录、二进制/超大文件、私钥/凭据模式命中的文件和用户配置的 glob。发现阶段只接受规范化后仍位于 `rootDir` 内的常规文件，拒绝符号链接逃逸。

### 5.2 图谱数据模型

知识库不共享 `sessions.db`：每个知识库在 MothX 受管的 `sessionDir/knowledge-bases/<knowledgeBaseId>.db` 中拥有一个完整、私有的 SQLite store。该库同时保存它的配置和所有图谱数据；源文件仍在用户指定目录。`sessions.db` 只保存会话、canonical Run、Cron 与审计，不含 `knowledge_*` 数据。业务层只能经 `internal/session` 和 `internal/dao` 访问；session schema 与 per-knowledge-store schema 都由 `internal/session` 的 schema/migration owner 维护。

这样大知识库的 FTS、WAL、checkpoint、vacuum/rebuild 与锁竞争不会影响会话转录和 Run 持久化；同一知识库内的快照发布仍可在其一个 SQLite transaction 内原子完成。配置列表通过安全枚举私有 store 目录获得，而不是在会话库增加第二份 catalog。历史版本曾把图数据写入 `sessions.db` 的，首次访问会先复制、校验并在成功后清除旧行，过程可重试。

| 记录 | 关键字段 | 目的 |
| --- | --- | --- |
| `knowledge_bases` | `id`、`name`、`root_dir`、档案、Agent 配置、计划、`active_snapshot_id` | 知识库配置与当前可查询快照。 |
| `knowledge_index_snapshots` | `id`、`knowledge_base_id`、`canonical_run_id`、状态、开始/完成时间、统计、错误摘要、schema 版本 | 把索引特有进度挂到 canonical Run，而不复制 Run 状态机。 |
| `knowledge_files` | `snapshot_id`、相对路径、内容摘要、大小、媒体类型、标题、状态 | 当前实现的文件级 provenance；mtime、提取器版本和增量复用为后续扩展。 |
| `knowledge_chunks` | `file_id`、序号、文本摘录、起止位置、content hash、搜索文本 | 图谱证据和文本种子；仅保存检索/引用所需的规范化文本。 |
| `knowledge_nodes` | `snapshot_id`、类型、规范标签、摘要、属性 JSON | 当前已有文件/标题/代码声明节点；节点 ID 不以模型自然语言为主键。 |
| `knowledge_edges` | `snapshot_id`、源/目标节点、关系类型、置信度 | 当前有确定性的 `contains`，以及由 Indexer 提议、Runtime 按同一 chunk 的标签与 span 复核后写入的 `co_mentions`。 |
| `knowledge_evidence` | 节点或边、`chunk_id`、证据 span、置信度 | 每个当前节点/边都可指向源 chunk。 |
| `knowledge_entity_aliases` | `snapshot_id`、别名规范键、`node_id` | 规划中的实体别名加速层，当前查询以 FTS chunk 种子和 evidence 邻接为主。 |

索引要求：

- `knowledge_files(snapshot_id, relative_path)` 在目标模型中唯一，便于后续增量 diff。
- `knowledge_nodes(snapshot_id, normalized_label, type)` 与 `knowledge_entity_aliases(snapshot_id, normalized_alias)` 是下一步的实体归并索引；当前只使用已实现的 evidence/边索引。
- `knowledge_edges(snapshot_id, from_node_id, relation_type)`、`knowledge_edges(snapshot_id, to_node_id, relation_type)` 建邻接索引。
- `knowledge_chunks` 使用 SQLite FTS5（或等价、经验证可用的本地倒排索引）作为图查询的文本种子，而不是将全文发送给模型。
- 所有查询以 `snapshot_id` 隔离。索引中途失败或被取消时，旧 `active_snapshot_id` 继续服务；只有完整校验成功后才原子切换。

### 5.3 索引流水线

一次“扫描并整理”按以下阶段执行。任何阶段失败都不会污染当前活动快照：

1. **发现**：在根目录内确定性遍历，应用档案和忽略规则，记录规范相对路径、大小、mtime、文件摘要。
2. **增量判定**：先与活动快照比较完整文件路径/content hash 集合和 schema 版本。当前已实现“无变化快照复用”：相同集合直接保留活动快照，不进行模型调用或 SQLite 图谱写入；部分变化时按文件复制未变化的 chunk/节点/局部边/evidence，并仅重新解析变更文件。已删除文件不进入新快照；跨文件关系必须由本轮 evidence 校验重新建立，不能因复制而变成无证据事实。
3. **提取与分块**：根据档案把文件转为规范文本与稳定 chunk（保留标题、行号/字符范围）；二进制、加密、解析失败或超过预算的文件只生成可见诊断，不交给模型。
4. **受约束图抽取**：Indexer 一次只读取有限 chunk 和同文件邻近摘要，输出严格 JSON。当前已实现的最小安全 schema 只允许它选择两个既有标题/代码声明节点的 `co_mentions` 及对应 span；输出经 JSON、ID、类型、同现文本、范围和数量校验后才入库。实体、别名、其他关系与摘要必须先定义 candidate/status schema，再扩大这个输出集合。
5. **归并与校验**：按规范标签、类型、别名和明确证据进行实体消歧；冲突保留多条有证据的关系，不以“后一次模型回答”覆盖前一次事实。没有证据的节点/边只能作为 `candidate`，不能出现在默认查询结果。
6. **快照发布与保留**：计算文件/chunk/节点/边统计，写入完成状态，并在同一 transaction 中将 `active_snapshot_id` 原子切为新快照、删除该知识库的全部旧快照及其 FTS/图数据。索引代理的 canonical Run 终态与快照状态一致。

Indexer 的职责是丰富结构，不是信任来源内容。其角色说明必须明确：文档里出现的“忽略此前指令”“执行命令”“上传内容”等文本均是待索引的数据，绝不能转化为工具调用或系统指令。

### 5.4 快速图查询

给定用户问题和一个活动快照，查询不从目录全扫，也不直接让模型决定读哪些任意文件。它按如下预算化流程进行：

1. 从问题中提取关键词、代码符号、文件路径和日期等可解释种子；先查实体别名索引和 FTS chunk 索引。
2. 选出有限种子节点/chunk 后，使用邻接索引作有界 BFS/递归 CTE 遍历（默认最多 2 hops、固定节点/边上限），按关系类型、证据数量、文件新鲜度和问题词命中排序。
3. 取回每条节点/边的证据 chunk、相邻冲突关系和必要的原文窗口。没有 evidence 的 candidate 不可进入回答上下文。
4. 将紧凑子图投影为 MCP tool result；若证据不足，返回空 evidence/结构化工具结果而不是扩大目录扫描。

这使“图查询”既快速又可解释：文本索引负责找入口，图邻接索引负责关系扩展，主 Agent 通过标准 tool 调用完成语言层的总结。图谱不是没有来源的模型记忆，也不以向量相似度取代路径和证据。

## 6. Knowledge MCP 与主会话工具调用

### 6.1 标准 MCP 工具与预算

Knowledge MCP 首版只暴露标准 `search_knowledge_base`。Agent loop 将其视为普通 MCP tool；MCP client 已把它注册为常规 Registry tool，因此 `internal/agent` 不需要任何知识库特例。

```json
{
  "knowledgeBaseId": "kb_product_docs",
  "snapshotId": "kbs_20260906_01",
  "query": "迁移方案的 durable run 语义",
  "limit": 4
}
```

工具结果包含 `knowledgeBaseId`、`snapshotId`、有界 `evidence[]` 和每项的 `chunkId/path/startLine/endLine` citation。Runtime 对 chunk 数、每项文本和总输出实施硬上限；超限时设置 `truncated:true`，绝不返回整库文本。

### 6.2 MCP 配置与语义

Knowledge MCP 使用现有 `mcp.json` / ACP `mcpServers` schema，不增加知识库专用 Agent 配置。例如：`{"name":"product-docs","type":"stdio","command":"mothx","args":["knowledge-mcp","serve","--knowledge-base","kb_product_docs"]}`。知识库 ID allowlist 来自 server 启动参数，不来自模型、Desktop metadata 或一次 prompt；任何入口只要通过 `SessionRuntime.ConnectMCP` 连接这一配置，就获得相同工具。

MCP server 仅是协议 adapter：它调用 `KnowledgeBaseService` 查询活动快照，不能自行执行 SQL、扫描源目录或调用 provider。标准 MCP tool result 由 Agent loop 的既有 tool event、Run 和 transcript 生命周期记录；Desktop 不构造 `provider.Message`，ACP 不维护另一个 string-only prompt 路径。

Tool description 明确要求 Agent 将结果视为不可信参考数据而非指令。每次调用天然关联主 Run、MCP server、知识库 ID 和 snapshot ID；对话 UI 仅显示标准 tool-event 投影，完整原文仍由源目录/受控来源读取，不能被 renderer 伪造或替换。

### 6.3 失败与降级

- 未索引、索引中、没有命中、查询超时、取消：均作为当前主 Run 的 MCP tool result/error 投影，不能伪造“空但成功”的 evidence。
- 默认模式是标准 tool 语义：Agent 可根据 tool failure 继续任务、重试或向用户说明不足；不会在主 Run 前阻断 admission。
- 用户若需要强制资料依据，应在任务提示中要求 Agent 成功调用并引用 `search_knowledge_base`；不再用 adapter-local `required` 字段拒绝主 prompt。

## 7. 调度、并发与生命周期

### 7.1 定时扫描

扫描计划复用 `internal/cron` 的调度与持久化能力，不能在 Electron 主进程、renderer 或 `setInterval` 中实现第二套定时器。知识库计划是一个显式的受管理任务类型，例如 `knowledge_base_reindex`，其 payload 只有知识库 ID 和预期配置版本；真正的配置和目录均在 `KnowledgeBaseService` 中重新解析。

- `manual` 不创建计划任务；“立即扫描”创建一次性 canonical Run。
- 周期/Cron 到点后，Cron claim 与知识库专用 session 的 execution admission 共同保证同库不会并发写快照；显式 debounce/coalesce 队列是后续优化项。
- 目录变化频繁时使用 debounce/coalesce，不让每个文件事件变成一次完整 Agent 执行。
- 计划暂停、删除知识库、根目录不可用和配置版本变化必须使旧计划失效。
- Cron 只负责唤醒；索引运行、重试、终态和恢复仍走 `ExecutionRuntime`，不由 Cron 自己维持第二个状态机。

### 7.2 并发与一致性

- 同一知识库同一时刻最多一个写入快照的索引 Run；不同知识库可在配置的全局并发上限内运行。
- 查询只读 `active_snapshot_id`，所以索引中的中间表不会泄漏给主会话。
- 目录重命名、删除、权限变化和解析失败作为文件状态记录；不应使整个旧快照失效。
- 调度器关闭由 ACP 的 `stopManageCron` 统一协调；Knowledge MCP 仅随其宿主 MCP client 生命周期启动和关闭，不创建 Librarian Runtime。

## 8. 架构归属与不可逾越的边界

| 层 | 负责 | 明确不负责 |
| --- | --- | --- |
| `desktop/renderer` | 设置表单、目录选择、知识库选择器、状态/来源卡片渲染 | 文件扫描、图查询、模型调用、数据库访问、prompt 拼接。 |
| `desktop/main` / preload | 受控 IPC、目录选择、唯一 ACP transport | 索引任务、持久化、模型密钥或图数据。 |
| `internal/acp` | additive RPC/通知投影、能力发现、结构化错误 | 业务规则、DAO 查询、agent.Config 组装、独立索引存储。 |
| `internal/agentruntime` | 知识库服务、普通 Agent 构建、输入准备、Runtime source/policy、Run/关闭协调 | 在 `internal/agent` 中硬编码知识库逻辑。 |
| `internal/session` | 知识库/快照的领域 API、事务边界、清理和引用记录 | Bun builder/raw SQL。 |
| `internal/dao` | 知识库配置、图谱、证据、快照的所有 SQL、映射与索引查询 | Agent/ACP/renderer 行为。 |
| `internal/cron` | 计划的持久化和唤醒 | 索引状态机、图谱写入。 |

实施时必须遵守下列强制规则：

1. 生产 Agent 只经 `SessionRuntime.BuildAgent`、`BuildTransientAgent` 或 `agentruntime.NewAgentManager` 构造；知识库代理没有例外。
2. 所有 Agent 执行都有 canonical durable Run；`knowledge_index_snapshots` 只能链接 Run，不能复制 running/completed/failed 状态。
3. source、mode、provider、tool capability、sandbox 和审批策略一次性由 Runtime resolver 决定。Desktop、ACP 和 Cron 不各自补默认值。
4. 所有 SQL/FTS/递归图查询均由 `internal/dao` 承担；schema/migration 只在既有 owner 文件追加。
5. TUI/CLI/WebUI/Channel 不增加知识库专用 loop、自动上下文或平行实现。任何入口若要接入，只配置同一个 Knowledge MCP server，不复制 Runtime 查询实现。

## 9. ACP 管理面与能力发现

ACP v1 保持不变；新增内容均为 additive 扩展，Desktop 必须根据 `initialize._meta.mothx.dev.features` gate UI。建议第一阶段能力键：

```text
manageKnowledgeBases
knowledgeGraphIndex
knowledgeBaseContext
```

建议方法组：

| 方法 | 请求/响应语义 |
| --- | --- |
| `mothx/manage/knowledge-bases/list` | 返回配置投影、活动快照摘要、计划状态和可安全显示的统计；不返回源文件内容、API key 或图谱全量。 |
| `mothx/manage/knowledge-bases/get` | 返回一个知识库的可编辑配置和状态。 |
| `mothx/manage/knowledge-bases/create` | 创建配置；校验根目录、profile、已配置 provider/model 和计划。专用 session 按首次实际 Run 确定性创建。 |
| `mothx/manage/knowledge-bases/update` | 更新配置并使 `active_snapshot_id` 失效；当前必须重新扫描后才能查询，并在同一私有 SQLite transaction 中清理旧图谱。 |
| `mothx/manage/knowledge-bases/delete` | 删除配置/索引/计划，绝不删除根目录。 |
| `mothx/manage/knowledge-bases/scan` | 同步手动触发索引，返回带 `runId` 的当前 snapshot 状态；取消和异步进度投影是后续项。 |
| `mothx/manage/knowledge-bases/status` | 当前等同单个配置/快照状态查询；Run 历史、进度、下次计划和失败诊断投影是后续项。 |
| `mothx/manage/knowledge-bases/query` | 仅供调试/预览使用；返回有界图查询结果，不能成为 renderer 组装主 prompt 的正式路径。 |

正式主会话不再通过 `session/prompt.knowledgeBaseRefs` 调用知识库；它通过标准 `mcp.json`（或 ACP 显式 `mcpServers`）配置连接 Knowledge MCP。旧字段仅作迁移兼容，新的 Desktop/ACP 客户端不得发送它。兼容桥的删除条件是：Desktop 已发布 MCP 配置路径、ACP 的跨进程 MCP contract test 覆盖创建/加载会话，且受支持客户端均不再发送该字段；满足后移除 `KnowledgeCapsule`、Librarian 和 `WithKnowledgeContext` 路径及字段。

主 Run 的标准 MCP tool execution/event 记录工具名、配置 server、参数、结果及 snapshot/citation；Indexer 继续以独立 durable Run 保存。UI 只投影同一标准 tool event，不能另造 `knowledge_context` 成功流。

错误码建议包括：`knowledge_base_not_found`、`knowledge_base_disabled`、`knowledge_base_unindexed`、`knowledge_base_indexing`、`knowledge_base_root_unavailable`、`knowledge_base_profile_invalid`、`knowledge_base_model_unavailable`、`knowledge_base_query_timeout`、`knowledge_base_context_required`。

## 10. 安全、隐私与质量

### 10.1 本地资料与 prompt injection

- 根目录、相对路径、符号链接、忽略规则和文件大小在 Runtime 内校验；使用清理后的绝对路径作为工具根，严禁按模型输出扩展目录边界。
- 文档内容一律是不可信数据。Indexer 的角色说明、MCP evidence schema 和主 Agent 的常规 tool-result 防护必须阻止源文本覆盖系统/用户权限或引导工具调用。
- Agent 的工具能力最小化为只读，且所有文件读取必须绑定当前知识库根目录；provider/model 配置不能让模型绕过本地工具策略。
- 知识库配置和查询事件不记录 API key、完整未引用文本或模型原始 chain-of-thought。诊断只保留必要的错误摘要和可选的脱敏 prompt 摘要。

### 10.2 数据保留

- 源目录是事实来源；索引存储的是文件元数据、规范化 chunk、图谱结构、证据 span 和必要摘要。
- 删除知识库或用户显式“清除索引”时，先在该知识库私有 SQLite 内以 DAO transaction 清理配置、快照、chunk、节点、边、evidence 与 FTS，再关闭并删除**该一个**数据库文件及其 WAL/SHM sidecar；首版保留专用 session/Run 作为审计记录，根目录绝不受影响。若未来加入 session 清理，必须以独立保留策略实现，不能删除运行记录来替代索引清理。
- 单文件删除/变更后的新快照不得继续引用旧 chunk。当前策略是**仅保留活动快照**：新快照完整写入并切换活动 ID 后，在同一 transaction 中删除旧快照；查询在返回前已将所需有界子图物化到内存。配置更新则清空活动 ID 并删除全部图谱，直到下一次成功扫描。
- 该清理释放 SQLite 可复用页，避免相同知识库随每次成功索引永久累积多份图谱数据；它不承诺在每次扫描后立即缩小 `.db` 文件。需要主动收缩磁盘文件时，应以后续受控的单库维护/VACUUM 流程实现，不能影响 `sessions.db`。
- 非默认目录、私密笔记、凭据文件和大文件的发现/忽略结果要在 UI 可见，使用户知道什么被排除而不是静默上传或读取。

### 10.3 回答质量

- 证据优先于流畅性：无 citation 的声明不能标为 `high`。
- 关系冲突、过期文件、不同快照或低置信边必须进入 `uncertainties`，不允许强行合并为单一事实。
- 主 Agent UI 可展开来源、打开相对路径/行范围，但打开仅是本地只读导航；不把文件复制到公共目录。
- 每个知识库提供“预览查询”与基准问题集。更新模型、档案或抽取 schema 后，应比较答案引用率、无依据断言率、命中时延和 token 使用量。

## 11. 分阶段实施计划

### Phase K0：设计与地基（已完成）

1. 确认 `KnowledgeBaseReference` 的 Runtime input contract、ACP 显式引用 policy 与主 Run/知识库 Run 关联模型。
2. 已实现：每知识库独立 SQLite store，保存配置、快照、文件、chunk、节点、边、证据与必要索引；会话数据库只保留 Run/审计，旧共享 store 自动迁移。
3. 实现不依赖 LLM 的目录发现、忽略、摘要、文本提取、稳定分块、FTS 与有界图查询基线。
4. 新快照发布后只保留活动图谱，配置更新后清空图谱；验证 FTS 与级联图记录不会残留。
5. 增加 Architecture guard，证明没有 adapter-local SQL、agent.Config assembler、prompt builder 或 Run lifecycle。

验收：可创建一个 `documents` 知识库、手动建立一个不含 LLM 图边的文件/chunk 快照、以关键词/路径快速找回可引用 chunk；TUI/CLI/WebUI 行为无变化。

### Phase K1：普通知识库代理与图谱抽取（进行中）

1. 通过 Runtime 的普通 Agent 构造路径实现 Indexer 角色上下文和只读 policy；查询改为 Knowledge MCP 标准 tool。
2. 已实现最小结构化图抽取：Indexer 可提议、Runtime 可复核 `co_mentions`。后续实现 candidate 状态、实体归并、别名、扩展关系和增量更新。
3. 为每次索引建立 canonical durable Run，并把快照记录链接到该 Run。
4. 提供 ACP `mothx/manage/knowledge-bases/*` 配置、手动扫描和状态投影；加入能力发现。

当前验收：`co_mentions` 图边可回溯 source span；伪造节点、越界 span、缺少同现文本的模型链接均被拒绝；Indexer 不能写源目录；MCP server 不能查询 allowlist 外的库；同一知识库不存在双活动索引 Run。扩展语义关系需满足原 K1 全部验收后再启用。

### Phase K2：Desktop 设置与对话注入

1. 实现知识库设置表单、目录选择、profile/provider/model/mode/schedule 配置、状态统计和手动扫描。
2. 已实现 Desktop 的 Knowledge MCP 配置/启停；会话通过标准 `mcp.json` 在新建/重新加载时连接。
3. 实现 MCP result token/大小预算、标准 tool-event 来源卡片与多库 allowlist。
4. 保留现有制品库为独立视图，修正导航/文案，避免把二者混为一谈。

验收：renderer 不读取数据库、不调用模型、不拼 provider content；启用 MCP 后主 Agent 可在正常 tool turn 获得可追溯 evidence；未启用时 wire payload 与现有 prompt 完全一致。

### Phase K3：调度、观测与质量回归

1. 接入 `internal/cron` 的计划唤醒、合并、暂停/恢复与重启恢复。
2. 提供图谱查询预览、来源浏览、索引差异、失败诊断和清除索引。
3. 添加受控基准库与回归测试，量化索引时长、MCP 查询 p50/p95、tool-result 大小、引用覆盖率与不确定性覆盖率。

验收：Desktop 重启后计划与状态恢复；源目录不可用不会破坏旧快照；调度不依赖 Electron 定时器；取消/重试不会产生孤儿 Run。

## 12. 测试矩阵与验收标准

| 范围 | 必测行为 |
| --- | --- |
| DAO / session | 每库 SQLite 路径隔离、图谱 CRUD、快照隔离、实体别名/邻接索引、旧共享库迁移、文件删除、事务回滚、知识库删除不删除源目录。 |
| Agent Runtime / MCP | 只从 Runtime 构建 Indexer；Knowledge MCP allowlist、只读 evidence 查询；无变化快照复用、部分变化文件子图克隆；Indexer JSON 校验；MCP result 大小上限与 citation。 |
| Run / recovery | 索引/查询 run 均经 `ExecutionRuntime` 终态化；无变化扫描复用快照并有 canonical event；取消、崩溃、恢复、同库互斥和旧快照可读。 |
| ACP wire | feature gate、配置 CRUD、scan/status、结构化错误、标准 `mcpServers` 连接与 MCP tool event ID/来源关联。 |
| Desktop | 未支持时显示占位；表单不保存密钥；选择器/卡片正确显示；无选择时不增加请求；不会从 renderer 读取索引或拼 prompt。 |
| 跨入口回归 | ACP（无 Desktop `surface`）可显式调用知识库；TUI、CLI、WebUI/API、Channel 不显示也不隐式调用知识库；通用输入/Run/附件契约保持不变。 |
| 安全 | 路径逃逸、符号链接、隐藏凭据、恶意文档指令、超大文件、过期/删除快照、跨知识库数据访问均拒绝或安全降级。 |

实现阶段至少运行：`go test ./internal/agentruntime ./internal/session ./internal/dao ./internal/acp ./internal/architecture`，并为 Desktop 运行 typecheck/build 及端到端 ACP smoke。修改生产构造、输入处理、Run/索引持久化或 shutdown 调用点时，必须补充跨入口 contract tests，证明仅 Desktop 的 policy/投影不同，canonical Runtime 行为未分叉。

## 13. 待确认的产品选择

以下选择不阻塞 K0 数据模型，但在开始 K1/K2 前应由产品确认：

1. `documents` 首版具体支持哪些格式，尤其是 PDF/Office 是否采用本地提取器；提取失败时是否允许只索引文件名/元数据。
2. 单知识库、全局和单次 query 的 token/费用/并发预算默认值。
3. provider/model 配置是否对索引和查询共用；本方案首版默认共用，避免用户面对两套配置。
4. `required` 知识库引用是否在首版暴露，还是先只提供软依赖以减少主会话失败率。
5. 图谱预览要展示到什么粒度：首版建议只展示统计、来源和查询路径，不做自由拖拽的全图可视化。

## 14. 明确拒绝的实现方式

- 在 Desktop renderer 中直接遍历知识目录、调用 provider 或将知识库回答字符串插进 `session/prompt`。
- 在 TUI 或 `internal/agent` 加一个全局 `knowledge` command/mode/tool，导致所有入口都有隐式知识库分支。
- 创建第二个 Agent loop、第二个 session replay 路径、第二个 run 状态机或 adapter-owned SQLite 表。
- 以“文档中提到过”推断一份可交付 artifact，或使用工作目录扫描替代 Runtime-owned resource lifecycle。
- 没有 evidence 的 LLM 关系直接作为事实写入图谱，或让向量相似度结果绕过图谱/来源验证。
- 在 Electron 中保存 provider API key、完整源文件副本或未脱敏模型返回。

这套边界保证知识库首先是一个由 Desktop 调度的普通、受限 Agent，而不是对 MothX Agent Core 的第二次实现；它在需要时为主 Agent 提供高密度证据，在不需要时完全不改变既有会话路径。
