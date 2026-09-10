import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { build as viteBuild } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'dist');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [join(root, 'main', 'index.ts')],
  outfile: join(out, 'main.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: false,
});

await build({
  entryPoints: [join(root, 'preload', 'index.ts')],
  outfile: join(out, 'preload.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: false,
});

// The desktop renderer is a standalone React + shadcn/ui + Tailwind frontend
// (desktop/renderer) built by Vite into dist/renderer as file://-compatible
// classic scripts. It is intentionally independent from the serve Web UI in ui/.
const rendererOut = join(out, 'renderer');
mkdirSync(rendererOut, { recursive: true });
await viteBuild({
  configFile: join(root, 'renderer', 'vite.config.ts'),
  logLevel: 'warn',
});
cpSync(join(root, 'resources', 'mothx.png'), join(rendererOut, 'mothx.png'));

console.log(`Built desktop runtime into ${out}`);
