// renderer 入口:加载 Desktop 本地偏好 → 挂载 React 根 → 桥接 ACP 事件。
// 诊断日志行(bootstrap done / renderer conn ready)是 e2e smoke 的断言契约,
// 措辞不可更改。

import { createRoot } from 'react-dom/client';

import './index.css';

import { App } from './App';
import { desktop } from './core/api';
import { bootstrapConnection, bootstrapStore } from './core/bootstrap';
import { state } from './core/state';
import { switchView } from './core/views';

async function bootstrap(): Promise<void> {
  await bootstrapStore();

  const container = document.getElementById('root');
  if (!container) throw new Error('missing #root container');
  const root = createRoot(container);
  root.render(<App />);

  await bootstrapConnection();
  switchView('home');

  desktop.log(
    `bootstrap done view=${state.view} conn=${state.connection.state} sessions=${state.sessions.length}`,
  );
}

window.addEventListener('error', (event) => {
  desktop.log(`renderer error: ${event.message}`);
});

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const container = document.getElementById('root');
  if (container) {
    container.textContent = '';
    const box = document.createElement('div');
    box.style.cssText = 'padding:56px 24px;text-align:center;font:600 14px sans-serif;color:#6b6b6b';
    box.textContent = `MothX Desktop failed to start: ${message}`;
    container.appendChild(box);
  }
});
