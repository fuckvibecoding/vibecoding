import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  configureDevModeSwitches,
  DEFAULT_DESKTOP_DEV_REMOTE_DEBUGGING_PORT,
  DESKTOP_RENDERER_READY_SIGNAL,
  DESKTOP_DEV_ENV,
  devRemoteDebuggingPort,
  enableDevModeWindow,
  isDesktopDevMode,
  rendererDistPath,
} from './dev-mode.ts';

test('isDesktopDevMode reflects the environment variable', (t) => {
  const original = process.env[DESKTOP_DEV_ENV];
  t.after(() => {
    process.env[DESKTOP_DEV_ENV] = original;
  });

  delete process.env[DESKTOP_DEV_ENV];
  assert.equal(isDesktopDevMode(), false);

  process.env[DESKTOP_DEV_ENV] = '1';
  assert.equal(isDesktopDevMode(), true);

  process.env[DESKTOP_DEV_ENV] = 'true';
  assert.equal(isDesktopDevMode(), false);
});

test('configureDevModeSwitches is a no-op outside dev mode', () => {
  const original = process.env[DESKTOP_DEV_ENV];
  try {
    delete process.env[DESKTOP_DEV_ENV];
    const switches: Array<{ name: string; value?: string }> = [];
    configureDevModeSwitches({
      appendSwitch(name: string, value?: string) {
        switches.push({ name, value });
      },
    });
    assert.deepEqual(switches, []);
  } finally {
    process.env[DESKTOP_DEV_ENV] = original;
  }
});

test('devRemoteDebuggingPort defaults to the standard port and can be overridden', (t) => {
  const original = process.env.MOTHX_DESKTOP_DEBUG_PORT;
  t.after(() => {
    process.env.MOTHX_DESKTOP_DEBUG_PORT = original;
  });

  delete process.env.MOTHX_DESKTOP_DEBUG_PORT;
  assert.equal(devRemoteDebuggingPort(), DEFAULT_DESKTOP_DEV_REMOTE_DEBUGGING_PORT);

  process.env.MOTHX_DESKTOP_DEBUG_PORT = '9333';
  assert.equal(devRemoteDebuggingPort(), 9333);

  process.env.MOTHX_DESKTOP_DEBUG_PORT = 'not-a-number';
  assert.equal(devRemoteDebuggingPort(), DEFAULT_DESKTOP_DEV_REMOTE_DEBUGGING_PORT);

  process.env.MOTHX_DESKTOP_DEBUG_PORT = '80';
  assert.equal(devRemoteDebuggingPort(), DEFAULT_DESKTOP_DEV_REMOTE_DEBUGGING_PORT);
});

test('configureDevModeSwitches enables localhost-only remote debugging in dev mode', () => {
  const original = process.env[DESKTOP_DEV_ENV];
  try {
    process.env[DESKTOP_DEV_ENV] = '1';
    const switches: Array<{ name: string; value?: string }> = [];
    configureDevModeSwitches({
      appendSwitch(name: string, value?: string) {
        switches.push({ name, value });
      },
    });
    assert.deepEqual(switches, [
      { name: 'remote-debugging-address', value: '127.0.0.1' },
      { name: 'remote-debugging-port', value: String(DEFAULT_DESKTOP_DEV_REMOTE_DEBUGGING_PORT) },
      { name: 'remote-allow-origins', value: `http://localhost:${DEFAULT_DESKTOP_DEV_REMOTE_DEBUGGING_PORT}` },
    ]);
  } finally {
    process.env[DESKTOP_DEV_ENV] = original;
  }
});

test('rendererDistPath points at the renderer beside the generated main bundle', () => {
  const mainDistDir = '/fake/desktop/dist';
  assert.equal(rendererDistPath(mainDistDir), join(mainDistDir, 'renderer'));
});

test('enableDevModeWindow opens detached DevTools and reloads only after the renderer ready signal', async () => {
  const dist = mkdtempSync(join(tmpdir(), 'mothx-desktop-dev-reload-'));
  try {
    let opened = false;
    let reloaded = false;
    let devtoolsOptions: unknown;
    const fakeWin = {
      isDestroyed: () => false,
      webContents: {
        openDevTools: (options?: unknown) => {
          opened = true;
          devtoolsOptions = options;
        },
        reload: () => {
          reloaded = true;
        },
      },
    } as unknown as Parameters<typeof enableDevModeWindow>[0];

    const cleanup = enableDevModeWindow(fakeWin, dist);
    assert.equal(opened, true, 'DevTools should be opened in dev mode');
    assert.deepEqual(devtoolsOptions, { mode: 'detach' }, 'DevTools should open in detached mode');
    assert.equal(typeof cleanup, 'function');

    // Ordinary bundle writes must not reload file:// while index.html can be
    // transiently replaced. The ready signal is emitted only after a complete
    // renderer build/copy cycle.
    writeFileSync(join(dist, 'main.js'), 'console.log("changed")');
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.equal(reloaded, false, 'individual renderer files must not trigger an intermediate reload');
    writeFileSync(join(dist, DESKTOP_RENDERER_READY_SIGNAL), String(Date.now()));
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.equal(reloaded, true, 'the ready signal must reload the completed renderer');
    cleanup();
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});
