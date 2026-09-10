import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const composer = await readFile(new URL('./composer.ts', import.meta.url), 'utf8');
const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const translations = await readFile(new URL('./i18n.ts', import.meta.url), 'utf8');

test('composer keeps linked provider and model controls in both toolbar variants', () => {
  for (const id of ['provider-btn', 'provider-btn2', 'model-btn', 'model-btn2']) {
    assert.match(index, new RegExp(`id="${id}"`), `${id} must be present`);
  }
  assert.match(index, /id="provider-menu"/, 'provider needs its own popover');
  assert.match(main, /#provider-label, \.provider-label2/, 'provider labels must render separately from models');
  assert.doesNotMatch(main, /\$\{provider\} · \$\{model\}/, 'model labels must no longer combine provider text');
});

test('provider and model menus use searchable ACP-projected choices', () => {
  assert.match(composer, /export function renderProviderMenu/, 'provider picker must have a dedicated renderer');
  assert.match(composer, /renderSearchableMenu\(menu, t\('composer\.provider'\)/, 'provider picker must be searchable');
  assert.match(composer, /renderSearchableMenu\(menu, t\('composer\.model'\)/, 'model picker must be searchable');
  assert.match(composer, /search\.type = 'search'/, 'picker must use a search input');
  assert.match(composer, /event\.key === 'Escape'/, 'Escape must close a picker');
  assert.match(composer, /event\.key === 'Enter'/, 'Enter must choose the first filtered option');
  assert.match(composer, /applyConfigOption\('provider', choice\.value\)/, 'provider selection must use session config options');
  assert.match(composer, /applyConfigOption\('model', choice\.value\)/, 'model selection must use session config options');
  assert.match(composer, /target\.closest\('#provider-btn'\)/, 'outside-click handling must retain provider picker interactions');
});

test('model choices expose catalog capabilities without local provider state', () => {
  assert.match(composer, /input\?: string\[\]/, 'catalog projection must retain input modalities');
  assert.match(composer, /catalogCapabilities\.set/, 'capabilities must be held only in the ephemeral catalog projection');
  assert.match(composer, /model-cap reasoning/, 'reasoning must be rendered as a model capability');
  assert.match(composer, /modalityLabel\(input\)/, 'input modalities must be rendered as capabilities');
  assert.match(styles, /\.pop-search/, 'search popover styling must exist');
  assert.match(styles, /\.model-cap/, 'model capability badge styling must exist');
  assert.doesNotMatch(composer, /desktop\.storeSet\([^)]*(provider|model)/i, 'picker must not persist provider or model state locally');
});

test('composer picker copy remains bilingual', () => {
  for (const key of ['composer.provider', 'composer.model', 'composer.searchProvider', 'composer.searchModel', 'composer.noMatches', 'composer.reasoning']) {
    assert.equal(translations.split(`'${key}'`).length - 1, 2, `${key} must exist in both locales`);
  }
});
