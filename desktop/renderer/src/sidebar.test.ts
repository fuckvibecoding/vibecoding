import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sidebar = await readFile(new URL('./sidebar.ts', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

test('sidebar scrollbar is hidden by default and revealed only during interaction', () => {
  assert.match(styles, /\.sidebar-scroll \{[\s\S]*scrollbar-width: none/, 'Firefox default must hide the sidebar scrollbar');
  assert.match(styles, /\.sidebar-scroll\.scrolling \{ scrollbar-width: thin/, 'interaction class must reveal a slim Firefox scrollbar');
  assert.match(styles, /\.sidebar-scroll::-webkit-scrollbar \{ width: 0/, 'WebKit default must hide the sidebar scrollbar');
  assert.match(styles, /\.sidebar-scroll\.scrolling::-webkit-scrollbar \{ width: 8px/, 'interaction class must reveal a slim WebKit scrollbar');
  for (const event of ['pointerenter', 'pointerleave', 'wheel', 'scroll']) assert.match(sidebar, new RegExp(`addEventListener\\('${event}'`), `${event} must control scrollbar visibility`);
  assert.match(sidebar, /scrollbarBound/, 'binding must remain idempotent');
});
