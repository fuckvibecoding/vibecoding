// 设置视图：工作区、外观、ACP 运行时诊断与关于。

import { acp, desktop, invoke, type DiagnosticLogEntry } from './api';
import { DIAGNOSTIC_LOGS_MAX, mergeDiagnosticLogs } from './diagnostic-logs';
import { setLocale, t } from './i18n';
import { renderManageSection, type ManagedSettingsTab } from './manage';
import { applyTheme } from './sidebar';
import { emit, state } from './state';
import { el, iconSpan, require$, toast } from './ui';

type SettingsTabID = 'workspace' | 'appearance' | 'application' | 'providers' | 'knowledge' | 'skills' | 'skillhub' | 'mcp' | 'memory' | 'env' | 'cron' | 'channels' | 'serve' | 'runtime' | 'stats' | 'about';

interface SettingsCategory {
  id: string;
  label: string;
  icon: string;
  tabs: { id: SettingsTabID; label: string; description: string; icon: string }[];
}

// The same conceptual groups exposed by WebUI settings, narrowed to the
// settings surfaces Desktop can truthfully project through ACP today. The
// two navigation panes own only presentation state; all configuration and
// mutations remain in the existing ACP-backed sections below.
const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: 'workspace', label: 'settings.category.workspace', icon: 'folder',
    tabs: [
      { id: 'workspace', label: 'settings.tab.workspace', description: 'settings.tab.workspaceDesc', icon: 'folder' },
      { id: 'appearance', label: 'settings.tab.appearance', description: 'settings.tab.appearanceDesc', icon: 'sun' },
    ],
  },
  {
    id: 'agent', label: 'settings.category.agent', icon: 'cpu',
    tabs: [
      { id: 'application', label: 'settings.tab.application', description: 'settings.tab.applicationDesc', icon: 'settings' },
      { id: 'providers', label: 'settings.tab.providers', description: 'settings.tab.providersDesc', icon: 'cpu' },
      { id: 'knowledge', label: 'settings.tab.knowledge', description: 'settings.tab.knowledgeDesc', icon: 'book' },
      { id: 'skills', label: 'settings.tab.skills', description: 'settings.tab.skillsDesc', icon: 'zap' },
      { id: 'skillhub', label: 'settings.tab.skillhub', description: 'settings.tab.skillhubDesc', icon: 'shop' },
      { id: 'env', label: 'settings.tab.env', description: 'settings.tab.envDesc', icon: 'terminal' },
    ],
  },
  {
    id: 'integrations', label: 'settings.category.integrations', icon: 'globe',
    tabs: [
      { id: 'channels', label: 'settings.tab.channels', description: 'settings.tab.channelsDesc', icon: 'channels' },
      { id: 'mcp', label: 'settings.tab.mcp', description: 'settings.tab.mcpDesc', icon: 'globe' },
      { id: 'memory', label: 'settings.tab.memory', description: 'settings.tab.memoryDesc', icon: 'book' },
    ],
  },
  {
    id: 'automation', label: 'settings.category.automation', icon: 'clock',
    tabs: [
      { id: 'cron', label: 'settings.tab.cron', description: 'settings.tab.cronDesc', icon: 'clock' },
    ],
  },
  {
    id: 'system', label: 'settings.category.system', icon: 'settings',
    tabs: [
      { id: 'serve', label: 'settings.tab.serve', description: 'settings.tab.serveDesc', icon: 'server' },
      { id: 'runtime', label: 'settings.tab.runtime', description: 'settings.tab.runtimeDesc', icon: 'refresh' },
      { id: 'stats', label: 'settings.tab.stats', description: 'settings.tab.statsDesc', icon: 'list' },
      { id: 'about', label: 'settings.tab.about', description: 'settings.tab.aboutDesc', icon: 'doc' },
    ],
  },
];

let activeSettingsCategory = 'workspace';
let activeSettingsTab: SettingsTabID = 'workspace';

const MANAGED_SETTINGS_TABS = new Set<ManagedSettingsTab>([
  'application', 'providers', 'knowledge', 'skills', 'skillhub', 'mcp',
  'memory', 'env', 'cron', 'channels', 'serve', 'stats',
]);

