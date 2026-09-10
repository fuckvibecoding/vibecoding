import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { build as viteBuild, type Plugin } from 'vite';

/**
 * Bounded development runner for MothX Desktop.
 *
 * - Builds main and preload once at startup. Changes to `main/` or `preload/`
 *   require a manual restart (documented in desktop/README.md).
 * - Builds the React renderer with Vite in watch mode, writing classic-script
 *   bundles into `dist/renderer` and recopying the app icon.
 * - Spawns Electron in explicit dev mode (`MOTHX_DESKTOP_DEV=1`), which enables
 *   DevTools, a localhost-only Chrome remote debugging port, and auto-reload
 *   when the renderer-ready signal appears.
 *
 * The renderer is still served as static `file://` assets; this script does not
 * start an HTTP server and the renderer does not call local APIs.
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'dist');
const rendererOut = join(out, 'renderer');
const devUserData = process.env.MOTHX_DESKTOP_USER_DATA || join(root, '.dev-user-data');
const rendererReadySignal = join(rendererOut, '.mothx-renderer-ready');

function notifyRendererReady(): void {
  writeFileSync(rendererReadySignal, String(Date.now()));
}

function copyRendererStatic(): void {
  mkdirSync(rendererOut, { recursive: true });
  cpSync(join(root, 'resources', 'mothx.png'), join(rendererOut, 'mothx.png'));
  notifyRendererReady();
}

async function buildMainAndPreload(): Promise<void> {
  await build({
    entryPoints: [join(root, 'main', 'index.ts')],
    outfile: join(out, 'main.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    sourcemap: true,
  });

  await build({
    entryPoints: [join(root, 'preload', 'index.ts')],
    outfile: join(out, 'preload.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    sourcemap: true,
  });
}

async function buildRenderer(): Promise<{ close: () => Promise<void> }> {
  copyRendererStatic();

  // Signal only after a complete bundle update so the main-process watcher
  // never reloads file:// while index.html is being replaced.
  const signalRendererReady: Plugin = {
    name: 'desktop-dev-renderer-ready',
    writeBundle() {
      notifyRendererReady();
    },
  };

  const watcher = await viteBuild({
    configFile: join(root, 'renderer', 'vite.config.ts'),
    logLevel: 'warn',
    plugins: [signalRendererReady],
    build: {
      sourcemap: true,
      watch: {},
    },
  });

  return {
    close: async () => {
      if (watcher && 'close' in watcher) await watcher.close();
    },
  };
}

function electronCommand(): { command: string; args: string[] } {
  // Spawn the project-local binary directly. Unlike a package-manager wrapper,
  // it stays attached for the entire Desktop session so the CDP endpoint stays
  // available for screenshots and review.
  const executable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
  return {
    command: join(root, 'node_modules', '.bin', executable),
    args: ['.', '--no-sandbox', `--user-data-dir=${devUserData}`],
  };
}

async function run(): Promise<void> {
  await buildMainAndPreload();
  const rendererWatcher = await buildRenderer();

  const { command: electronBin, args: electronArgs } = electronCommand();
  const child = spawn(electronBin, electronArgs, {
    cwd: root,
    env: { ...process.env, MOTHX_DESKTOP_DEV: '1' },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  let exited = false;
  function cleanup(signal: NodeJS.Signals): void {
    if (exited) return;
    exited = true;
    child.kill(signal);
  }

  process.on('SIGINT', () => cleanup('SIGTERM'));
  process.on('SIGTERM', () => cleanup('SIGTERM'));

  child.on('exit', async (code) => {
    console.log(`[desktop-dev] Electron exited with code ${code ?? 0}`);
    if (!exited) {
      exited = true;
      await rendererWatcher.close();
      process.exit(code ?? 0);
    }
  });
}

run().catch((error: unknown) => {
  console.error('desktop dev runner failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
