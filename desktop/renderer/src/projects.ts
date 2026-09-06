// Global history management view. The filename is retained while the former
// project page is migrated; projects are now only an ACP-backed grouping
// filter and every action reuses the task-tree session menu.

import { t } from './i18n';
import { historySessions, loadMoreHistory, openSession, refreshHistory, setHistoryQuery, setHistoryScope } from './sessions';
import { showSessionMenu } from './sidebar';
import { state, type ListedSessionShape } from './state';
import { el, iconSpan, require$ } from './ui';

function sessionTitle(session: ListedSessionShape): string {
  return session.title || session.sessionId.slice(0, 10);
}

function sessionProjectName(session: ListedSessionShape): string {
  const project = state.projects.find((entry) => entry.id === session._meta?.projectId);
  return project?.name || t('tree.ungrouped');
}

function sessionStatus(session: ListedSessionShape): string {
  const run = session._meta?.lastRun;
  if (run?.active || run?.status === 'running') return t('status.working');
  return run?.status ? t(`status.${run.status}`) : t('status.idle');
}

function historyRow(session: ListedSessionShape): HTMLElement {
  const row = el('div', 'row-item clickable history-row');
  const icon = el('div', 'row-icon');
  icon.appendChild(iconSpan('list'));
  const main = el('div', 'row-main');
  const title = el('div', 'row-title', sessionTitle(session));
  const meta = el('div', 'row-desc', [
    sessionProjectName(session),
    session.cwd,
    [session.provider, session.model].filter(Boolean).join(' / '),
    session.updatedAt ? new Date(session.updatedAt).toLocaleString() : '',
    sessionStatus(session),
  ].filter(Boolean).join(' · '));
  main.append(title, meta);
  const more = el('button', 'history-row-more', '⋯');
  more.title = t('session.actions');
  more.setAttribute('aria-label', t('session.actions'));
  more.addEventListener('click', (event) => {
    event.stopPropagation();
    showSessionMenu(session, more);
  });
  row.append(icon, main, more);
  row.addEventListener('click', () => void openSession(session.sessionId));
  return row;
}

export function renderHistory(): void {
  const list = require$('#history-list');
  const empty = require$('#history-empty');
  const more = require$('#history-load-more') as HTMLButtonElement;
  const search = require$('#history-search') as HTMLInputElement;
  const scope = require$('#history-scope') as HTMLSelectElement;
  const project = require$('#history-project') as HTMLSelectElement;
  const page = historySessions();

  if (search.value !== state.historyQuery) search.value = state.historyQuery;
  scope.value = state.historyScope;
  project.textContent = '';
  for (const entry of state.projects) project.appendChild(new Option(entry.name, entry.id));
  project.hidden = state.historyScope !== 'project';
  project.value = state.historyProjectId;

  list.textContent = '';
  for (const session of page.sessions) list.appendChild(historyRow(session));
  empty.hidden = page.loading || page.sessions.length > 0;
  more.hidden = !page.nextCursor;
  more.disabled = page.loading;
  more.textContent = page.loading ? '…' : t('history.loadMore');
}

export function bindHistory(): void {
  const search = require$('#history-search') as HTMLInputElement;
  const scope = require$('#history-scope') as HTMLSelectElement;
  const project = require$('#history-project') as HTMLSelectElement;
  let debounce: number | undefined;
  search.addEventListener('input', () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => void setHistoryQuery(search.value), 220);
  });
  scope.addEventListener('change', () => {
    if (scope.value === 'project') {
      const id = project.value || state.projects[0]?.id || '';
      if (!id) {
        scope.value = 'all';
        void setHistoryScope('all');
        return;
      }
      void setHistoryScope('project', id);
      return;
    }
    void setHistoryScope(scope.value === 'ungrouped' ? 'ungrouped' : 'all');
  });
  project.addEventListener('change', () => void setHistoryScope('project', project.value));
  require$('#history-load-more').addEventListener('click', () => void loadMoreHistory());
}

export function openHistory(): void {
  void refreshHistory();
}
