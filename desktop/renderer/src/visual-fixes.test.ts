import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

test('appearance settings rows render meaningful icons inside their row-icon containers', () => {
  const cases: [string, string][] = [
    ['settings-theme-icon', 'sun'],
    ['settings-lang-icon', 'globe'],
    ['settings-home-bg-icon', 'image'],
    ['settings-home-opacity-icon', 'sliders'],
    ['settings-home-blur-icon', 'frame'],
  ];
  for (const [id, icon] of cases) {
    assert.match(
      index,
      new RegExp(`<div class="row-icon" id="${id}"><span class="wi sm" data-icon="${icon}"></span></div>`),
      `${id} must contain a meaningful ${icon} icon`,
    );
  }
});

test('sidebar New Task button is lighter than a solid accent block while staying primary', () => {
  const block = grabBlock('.btn-new-task');
  assert.match(block, /background:\s*var\(--accent-soft\)/, 'base new-task button must use a subtle accent tint');
  assert.match(block, /color:\s*var\(--accent\)/, 'base new-task button must show accent text');
  assert.match(block, /border:\s*1px solid color-mix\(in srgb, var\(--accent\) 58%, transparent\)/, 'base new-task button must keep a restrained accent border');

  const hover = grabBlock('.btn-new-task:hover');
  assert.match(hover, /background:\s*var\(--accent\)/, 'new-task hover must fill with the accent color');
  assert.match(hover, /color:\s*var\(--accent-contrast\)/, 'new-task hover must use contrast text');
});

test('global-background New Task button uses a readable control surface instead of an opaque accent slab', () => {
  const block = grabBlock('#app.has-app-background .btn-new-task');
  assert.match(block, /background:\s*var\(--app-control-bg\)/, 'global-background new-task must sit on the shared control surface');
  assert.match(block, /border:\s*1px solid var\(--app-control-border-strong\)/, 'global-background new-task must use a visible control border');
  assert.doesNotMatch(block, /background:\s*color-mix\(in srgb, var\(--accent\) 86%, transparent\)/, 'global-background new-task must not reuse the heavy primary-button slab');

  const hover = grabBlock('#app.has-app-background .btn-new-task:hover');
  assert.match(hover, /background:\s*var\(--accent\)/, 'global-background new-task hover must still resolve to accent');
});

test('Home hero headline is less saturated and secondary text is more readable', () => {
  const accent = grabBlock('.hero-title .accent-text');
  assert.match(
    accent,
    /color:\s*color-mix\(in srgb, var\(--home-accent\) 55%, var\(--home-muted\)\)/,
    'hero accent text must be desaturated with the muted tone',
  );
  assert.match(accent, /font-weight:\s*500/, 'hero accent text must use a lighter weight');

  const subtitle = grabBlock('.hero-subtitle');
  assert.match(subtitle, /color:\s*var\(--home-text\)/, 'hero subtitle must use the strong text color');
  assert.match(subtitle, /opacity:\s*\.78/, 'hero subtitle must remain slightly subdued');

  assert.doesNotMatch(
    styles,
    /\.hero-title \.accent-text \{[^}]*color:\s*var\(--home-accent\)[^}]*\}/,
    'hero accent text must not use the raw saturated accent color',
  );
});

test('Home mode description, quick cards, and composer tool icons are readable', () => {
  const sub = grabBlock('.mode-desc .sub');
  assert.match(sub, /color:\s*var\(--home-text\)/, 'mode-desc sub must use strong text color');
  assert.match(sub, /opacity:\s*\.9/, 'mode-desc sub must keep slight subdual');

  const desc = grabBlock('.mode-desc .desc');
  assert.match(desc, /color:\s*var\(--home-muted\)/, 'mode-desc desc must use readable muted color');
  assert.doesNotMatch(desc, /color:\s*var\(--home-faint\)/, 'mode-desc desc must not use the faint color');

  const card = grabBlock('.quick-card');
  assert.match(card, /color:\s*color-mix\(in srgb, var\(--home-text\) 90%, transparent\)/, 'quick cards must use stronger text color');
  assert.doesNotMatch(card, /color:\s*var\(--home-muted\)/, 'quick cards must not inherit the faint muted color');

  const tag = grabBlock('.quick-card-tag');
  assert.match(tag, /color:\s*var\(--home-muted\)/, 'quick card tags must use readable muted color');
  assert.match(tag, /font-size:\s*10px/, 'quick card tags must stay concise');

  const toolIcon = grabBlock('#view-home .composer-tool .wi');
  assert.match(toolIcon, /color:\s*var\(--home-text\)/, 'home composer tool icons must use strong text color');
  assert.match(toolIcon, /opacity:\s*\.85/, 'home composer tool icons must stay slightly subtle');
});

