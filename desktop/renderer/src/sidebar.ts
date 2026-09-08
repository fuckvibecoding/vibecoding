// Left task history tree. Projects are organization-only branches over the
// global ACP task catalog; they never filter the current working directory.

import { desktop } from './api';
import { renderAutomation } from './automation';
import { renderLibrary } from './library';
import { activateSettingsView, openSettingsTab } from './settings';
import { t } from './i18n';
import { iconSVG } from './icons';
import {
  changeSessionWorkingDirectory,
  createProject,
  createProjectAndAssign,
  deleteProject,
  deleteSession,
  forkSession,
  isPinned,
  loadMoreTaskSessions,
  openSession,
  recentSessions,
  refreshHistory,
  renameProject,
  renameSession,
  setSessionProject,
  startNewTask,
  taskProjectPageKey,
  taskUngroupedPageKey,
  togglePin,
  toggleProjectExpanded,
  ungroupedSessions,
  sessionPage,
} from './sessions';
import { emit, hasFeature, state, type ListedSessionShape, type ProjectShape } from './state';
import { matchesTaskSearch, sortTaskSessions } from './task-tree';
import { el, hideMenus, iconSpan, require$, showMenu } from './ui';
import { switchView } from './views';

const DOT_COLOR: Record<string, string> = {
  planning: 'var(--blue)',
  working: 'var(--accent)',
  pending: 'var(--amber)',
  completed: 'var(--green)',
  failed: 'var(--red)',
  cancelled: 'var(--fg-faint)',
};

function sessionStatus(session: ListedSessionShape): string {
  const lastRun = session._meta?.lastRun;
  if (hasFeature('runStatus') && lastRun) {
    if (lastRun.active || lastRun.status === 'running') return 'working';
    return lastRun.status || 'idle';
  }
  if (state.activeSessionId === session.sessionId && state.promptInFlight) return 'working';
  return 'idle';
}

function disposeMenu(menu: HTMLElement): void {
  menu.remove();
  hideMenus();
}

function menuButton(menu: HTMLElement, label: string, action: () => void | Promise<void>, danger = false): void {
  const button = el('button', danger ? 'task-menu-item danger' : 'task-menu-item', label);
  button.addEventListener('click', () => {
    disposeMenu(menu);
    void action();
  });
  menu.appendChild(button);
}

function menuHeading(menu: HTMLElement, text: string): void {
  menu.appendChild(el('div', 'task-menu-heading', text));
}

function mountMenu(menu: HTMLElement, anchor: HTMLElement): void {
  document.body.appendChild(menu);
  showMenu(menu, anchor);
  const onDocumentPointer = (event: PointerEvent) => {
    if (!menu.contains(event.target as Node) && event.target !== anchor) {
      disposeMenu(menu);
      document.removeEventListener('pointerdown', onDocumentPointer, true);
    }
  };
  window.setTimeout(() => document.addEventListener('pointerdown', onDocumentPointer, true), 0);
}

export function showSessionMenu(session: ListedSessionShape, anchor: HTMLElement): void {
  const menu = el('div', 'pop-menu task-context-menu');
  menu.setAttribute('role', 'menu');
  const projectId = session._meta?.projectId || null;
  menuButton(menu, isPinned(session.sessionId) ? t('session.unpin') : t('session.pin'), () => togglePin(session.sessionId));
  menuButton(menu, t('chat.rename'), () => renameSession(session.sessionId));
  menuHeading(menu, t('session.moveToProject'));
  for (const project of state.projects) {
    const marker = project.id === projectId ? '✓ ' : '';
    menuButton(menu, `${marker}${project.name}`, () => setSessionProject(session.sessionId, project.id));
  }
  menuButton(menu, t('session.createProjectAndMove'), () => createProjectAndAssign(session.sessionId));
  if (projectId) menuButton(menu, t('session.removeProject'), () => setSessionProject(session.sessionId, null));
  menuHeading(menu, t('session.actions'));
  menuButton(menu, t('session.setWorkspace'), () => changeSessionWorkingDirectory(session.sessionId));
  menuButton(menu, t('chat.fork'), () => forkSession(session.sessionId));
  menuButton(menu, t('chat.delete'), () => deleteSession(session.sessionId), true);
  mountMenu(menu, anchor);
}

