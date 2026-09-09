import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

test('titlebar keeps its normal inactive styling', () => {
  assert.match(styles, /\.titlebar \{[\s\S]*background:\s*var\(--titlebar-bg\)/, 'inactive titlebar must use the theme titlebar background');
  assert.match(styles, /\.titlebar \{[\s\S]*border-bottom:\s*1px solid var\(--border\)/, 'inactive titlebar must keep its bottom border');
  assert.match(styles, /\.titlebar \{[\s\S]*-webkit-app-region:\s*drag/, 'titlebar must remain draggable');
  assert.match(styles, /\.titlebar button \{[\s\S]*-webkit-app-region:\s*no-drag/, 'titlebar buttons must stay non-draggable');
});

test('global-background titlebar uses readable contrast surfaces for text and window controls', () => {
  assert.match(styles, /#app\.has-app-background \.titlebar \{[^}]*backdrop-filter:\s*blur\(var\(--app-surface-blur/, 'titlebar must blur the app background');

  const surfaceBlock = grabBlock('#app.has-app-background .titlebar-left,\n#app.has-app-background .win-controls');
  assert.match(surfaceBlock, /background:\s*var\(--app-titlebar-control-bg\)/, 'titlebar text area and window controls must share a subtler control surface');
  assert.match(surfaceBlock, /border:\s*1px solid var\(--app-titlebar-control-border\)/, 'control surface must have a restrained border');
  assert.match(surfaceBlock, /box-shadow:\s*var\(--app-titlebar-control-shadow\)/, 'control surface must cast a subtler shadow');
  assert.match(surfaceBlock, /backdrop-filter:\s*blur\(10px\) saturate\(140%\)/, 'control surface must blur and saturate the background underneath');

  assert.match(styles, /--app-titlebar-control-bg:\s*rgb\(var\(--home-image-overlay-rgb\) \/ \.46\)/, 'titlebar control surface must be more transparent than regular controls');
  assert.match(styles, /--app-titlebar-control-border:\s*rgb\(var\(--app-outline-rgb\) \/ \.12\)/, 'titlebar control border must be more restrained');
  assert.match(styles, /--app-titlebar-control-shadow:\s*0 1px 4px rgb\(var\(--app-outline-rgb\) \/ \.06\)/, 'titlebar control shadow must be more subtle');

  assert.match(styles, /#app\.has-app-background \.titlebar-left\s*\{[^}]*padding:/, 'titlebar text area must be padded inside its surface');

  assert.match(styles, /#app\.has-app-background \.app-name \{[^}]*color:\s*var\(--fg-strong\)/, 'app name must use the strongest text color on a background image');
  assert.match(styles, /#app\.has-app-background \.app-name \{[^}]*text-shadow:/, 'app name must carry a text shadow for extra contrast');

  assert.match(styles, /#app\.has-app-background \.app-ver \{[^}]*background:\s*rgb\(var\(--app-outline-rgb\) \/ \.07\)/, 'version badge must use a subtle surface on a background image');
  assert.match(styles, /#app\.has-app-background \.app-ver \{[^}]*color:\s*var\(--fg-muted\)/, 'version badge text must stay readable on a background image');
  assert.match(styles, /#app\.has-app-background \.app-ver \{[^}]*border:\s*1px solid rgb\(var\(--app-outline-rgb\) \/ \.1\)/, 'version badge must have a restrained border');

  assert.match(styles, /#app\.has-app-background \.win-btn \{[^}]*color:\s*var\(--fg-strong\)/, 'window control icons must use the strongest text color on a background image');
  assert.match(styles, /#app\.has-app-background \.win-btn \{[^}]*text-shadow:/, 'window control icons must carry a text shadow for extra contrast');
  assert.match(styles, /#app\.has-app-background \.win-btn:focus-visible \{[^}]*outline:/, 'window controls must keep a visible keyboard focus ring over a background image');
});

test('global-background titlebar preserves hover and close danger state', () => {
  assert.match(styles, /#app\.has-app-background \.win-btn:hover \{[^}]*background:\s*var\(--app-titlebar-control-hover\)/, 'window controls must show a hover surface');
  assert.match(styles, /#app\.has-app-background \.win-btn:hover \{[^}]*border-color:\s*var\(--app-control-border-strong\)/, 'window controls must darken their border on hover');
  assert.match(styles, /#app\.has-app-background \.win-btn\.close:hover \{[^}]*background:\s*var\(--red\)/, 'close control must retain its red danger hover state');
  assert.match(styles, /#app\.has-app-background \.win-btn\.close:hover \{[^}]*color:\s*var\(--danger-contrast\)/, 'close control danger state must use the danger contrast color');
});

function grabBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'i');
  const match = styles.match(re);
  assert.ok(match, `expected to find CSS block for "${selector}"`);
  return match![1];
}
