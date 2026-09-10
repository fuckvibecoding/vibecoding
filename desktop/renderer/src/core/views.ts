// 视图切换:仅更新中央状态并广播;导航高亮与视图挂载由 React 投影。

import { requestChatScroll } from './bus';
import { emit, state } from './state';

export type ViewName = 'home' | 'chat' | 'skills' | 'history' | 'automation' | 'library' | 'settings';

export function switchView(name: ViewName | string): void {
  state.view = name;
  if (name === 'chat') requestChatScroll(true);
  emit();
}
