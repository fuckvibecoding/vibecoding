// Local commands are projected by available_commands_update; the optional
// marketplace is an ACP-only projection of the shared SkillHub service.

import { invoke } from './api';
import { injectToComposer } from './composer';
import { t } from './i18n';
import { hasFeature, state } from './state';
import { confirmDialog, el, iconSpan, require$, toast } from './ui';
import { switchView } from './views';

interface Market { id: string; name?: string; capabilities?: { categories?: boolean }; }
interface Target { path: string; scope: 'project' | 'global'; label: string; }
interface Installed { installed?: boolean; updateAvailable?: boolean; name?: string; scope?: string; }
interface Skill { market: string; id: string; name?: string; displayName?: string; slug?: string; description?: string; version?: string; category?: string; author?: string; suspicious?: boolean; installed?: Installed; }
interface SearchPage { items?: Skill[]; }
interface SessionState { activeSkills?: string[]; }

let market = '';
let scope: 'project' | 'global' = 'project';
let targetDir = '';
let activeSkills: string[] = [];
let requestSerial = 0;

function commandKind(command: { _meta?: Record<string, unknown> }): string {
  return (command._meta?.['mothx.dev'] as { kind?: string } | undefined)?.kind || 'command';
}
function skillTitle(skill: Skill): string { return skill.displayName || skill.name || skill.slug || skill.id; }
function installedName(skill: Skill): string { return skill.installed?.name || skill.slug || skill.name || ''; }
function isActive(skill: Skill): boolean { return activeSkills.includes(installedName(skill)); }

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
    title.append(el('span', '', command.name), el('span', `badge ${kind === 'skill' ? 'badge-accent' : 'badge-blue'}`, kind === 'skill' ? t('skills.kindSkill') : t('skills.kindCommand')));
    card.appendChild(title);
    card.appendChild(el('div', 'card-desc', command.description || ''));
    const meta = el('div', 'card-meta');
    const use = el('span', '', t('skills.use')); use.style.color = 'var(--accent)'; meta.appendChild(use); card.appendChild(meta);
    card.addEventListener('click', () => { injectToComposer(command.name.startsWith('/') ? `${command.name} ` : `/${command.name} `); switchView(state.activeSessionId ? 'chat' : 'home'); });
    grid.appendChild(card);
  }
  renderCatalogShell();
}

function renderCatalogShell(): void {
  const root = require$('#skillhub-catalog');
  root.textContent = '';
  root.hidden = !hasFeature('manageSkillHubCatalog');
  if (root.hidden) return;
  root.appendChild(el('div', 'skillhub-catalog-head', t('skills.marketplace')));
  const sessionId = state.activeSessionId;
  root.appendChild(el('div', 'row-desc', sessionId ? t('skills.marketplaceDesc') : t('skills.marketplaceSessionRequired')));
  if (!sessionId) return;
  const loading = el('div', 'row-desc', t('skills.marketplaceLoading')); root.appendChild(loading);
  void loadCatalog(root, sessionId, loading);
}

async function loadCatalog(root: HTMLElement, sessionId: string, loading: HTMLElement): Promise<void> {
  const serial = ++requestSerial;
  try {
    const [marketResult, targetResult, installedResult] = await Promise.all([
      invoke<{ markets?: Market[] }>('mothx/manage/skillhub/markets', { sessionId }),
      invoke<{ targets?: Target[] }>('mothx/manage/skillhub/targets', { sessionId }),
      invoke<{ session?: SessionState }>('mothx/manage/skillhub/installed', { sessionId }),
    ]);
    if (serial !== requestSerial || state.activeSessionId !== sessionId) return;
    const markets = marketResult.markets || [], targets = targetResult.targets || [];
    activeSkills = installedResult.session?.activeSkills || [];
    market = markets.some((item) => item.id === market) ? market : (markets[0]?.id || '');
    const target = targets.find((item) => item.path === targetDir) || targets.find((item) => item.scope === scope) || targets[0];
    targetDir = target?.path || ''; scope = target?.scope || 'project'; loading.remove(); buildCatalog(root, sessionId, markets, targets);
  } catch (error) { loading.textContent = `${t('skills.marketplaceError')}: ${error instanceof Error ? error.message : String(error)}`; }
}

