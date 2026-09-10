import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const devScript = await readFile(join(root, 'scripts', 'dev.ts'), 'utf8');

test('npm run dev runs the bounded dev runner', () => {
  assert.ok(pkg.scripts.dev, 'dev script should exist');
  assert.match(pkg.scripts.dev, /tsx scripts\/dev\.ts/, 'dev script must run scripts/dev.ts');
  assert.doesNotMatch(pkg.scripts.dev, /build:runtime/, 'frontend restarts must not rebuild the ACP runtime');
});

test('dev runner enables explicit dev mode when spawning Electron', () => {
  assert.match(
    devScript,
    /MOTHX_DESKTOP_DEV[\s]*:[\s]*['"]1['"]/,
    'dev runner must spawn Electron with MOTHX_DESKTOP_DEV=1',
  );
  assert.match(devScript, /node_modules', '\.bin'/, 'dev runner must keep the project-local Electron process attached');
  assert.match(devScript, /--user-data-dir=\$\{devUserData\}/, 'dev runner must isolate itself from an installed Desktop instance');
  assert.match(devScript, /\.mothx-renderer-ready/, 'dev runner must signal only after a completed renderer update');
});

test('npm run dev keeps the pure ACP architecture: no serve/HTTP proxy', () => {
  assert.doesNotMatch(pkg.scripts.dev, /serve/, 'dev script must not start mothx serve');
  assert.doesNotMatch(
    pkg.scripts.dev,
    /http:\/\/localhost/,
    'dev script must not start a renderer HTTP server',
  );
});
