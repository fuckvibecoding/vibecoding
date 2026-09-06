// renderer 入口：桥接事件、状态订阅、全局 UI 刷新。

import { acp, desktop, type RendererEvent } from './api';
import { notifyCronCompleted, renderAutomation, bindAutomation } from './automation';
import { applyReverseRequest, applySessionEvent, applySessionUpdate, bindChatScroll, startDeadlineTicker, STATUS_CLASS, syncTranscript } from './chat';
import { bindComposer, bindMenus, cancelRun, refreshDraftConfigOptions, renderAttachRow } from './composer';
import { bindHome, renderHome } from './home';
import { renderLibrary } from './library';
import { bindManage } from './manage';
import { bindHistory, renderHistory } from './projects';
import { createMothxLogo, hydrateIcons } from './icons';
import { applyStaticI18n, setLocale, t } from './i18n';
import { activateSettingsView, applyHomeBackground, renderSettings, bindSettings } from './settings';
import { refreshProjects, refreshSessions, renameSession, deleteSession, forkSession, chooseWorkingDirectory, startNewTaskWithDirectory } from './sessions';
import { bindSidebar, renderSidebar, applyTheme } from './sidebar';
import { renderSkills } from './skills';
import { currentModelLabel, currentProviderLabel, emit, state, subscribe } from './state';
import { el, iconSpan, require$ } from './ui';
import { switchView } from './views';

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function renderChrome(): void {
  // 已打开的会话优先显示它自己的工作目录；没有会话时显示下一次新建任务的
  // 候选目录。connection.workspace 只是 ACP 进程的连接根目录。
  const workspace = state.activeSessionCwd || state.newSessionCwd || state.connection.workspace || state.store.lastWorkspace || '…';
  const chipName = require$('#workspace-chip-name');
  chipName.textContent = basename(workspace);
  require$('#workspace-chip').title = workspace;
  require$('#sb-workspace-label').textContent = basename(workspace);
  require$('#sb-model-label').textContent = currentModelLabel();
  require$('#sb-mode-label').textContent = state.currentMode || '…';
  const usage = require$('#sb-usage');
  if (state.usage && state.usage.used > 0) {
    usage.hidden = false;
    const percent = state.usage.size > 0 ? Math.round((state.usage.used / state.usage.size) * 100) : 0;
    const cost = state.usage.cost ? ` · $${state.usage.cost.toFixed(4)}` : '';
    usage.textContent = `ctx ${state.usage.used}${state.usage.size ? `/${state.usage.size}` : ''}${percent ? ` (${percent}%)` : ''}${cost}`;
  } else {
    usage.hidden = true;
  }
}

function renderConnection(): void {
  const conn = state.connection;
  const dot = require$('#sb-conn').querySelector('.sb-dot');
  const label = require$('#sb-conn-label');
  dot?.classList.remove('ok', 'warn', 'err');
  switch (conn.state) {
    case 'ready':
      dot?.classList.add('ok');
      label.textContent = t('conn.ready');
      break;
    case 'starting':
      dot?.classList.add('warn');
      label.textContent = t('conn.starting');
      break;
    case 'restarting':
      dot?.classList.add('warn');
      label.textContent = t('conn.restarting');
      break;
    case 'error':
      dot?.classList.add('err');
      label.textContent = t('conn.error');
      break;
    default:
      label.textContent = t('conn.stopped');
  }
  const hero = require$('#hero-conn');
  if (conn.state === 'ready') {
    hero.textContent = `${t('conn.ready')} · mothx ${conn.agentInfo?.version || ''} · ACP v1`;
  } else if (conn.error) {
    hero.textContent = `${conn.error.message}${conn.error.fix ? ` — ${conn.error.fix}` : ''}`;
  } else {
    hero.textContent = t(`conn.${conn.state}`);
  }
  renderErrorBanner();
}

