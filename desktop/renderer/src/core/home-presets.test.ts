import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { PRESETS } from './i18n.ts';

const homeView = await readFile(new URL('../views/HomeView.tsx', import.meta.url), 'utf8');

const CATEGORIES = ['working', 'coding', 'design'] as const;
const GENERIC_LABELS = ['整理信息', '起草邮件', '调研主题', '总结会议', '生成报告', '编写文档', '分析缺陷', '重构代码', '技术文档', '演示文稿', '插画方向', 'logo 方案', '主题文案', '视觉方案'];

test('presets expose three categories with six concrete options each', () => {
  assert.deepStrictEqual(Object.keys(PRESETS).sort(), [...CATEGORIES].sort());
  for (const category of CATEGORIES) {
    const preset = PRESETS[category];
    assert.strictEqual(preset.quickZh.length, 6, `${category} must have six zh labels`);
    assert.strictEqual(preset.quickEn.length, 6, `${category} must have six en labels`);
    assert.strictEqual(preset.tagZh.length, 6, `${category} must have six zh tags`);
    assert.strictEqual(preset.tagEn.length, 6, `${category} must have six en tags`);
    assert.strictEqual(preset.promptsZh.length, 6, `${category} must have six zh prompts`);
    assert.strictEqual(preset.promptsEn.length, 6, `${category} must have six en prompts`);
  }
});

test('preset labels are non-empty and more concrete than generic verbs', () => {
  for (const category of CATEGORIES) {
    const preset = PRESETS[category];
    for (const [i, label] of preset.quickZh.entries()) {
      assert.ok(label.trim().length >= 3, `${category} zh label ${i} must be substantive`);
      assert.ok(!GENERIC_LABELS.includes(label.trim()), `${category} zh label ${i} should not be the old generic label`);
    }
    for (const [i, label] of preset.quickEn.entries()) {
      assert.ok(label.trim().length >= 4, `${category} en label ${i} must be substantive`);
    }
  }
});

test('preset prompts are realistic professional workflows', () => {
  for (const category of CATEGORIES) {
    const preset = PRESETS[category];
    for (let i = 0; i < 6; i++) {
      const zh = preset.promptsZh[i];
      const en = preset.promptsEn[i];
      assert.ok(zh.length >= 15, `${category} zh prompt ${i} must be a credible workflow`);
      assert.ok(en.length >= 30, `${category} en prompt ${i} must be a credible workflow`);
      assert.ok(!/[。！？]$/.test(en), `${category} en prompt ${i} must use sentence-ending punctuation consistent with English copy`);
      assert.ok(/[。！？]$/.test(zh), `${category} zh prompt ${i} must end with Chinese punctuation`);
    }
  }
});

test('preset tags are concise bilingual capability markers', () => {
  for (const category of CATEGORIES) {
    const preset = PRESETS[category];
    for (let i = 0; i < 6; i++) {
      assert.ok(preset.tagZh[i].length <= 4, `${category} zh tag ${i} must be concise`);
      assert.ok(preset.tagEn[i].length <= 10, `${category} en tag ${i} must be concise`);
    }
  }
});

test('home quick actions render as a compact refined card grid', () => {
  assert.match(homeView, /grid-cols-3/, 'quick actions must use a three-column grid');
  assert.match(homeView, /max-w-\[640px\]/, 'quick actions grid must keep a compact maximum width');
  assert.match(homeView, /max-\[560px\]:grid-cols-2/, 'narrow viewports must fall back to two columns');

  assert.match(homeView, /flex flex-col items-stretch/, 'quick cards must stack content vertically');
  assert.match(homeView, /border border-home-border/, 'quick cards must have a subtle border');
  assert.match(homeView, /bg-home-surface/, 'quick cards must use the home surface background');
  assert.match(homeView, /text-left/, 'quick cards must align text to the left');
  assert.match(homeView, /hover:-translate-y-px/, 'quick card hover must lift slightly');
  assert.match(homeView, /hover:border-home-accent/, 'quick card hover must use the accent border');
});

test('quick card typography remains compact and readable', () => {
  assert.match(homeView, /text-\[10px\] font-semibold uppercase/, 'quick card tag must be small and uppercase');
  assert.match(homeView, /tracking-\[\.4px\] text-home-muted/, 'quick card tag must stay muted and concise');
  assert.match(homeView, /truncate text-\[12\.5px\] font-medium/, 'quick card label must stay compact on one line');
});

test('quick card click replaces the home composer content with the preset prompt', () => {
  assert.match(homeView, /requestComposerReplace\(prompts\[index\] \?\? label\)/, 'quick cards must inject their concrete prompt into the composer');
});