// Diagnostic logs are main-process-only state; the renderer keeps only the
// current filter and the in-view snapshot. They are never persisted to store,
// localStorage, or session state.
let diagnosticLogs: DiagnosticLogEntry[] = [];
let diagnosticLogFilter = '';
let diagnosticLogsLoaded = false;
let unsubscribeDiagnosticLogs: (() => void) | undefined;

export function renderSettings(): void {
  renderSettingsNavigation();
  const defaultWorkDir = state.newSessionCwd || state.store.lastWorkspace || state.connection.workspace || '…';
  require$('#settings-ws-path').textContent = defaultWorkDir;

  const recent = require$('#settings-ws-recent');
  recent.textContent = '';
  const recents = state.store.recentWorkspaces.filter((entry) => entry !== defaultWorkDir);
  if (recents.length > 0) {
    const label = el('div', 'group-label', t('settings.recent'));
    label.style.padding = '10px 2px 6px';
    recent.appendChild(label);
    for (const entry of recents) {
      const row = el('div', 'row-item clickable');
      const icon = el('div', 'row-icon');
      icon.appendChild(iconSpan('folder'));
      const main = el('div', 'row-main');
      main.appendChild(el('div', 'row-title', basename(entry)));
      main.appendChild(el('div', 'row-desc', entry));
      row.append(icon, main);
      row.addEventListener('click', () => {
        void setDefaultWorkingDirectory(entry);
      });
      recent.appendChild(row);
    }
  }

  document.querySelectorAll<HTMLElement>('#settings-theme-toggle button').forEach((button) => {
    button.classList.toggle('active', button.dataset.themeValue === state.store.theme);
  });
  document.querySelectorAll<HTMLElement>('#settings-lang-toggle button').forEach((button) => {
    button.classList.toggle('active', button.dataset.langValue === state.store.locale);
  });
  renderHomeBackgroundControls();

  const connDetail = require$('#settings-conn-detail');
  const conn = state.connection;
  const agentVersion = conn.agentInfo?.version || '';
  connDetail.textContent = `${t(connLabel(conn.state))}${conn.pid ? ` · pid ${conn.pid}` : ''}${agentVersion ? ` · mothx ${agentVersion}` : ''}${conn.error ? ` · ${conn.error.message}` : ''}`;

  const about = require$('#settings-about-detail');
  about.textContent = `v${state.appInfo.version} · ${state.appInfo.platform}/${state.appInfo.arch} · ACP v1${state.appInfo.runtimeBinary ? ` · ${state.appInfo.runtimeBinary}` : ''}`;

  renderDiagnosticLogs();
  if (!diagnosticLogsLoaded) {
    void loadDiagnosticLogs();
  }
}

// Opening settings and selecting a tab are the only points that may load a
// management projection. renderSettings itself is called for ordinary state
// updates, so it must remain presentation-only.
export function activateSettingsView(): void {
  renderSettings();
  loadActiveManagedSettingsTab();
}

function isManagedSettingsTab(tab: SettingsTabID): tab is ManagedSettingsTab {
  return MANAGED_SETTINGS_TABS.has(tab as ManagedSettingsTab);
}

function loadActiveManagedSettingsTab(): void {
  if (state.connection.state !== 'ready' || !isManagedSettingsTab(activeSettingsTab)) return;
  void renderManageSection(activeSettingsTab);
}

