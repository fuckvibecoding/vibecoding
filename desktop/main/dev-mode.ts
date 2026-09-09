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
 * Open DevTools and watch the generated renderer dist directory for changes.
 * When any renderer asset is rebuilt, reload the BrowserWindow so the static
 * file:// page reflects the latest code. Returns a cleanup function.
 */
export function enableDevModeWindow(win: BrowserWindow, rendererDist: string): () => void {
  win.webContents.openDevTools();

  let debounce: ReturnType<typeof setTimeout> | undefined;
  // The generated renderer assets are all direct children of this directory.
  // Avoid recursive watching: Node does not support it on Linux.
  const watcher = watch(rendererDist, (_event, filename) => {
    // Ignore macOS .DS_Store and similar metadata churn.
    if (filename && filename.startsWith('.')) return;
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