test('Home vertical spacing centers the content without affecting the chat composer', () => {
  const inner = grabBlock('.home-inner');
  assert.match(inner, /min-height:\s*100%/, 'home inner must fill the scroll height so justify-content can balance content');
  assert.match(inner, /justify-content:\s*center/, 'home inner must center its content vertically');
  assert.match(inner, /box-sizing:\s*border-box/, 'home padding must remain within the available height');

  const composer = grabBlock('#view-home .composer-wrap');
  assert.match(composer, /margin-top:\s*36px/, 'home composer must keep a clean gap from the content above');
  assert.match(styles, /^\.composer-wrap \{ width: 100%; \}$/m, 'chat composer layout must not inherit Home spacing');
});

test('Home composer area is modestly wider while keeping a wrap fallback for narrow viewports', () => {
  const inner = grabBlock('.home-inner');
  const widthMatch = inner.match(/width:\s*min\((\d+)px,\s*92%\)/);
  assert.ok(widthMatch, 'home inner must use a responsive min(...) width cap');
  const cap = parseInt(widthMatch[1], 10);
  assert.ok(cap >= 800 && cap <= 840, `home inner width cap (${cap}px) must stay within the 800-840px desktop range`);

  const bar = grabBlock('.composer-bar');
  assert.match(bar, /flex-wrap:\s*wrap/, 'composer controls must still wrap when the Home width is constrained');
  assert.match(bar, /min-width:\s*0/, 'composer bar must remain allowed to shrink before wrapping');
});

test('composer toolbar wraps instead of squeezing its controls', () => {
  const bar = grabBlock('.composer-bar');
  assert.match(bar, /flex-wrap:\s*wrap/, 'composer controls must move to a new line when space is constrained');
  assert.match(bar, /min-width:\s*0/, 'composer bar must be allowed to fit its container');

  assert.match(styles, /^\.composer-tool\s*\{[^}]*flex:\s*0 0 auto[^}]*\}/m, 'composer controls must retain their natural button width instead of flex-shrinking');
  assert.match(styles, /^\.composer-tool\s*\{[^}]*min-height:\s*28px[^}]*\}/m, 'composer controls must preserve a stable hit area');

  const send = grabBlock('.btn-send');
  assert.match(send, /flex-shrink:\s*0/, 'send control must never be compressed');

  const labels = grabBlock('.composer-tool span:not(.wi)');
  assert.match(labels, /text-overflow:\s*ellipsis/, 'long picker labels must truncate cleanly');
});

test('sidebar hierarchy labels and statuses are readable without breaking density or truncation', () => {
  for (const selector of ['.nav-sub', '.task-tree-label', '.task-project-count', '.task-empty', '.local-hint']) {
    const block = grabBlock(selector);
    assert.match(block, /color:\s*var\(--fg-muted\)/, `${selector} must use the readable muted text color`);
    assert.doesNotMatch(block, /color:\s*var\(--fg-faint\)/, `${selector} must not use the faint text color`);
  }

  const title = grabBlock('.task-title');
  assert.match(title, /white-space:\s*nowrap/, 'session title must keep single-line truncation');
  assert.match(title, /overflow:\s*hidden/, 'session title must hide overflow');
  assert.match(title, /text-overflow:\s*ellipsis/, 'session title must ellipsis overflow');
});

function grabBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'i');
  const match = styles.match(re);
  assert.ok(match, `expected to find CSS block for "${selector}"`);
  return match![1];
}
