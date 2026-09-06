# Changelog (Current Version)

This file contains the changes for the **current version only**. The full history of all versions lives in [docs/en/changelog.md](en/changelog.md).

## v1.2.100

### ✨ New Features

- **Expert Teams Across TUI, WebUI, and Desktop**
  - Sessions can bind a reusable expert bundle with `--expert <id>` or TUI `/expert list|show|bind|unbind|switch` commands. A team bundle injects its lead identity and roster and automatically enables member dispatch; a single-persona bundle changes only the lead identity.
  - Replacing an existing expert creates a fork instead of overwriting the source session. The WebUI expert panel and Desktop ACP **Expert** option use the same Runtime-owned binding and fork path.
  - Member lifecycle projections now carry the member name, emoji, role, and expert identity for TUI, WebUI, and Desktop cards. Member completion is delivered at a lead boundary and never starts a new run by itself.
  - ESM continues only from a genuinely idle, runnable objective. Pending input, decisions, or a member terminal event cannot bypass that gate.

- **WebUI: Slash Command Suggestions in the Chat Composer**
  - Typing `/` in the chat input now shows a suggestion dropdown covering every supported slash command (`/clear`, `/mode`, `/model`, `/defaultModel`, `/models`, `/sessions`, `/status`, `/compact`, `/delegate`, `/alloweditpath`, `/allowautoedit`, `/workflows`, `/skill`, `/skills`, `/rule`, `/esm`, `/help`), with a dedicated subcommand filter for `/esm` (objective/edit/pause/resume/clear/guide).
  - Navigate with ↑/↓, complete with Tab or Enter (Enter sends the prompt when the input already matches the selection), dismiss with Esc, or click an entry; accepting a suggestion places the cursor at the end of the inserted command. The composer keeps proper combobox/listbox ARIA state (`aria-expanded`, `aria-activedescendant`, `aria-selected`).
  - Suggestions are suppressed while a run is active, the API is disabled, or the input spans multiple lines.

### 🐛 Bug Fixes

- **Channels: Browser Selection Survives Runtime Rehydration**
  - A channel session's persisted Browser selection now drives both initial registry construction and Runtime resource rehydration. Explicitly enabling Browser no longer has the tool removed after the session Runtime attaches.

- **TUI: Prompts Submitted During an Active Run Are Queued Instead of Replacing It**
  - A session allows exactly one foreground execution at a time. Previously, submitting input while a run was active replaced the in-memory run handle, orphaning the active run's terminal cleanup and its runtime lease. Such submissions are now queued in the TUI, and the next queued prompt starts only after the preceding run reaches its canonical terminal state and releases its lease — across every terminal branch (success, failure, incomplete, and cancellation).
  - Queued prompts retain their Runtime-prepared attachments (`agentruntime.PreparedInput`) and re-enter through the same input contract, so attachments survive the delay unchanged.

### ✅ Tests

- TUI: new coverage asserting that input during an active run queues without replacing the lease owner, and that the queued prompt starts only after the cancellation path finalizes the durable run and releases its lease.
- Expert Teams: Runtime binding/fork, named-member events, TUI and Serve no-direct-run guards, ACP bind/fork process coverage, Desktop projection, and cross-entry ESM idle-gate coverage.
- Channels: an all-selectable-tools contract test verifies that every available persisted tool selection is present in the resolved session registry.
