import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

function grabBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^\\s*${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'im');
  const match = styles.match(re);
  assert.ok(match, `expected to find CSS block for "${selector}"`);
  return match![1];
}

test('both composer toolbars keep fixed icon controls and send button non-shrinkable', () => {
  for (const id of ['plus-btn', 'caps-btn', 'plus-btn2', 'caps-btn2']) {
    const re = new RegExp(`<button\\b(?=[^>]*\\bid="${id}"(?=[\\s>]))(?=[^>]*\\bclass="[^"]*composer-tool composer-tool-icon[^"]*")[^>]*>`);
    assert.match(index, re, `${id} must carry the icon-only class so it never shrinks`);
  }

  const toolBlock = grabBlock('.composer-tool');
  assert.match(toolBlock, /min-width:\s*0/, 'composer tool must allow graceful shrink so labels can truncate');

  const iconBlock = grabBlock('.composer-tool-icon');
  assert.match(iconBlock, /flex-shrink:\s*0/, 'icon-only toolbar controls must not compress below their intended size');

  const btnSend = grabBlock('.btn-send');
  assert.match(btnSend, /flex-shrink:\s*0/, 'send button must keep its fixed square dimensions');
  assert.match(btnSend, /width:\s*32px/, 'send button must keep 32px width');
  assert.match(btnSend, /height:\s*32px/, 'send button must keep 32px height');
});

test('composer bar wraps instead of squeezing controls on narrow widths', () => {
  const bar = grabBlock('.composer-bar');
  assert.match(bar, /flex-wrap:\s*wrap/, 'composer bar must wrap gracefully instead of overflowing or squeezing');
  assert.match(bar, /min-width:\s*0/, 'composer bar must allow shrink-to-fit when wrapping');
});

test('provider, model, workspace and mode labels truncate cleanly', () => {
  const labelRule = grabBlock('.composer-tool span:not(.wi)');
  assert.match(labelRule, /white-space:\s*nowrap/, 'label text must stay on one line');
  assert.match(labelRule, /overflow:\s*hidden/, 'label overflow must be hidden');
  assert.match(labelRule, /text-overflow:\s*ellipsis/, 'label overflow must show ellipsis');
  assert.match(labelRule, /min-width:\s*0/, 'label span must be allowed to shrink for truncation');

  for (const cls of ['model', 'provider', 'workspace-picker', 'expert-picker']) {
    const block = grabBlock(`.composer-tool.${cls}`);
    assert.doesNotMatch(block, /flex-shrink:\s*0/, `${cls} label-bearing control must remain shrinkable/truncatable`);
  }
});