function renderSettingsNavigation(): void {
  const category = SETTINGS_CATEGORIES.find((entry) => entry.id === activeSettingsCategory) || SETTINGS_CATEGORIES[0];
  if (!category) return;
  if (!category.tabs.some((tab) => tab.id === activeSettingsTab)) activeSettingsTab = category.tabs[0]?.id || 'workspace';

  const categoryNav = require$('#settings-category-nav');
  categoryNav.textContent = '';
  categoryNav.appendChild(el('div', 'settings-nav-title', t('settings.categories')));
  const categoryList = el('div', 'settings-nav-list');
  for (const entry of SETTINGS_CATEGORIES) {
    const button = settingsNavButton(entry.icon, t(entry.label), entry.id === category.id);
    button.addEventListener('click', () => {
      activeSettingsCategory = entry.id;
      activeSettingsTab = entry.tabs[0]?.id || 'workspace';
      renderSettingsNavigation();
      loadActiveManagedSettingsTab();
    });
    categoryList.appendChild(button);
  }
  categoryNav.appendChild(categoryList);

  const tabNav = require$('#settings-tab-nav');
  tabNav.textContent = '';
  tabNav.appendChild(el('div', 'settings-nav-title', t('settings.sections')));
  const tabList = el('div', 'settings-nav-list');
  for (const tab of category.tabs) {
    const button = settingsNavButton(tab.icon, t(tab.label), tab.id === activeSettingsTab);
    button.addEventListener('click', () => {
      activeSettingsTab = tab.id;
      renderSettingsNavigation();
      loadActiveManagedSettingsTab();
    });
    tabList.appendChild(button);
  }
  tabNav.appendChild(tabList);

  const activeTab = category.tabs.find((tab) => tab.id === activeSettingsTab) || category.tabs[0];
  require$('#settings-detail-title').textContent = activeTab ? t(activeTab.label) : t('settings.title');
  require$('#settings-detail-subtitle').textContent = activeTab ? t(activeTab.description) : t('settings.subtitle');
  document.querySelectorAll<HTMLElement>('[data-settings-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.settingsPanel !== activeSettingsTab;
  });
}

function settingsNavButton(icon: string, label: string, active: boolean): HTMLButtonElement {
  const button = el('button', `settings-nav-button${active ? ' active' : ''}`) as HTMLButtonElement;
  button.type = 'button';
  button.setAttribute('aria-pressed', String(active));
  button.appendChild(iconSpan(icon));
  button.appendChild(el('span', '', label));
  return button;
}

