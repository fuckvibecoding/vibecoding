import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const envPanel = await readFile(new URL('./EnvPanel.tsx', import.meta.url), 'utf8');

test('environment-variable add controls reserve the label row so their baselines align', () => {
  assert.match(
    envPanel,
    /className="invisible select-none text-\[11px\] font-semibold text-muted-foreground" aria-hidden="true"/,
    'the action column must retain the same label-row height as the name and value fields',
  );
  assert.match(
    envPanel,
    /<Button className="w-full" onClick=\{addVariable\}>/,
    'the add button must fill its control column like the adjacent inputs',
  );
  assert.match(envPanel, /max-\[760px\]:grid-cols-1/, 'the add controls must remain one column on narrow screens');
});