function renderErrorBanner(): void {
  const home = require$('#view-home .home-inner');
  let banner = home.querySelector<HTMLElement>('.conn-banner');
  const conn = state.connection;
  if (conn.state !== 'error' || !conn.error) {
    banner?.remove();
    return;
  }
  if (!banner) {
    banner = el('div', 'conn-banner');
    home.insertBefore(banner, home.firstChild);
  }
  banner.textContent = '';
  banner.appendChild(iconSpan('alert', 'md'));
  const text = el('div', 'cb-text');
  text.appendChild(el('div', '', t('conn.errorBanner', { m: conn.error.message })));
  if (conn.error.fix) text.appendChild(el('div', 'cb-fix', conn.error.fix));
  banner.appendChild(text);
  const retry = el('button', 'btn-ghost', t('conn.retry'));
  retry.addEventListener('click', () => {
    void acp.restart();
  });
  banner.appendChild(retry);
  const settings = el('button', 'btn-ghost', t('conn.openSettings'));
  settings.addEventListener('click', () => {
    switchView('settings');
    activateSettingsView();
    emit();
  });
  banner.appendChild(settings);
}

function renderChatHeader(): void {
  const chip = require$('#chat-status');
  const label = require$('#chat-status-label');
  chip.className = `status-chip ${STATUS_CLASS[state.runStatus] || 'st-idle'}`;
  label.textContent = t(`status.${state.runStatus}`);
  require$('#chat-title').textContent = state.activeTitle || t('chat.newTask');
  const runningHere = state.promptInFlight && state.runningSessionId === state.activeSessionId;
  require$('#cancel-chat').hidden = !runningHere;
  (require$('#send-chat') as HTMLButtonElement).disabled = runningHere;
  (require$('#send-home') as HTMLButtonElement).disabled = state.promptInFlight;
}

function renderAll(): void {
  renderChrome();
  renderConnection();
  renderChatHeader();
  renderSidebar();
  renderAttachRow();
  if (state.view === 'home') renderHome();
  if (state.view === 'skills') renderSkills();
  if (state.view === 'settings') renderSettings();
  if (state.view === 'history') renderHistory();
  const modeLabels = document.querySelectorAll<HTMLElement>('#mode-label, .mode-label2');
  modeLabels.forEach((node) => {
    node.textContent = state.currentMode || '…';
  });
  const modelLabels = document.querySelectorAll<HTMLElement>('#model-label, .model-label2');
  const provider = currentProviderLabel();
  const model = currentModelLabel();
  modelLabels.forEach((node) => {
    node.textContent = provider && model !== '…' ? `${provider} · ${model}` : model;
  });
}

function handleEvent(event: RendererEvent): void {
  switch (event.type) {
    case 'state':
      state.connection = event.snapshot;
      if (event.snapshot.state === 'ready') {
        desktop.log('renderer conn ready');
        void refreshSessions();
        void refreshProjects();
        void refreshDraftConfigOptions();
      }
      emit();
      return;
    case 'session-update':
      applySessionUpdate(event.sessionId, event.update as Record<string, unknown>);
      emit();
      return;
    case 'session-event':
      applySessionEvent(event.event as Record<string, unknown>);
      if (String((event.event as Record<string, unknown>)?.event || '') === 'cron_completed') {
        notifyCronCompleted(event.event as Record<string, unknown>);
      }
      emit();
      return;
    case 'reverse-request':
      applyReverseRequest(event.id, event.method, (event.params || {}) as Record<string, unknown>);
      emit();
      return;
    default:
      return;
  }
}