function connLabel(connectionState: string): string {
  switch (connectionState) {
    case 'ready': return t('conn.ready');
    case 'starting': return t('conn.starting');
    case 'restarting': return t('conn.restarting');
    case 'stopped': return t('conn.stopped');
    case 'error': return t('conn.error');
    default: return connectionState;
  }
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function homeImageURL(path: string): string {
  const raw = path.trim();
  if (!raw) return '';
  const normalized = raw.replace(/\\/g, '/');
  const absolute = normalized.startsWith('/')
    ? `file://${normalized}`
    : /^[A-Za-z]:\//.test(normalized)
      ? `file:///${normalized}`
      : '';
  return absolute
    ? encodeURI(absolute).replace(/#/g, '%23').replace(/\?/g, '%3F').replace(/"/g, '%22')
    : '';
}

// Home imagery is a Desktop-only visual preference. Keep the file path in the
// local UI store rather than copying the image into session or ACP storage.
export function applyHomeBackground(): void {
  const home = document.querySelector<HTMLElement>('#view-home');
  if (!home) return;
  const source = homeImageURL(state.store.homeBackgroundImage);
  if (!source) {
    home.classList.remove('has-home-background');
    home.style.removeProperty('--home-user-image');
    home.style.removeProperty('--home-user-image-opacity');
    home.style.removeProperty('--home-user-image-blur');
    return;
  }
  home.classList.add('has-home-background');
  home.style.setProperty('--home-user-image', `url("${source}")`);
  home.style.setProperty('--home-user-image-opacity', String(clampNumber(state.store.homeBackgroundOpacity, 0, 100) / 100));
  home.style.setProperty('--home-user-image-blur', `${clampNumber(state.store.homeBackgroundBlur, 0, 24)}px`);
}

function renderHomeBackgroundControls(): void {
  const path = state.store.homeBackgroundImage;
  require$('#settings-home-bg-path').textContent = path || t('settings.homeBackgroundNone');
  (require$('#settings-home-bg-clear') as HTMLButtonElement).disabled = !path;
  const opacity = clampNumber(state.store.homeBackgroundOpacity, 0, 100);
  const opacityInput = require$('#settings-home-bg-opacity') as HTMLInputElement;
  opacityInput.value = String(opacity);
  require$('#settings-home-bg-opacity-value').textContent = `${opacity}%`;
  const blur = clampNumber(state.store.homeBackgroundBlur, 0, 24);
  const blurInput = require$('#settings-home-bg-blur') as HTMLInputElement;
  blurInput.value = String(blur);
  require$('#settings-home-bg-blur-value').textContent = `${blur}px`;
}

function updateHomeBackground(patch: Partial<Pick<typeof state.store, 'homeBackgroundImage' | 'homeBackgroundOpacity' | 'homeBackgroundBlur'>>, persist: boolean): void {
  if (patch.homeBackgroundImage !== undefined) state.store.homeBackgroundImage = patch.homeBackgroundImage;
  if (patch.homeBackgroundOpacity !== undefined) state.store.homeBackgroundOpacity = clampNumber(patch.homeBackgroundOpacity, 0, 100);
  if (patch.homeBackgroundBlur !== undefined) state.store.homeBackgroundBlur = clampNumber(patch.homeBackgroundBlur, 0, 24);
  applyHomeBackground();
  renderHomeBackgroundControls();
  if (persist) void desktop.storeSet(patch);
}

export async function setDefaultWorkingDirectory(cwd: string): Promise<void> {
  const target = cwd.trim();
  if (!target || (target === state.newSessionCwd && target === state.store.lastWorkspace)) return;
  // This is Desktop UI preference only. It chooses the cwd for the next
  // session/new call, never restarts ACP and never mutates an existing session.
  state.newSessionCwd = target;
  state.dirConfirmed = true;
  state.store.lastWorkspace = target;
  await desktop.storeSet({ lastWorkspace: target });
  toast(t('settings.defaultWorkDirSaved', { w: basename(target) }));
  emit();
}

async function chooseDefaultWorkingDirectory(): Promise<void> {
  const current = state.newSessionCwd || state.store.lastWorkspace || state.connection.workspace || '';
  const picked = await desktop.chooseDirectory(current);
  if (!picked) return;
  await setDefaultWorkingDirectory(picked);
}

async function runDoctor(): Promise<void> {
  const container = require$('#doctor-result');
  container.textContent = '';
  container.appendChild(el('div', 'group-label', '…'));
  try {
    const result = await invoke<{ checks?: { id?: string; title?: string; status?: string; detail?: string; fix?: string }[]; version?: string }>('mothx/doctor', {
      cwd: state.newSessionCwd || state.connection.workspace || undefined,
    });
    container.textContent = '';
    const card = el('div', 'row-list doctor-card');
    for (const check of result?.checks || []) {
      const row = el('div', 'doctor-check');
      const dot = el('span', `dc-status dc-${statusClass(check.status || '')}`);
      const main = el('div', 'row-main');
      main.appendChild(el('div', 'dc-title', `${check.title || check.id || 'check'} — ${check.status || ''}`));
      if (check.detail) main.appendChild(el('div', 'dc-detail', check.detail));
      if (check.fix) main.appendChild(el('div', 'dc-fix', check.fix));
      row.append(dot, main);
      card.appendChild(row);
    }
    if (!result?.checks?.length) {
      card.appendChild(el('div', 'doctor-check', 'no checks reported'));
    }
    container.appendChild(card);
  } catch (error) {
    container.textContent = '';
    toast(t('doctor.failed', { e: error instanceof Error ? error.message : String(error) }));
  }
}

function statusClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'ok':
    case 'pass':
    case 'passed':
      return 'ok';
    case 'warn':
    case 'warning':
      return 'warn';
    case 'error':
    case 'fail':
    case 'failed':
      return 'error';
    default:
      return 'skip';
  }
}

function renderDiagnosticLogs(): void {
  const list = require$('#diagnostic-logs-list');
  const empty = require$('#diagnostic-logs-empty');
  const count = require$('#diagnostic-logs-count');
  const term = diagnosticLogFilter.trim().toLowerCase();
  const filtered = term
    ? diagnosticLogs.filter((entry) =>
        `${entry.source} ${entry.message}`.toLowerCase().includes(term)
      )
    : diagnosticLogs.slice();

  list.textContent = '';
  for (const entry of filtered) {
    const line = el('div', 'diagnostic-log-line');
    const ts = el('span', 'diagnostic-log-ts', formatShortTime(entry.timestamp));
    const source = el('span', `diagnostic-log-source diagnostic-log-source-${entry.source}`, entry.source);
    const message = el('span', 'diagnostic-log-message', entry.message);
    line.append(ts, source, message);
    list.appendChild(line);
  }
  empty.hidden = filtered.length > 0;
  list.hidden = filtered.length === 0;
  count.textContent = t('settings.diagnosticLogsCount', { n: String(filtered.length), m: String(diagnosticLogs.length) });
}