function buildCatalog(root: HTMLElement, sessionId: string, markets: Market[], targets: Target[]): void {
  const controls = el('div', 'skillhub-controls');
  const marketSelect = document.createElement('select'); marketSelect.className = 'input';
  for (const item of markets) marketSelect.appendChild(new Option(item.name || item.id, item.id, false, item.id === market));
  marketSelect.addEventListener('change', () => { market = marketSelect.value; renderCatalogShell(); }); controls.appendChild(marketSelect);
  const targetSelect = document.createElement('select'); targetSelect.className = 'input';
  for (const item of targets) targetSelect.appendChild(new Option(`${item.label} · ${item.scope}`, item.path, false, item.path === targetDir));
  targetSelect.addEventListener('change', () => { const found = targets.find((item) => item.path === targetSelect.value); targetDir = found?.path || ''; scope = found?.scope || 'project'; }); controls.appendChild(targetSelect);
  root.appendChild(controls);
  const searchRow = el('form', 'skillhub-search');
  const query = document.createElement('input'); query.className = 'input'; query.placeholder = t('skills.marketplaceSearch');
  const submit = el('button', 'btn-primary', t('skills.search')) as HTMLButtonElement; submit.type = 'submit'; searchRow.append(query, submit); root.appendChild(searchRow);
  const workspace = el('div', 'skillhub-workspace'); root.appendChild(workspace);
  const load = (official = false) => void loadResults(workspace, sessionId, market, query.value, official);
  searchRow.addEventListener('submit', (event) => { event.preventDefault(); load(false); });
  if (market === 'skillhub.cn') { const official = el('button', 'btn-secondary', t('skills.official')) as HTMLButtonElement; official.type = 'button'; official.addEventListener('click', () => load(true)); controls.appendChild(official); }
  if (markets.find((item) => item.id === market)?.capabilities?.categories) void loadCategories(controls, sessionId, market, () => load(false));
  load(market === 'skillhub.cn');
}

async function loadCategories(controls: HTMLElement, sessionId: string, chosenMarket: string, refresh: () => void): Promise<void> {
  try {
    const result = await invoke<{ categories?: { key: string; name: string; nameEn?: string }[] }>('mothx/manage/skillhub/categories', { sessionId, market: chosenMarket });
    if (state.activeSessionId !== sessionId || market !== chosenMarket) return;
    const select = document.createElement('select'); select.className = 'input'; select.dataset.skillhubCategory = 'true'; select.appendChild(new Option(t('skills.allCategories'), ''));
    for (const category of result.categories || []) select.appendChild(new Option(category.nameEn || category.name, category.key));
    select.addEventListener('change', refresh); controls.appendChild(select);
  } catch { /* Market category support is optional. */ }
}

async function loadResults(workspace: HTMLElement, sessionId: string, chosenMarket: string, query: string, official: boolean): Promise<void> {
  const serial = ++requestSerial; workspace.textContent = t('skills.marketplaceLoading');
  try {
    const category = workspace.parentElement?.querySelector<HTMLSelectElement>('[data-skillhub-category]')?.value || '';
    const page = await invoke<SearchPage>(official ? 'mothx/manage/skillhub/official' : 'mothx/manage/skillhub/search', { sessionId, market: chosenMarket, query: query.trim(), category, sort: 'downloads', order: 'desc', limit: 20, page: 1 });
    if (serial !== requestSerial || state.activeSessionId !== sessionId || market !== chosenMarket) return;
    renderResults(workspace, sessionId, page.items || []);
  } catch (error) { workspace.textContent = `${t('skills.marketplaceError')}: ${error instanceof Error ? error.message : String(error)}`; }
}

