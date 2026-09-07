# Vibe Browser

Use this skill when the user asks to inspect, test, automate, or capture a web page with the `browser` tool.

The `browser` tool exposes browser automation through an action field. Prefer this loop:

1. `open` or `navigate` to the page.
2. `snapshot` with `interactive=true` to inspect controls and stable refs/selectors.
3. Interact with `click`, `click_at`, `dblclick`, `dblclick_at`, `fill`, `type`, `press`, `select`, `check`, `uncheck`, `scroll`, `move_mouse`, or `drag`.
4. After page-changing actions, wait with `wait_for_selector`, `wait_for_text`, `wait_for_url`, or a short `wait_ms`.
5. Re-run `snapshot` or read with `get_text`, `get_html`, `get_attr`, `get_url`, or `get_title`.
6. Use `screenshot` for visual verification; pass `outputPath` to save under the project.

Common actions:

- Navigation: `open`, `navigate` (with `waitUntil` for load state), `back`, `forward`, `reload`, `close`.
- Inspection: `snapshot`, `get_text`, `get_html` (capped at ~50KB; `maxBytes=0` for full doc), `get_value`, `get_attr`, `get_url`, `get_title`, `eval`.
- State checks: `is_visible`, `is_enabled`, `is_checked`.
- Waiting: `wait_ms`, `wait_for_selector`, `wait_for_text`, `wait_for_url`.
- Coordinate mouse (v0.1.5+): `click_at`, `dblclick_at`, `move_mouse`, `drag` (x/y are viewport CSS pixels). `scroll` accepts optional `x`/`y` to scroll at a point.
- Browser state: `set_viewport`, `set_geolocation`, `set_offline`, `set_headers`, `cookies_get`, `set_cookie`, `cookies_clear`, `tab_new`, `tab_close`.
- Capture: `screenshot` (with `clipX`/`clipY`/`clipWidth`/`clipHeight` for a region, or `fullPage` for everything).

Keep selectors specific and prefer refs/selectors observed in a fresh snapshot. Never claim a UI state changed until you verify it with a snapshot, read, URL/title check, or screenshot.