function showProjectMenu(project: ProjectShape, anchor: HTMLElement): void {
  const menu = el('div', 'pop-menu task-context-menu');
  menu.setAttribute('role', 'menu');
  menuButton(menu, t('projects.new'), async () => { await createProject(); });
  menuButton(menu, t('projects.rename'), () => renameProject(project.id, project.name));
  menuButton(menu, t('projects.delete'), () => deleteProject(project.id), true);
  mountMenu(menu, anchor);
}

function sessionItem(session: ListedSessionShape): HTMLElement {
  const status = sessionStatus(session);
  const item = el('div', `task-item${state.activeSessionId === session.sessionId ? ' active' : ''}`);
  item.title = `${session.title || session.sessionId}${session.model ? ` · ${session.model}` : ''}${session.cwd ? ` · ${session.cwd}` : ''}`;
  const dot = el('span', 'task-dot');
  dot.style.background = DOT_COLOR[status] || 'var(--fg-faint)';
  item.appendChild(dot);
  item.appendChild(el('span', 'task-title', session.title || session.sessionId.slice(0, 10)));
  if (isPinned(session.sessionId)) {
    const pin = el('span', 'task-pin');
    pin.innerHTML = iconSVG('pin');
    item.appendChild(pin);
  }
  const more = el('button', 'task-more', '⋯');
  more.title = t('session.actions');
  more.setAttribute('aria-label', t('session.actions'));
  more.addEventListener('click', (event) => {
    event.stopPropagation();
    showSessionMenu(session, more);
  });
  item.appendChild(more);
  item.addEventListener('click', () => void openSession(session.sessionId));
  return item;
}

function appendSessionRows(container: HTMLElement, sessions: ListedSessionShape[], keyword: string): number {
  const visible = sortTaskSessions(sessions).filter((session) => matchesTaskSearch(session, state.projects, keyword));
  for (const session of visible) container.appendChild(sessionItem(session));
  return visible.length;
}

function appendLoadMore(container: HTMLElement, label: string, loading: boolean, onClick: () => void): void {
  const button = el('button', 'task-load-more', loading ? '…' : label);
  (button as HTMLButtonElement).disabled = loading;
  button.addEventListener('click', onClick);
  container.appendChild(button);
}

function projectBranch(project: ProjectShape, keyword: string): HTMLElement {
  const branch = el('div', 'task-project');
  const expanded = state.expandedProjectIds.includes(project.id);
  const header = el('div', 'task-project-head');
  const toggle = el('button', 'task-project-toggle');
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.innerHTML = iconSVG('chevron');
  if (expanded) toggle.classList.add('expanded');
  toggle.addEventListener('click', () => void toggleProjectExpanded(project.id));
  const name = el('button', 'task-project-name', project.name);
  name.addEventListener('click', () => void toggleProjectExpanded(project.id));
  const count = el('span', 'task-project-count', String(project.sessionCount ?? 0));
  const more = el('button', 'task-more', '⋯');
  more.title = t('projects.actions');
  more.setAttribute('aria-label', t('projects.actions'));
  more.addEventListener('click', (event) => {
    event.stopPropagation();
    showProjectMenu(project, more);
  });
  header.append(toggle, name, count, more);
  branch.appendChild(header);
  if (!expanded) return branch;

  const rows = el('div', 'task-project-sessions');
  const key = taskProjectPageKey(project.id);
  const page = sessionPage(key);
  appendSessionRows(rows, page.sessions, keyword);
  if (page.loading && !page.sessions.length) rows.appendChild(el('div', 'task-empty', '…'));
  if (page.nextCursor) appendLoadMore(rows, t('history.loadMore'), page.loading, () => void loadMoreTaskSessions(key, { scope: 'project', projectId: project.id }));
  branch.appendChild(rows);
  return branch;
}

