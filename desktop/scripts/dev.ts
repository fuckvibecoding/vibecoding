import { build, context } from 'esbuild';
import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, watch as fsWatch } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Bounded development runner for MothX Desktop.
 *
 * - Builds main and preload once at startup. Changes to `main/` or `preload/`
 *   require a manual restart (documented in desktop/README.md).
 * - Builds the renderer bundle and watches `renderer/src/` TypeScript sources
 *   changes, recopying `index.html`, `styles.css`, and the app icon whenever
 *   those files change.
 * - Spawns Electron in explicit dev mode (`MOTHX_DESKTOP_DEV=1`), which enables
 *   DevTools, a localhost-only Chrome remote debugging port, and auto-reload
 *   when `dist/renderer` assets change.
 *
 * The renderer is still served as static `file://` assets; this script does not
 * start an HTTP server and the renderer does not call local APIs.
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'dist');
const rendererOut = join(out, 'renderer');
const rendererIn = join(root, 'renderer');
const staticAssets = ['index.html', 'styles.css', 'mothx.png'];
const devUserData = process.env.MOTHX_DESKTOP_USER_DATA || join(root, '.dev-user-data');

function copyRendererStatic(): void {
  for (const name of staticAssets) {
    const source = join(rendererIn, name === 'mothx.png' ? join('..', 'resources', name) : name);
    cpSync(source, join(rendererOut, name));
  }
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

async function buildRenderer(): Promise<ReturnType<typeof context>> {
  mkdirSync(rendererOut, { recursive: true });
  copyRendererStatic();

  const ctx = await context({
    entryPoints: [join(rendererIn, 'src', 'main.ts')],
    outfile: join(rendererOut, 'main.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'chrome120',
    sourcemap: true,
  });

  // Complete the first bundle before launching Electron. Subsequent source
  // edits are handled by context.watch().
  await ctx.rebuild();

  // Watch static HTML/CSS and icon files and recopy them into dist/renderer so
  // the main-process watcher can trigger a renderer reload.
  const staticWatcher = fsWatch(rendererIn, { recursive: false }, (_event, filename) => {
    if (filename && staticAssets.includes(String(filename))) {
      copyRendererStatic();
    }
  });

  // Hook into the esbuild context lifecycle so cleanup closes the fs watcher.
  const originalDispose = ctx.dispose.bind(ctx);
  ctx.dispose = async () => {
    staticWatcher.close();
    return originalDispose();
  };

  return ctx;
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
  const rendererCtx = await buildRenderer();
  await rendererCtx.watch();

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
      await rendererCtx.dispose();
      process.exit(code ?? 0);
    }
  });
}

run().catch((error: unknown) => {
  console.error('desktop dev runner failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
