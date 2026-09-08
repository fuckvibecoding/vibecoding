# 更新日志（当前版本）

本文件仅记录**当前版本**的变更。所有版本的完整历史见 [docs/zh/changelog.md](zh/changelog.md)。

## v1.2.100

### ✨ 新功能

- **TUI、WebUI 与 Desktop 全端主角团**
  - 会话可通过 `--expert <id>` 或 TUI `/expert list|show|bind|unbind|switch` 命令绑定可复用主角包。团队包会注入 lead 身份与名册并自动启用成员调度；单人包只改变 lead 身份。
  - 替换已绑定主角会创建分叉，而不会覆盖源会话。WebUI 主角面板和 Desktop ACP 的 **Expert** 选项复用同一条 Runtime 绑定与分叉路径。
  - 成员生命周期投影现在携带成员名称、emoji、角色和主角身份，供 TUI、WebUI 与 Desktop 卡片展示。成员完成会在 lead 的边界投递，绝不会自行启动新 run。
  - ESM 仅在目标可运行且会话真正空闲时续跑；待处理输入、决策或成员终态事件都不能绕过该 gate。
  - 新增内置 `expert-creater` Skill：通过 TUI/WebUI 的 `/skill expert-creater` 或 Desktop/ACP 的 `/expert-creater` 启用后，当前 Agent 会在项目 `.mothx/experts/` 中创建并安装经校验的主角团。

- **WebUI：聊天输入框斜杠命令建议**
  - 在聊天输入中键入 `/` 即弹出建议下拉框，覆盖全部支持的斜杠命令（`/clear`、`/mode`、`/model`、`/defaultModel`、`/models`、`/sessions`、`/status`、`/compact`、`/delegate`、`/alloweditpath`、`/allowautoedit`、`/workflows`、`/skill`、`/skills`、`/rule`、`/esm`、`/help`），并对 `/esm` 提供专门的子命令过滤（objective/edit/pause/resume/clear/guide）。
  - 使用 ↑/↓ 导航，Tab 或 Enter 补全（当输入与选中项完全一致时 Enter 直接发送），Esc 关闭，或点击选中；选中后光标定位到插入命令的末尾。输入框保持完整的 combobox/listbox 无障碍状态（`aria-expanded`、`aria-activedescendant`、`aria-selected`）。
  - 运行进行中、API 被禁用或输入包含换行时不显示建议。

- **WebUI：Runtime 托管的知识库管理**
  - 新增 **知识库** 工作区：通过与 ACP 和 Desktop 相同的 Runtime/session 服务完成目录知识库的列表、新建、编辑、扫描、查询和删除。原生目录选择器不可用时回退到内置目录浏览器；源文件与索引存储始终由服务端持有。

- **Desktop：精简首页预设，快捷操作一键填入提示词**
  - 首页预设标签精简为「办公 / 代码 / 创作」，中英文预设描述同步收紧。
  - 快捷操作改为将完整、可直接发送的提示词（含可替换的 `[主题]` 占位符）填入输入框，一键即可开始真实任务，而不再是空泛的标签文案。

### 🐛 问题修复

- **Browser：内置 Skill 不再写入项目目录**
  - Browser 指引现随内置 `vibe-browser` Skill 提供。在 TUI、WebUI、Desktop、ACP 或频道中启用 Browser 不再创建 `.skills/vibe-browser/SKILL.md`；用户主动创建的同名项目或全局 Skill 仍可覆盖内置指引。

- **频道：Browser 选择在 Runtime 重装配后保持有效**
  - 频道会话持久化的 Browser 选择现在同时驱动初始 Registry 构建和 Runtime 资源重装配。显式启用 Browser 后，Session Runtime 附着时不再将该工具移除。

- **TUI：运行期间提交的提示词排队执行，不再顶替当前运行**
  - 同一会话同一时刻只允许一个前台执行。此前在运行进行中提交输入会直接替换内存中的运行句柄，导致活跃运行的终态清理与运行时租约被孤立。现在此类提交会在 TUI 中排队，仅当前一个运行到达规范终态并释放租约后，才启动下一个排队提示词 —— 覆盖所有终态分支（成功、失败、未完成与取消）。
  - 排队的提示词保留 Runtime 预制的附件（`agentruntime.PreparedInput`），并通过同一输入契约重新提交，附件在延迟期间保持不变。

### ✅ 测试

- TUI：新增测试断言运行期间提交的输入仅排队而不替换租约持有者，且排队提示词只有在取消流程完成持久化运行终态并释放租约之后才会启动。
- 主角团：覆盖 Runtime 绑定/分叉、命名成员事件、TUI 与 Serve 的“成员终态不直接开 run”守卫、ACP bind/fork 进程路径、Desktop 投影与跨入口 ESM 空闲 gate。
- 频道：全“可选工具”契约测试验证每个可用的持久化工具选择都会出现在解析后的会话 Registry 中。
