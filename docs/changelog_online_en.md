# Changelog (Current Version)

This file contains the changes for the **current version only**. The full history of all versions lives in [docs/en/changelog.md](en/changelog.md).

## v1.2.100

### ✨ New Features

- **Independent Artifact Publishing Switches**
  - TUI/CLI, WebUI/API, Desktop/ACP, and messaging channels now have separate artifact publishing switches, all disabled by default. Each entry point enables the shared Runtime-owned `publish_artifact` path without changing the others.

- **Expert Teams Across TUI, WebUI, and Desktop**
  - Sessions can bind a reusable expert bundle with `--expert <id>` or TUI `/expert list|show|bind|unbind|switch` commands. A team bundle injects its lead identity and roster and automatically enables member dispatch; a single-persona bundle changes only the lead identity.
  - Replacing an existing expert creates a fork instead of overwriting the source session. The WebUI expert panel and Desktop ACP **Expert** option use the same Runtime-owned binding and fork path.
  - Member lifecycle projections now carry the member name, emoji, role, and expert identity for TUI, WebUI, and Desktop cards. Member completion is delivered at a lead boundary and never starts a new run by itself.
  - ESM continues only from a genuinely idle, runnable objective. Pending input, decisions, or a member terminal event cannot bypass that gate.
  - Added the built-in `expert-creater` Skill. Activate it with `/skill expert-creater` in TUI/WebUI or `/expert-creater` in Desktop/ACP, then let the current Agent create and install a validated project team under `.mothx/experts/`.

- **WebUI: Slash Command Suggestions in the Chat Composer**
  - Typing `/` in the chat input now shows a suggestion dropdown covering every supported slash command (`/clear`, `/mode`, `/model`, `/defaultModel`, `/models`, `/sessions`, `/status`, `/compact`, `/delegate`, `/alloweditpath`, `/allowautoedit`, `/workflows`, `/skill`, `/skills`, `/rule`, `/esm`, `/help`), with a dedicated subcommand filter for `/esm` (objective/edit/pause/resume/clear/guide).
  - Navigate with ↑/↓, complete with Tab or Enter (Enter sends the prompt when the input already matches the selection), dismiss with Esc, or click an entry; accepting a suggestion places the cursor at the end of the inserted command. The composer keeps proper combobox/listbox ARIA state (`aria-expanded`, `aria-activedescendant`, `aria-selected`).
  - Suggestions are suppressed while a run is active, the API is disabled, or the input spans multiple lines.

- **WebUI: Runtime-Owned Knowledge Base Management**
  - The new **Knowledge** workspace lists, creates, edits, scans, queries, and deletes directory-backed knowledge bases through the same Runtime/session services used by ACP and Desktop. Directory selection falls back to the built-in browser when a native picker is unavailable; source files and index storage remain server-owned.

- **Desktop: Streamlined Home Presets and Prompt-Filling Quick Actions**
  - Home preset tabs are shortened to Work / Code / Create (办公 / 代码 / 创作) with tightened descriptions in both languages.
  - Quick-action chips now fill the composer with a complete, ready-to-send prompt (including editable `[topic]`-style placeholders) instead of a bare label, so one click can start a real task.

- **Desktop: Development Mode (`make desktop-dev` / `npm run dev`)**
  - New dev runner: watches `renderer/src/`, `renderer/index.html`, and `renderer/styles.css`, rebuilds `dist/renderer` on change, and reloads Electron without cache so the ACP child process does not restart; `main/` and `preload/` are built once at startup and require a manual restart after edits.
  - Dev mode (`MOTHX_DESKTOP_DEV=1`) opens DevTools automatically in a detached external window (never docked inside the app), binds the Chrome DevTools Protocol to `127.0.0.1:9223` only (change the local port with `MOTHX_DESKTOP_DEBUG_PORT`), and reloads the window when renderer assets change; it does not start `mothx serve` and adds no HTTP/API channel to the renderer.
  - The dev instance runs on an isolated user data directory (`desktop/.dev-user-data/`, overridable with `MOTHX_DESKTOP_USER_DATA`) so it never competes with an installed Desktop for the single-instance lock or reuses its local display state.

- **Desktop: Online Skill Marketplace (SkillHub Catalog)**
  - New ACP feature key `manageSkillHubCatalog` and an additive `mothx/manage/skillhub/*` method family (markets/categories/official/search/detail/targets/installed/install/activate/uninstall) as a pure ACP projection of the shared SkillHub service; every request must bind to an active session, so Desktop cannot pick arbitrary install directories.
  - The Desktop skills page gains a marketplace section: market/category filters, keyword search, official recommendations, and install/update/activate-into-session/uninstall into the session's project or global skills directory.
  - ACP sessions now track multiple active skills (previously activating a new skill replaced the previous one), so several skills can stay active in the same session.

- **Desktop: App-Wide Background Image Options**
  - Background images can now apply to the whole app or the home view only, with fit modes (cover / contain / stretch / tile) and anchor positions (center / left / right / top / bottom).
  - Background veils and surface blur fade adaptively with image opacity; with an app-wide background, the titlebar gains a readable contrast surface and text shadows so window controls stay legible.
  - Appearance settings move into a standalone Appearance category.

### 🐛 Bug Fixes

- **Browser: Built-in Skill No Longer Writes into Projects**
  - Browser guidance now ships as the built-in `vibe-browser` Skill. Enabling Browser in TUI, WebUI, Desktop, ACP, or a channel no longer creates `.skills/vibe-browser/SKILL.md`; intentionally created project or global skills with that name still override the built-in guidance.

- **Channels: Browser Selection Survives Runtime Rehydration**
  - A channel session's persisted Browser selection now drives both initial registry construction and Runtime resource rehydration. Explicitly enabling Browser no longer has the tool removed after the session Runtime attaches.

- **TUI: Prompts Submitted During an Active Run Are Queued Instead of Replacing It**
  - A session allows exactly one foreground execution at a time. Previously, submitting input while a run was active replaced the in-memory run handle, orphaning the active run's terminal cleanup and its runtime lease. Such submissions are now queued in the TUI, and the next queued prompt starts only after the preceding run reaches its canonical terminal state and releases its lease — across every terminal branch (success, failure, incomplete, and cancellation).
  - Queued prompts retain their Runtime-prepared attachments (`agentruntime.PreparedInput`) and re-enter through the same input contract, so attachments survive the delay unchanged.

### ✅ Tests

- TUI: new coverage asserting that input during an active run queues without replacing the lease owner, and that the queued prompt starts only after the cancellation path finalizes the durable run and releases its lease.
- Expert Teams: Runtime binding/fork, named-member events, TUI and Serve no-direct-run guards, ACP bind/fork process coverage, Desktop projection, and cross-entry ESM idle-gate coverage.
- Channels: an all-selectable-tools contract test verifies that every available persisted tool selection is present in the resolved session registry.