async function bootstrap(): Promise<void> {
  document.body.classList.add(`platform-${desktop.platform()}`);
  const store = await desktop.storeGet().catch(() => null);
  if (store) state.store = store;
  state.appInfo = await desktop.appInfo().catch(() => state.appInfo);
  setLocale(state.store.locale);
  applyTheme(state.store.theme);
  applyHomeBackground();
  applyStaticI18n();
  hydrateIcons();

  require$('#app-logo').replaceChildren(createMothxLogo());
  require$('#hero-logo').replaceChildren(createMothxLogo());
  require$('#app-ver').textContent = `v${state.appInfo.version}`;
  require$('#sb-version').textContent = `MothX Desktop v${state.appInfo.version} · ACP`;
  require$('#local-hint').textContent = t('nav.localMode');
  require$('#chat-fork').title = t('chat.fork');
  require$('#chat-rename').title = t('chat.rename');
  require$('#chat-delete').title = t('chat.delete');
  require$('#settings-ws-icon').appendChild(iconSpan('folder'));
  require$('#settings-theme-icon').appendChild(iconSpan('sun'));
  require$('#settings-lang-icon').appendChild(iconSpan('globe'));
  require$('#settings-home-bg-icon').appendChild(iconSpan('image'));
  require$('#settings-home-opacity-icon').appendChild(iconSpan('sliders'));
  require$('#settings-home-blur-icon').appendChild(iconSpan('sliders'));
  require$('#settings-conn-icon').appendChild(iconSpan('zap'));
  require$('#settings-doctor-icon').appendChild(iconSpan('shield'));
  require$('#settings-about-icon').appendChild(iconSpan('cpu'));

  // 窗口控制（Windows/Linux 自绘按钮；macOS 使用原生红绿灯）。
  require$('#win-min').addEventListener('click', () => desktop.windowControl('minimize'));
  require$('#win-max').addEventListener('click', () => desktop.windowControl('maximize'));
  require$('#win-close').addEventListener('click', () => desktop.windowControl('close'));
  require$('#workspace-chip').addEventListener('click', () => {
    // 不能就地修改已有 session 的工作目录。当前有会话时，目录选择明确开始
    // 一个新任务；首页则仅更新下一次 session/new 的候选目录。
    if (state.activeSessionId) void startNewTaskWithDirectory();
    else void chooseWorkingDirectory();
  });

  bindChatScroll();
  bindSidebar();
  bindHome();
  bindSettings();
  bindHistory();
  bindManage();
  bindAutomation();
  bindMenus();
  startDeadlineTicker();
  bindComposer('#home-input', '#send-home', 'home');
  bindComposer('#chat-input', '#send-chat', 'chat');
  require$('#cancel-chat').addEventListener('click', () => cancelRun());
  require$('#cancel-chat').title = t('chat.cancelRun');

  require$('#chat-rename').addEventListener('click', () => {
    if (state.activeSessionId) void renameSession(state.activeSessionId);
  });
  require$('#chat-delete').addEventListener('click', () => {
    if (state.activeSessionId) void deleteSession(state.activeSessionId);
  });
  require$('#chat-fork').addEventListener('click', () => {
    if (state.activeSessionId) void forkSession(state.activeSessionId);
  });

  // 图片预览模态框
  require$('#preview-close').addEventListener('click', () => {
    require$('#preview-modal').hidden = true;
  });
  require$('#preview-modal').addEventListener('mousedown', (event) => {
    if (event.target === require$('#preview-modal')) require$('#preview-modal').hidden = true;
  });

  subscribe(renderAll);

  acp.onEvent(handleEvent);
  state.connection = await acp.getState().catch(() => state.connection);
  if (state.connection.state === 'ready') {
    desktop.log('renderer conn ready');
    state.newSessionCwd = state.store.lastWorkspace || state.connection.workspace || '';
    state.dirConfirmed = state.newSessionCwd !== '';
    await refreshSessions();
    await refreshDraftConfigOptions();
    void refreshProjects();
  }

  switchView('home');
  renderAll();
  syncTranscript();
  desktop.log(`bootstrap done view=${state.view} activeView=${document.querySelector('.view.active')?.id || 'none'} conn=${state.connection.state} sessions=${state.sessions.length}`);
}

window.addEventListener('error', (event) => {
  desktop.log(`renderer error: ${event.message}`);
});

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  document.body.textContent = '';
  const box = el('div', 'empty');
  box.appendChild(el('div', 'empty-title', `MothX Desktop failed to start: ${message}`));
  document.body.appendChild(box);
});
