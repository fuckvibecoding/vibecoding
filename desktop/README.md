# MothX Desktop

MothX Desktop 是一个**纯 ACP（Agent Client Protocol）客户端**：

- Electron 主进程启动打包内的 `mothx acp` 子进程，通过 stdio 上的
  newline-delimited JSON-RPC（ACP v1 + `mothx.dev` 扩展）通信。
- 主进程是唯一的 ACP client（`main/acp-client.ts`）；渲染进程只通过
  preload 暴露的 `window.mothx` IPC 桥访问协议，不直接接触子进程。
- 前端是**独立的单页应用**（`desktop/renderer/`，TypeScript + 原生 DOM，
  esbuild 打包），与 serve 模式的 Web UI（`ui/`）完全分离；桌面版不再启动
  `mothx serve`，没有 HTTP/token 通道。
- 界面布局参考 workbuddy 桌面原型：38px 标题栏 / 220px 侧边栏 / 22px 状态栏，
  IDE Light / IDE Night 双主题，任务状态机（规划中/执行中/等待输入/已完成/失败），
  计划卡片、工具卡片（含 diff）、审批/提问卡片、制品卡片。

## 架构

```
renderer (desktop/renderer)          main (desktop/main)                runtime
┌──────────────────────────┐   IPC   ┌──────────────────────┐  stdio  ┌──────────────┐
│ index.html / styles.css  │◄───────►│ index.ts  窗口/生命周期 │◄───────►│ mothx acp    │
│ src/main.ts   事件循环     │ context │ acp-client.ts JSON-RPC│ NDJSON  │ (vendored)   │
│ src/chat.ts   转录投影     │ Bridge  │ ipc.ts    通道注册     │         │ ACP v1 +     │
│ src/composer.ts 输入/附件  │         │ store.ts  UI 本地状态  │         │ mothx.dev ext│
│ src/sessions.ts 会话操作   │         └──────────────────────┘         └──────────────┘
└──────────────────────────┘
```

协议使用（全部经 `acp-client.ts`）：

- 生命周期：`initialize`（`_meta.mothx.workspace` 协商工作区窗口）；新建对话先选工作目录（原生选择器）：目录在窗口内直接用作会话 cwd，否则经 `mothx/workspace/extend` 免重启纳入窗口，老运行时回退重启子进程
- 会话：`session/new` `session/load`（重放历史）`session/resume` `session/fork` `session/list` `session/close` `session/delete` `mothx/session/setTitle`
- 运行：`session/prompt`（text / resource_link / resource content block）`session/cancel` `$/cancel_request`
- 配置：`session/set_config_option`（provider/model/mode/thinking_level/sandbox/browser/web_search）`session/set_mode`
- 通知：`session/update`（agent_message_chunk、agent_thought_chunk、tool_call(_update) 含 diff、plan、usage_update、available_commands_update、config_option_update、session_info_update、artifact*）与 `_mothx/session_event`（terminal/status/retry/compaction）
- 反向请求：`session/request_permission`（审批）`mothx/requestQuestion`（提问）
- 诊断：`mothx/doctor`；制品获取：`mothx/attachment/fetch`*

`*` 标记的制品投影/获取是 ACP 能力缺口补齐项（P0-1），见
`docs/proposal/desktop-acp-frontend-gap-proposal.md`；运行时未实现时前端自动降级
（从 `publish_artifact` 工具调用投影制品卡片）。审批/提问超时通过环境变量
`MOTHX_ACP_PERMISSION_TIMEOUT` / `MOTHX_ACP_QUESTION_TIMEOUT` 注入（P0-3）。

主题/语言/置顶任务/工作区历史等 ACP 不拥有的 UI 状态保存在 userData 的
`desktop-store.json`（`main/store.ts`），绝不复制会话权威数据。

## 开发与构建

打包的应用包含平台原生 MothX CLI 二进制（`vendor/mothx/bin/mothx[.exe]`），
由当前源码构建（`scripts/build-runtime.cjs`），并在打包前用 `mothx --version`
校验。`ui/dist` 只在缺失时构建一次（Go 二进制 embed 需要），桌面前端与其无关。

从仓库根目录：

```bash
make desktop-vendor     # npm ci + version:set + 源码构建 vendor 运行时
make desktop-build      # esbuild 打包 main/preload/renderer 到 desktop/dist
make desktop-dev        # 监听 renderer、自动刷新 Electron，并打开 DevTools / 本地 CDP
```

desktop 目录内：

```bash
npm run build           # esbuild（main.cjs / preload.cjs / renderer/*）
npm run dev             # renderer 热更新；DevTools + 127.0.0.1:9223 Chrome DevTools Protocol（先执行 make desktop-vendor）
npm run typecheck       # tsc --noEmit（main + preload + renderer + scripts）
npm test                # node --test + tsx --test（协议分帧/本地 store）
npm run start           # version:set + ensure:electron + build:runtime + build + electron .
```

开发时可用 `MOTHX_BINARY=/path/to/mothx` 覆盖运行时二进制（未打包时生效，
优先级最高；随后依次查找 vendor 目录与仓库 `bin/`）。

`make desktop-dev` 会先准备 Desktop 运行时，再启动 `npm run dev`。直接在
`desktop/` 中执行 `npm run dev` 时，请先执行一次 `make desktop-vendor`。它监听
`renderer/src/`、`renderer/index.html` 与 `renderer/styles.css`：修改后会重建
`dist/renderer` 并让 Electron 无缓存刷新，ACP 子进程无需重启。`main/` 与
`preload/` 只在启动时构建一次；修改后需要手动重启 Electron。开发模式自动打开
DevTools，并将 Chrome DevTools Protocol 限制为 `127.0.0.1:9223`，可供本机自动化
工具连接、截图和界面审阅；可用 `MOTHX_DESKTOP_DEBUG_PORT=9333 make desktop-dev`
换用其他本地端口。它不启动 `mothx serve`，也不会向 renderer 增加 HTTP/API
通道。

## 发布打包

Desktop `package.json` 保持占位版本；`npm run version:set` 与打包脚本从
`MOTHX_VERSION`（如设置）或当前 git tag 解析真实版本。

- `npm run dist:dev:mac` — 当前机器构建 macOS 开发包（`MothX-Desktop-macos-{arch}.dmg` + `.zip`）
- `npm run dist:dev:win` — 当前机器构建 Windows 开发包（`MothX-Desktop-windows-x64.exe` portable + `.zip`）
- `npm run dist:dev:linux` — 当前机器构建 Linux 开发包（`MothX-Desktop-linux-amd64.AppImage` + `.deb` + `.tar.gz`）
- `npm run dist:mac` / `dist:win` / `dist:linux` — 对应发布构建，允许配置 publish

等价的仓库根目录快捷命令：

```bash
make desktop-dist-dev-mac
make desktop-dist-dev-win
make desktop-dist-dev-linux
```

`dist:dev:*` 强制 `--publish never`，不会创建或上传 GitHub Release。跨平台构建
仍建议在对应 runner 上执行。macOS 构建为单架构（`--arch $(node -p process.arch)`）；
`after-pack.cjs` 会校验打包进应用的 CLI 二进制架构与应用架构一致。
