// 首页视图：hero、场景预设（日常办公/代码开发/设计创意）、快捷操作、目标切换。

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
  const items = getLocale() === 'zh' ? preset.quickZh : preset.quickEn;
  for (const label of items) {
    const chip = el('button', 'quick-chip');
    chip.appendChild(iconSpan('sparkle'));
    chip.appendChild(el('span', '', label));
    chip.addEventListener('click', () => {
      const input = require$('#home-input') as HTMLTextAreaElement;
      input.value = `${label}：`;
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