export function renderSidebar(): void {
  const expertsNav = document.querySelector<HTMLElement>('.nav-item[data-nav="experts"]');
  if (expertsNav) expertsNav.hidden = !hasFeature('manageExperts');
  const keyword = (document.querySelector<HTMLInputElement>('#task-search')?.value || '').trim().toLowerCase();
  const projects = require$('#task-project-tree');
  const recent = require$('#task-recent-list');
  const ungrouped = require$('#task-ungrouped-list');
  projects.textContent = '';
  recent.textContent = '';
  ungrouped.textContent = '';

  for (const project of state.projects) projects.appendChild(projectBranch(project, keyword));
  if (state.projects.length === 0 && hasFeature('projects')) projects.appendChild(el('div', 'task-empty', t('projects.empty')));
  appendSessionRows(recent, recentSessions(), keyword);
  const ungroupedCount = appendSessionRows(ungrouped, ungroupedSessions(), keyword);
  const ungroupedPage = sessionPage(taskUngroupedPageKey());
  if (ungroupedPage.nextCursor) appendLoadMore(ungrouped, t('history.loadMore'), ungroupedPage.loading, () => void loadMoreTaskSessions(taskUngroupedPageKey(), { scope: 'ungrouped' }));

  const empty = require$('#task-empty');
  const hasVisible = projects.childElementCount > 0 || recent.childElementCount > 0 || ungroupedCount > 0;
  empty.hidden = hasVisible;
  empty.textContent = keyword ? t('history.noResults') : state.sessionsLoading ? '…' : t('nav.noTasks');
}

export function bindSidebar(): void {
  // Gate experts sidebar entry on ACP feature advertisement, matching the
  // Settings tab behavior. renderSidebar also refreshes this on every emit.
  const expertsNav = document.querySelector<HTMLElement>('.nav-item[data-nav="experts"]');
  if (expertsNav) expertsNav.hidden = !hasFeature('manageExperts');

  const newTask = () => startNewTask();
  require$('#btn-new-task').addEventListener('click', newTask);
  require$('#btn-new-task2').addEventListener('click', newTask);
  require$('#btn-new-task2').title = t('nav.newTask');
  require$('#btn-new-project').addEventListener('click', () => void createProject());
  require$('#btn-new-project').title = t('projects.new');
  require$('#task-history').addEventListener('click', () => {
    switchView('history');
    void refreshHistory();
    emit();
  });

  document.querySelectorAll<HTMLElement>('.nav-item[data-nav]').forEach((nav) => {
    nav.addEventListener('click', () => {
      const view = nav.dataset.nav || 'home';
      if (view === 'experts') {
        switchView('settings');
        openSettingsTab('experts');
        emit();
        return;
      }
      switchView(view);
      if (view === 'history') void refreshHistory();
      if (view === 'library') void renderLibrary();
      if (view === 'automation') void renderAutomation();
      if (view === 'settings') activateSettingsView();
      emit();
    });
  });
  require$('#task-search').addEventListener('input', () => renderSidebar());
  require$('#settings-btn').addEventListener('click', () => {
    switchView('settings');
    activateSettingsView();
    emit();
  });
  require$('#settings-btn').title = t('settings.title');
  require$('#theme-toggle').addEventListener('click', () => applyTheme(state.store.theme === 'dark' ? 'light' : 'dark'));
}

export function applyTheme(theme: 'light' | 'dark'): void {
  state.store.theme = theme;
  document.documentElement.dataset.theme = theme;
  const toggle = require$('#theme-toggle');
  toggle.textContent = '';
  toggle.appendChild(iconSpan(theme === 'dark' ? 'sun' : 'moon', 'md'));
  void desktop.storeSet({ theme }).catch(() => undefined);
  emit();
}