async function loadDiagnosticLogs(force = false): Promise<void> {
  if (!force && diagnosticLogsLoaded) return;
  diagnosticLogsLoaded = true;
  try {
    const snapshot = await desktop.getDiagnosticLogs();
    diagnosticLogs = mergeDiagnosticLogs(diagnosticLogs, snapshot);
    renderDiagnosticLogs();
  } catch (error) {
    desktop.log(`settings: failed to load diagnostic logs: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function onDiagnosticLog(entry: DiagnosticLogEntry): void {
  diagnosticLogs = mergeDiagnosticLogs(diagnosticLogs, [entry]);
  renderDiagnosticLogs();
}

function formatShortTime(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

export function bindSettings(): void {
  if (!unsubscribeDiagnosticLogs) {
    unsubscribeDiagnosticLogs = desktop.onDiagnosticLog(onDiagnosticLog);
  }

  require$('#settings-ws-choose').addEventListener('click', () => {
    void chooseDefaultWorkingDirectory();
  });
  document.querySelectorAll<HTMLElement>('#settings-theme-toggle button').forEach((button) => {
    button.addEventListener('click', () => applyTheme((button.dataset.themeValue as 'light' | 'dark') || 'light'));
  });
  document.querySelectorAll<HTMLElement>('#settings-lang-toggle button').forEach((button) => {
    button.addEventListener('click', () => {
      const locale = (button.dataset.langValue as 'zh' | 'en') || 'zh';
      state.store.locale = locale;
      setLocale(locale);
      void desktop.storeSet({ locale });
      location.reload();
    });
  });
  require$('#settings-home-bg-choose').addEventListener('click', () => {
    void chooseHomeBackground();
  });
  require$('#settings-home-bg-clear').addEventListener('click', () => {
    updateHomeBackground({ homeBackgroundImage: '' }, true);
    toast(t('settings.homeBackgroundCleared'));
  });
  const opacityInput = require$('#settings-home-bg-opacity') as HTMLInputElement;
  opacityInput.addEventListener('input', () => {
    updateHomeBackground({ homeBackgroundOpacity: Number(opacityInput.value) }, false);
  });
  opacityInput.addEventListener('change', () => {
    updateHomeBackground({ homeBackgroundOpacity: Number(opacityInput.value) }, true);
  });
  const blurInput = require$('#settings-home-bg-blur') as HTMLInputElement;
  blurInput.addEventListener('input', () => {
    updateHomeBackground({ homeBackgroundBlur: Number(blurInput.value) }, false);
  });
  blurInput.addEventListener('change', () => {
    updateHomeBackground({ homeBackgroundBlur: Number(blurInput.value) }, true);
  });
  require$('#settings-restart').addEventListener('click', () => {
    void acp.restart().then((outcome) => {
      toast(outcome.ok ? t('settings.restarted') : t('settings.switchFailed', { e: outcome.error.message }));
    });
  });
  require$('#settings-run-doctor').addEventListener('click', () => {
    void runDoctor();
  });

  const logsFilter = require$('#diagnostic-logs-filter') as HTMLInputElement;
  logsFilter.addEventListener('input', () => {
    diagnosticLogFilter = logsFilter.value;
    renderDiagnosticLogs();
  });
  require$('#diagnostic-logs-refresh').addEventListener('click', () => {
    void loadDiagnosticLogs(true);
  });
}

async function chooseHomeBackground(): Promise<void> {
  const picked = await desktop.chooseHomeBackground(state.store.homeBackgroundImage);
  if (!picked) return;
  updateHomeBackground({ homeBackgroundImage: picked }, true);
  toast(t('settings.homeBackgroundSet', { w: basename(picked) }));
}
