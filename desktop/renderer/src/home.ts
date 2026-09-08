// 首页视图：hero、场景预设（办公/代码/创作）、快捷操作、目标切换。

import { t, PRESETS, getLocale } from './i18n';
import { state } from './state';
import { el, iconSpan, require$ } from './ui';

export function renderHome(): void {
  const preset = PRESETS[state.preset] || PRESETS.coding;
  document.querySelectorAll<HTMLElement>('.mode-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.preset === state.preset);
  });
  const desc = require$('#mode-desc');
  desc.textContent = '';
  desc.appendChild(el('div', 'sub', t(`preset.${state.preset}.sub`)));
  desc.appendChild(el('div', 'desc', t(`preset.${state.preset}.desc`)));

  const quick = require$('#quick-actions');
  quick.textContent = '';
  const isZh = getLocale() === 'zh';
  const items = isZh ? preset.quickZh : preset.quickEn;
  const prompts = isZh ? preset.promptsZh : preset.promptsEn;
  for (let i = 0; i < items.length; i++) {
    const label = items[i];
    const prompt = prompts[i] ?? label;
    const chip = el('button', 'quick-chip');
    chip.appendChild(iconSpan('sparkle'));
    chip.appendChild(el('span', '', label));
    chip.addEventListener('click', () => {
      const input = require$('#home-input') as HTMLTextAreaElement;
      input.value = prompt;
      input.focus();
    });
    quick.appendChild(chip);
  }
}

export function bindHome(): void {
  document.querySelectorAll<HTMLElement>('.mode-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      state.preset = tab.dataset.preset || 'coding';
      renderHome();
    });
  });

  require$('#send-home').title = t('nav.newTask');
}
