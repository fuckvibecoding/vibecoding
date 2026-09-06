// 技能视图：available_commands_update 同步的技能/指令卡片。

import { injectToComposer } from './composer';
import { t } from './i18n';
import { state } from './state';
import { el, iconSpan, require$ } from './ui';
import { switchView } from './views';

function commandKind(command: { _meta?: Record<string, unknown> }): string {
  const meta = command._meta?.['mothx.dev'] as { kind?: string } | undefined;
  return meta?.kind || 'command';
}

export function renderSkills(): void {
  const grid = require$('#skills-grid');
  const empty = require$('#skills-empty');
  grid.textContent = '';
  empty.hidden = state.availableCommands.length > 0;
  for (const command of state.availableCommands) {
    const kind = commandKind(command);
    const card = el('div', 'card');
    const icon = el('div', 'card-icon');
    icon.appendChild(iconSpan(kind === 'skill' ? 'zap' : 'slash', 'lg'));
    card.appendChild(icon);
    const title = el('div', 'card-title');
    title.appendChild(el('span', '', command.name));
    const badge = el('span', `badge ${kind === 'skill' ? 'badge-accent' : 'badge-blue'}`, kind === 'skill' ? t('skills.kindSkill') : t('skills.kindCommand'));
    title.appendChild(badge);
    card.appendChild(title);
    card.appendChild(el('div', 'card-desc', command.description || ''));
    const meta = el('div', 'card-meta');
    const use = el('span', '', t('skills.use'));
    use.style.color = 'var(--accent)';
    meta.appendChild(use);
    card.appendChild(meta);
    card.addEventListener('click', () => {
      injectToComposer(command.name.startsWith('/') ? `${command.name} ` : `/${command.name} `);
      switchView(state.activeSessionId ? 'chat' : 'home');
    });
    grid.appendChild(card);
  }
}
