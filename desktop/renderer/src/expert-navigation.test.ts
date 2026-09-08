import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const sidebar = await readFile(new URL('./sidebar.ts', import.meta.url), 'utf8');
const composer = await readFile(new URL('./composer.ts', import.meta.url), 'utf8');
const translations = await readFile(new URL('./i18n.ts', import.meta.url), 'utf8');

test('expert teams sidebar entry precedes knowledge library and is ACP-gated', () => {
  const expertIndex = index.indexOf('data-nav="experts"');
  const libraryIndex = index.indexOf('data-nav="library"');
  assert.ok(expertIndex >= 0 && expertIndex < libraryIndex, 'Expert teams must appear directly above the library');
  const between = index.slice(expertIndex + 'data-nav="experts"'.length, libraryIndex);
  assert.ok(!between.includes('data-nav='), 'No other nav item may sit between experts and library');
  assert.match(sidebar, /hidden\s*=\s*!hasFeature\('manageExperts'\)/, 'sidebar entry must follow the ACP feature gate');
  assert.match(sidebar, /openSettingsTab\('experts'\)/, 'sidebar entry must open the canonical Expert settings tab');
});

test('composer binds or clears current session expert through its canonical config option', () => {
  assert.match(composer, /applyConfigOption\('expert', value\)/, 'fresh binding and unbinding must use the expert config option');
  assert.match(composer, /expertOption\.currentValue\s*&&\s*value/, 'only non-empty expert replacement may fork');
  assert.match(composer, /forkSession\(sessionID, value\)/, 'expert replacement must use the Runtime-owned session fork');
  assert.match(composer, /value === expertOption\.currentValue\s*\)\s*return/, 're-selecting the current expert is a no-op');
});

test('chat composer exposes an independent visible Expert Teams picker', () => {
  assert.match(index, /id="expert-btn"/, 'new-session composer must expose the same Expert Teams picker before session/new');
  assert.match(index, /id="expert-btn2"/, 'chat composer must expose a dedicated Expert Teams button');
  assert.match(index, /id="expert-menu"/, 'chat composer must expose an Expert Teams menu');
  assert.match(index, /data-i18n-aria-label="composer\.expert"/, 'picker must have a localized accessible label');
  assert.match(index, /data-i18n-title="composer\.expert"/, 'picker must have a localized accessible title');
  assert.match(composer, /renderExpertMenu/, 'Expert Teams menu must render independently of the mode menu');
  assert.match(composer, /chooseSessionExpert/, 'both composer controls must share canonical binding behavior');
  assert.match(composer, /composer\.expertNone/, 'picker menu must include a localized No expert option');
});

test('new-session expert selection is independent from Mode and is carried into the initial session config', () => {
  const modeMenu = composer.match(/export function renderModeMenu\(\): void \{[\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(modeMenu, /expertOption|chooseSessionExpert/, 'Mode must not duplicate the dedicated Expert picker');
  assert.match(composer, /mothx\/session\/draft-config-options/, 'draft options must come from the shared ACP Runtime projection');
  assert.match(composer, /pendingConfig\[configId\] = value/, 'a pre-session expert choice must be retained for session creation');
  assert.match(composer, /pendingConfig\.expert = undefined/, 'the pending expert choice must be cleared after it is applied');
});

test('expert sidebar label stays bilingual', () => {
  assert.equal(translations.split("'nav.experts'").length - 1, 2, 'nav.experts must be present in both translation maps');
});