function renderResults(workspace: HTMLElement, sessionId: string, items: Skill[]): void {
  workspace.textContent = ''; const list = el('div', 'skillhub-results'); const detail = el('aside', 'skillhub-detail');
  if (!items.length) list.appendChild(el('div', 'empty-title', t('skills.marketplaceEmpty')));
  for (const item of items) {
    const card = el('button', 'skillhub-result') as HTMLButtonElement; card.type = 'button'; const title = el('div', 'skillhub-result-title', skillTitle(item));
    if (item.suspicious) title.appendChild(el('span', 'badge badge-red', t('skills.risk')));
    if (item.installed?.installed) title.appendChild(el('span', 'badge badge-blue', item.installed.updateAvailable ? t('skills.updateAvailable') : t('skills.installed')));
    card.append(title, el('div', 'row-desc', item.description || '')); card.addEventListener('click', () => void loadDetail(detail, sessionId, item)); list.appendChild(card);
  }
  workspace.append(list, detail); if (items[0]) void loadDetail(detail, sessionId, items[0]);
}

async function loadDetail(container: HTMLElement, sessionId: string, item: Skill): Promise<void> {
  container.textContent = t('skills.detailLoading');
  try { const skill = await invoke<Skill>('mothx/manage/skillhub/detail', { sessionId, market: item.market, id: item.id }); if (state.activeSessionId === sessionId) renderDetail(container, sessionId, skill); } catch (error) { container.textContent = `${t('skills.marketplaceError')}: ${error instanceof Error ? error.message : String(error)}`; }
}

function renderDetail(container: HTMLElement, sessionId: string, skill: Skill): void {
  container.textContent = ''; container.append(el('div', 'skillhub-detail-title', skillTitle(skill)), el('div', 'row-desc', skill.description || ''), el('div', 'skillhub-detail-meta', [skill.version, skill.author, skill.category].filter(Boolean).join(' · ')));
  const actions = el('div', 'skillhub-detail-actions'); const installed = Boolean(skill.installed?.installed);
  const install = el('button', 'btn-primary', installed ? t('skills.update') : t('skills.install')) as HTMLButtonElement; install.type = 'button'; install.addEventListener('click', () => void installSkill(sessionId, skill, installed)); actions.appendChild(install);
  if (installed && !isActive(skill)) { const activate = el('button', 'btn-secondary', t('skills.activate')) as HTMLButtonElement; activate.type = 'button'; activate.addEventListener('click', () => void activateSkill(sessionId, skill)); actions.appendChild(activate); }
  if (installed) { const remove = el('button', 'btn-deny', t('skills.uninstall')) as HTMLButtonElement; remove.type = 'button'; remove.addEventListener('click', () => void uninstallSkill(sessionId, skill)); actions.appendChild(remove); }
  container.appendChild(actions);
}

async function installSkill(sessionId: string, skill: Skill, overwrite: boolean): Promise<void> {
  if (!targetDir) { toast(t('skills.targetRequired')); return; }
  if (overwrite && !confirmDialog(t('skills.confirmUpdate'))) return;
  try { await invoke('mothx/manage/skillhub/install', { sessionId, market: skill.market, id: skill.id, version: skill.version || '', scope, targetDir, overwrite, activate: false }); toast(t(overwrite ? 'skills.updated' : 'skills.installedNotice')); renderCatalogShell(); } catch (error) { toast(`${t('skills.marketplaceError')}: ${error instanceof Error ? error.message : String(error)}`); }
}
async function activateSkill(sessionId: string, skill: Skill): Promise<void> {
  try { const result = await invoke<{ session?: SessionState }>('mothx/manage/skillhub/activate', { sessionId, id: installedName(skill) }); activeSkills = result.session?.activeSkills || activeSkills; toast(t('skills.activated')); renderCatalogShell(); } catch (error) { toast(`${t('skills.marketplaceError')}: ${error instanceof Error ? error.message : String(error)}`); }
}
async function uninstallSkill(sessionId: string, skill: Skill): Promise<void> {
  if (!confirmDialog(t('skills.confirmUninstall'))) return;
  try { await invoke('mothx/manage/skillhub/uninstall', { sessionId, market: skill.market, id: skill.id, scope: skill.installed?.scope || scope }); toast(t('skills.uninstalled')); renderCatalogShell(); } catch (error) { toast(`${t('skills.marketplaceError')}: ${error instanceof Error ? error.message : String(error)}`); }
}
