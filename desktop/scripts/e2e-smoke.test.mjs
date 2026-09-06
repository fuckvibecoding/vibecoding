import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const smoke = await readFile(new URL('./e2e-smoke.mjs', import.meta.url), 'utf8');

test('desktop e2e smoke is a real launch gate, not a success-on-skip script', () => {
  assert.match(smoke, /requires DISPLAY or WAYLAND_DISPLAY/);
  assert.match(smoke, /process\.exit\(1\)/, 'missing GUI support must fail the smoke gate');
  assert.match(smoke, /--user-data-dir=/, 'smoke must isolate its own Electron instance');
  assert.doesNotMatch(smoke, /pkill\s+-f/, 'smoke must not kill unrelated Electron processes');
});
