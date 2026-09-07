import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const chatSrc = await readFile(new URL('./chat.ts', import.meta.url), 'utf8');
const stateSrc = await readFile(new URL('./state.ts', import.meta.url), 'utf8');
const stylesSrc = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

test('thought blocks render as a button with aria-expanded and default collapsed', () => {
  assert.match(
    chatSrc,
    /const toggle = el\('button', 'thought-toggle'\) as HTMLButtonElement;/,
    'thought toggle must be a real button so keyboard users can operate it',
  );
  assert.match(
    chatSrc,
    /toggle\.setAttribute\('aria-expanded', String\(item\.open\)\);/,
    'thought toggle must expose its initial collapsed state',
  );
  assert.match(
    chatSrc,
    /toggle\.setAttribute\('aria-expanded', String\(block\.classList\.contains\('open'\)\)\);/,
    'thought toggle must update aria-expanded when the user expands/collapses',
  );
  assert.match(
    chatSrc,
    /if \(current && current\.kind === 'thought'\) current\.open = block\.classList\.contains\('open'\);/,
    'thought toggle must persist the open state on the transcript item',
  );
});

test('tool cards render a button header with aria-expanded and never auto-expand on failure', () => {
  assert.match(
    chatSrc,
    /const head = el\('button', 'tool-head'\) as HTMLButtonElement;/,
    'tool card header must be a real button so keyboard users can operate it',
  );
  assert.match(
    chatSrc,
    /head\.setAttribute\('aria-expanded', String\(item\.open\)\);/,
    'tool card header must expose its initial collapsed state',
  );
  assert.match(
    chatSrc,
    /head\.setAttribute\('aria-expanded', String\(open\)\);/,
    'tool card header must update aria-expanded when the user expands/collapses',
  );
  assert.match(
    chatSrc,
    /if \(current && current\.kind === 'tool'\) current\.open = open;/,
    'tool card header must persist the open state on the transcript item',
  );
  assert.doesNotMatch(
    chatSrc,
    /if \(item\.status === 'failed'\) card\.classList\.add\('open'\)/,
    'tool card must not auto-expand when created in a failed state',
  );
  assert.doesNotMatch(
    chatSrc,
    /if \(item\.status === 'failed'\) node\.classList\.add\('open'\)/,
    'tool card update must not auto-expand when the status becomes failed',
  );
});

test('tool_call and tool_call_update initialize tool disclosure state to collapsed', () => {
  assert.match(
    chatSrc,
    /case 'tool_call':[\s\S]*?open: false,[\s\S]*?contents: \[\],/,
    'tool_call must create tool items with open=false',
  );
  assert.match(
    chatSrc,
    /item = \{ kind: 'tool',[\s\S]*?open: false, contents: \[\] \};/,
    'tool_call_update fallback must create tool items with open=false',
  );
  assert.match(
    stateSrc,
    /kind: 'tool'[\s\S]*?open: boolean/,
    'tool transcript item type must include an explicit open flag',
  );
});

test('styles make the button toggles full-width and keyboard-focusable', () => {
  assert.match(
    stylesSrc,
    /\.thought-toggle \{[\s\S]*?width: 100%;/,
    'thought toggle should span the full card width for an accessible hit target',
  );
  assert.match(
    stylesSrc,
    /\.tool-head \{[\s\S]*?width: 100%;/,
    'tool head should span the full card width for an accessible hit target',
  );
  assert.match(
    stylesSrc,
    /\.thought-toggle:focus-visible,\s*\.tool-head:focus-visible/,
    'toggles should have a visible focus indicator',
  );
});
