import type { BrowserWindow } from 'electron';
import { watch } from 'node:fs';
import { join } from 'node:path';

/**
 * Desktop development mode is opt-in via this environment variable.
 * It must be set by the dev runner (npm run dev / make desktop-dev) so the
 * main process can enable DevTools, a localhost-only remote debugging port,
 * and renderer auto-reload when dist/renderer assets change.
 */
export const DESKTOP_DEV_ENV = 'MOTHX_DESKTOP_DEV';

/**
 * Default localhost-only Chrome remote debugging port used in explicit dev mode.
 */
export const DEFAULT_DESKTOP_DEV_REMOTE_DEBUGGING_PORT = 9223;
export const DESKTOP_RENDERER_READY_SIGNAL = '.mothx-renderer-ready';

/**
 * Returns true when the desktop dev runner has enabled development mode.
 */
export function isDesktopDevMode(): boolean {
  return process.env[DESKTOP_DEV_ENV] === '1';
}

/**
 * Returns the configured localhost-only remote debugging port. It can be
 * overridden with `MOTHX_DESKTOP_DEBUG_PORT` for local tooling that expects a
 * specific port.
 */
export function devRemoteDebuggingPort(): number {
  const env = process.env.MOTHX_DESKTOP_DEBUG_PORT;
  if (!env) return DEFAULT_DESKTOP_DEV_REMOTE_DEBUGGING_PORT;
  const parsed = parseInt(env, 10);
  return Number.isInteger(parsed) && parsed >= 1024 && parsed <= 65535
    ? parsed
    : DEFAULT_DESKTOP_DEV_REMOTE_DEBUGGING_PORT;
}

/**
 * Apply Chromium command-line switches that must be configured before the
 * application is ready. The debugging port is bound to localhost by default;
 * we also restrict allowed origins to localhost explicitly.
 */
export function configureDevModeSwitches(commandLine: {
  appendSwitch(name: string, value?: string): void;
}): void {
  if (!isDesktopDevMode()) return;
  const port = devRemoteDebuggingPort();
  commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
  commandLine.appendSwitch('remote-debugging-port', String(port));
  commandLine.appendSwitch('remote-allow-origins', `http://localhost:${port}`);
}

/**
 * Open DevTools in a detached external window and watch only the renderer
 * ready signal. The development builder writes that marker after a complete
 * bundle/static-asset update; watching individual output files can reload
 * file:// while index.html is temporarily being replaced and cause a blank
 * renderer. Returns a cleanup function.
 */
export function enableDevModeWindow(win: BrowserWindow, rendererDist: string): () => void {
  // Always detach DevTools so it never docks inside the BrowserWindow and cannot
  // influence layout/style review. The local CDP endpoint is unaffected.
  win.webContents.openDevTools({ mode: 'detach' });

  let debounce: ReturnType<typeof setTimeout> | undefined;
  // Avoid recursive watching: Node does not support it on Linux. More
  // importantly, do not reload on main.js/index.html/styles.css writes.
  const watcher = watch(rendererDist, (_event, filename) => {
    if (String(filename) !== DESKTOP_RENDERER_READY_SIGNAL) return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      if (win.isDestroyed()) return;
      win.webContents.reload();
    }, 120);
  });

  return () => {
    if (debounce) clearTimeout(debounce);
    watcher.close();
  };
}

/**
 * Compute the path to the generated renderer assets for reload watching.
 */
export function rendererDistPath(mainDistDir: string): string {
  return join(mainDistDir, 'renderer');
}
