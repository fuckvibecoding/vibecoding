import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { fileURLToPath } from 'node:url';

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

// The desktop renderer is a standalone frontend (desktop/renderer) and is
// intentionally independent from the serve Web UI in ui/.
const rendererOut = join(out, 'renderer');
mkdirSync(rendererOut, { recursive: true });
await build({
  entryPoints: [join(root, 'renderer', 'src', 'main.ts')],
  outfile: join(rendererOut, 'main.js'),
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'chrome120',
  sourcemap: false,
});
cpSync(join(root, 'renderer', 'index.html'), join(rendererOut, 'index.html'));
cpSync(join(root, 'renderer', 'styles.css'), join(rendererOut, 'styles.css'));
cpSync(join(root, 'resources', 'mothx.png'), join(rendererOut, 'mothx.png'));

console.log(`Built desktop runtime into ${out}`);
