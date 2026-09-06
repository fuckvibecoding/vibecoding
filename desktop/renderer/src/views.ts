// 视图切换与导航高亮。

import { state } from './state';
import { require$ } from './ui';

export type ViewName = 'home' | 'chat' | 'skills' | 'history' | 'automation' | 'library' | 'settings';

export function switchView(name: ViewName | string): void {
  state.view = name;
  document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
  const target = document.querySelector<HTMLElement>(`#view-${name}`) || require$('#view-home');
  target.classList.add('active');
  document.querySelectorAll<HTMLElement>('.nav-item[data-nav]').forEach((nav) => {
    nav.classList.toggle('active', nav.dataset.nav === name);
  });
  if (name === 'chat') {
    const stream = require$('#chat-stream');
    stream.scrollTop = stream.scrollHeight;
  }
}
