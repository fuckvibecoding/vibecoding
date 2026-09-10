// 管理面（Phase 3）：mothx/manage/* 的设置页集成。
// 无发现键时各区块显示 unsupported 行；密钥只掩码展示。

import { desktop, invoke } from './api';
import { refreshDraftConfigOptions } from './composer';
import { getLocale, t } from './i18n';
import { hasFeature, state } from './state';
import { confirmDialog, el, iconSpan, promptModal, require$, toast } from './ui';

export interface ProviderView {
  name: string;
  maskedKey?: string | null;
  baseUrl?: string;
  modelCount?: number;
}
export interface SettingsView {
  defaultProvider?: string;
  defaultModel?: string;
  defaultMode?: string;
  thinkingLevel?: string;
  providers?: ProviderView[];
}
interface ApplicationSettingsView {
  defaults?: {
    defaultMode?: string;
    enablePlanTool?: boolean;
    enableArtifact?: boolean;
    enableACPArtifact?: boolean;
    authored?: boolean;
    updateCheck?: boolean;
  };
  contextFiles?: { enabled?: boolean; extraFiles?: string[] };
  compaction?: { enabled?: boolean; reserveTokens?: number; keepRecentTokens?: number; tokenizer?: string; tokenizerModel?: string; template?: string };
  toolExecution?: { mode?: string; maxConcurrency?: number };
  webSearch?: { enabled?: boolean; provider?: string; providerType?: string; model?: string };
  imageGeneration?: { enabled?: boolean; provider?: string; apiType?: string; baseUrl?: string; model?: string; tokenConfigured?: boolean };
  retry?: { enabled?: boolean; maxRetries?: number; baseDelayMs?: number };
  statusLine?: { enabled?: boolean; type?: string; command?: string; padding?: number; refreshInterval?: number; timeoutMs?: number; fallback?: string };
  sandbox?: { enabled?: boolean; level?: string; bwrapPath?: string; allowNetwork?: boolean; allowedRead?: string[]; allowedWrite?: string[]; deniedPaths?: string[]; tmpSize?: string; protectGit?: boolean };
  approval?: { bashWhitelist?: string[]; bashBlacklist?: string[]; confirmBeforeWrite?: boolean };
}
interface ServeConfigAPIView {
  listen?: string;
  defaultMode?: string;
  defaultThinkingLevel?: string;
  enableSubAgents?: boolean;
  enableDelegate?: boolean;
  enableWorkflows?: boolean;
  enableWebSearch?: boolean;
  enableBrowser?: boolean;
  enableArtifact?: boolean;
  enableA2AMaster?: boolean;
  toolVisibility?: { mode?: string; detail?: string };
  systemPromptMode?: string;
  requestTimeoutSeconds?: number;
  backgroundRunMaxSeconds?: number;
  maxConcurrentRequests?: number;
  logLevel?: string;
  session?: { idleTimeoutSeconds?: number; maxSessions?: number };
}
interface ServeConfigFeaturesView {
  webUI?: boolean;
  openAIAPI?: boolean;
  multiAgent?: boolean;
  cron?: boolean;
  memory?: boolean;
}
interface ServeConfigWebUIView { enabled?: boolean; dir?: string; }
interface ServeConfigCronView { enabled?: boolean; interval?: number; }
interface ServeConfigMemoryView { enabled?: boolean; path?: string; }
interface ServeConfigSecurityView { smartApprovals?: boolean; }
interface ServeConfigAgentView {
  maxTurns?: number;
  budgetPressure?: boolean;
  contextPressure?: boolean;
  budgetPressureThreshold?: number;
  contextPressureThreshold?: number;
  runStaleTimeoutSeconds?: number;
  runMaxDurationSeconds?: number;
  backgroundRunMaxSecs?: number;
}
interface ServeConfigView {
  api?: ServeConfigAPIView;
  features?: ServeConfigFeaturesView;
  webUI?: ServeConfigWebUIView;
  cron?: ServeConfigCronView;
  memory?: ServeConfigMemoryView;
  security?: ServeConfigSecurityView;
  agent?: ServeConfigAgentView;
  lobsterMode?: boolean;
}
interface ChannelsWechatView {
  enabled?: boolean;
  workDir?: string;
  autoTyping?: boolean;
  credentialConfigured?: boolean;
}
interface ChannelsFeishuView {
  enabled?: boolean;
  workDir?: string;
  appIDConfigured?: boolean;
  appSecretConfigured?: boolean;
}
interface ChannelsConfigView {
  artifact?: boolean;
  wechat?: ChannelsWechatView;
  feishu?: ChannelsFeishuView;
}
interface ChannelsConfigPatch {
  artifact?: boolean;
  wechat?: ChannelsWechatPatch;
  feishu?: ChannelsFeishuPatch;
}
interface ChannelsWechatPatch {
  enabled?: boolean;
  workDir?: string;
  autoTyping?: boolean;
  credPath?: string;
  clearCredPath?: boolean;
}
interface ChannelsFeishuPatch {
  enabled?: boolean;
  workDir?: string;
  appId?: string;
  appSecret?: string;
  clearAppId?: boolean;
  clearAppSecret?: boolean;
}
interface ProviderModelView {
  id?: string;
  name?: string;
  reasoning?: boolean;
  contextWindow?: number;
  maxTokens?: number;
  input?: string[];
  [key: string]: unknown;
}
interface ProviderConfigShape {
  vendor?: string;
  baseUrl?: string;
  httpProxy?: string;
  forceHTTP11?: boolean;
  api?: string;
  thinkingFormat?: string;
  cacheControl?: boolean;
  maxImagesPerRequest?: number;
  models?: ProviderModelView[];
}
interface ProviderConfigView {
  id: string;
  provider: ProviderConfigShape;
  maskedKey?: string | null;
  apiKeyConfigured?: boolean;
  isDefault?: boolean;
  globalOverride?: boolean;
}
interface ProviderCatalog {
  providers?: ProviderView[];
  providerConfigs?: ProviderConfigView[];
  models?: { id?: string; name?: string; provider?: string; reasoning?: boolean; input?: string[] }[];
  defaultProvider?: string;
  defaultModel?: string;
}
export interface SkillHubMarketView {
  id: string;
  name?: string;
  siteURL?: string;
  apiURL?: string;
  enabled?: boolean;
  apiTokenConfigured?: boolean;
}
export interface SkillHubView {
  defaultMarket?: string;
  defaultInstallScope?: string;
  officialHandles?: string[];
  markets?: SkillHubMarketView[];
}
export interface SkillView {
  name: string;
  description?: string;
  source?: string;
  enabled?: boolean;
}
export interface McpServerView {
  name: string;
  type?: string;
  command?: string;
  args?: string[];
  url?: string;
  messageUrl?: string;
  enabled?: boolean;
  envKeys?: string[];
  headerNames?: string[];
}
export interface StatsSummary {
  sessions?: number;
  runs?: number;
  tokens?: { input?: number; output?: number };
  cost?: number;
}
export interface StatsPoint {
  date?: string;
  runs?: number;
  tokens?: number;
  cost?: number;
}
export interface KnowledgeBaseSpec {
  name: string;
  rootDir: string;
  preprocessProfile: string;
  provider: string;
  model: string;
  mode: string;
  thinkingLevel?: string;
  schedule: string;
  enabled: boolean;
}
export interface KnowledgeBase extends KnowledgeBaseSpec {
  id: string;
  activeSnapshotId?: string;
  createdAt?: string;
  updatedAt?: string;
}
export interface KnowledgeSnapshot {
  id: string;
  status: string;
  fileCount?: number;
  chunkCount?: number;
  nodeCount?: number;
  edgeCount?: number;
  startedAt?: string;
  finishedAt?: string;
  errorSummary?: string;
}
interface KnowledgeBaseView {
  knowledgeBase: KnowledgeBase;
  snapshot?: KnowledgeSnapshot | null;
  status?: string;
}
export interface CronJobView {
  id: string;
  name?: string;
  schedule?: string;
  prompt?: string;
  mode?: string;
  enabled?: boolean;
  workDir?: string;
  sessionId?: string;
  a2aTarget?: string;
  runCount?: number;
  lastStatus?: string;
  lastRun?: string;
  nextRun?: string;
  lastError?: string;
  createdAt?: string;
  provider?: string;
  model?: string;
  [key: string]: unknown;
}
export interface EnvVariableView {
  name: string;
  valueConfigured?: boolean;
}
export interface EnvView {
  variables?: EnvVariableView[];
}
interface EnvPatch {
  set?: { name: string; value: string }[];
  unset?: string[];
}
export interface ExpertLocalizedText { zh?: string; en?: string; }
export interface ExpertMemberMeta {
  id: string;
  name?: ExpertLocalizedText;
  profession?: ExpertLocalizedText;
  avatar?: string;
  role: string;
}
export interface ExpertTeamInfo { leadAgent: string; memberAgents: string[]; }
export interface ExpertManifest {
  schemaVersion?: number;
  name: string;
  expertType?: string;
  agentName?: string;
  displayName?: ExpertLocalizedText;
  categoryId?: string;
  quickPrompts?: ExpertLocalizedText[];
  defaultInitPrompt?: ExpertLocalizedText;
  teamInfo?: ExpertTeamInfo;
  members?: ExpertMemberMeta[];
}
export interface ExpertBundle {
  scope: 'global' | 'project' | 'builtin' | string;
  manifest: ExpertManifest;
  agents: Record<string, string>;
}
export interface ExpertSummary {
  name: string;
  expertType?: string;
  displayName?: ExpertLocalizedText;
  source?: string;
  invalid?: boolean;
  invalidReason?: string;
}
export interface ExpertListView {
  scope: string;
  cwd?: string;
  experts?: ExpertSummary[];
  effectiveExperts?: ExpertSummary[];
  bundle?: ExpertBundle;
}

const cache: {
  settings?: SettingsView;
  application?: ApplicationSettingsView;
  providerCatalog?: ProviderCatalog;
  skillHub?: SkillHubView;
  skills?: SkillView[];
  mcp?: McpServerView[];
  memory?: string;
  stats?: StatsSummary;
  points?: StatsPoint[];
  cron?: CronJobView[];
  knowledgeBases?: KnowledgeBaseView[];
  serve?: ServeConfigView;
  channels?: ChannelsConfigView;
  env?: EnvView;
  experts?: ExpertListView;
} = {};

type ProviderCatalogScope = 'configured' | 'all';
type ProviderEditorTab = 'connection' | 'models' | 'advanced';
type ExpertScope = 'global' | 'project';

// This is intentionally renderer-only state. ACP remains the source of truth
// for settings; these values only preserve where a person is in the settings
// workspace while it is open.
let providerCatalogScope: ProviderCatalogScope = 'configured';
let providerSearch = '';
let activeProviderID = '';
let providerDraft: ProviderConfigView | undefined;
let providerEditorTab: ProviderEditorTab = 'connection';
let cronDraft: CronJobView | undefined;
let creatingKnowledgeBase = false;
let expertScope: ExpertScope = 'global';
let expertDraft: ExpertBundle | undefined;
let creatingExpert = false;

async function guard<T>(feature: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  if (!hasFeature(feature)) return fallback;
  try {
    return await fn();
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
    return fallback;
  }
}

function unsupportedRow(container: HTMLElement, feature: string): void {
  container.textContent = '';
  const row = el('div', 'row-item');
  row.appendChild(el('div', 'row-desc', hasFeature(feature) ? '…' : t('manage.unsupported')));
  container.appendChild(row);
}

// Settings owns tab navigation; this module only maps an active management
// tab to its ACP-backed projection. Keeping requests one-tab-at-a-time avoids
// loading every hidden settings panel at startup or on every settings entry.
export type ManagedSettingsTab = 'application' | 'providers' | 'knowledge' | 'skills' | 'skillhub' | 'experts' | 'mcp' | 'memory' | 'env' | 'cron' | 'channels' | 'serve' | 'stats';

const manageSectionRequests = new Map<ManagedSettingsTab, Promise<void>>();

export function renderManageSection(tab: ManagedSettingsTab): Promise<void> {
  const existing = manageSectionRequests.get(tab);
  if (existing) return existing;

  let request: Promise<void>;
  switch (tab) {
    case 'application': request = renderApplication(); break;
    case 'providers': request = renderProviders(); break;
    case 'knowledge': request = renderKnowledgeBases(); break;
    case 'skills': request = renderSkills(); break;
    case 'skillhub': request = renderSkillHub(); break;
    case 'experts': request = renderExperts(); break;
    case 'mcp': request = renderMcp(); break;
    case 'memory': request = renderMemory(); break;
    case 'env': request = renderEnv(); break;
    case 'cron': request = renderCron(); break;
    case 'channels': request = renderChannels(); break;
    case 'serve': request = renderServe(); break;
    case 'stats': request = renderStats(); break;
  }
  manageSectionRequests.set(tab, request);
  void request.finally(() => {
    if (manageSectionRequests.get(tab) === request) manageSectionRequests.delete(tab);
  });
  return request;
}

async function renderApplication(): Promise<void> {
  const container = require$('#manage-application');
  if (!hasFeature('manageApplicationSettings')) {
    unsupportedRow(container, 'manageApplicationSettings');
    return;
  }
  const application = await guard('manageApplicationSettings', () => invoke<ApplicationSettingsView>('mothx/manage/application/get', {}), cache.application);
  cache.application = application || cache.application;
  container.textContent = '';
  if (!cache.application) {
    unsupportedRow(container, 'manageApplicationSettings');
    return;
  }
  renderApplicationSettings(container, cache.application);
}

function renderApplicationSettings(container: HTMLElement, view: ApplicationSettingsView): void {
  const defaults = view.defaults || {};
  const context = view.contextFiles || {};
  const compaction = view.compaction || {};
  const tools = view.toolExecution || {};
  const webSearch = view.webSearch || {};
  const image = view.imageGeneration || {};
  const retry = view.retry || {};
  const statusLine = view.statusLine || {};
  const sandbox = view.sandbox || {};
  const approval = view.approval || {};
  const root = el('div', 'application-settings-workspace');
  const header = el('div', 'application-settings-header');
  const copy = el('div');
  copy.append(
    el('div', 'provider-section-eyebrow', t('settings.application')),
    el('div', 'provider-section-title', t('settings.applicationTitle')),
    el('div', 'row-desc', t('settings.applicationDesc')),
  );
  const save = el('button', 'btn-primary', t('settings.applicationSave')) as HTMLButtonElement;
  header.append(copy, save);
  root.appendChild(header);

  const defaultCard = applicationCard(t('settings.applicationDefaults'), t('settings.applicationDefaultsDesc'));
  const defaultMode = applicationSelect(defaults.defaultMode || 'yolo', ['agent', 'plan', 'yolo', 'os']);
  const enablePlanTool = applicationToggle(t('settings.applicationEnablePlanTool'), defaults.enablePlanTool === true);
  const enableArtifact = applicationToggle(t('settings.applicationEnableArtifact'), defaults.enableArtifact === true);
  const enableACPArtifact = applicationToggle(t('settings.applicationEnableACPArtifact'), defaults.enableACPArtifact === true);
  const authored = applicationToggle(t('settings.applicationAuthored'), defaults.authored === true);
  const updateCheck = applicationToggle(t('settings.applicationUpdateCheck'), defaults.updateCheck !== false);
  defaultCard.grid.append(
    applicationField(t('settings.applicationDefaultMode'), defaultMode),
    enablePlanTool.field, enableArtifact.field, enableACPArtifact.field, authored.field, updateCheck.field,
  );
  root.appendChild(defaultCard.card);

  const contextCard = applicationCard(t('settings.applicationContext'), t('settings.applicationContextDesc'));
  const contextFiles = applicationToggle(t('settings.applicationContextFiles'), context.enabled !== false);
  const compactEnabled = applicationToggle(t('settings.applicationCompaction'), compaction.enabled !== false);
  const reserveTokens = applicationNumber(compaction.reserveTokens, 0);
  const keepRecentTokens = applicationNumber(compaction.keepRecentTokens, 0);
  const tokenizer = applicationInput(compaction.tokenizer || '');
  const tokenizerModel = applicationInput(compaction.tokenizerModel || '');
  const extraFiles = applicationTextarea((context.extraFiles || []).join('\n'), 3);
  const compactionTemplate = applicationTextarea(compaction.template || '', 3);
  contextCard.grid.append(
    contextFiles.field, compactEnabled.field,
    applicationField(t('settings.applicationReserveTokens'), reserveTokens),
    applicationField(t('settings.applicationKeepRecentTokens'), keepRecentTokens),
    applicationField(t('settings.applicationTokenizer'), tokenizer),
    applicationField(t('settings.applicationTokenizerModel'), tokenizerModel),
    applicationField(t('settings.applicationExtraFiles'), extraFiles, true),
    applicationField(t('settings.applicationCompactionTemplate'), compactionTemplate, true),
  );
  root.appendChild(contextCard.card);

  const toolsCard = applicationCard(t('settings.applicationTools'), t('settings.applicationToolsDesc'));
  const webSearchEnabled = applicationToggle(t('settings.applicationWebSearch'), webSearch.enabled === true);
  const webSearchProvider = applicationInput(webSearch.provider || '');
  const webSearchType = applicationInput(webSearch.providerType || '');
  const webSearchModel = applicationInput(webSearch.model || '');
  const toolExecutionMode = applicationSelect(tools.mode || 'parallel', ['parallel', 'sequential']);
  const toolConcurrency = applicationNumber(tools.maxConcurrency, 1);
  toolsCard.grid.append(
    webSearchEnabled.field,
    applicationField(t('settings.applicationWebSearchProvider'), webSearchProvider),
    applicationField(t('settings.applicationWebSearchType'), webSearchType),
    applicationField(t('settings.applicationWebSearchModel'), webSearchModel),
    applicationField(t('settings.applicationToolExecutionMode'), toolExecutionMode),
    applicationField(t('settings.applicationToolConcurrency'), toolConcurrency),
  );
  root.appendChild(toolsCard.card);

  const imageCard = applicationCard(t('settings.applicationImage'), t('settings.applicationImageDesc'));
  const imageEnabled = applicationToggle(t('settings.applicationImageEnabled'), image.enabled === true);
  const imageProvider = applicationInput(image.provider || '');
  const imageAPI = applicationInput(image.apiType || '');
  const imageBaseURL = applicationInput(image.baseUrl || '');
  const imageModel = applicationInput(image.model || '');
  const imageToken = applicationInput('', 'password');
  imageToken.placeholder = image.tokenConfigured ? t('settings.applicationTokenConfigured') : t('settings.applicationTokenUnset');
  const clearImageToken = applicationToggle(t('settings.applicationClearToken'), false);
  imageCard.grid.append(
    imageEnabled.field,
    applicationField(t('settings.applicationImageProvider'), imageProvider),
    applicationField(t('settings.applicationImageAPI'), imageAPI),
    applicationField(t('settings.applicationImageBaseURL'), imageBaseURL),
    applicationField(t('settings.applicationImageModel'), imageModel),
    applicationField(t('settings.applicationImageToken'), imageToken),
    clearImageToken.field,
  );
  root.appendChild(imageCard.card);

  const runtimeCard = applicationCard(t('settings.applicationRuntime'), t('settings.applicationRuntimeDesc'));
  const retryEnabled = applicationToggle(t('settings.applicationRetry'), retry.enabled !== false);
  const maxRetries = applicationNumber(retry.maxRetries, 0);
  const baseDelay = applicationNumber(retry.baseDelayMs, 0);
  const statusLineEnabled = applicationToggle(t('settings.applicationStatusLine'), statusLine.enabled === true);
  const statusType = applicationInput(statusLine.type || '');
  const statusCommand = applicationInput(statusLine.command || '');
  const statusPadding = applicationNumber(statusLine.padding, 0);
  const statusRefresh = applicationNumber(statusLine.refreshInterval, 0);
  const statusTimeout = applicationNumber(statusLine.timeoutMs, 0);
  const statusFallback = applicationInput(statusLine.fallback || '');
  runtimeCard.grid.append(
    retryEnabled.field,
    applicationField(t('settings.applicationMaxRetries'), maxRetries),
    applicationField(t('settings.applicationBaseDelay'), baseDelay),
    statusLineEnabled.field,
    applicationField(t('settings.applicationStatusType'), statusType),
    applicationField(t('settings.applicationStatusCommand'), statusCommand, true),
    applicationField(t('settings.applicationStatusPadding'), statusPadding),
    applicationField(t('settings.applicationStatusRefresh'), statusRefresh),
    applicationField(t('settings.applicationStatusTimeout'), statusTimeout),
    applicationField(t('settings.applicationStatusFallback'), statusFallback),
  );
  root.appendChild(runtimeCard.card);

  const safetyCard = applicationCard(t('settings.applicationSafety'), t('settings.applicationSafetyDesc'));
  const sandboxEnabled = applicationToggle(t('settings.applicationSandbox'), sandbox.enabled === true);
  const allowNetwork = applicationToggle(t('settings.applicationAllowNetwork'), sandbox.allowNetwork === true);
  const protectGit = applicationToggle(t('settings.applicationProtectGit'), sandbox.protectGit === true);
  const sandboxLevel = applicationInput(sandbox.level || 'none');
  const bwrapPath = applicationInput(sandbox.bwrapPath || '');
  const tmpSize = applicationInput(sandbox.tmpSize || '');
  const allowedRead = applicationTextarea((sandbox.allowedRead || []).join('\n'), 3);
  const allowedWrite = applicationTextarea((sandbox.allowedWrite || []).join('\n'), 3);
  const deniedPaths = applicationTextarea((sandbox.deniedPaths || []).join('\n'), 3);
  const confirmWrite = applicationToggle(t('settings.applicationConfirmWrite'), approval.confirmBeforeWrite === true);
  const bashWhitelist = applicationTextarea((approval.bashWhitelist || []).join('\n'), 3);
  const bashBlacklist = applicationTextarea((approval.bashBlacklist || []).join('\n'), 3);
  safetyCard.grid.append(
    sandboxEnabled.field, allowNetwork.field, protectGit.field,
    applicationField(t('settings.applicationSandboxLevel'), sandboxLevel),
    applicationField(t('settings.applicationBwrapPath'), bwrapPath),
    applicationField(t('settings.applicationTmpSize'), tmpSize),
    applicationField(t('settings.applicationAllowedRead'), allowedRead, true),
    applicationField(t('settings.applicationAllowedWrite'), allowedWrite, true),
    applicationField(t('settings.applicationDeniedPaths'), deniedPaths, true),
    confirmWrite.field,
    applicationField(t('settings.applicationBashWhitelist'), bashWhitelist, true),
    applicationField(t('settings.applicationBashBlacklist'), bashBlacklist, true),
  );
  root.appendChild(safetyCard.card);

  save.addEventListener('click', () => {
    void saveApplicationSettings(save, {
      defaults: {
        defaultMode: defaultMode.value, enablePlanTool: enablePlanTool.input.checked,
        enableArtifact: enableArtifact.input.checked, enableACPArtifact: enableACPArtifact.input.checked,
        authored: authored.input.checked, updateCheck: updateCheck.input.checked,
      },
      contextFiles: { enabled: contextFiles.input.checked, extraFiles: applicationLines(extraFiles.value) },
      compaction: {
        enabled: compactEnabled.input.checked, reserveTokens: applicationInteger(reserveTokens, 0),
        keepRecentTokens: applicationInteger(keepRecentTokens, 0), tokenizer: tokenizer.value.trim(),
        tokenizerModel: tokenizerModel.value.trim(), template: compactionTemplate.value,
      },
      toolExecution: { mode: toolExecutionMode.value, maxConcurrency: applicationInteger(toolConcurrency, 1) },
      webSearch: {
        enabled: webSearchEnabled.input.checked, provider: webSearchProvider.value.trim(),
        providerType: webSearchType.value.trim(), model: webSearchModel.value.trim(),
      },
      imageGeneration: {
        enabled: imageEnabled.input.checked, provider: imageProvider.value.trim(), apiType: imageAPI.value.trim(),
        baseUrl: imageBaseURL.value.trim(), model: imageModel.value.trim(),
        ...(clearImageToken.input.checked ? { token: '' } : imageToken.value.trim() ? { token: imageToken.value.trim() } : {}),
      },
      retry: { enabled: retryEnabled.input.checked, maxRetries: applicationInteger(maxRetries, 0), baseDelayMs: applicationInteger(baseDelay, 0) },
      statusLine: {
        enabled: statusLineEnabled.input.checked, type: statusType.value.trim(), command: statusCommand.value.trim(),
        padding: applicationInteger(statusPadding, 0), refreshInterval: applicationInteger(statusRefresh, 0),
        timeoutMs: applicationInteger(statusTimeout, 0), fallback: statusFallback.value.trim(),
      },
      sandbox: {
        enabled: sandboxEnabled.input.checked, level: sandboxLevel.value.trim(), bwrapPath: bwrapPath.value.trim(),
        allowNetwork: allowNetwork.input.checked, allowedRead: applicationLines(allowedRead.value),
        allowedWrite: applicationLines(allowedWrite.value), deniedPaths: applicationLines(deniedPaths.value),
        tmpSize: tmpSize.value.trim(), protectGit: protectGit.input.checked,
      },
      approval: {
        confirmBeforeWrite: confirmWrite.input.checked, bashWhitelist: applicationLines(bashWhitelist.value),
        bashBlacklist: applicationLines(bashBlacklist.value),
      },
    });
  });
  container.appendChild(root);
}

function applicationCard(title: string, description: string): { card: HTMLElement; grid: HTMLElement } {
  const card = el('section', 'application-settings-card');
  const head = el('div', 'application-settings-card-head');
  head.append(el('div', 'provider-section-title', title), el('div', 'row-desc', description));
  const grid = el('div', 'application-settings-grid');
  card.append(head, grid);
  return { card, grid };
}

function applicationField(label: string, control: HTMLElement, full = false): HTMLElement {
  const field = el('label', full ? 'application-settings-field full' : 'application-settings-field');
  field.append(el('span', '', label), control);
  return field;
}

function applicationToggle(label: string, checked: boolean): { field: HTMLElement; input: HTMLInputElement } {
  const field = el('label', 'application-settings-toggle');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  field.append(el('span', '', label), input);
  return { field, input };
}

function applicationInput(value: string, type = 'text'): HTMLInputElement {
  const input = document.createElement('input');
  input.className = 'settings-input';
  input.type = type;
  input.value = value;
  return input;
}

function applicationNumber(value: number | undefined, min: number): HTMLInputElement {
  const input = applicationInput(String(value ?? min), 'number');
  input.min = String(min);
  input.step = '1';
  return input;
}

function applicationSelect(value: string, options: string[]): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'settings-select';
  for (const optionValue of options) {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionValue;
    select.appendChild(option);
  }
  if (!options.includes(value)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
  select.value = value;
  return select;
}

function applicationTextarea(value: string, rows: number): HTMLTextAreaElement {
  const textarea = document.createElement('textarea');
  textarea.className = 'settings-input application-settings-textarea';
  textarea.rows = rows;
  textarea.value = value;
  return textarea;
}

function applicationLines(value: string): string[] {
  return value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
}

function applicationInteger(input: HTMLInputElement, min: number): number {
  const value = Number(input.value);
  return Number.isInteger(value) && value >= min ? value : min;
}

async function saveApplicationSettings(button: HTMLButtonElement, patch: Record<string, unknown>): Promise<void> {
  button.disabled = true;
  const label = button.textContent;
  button.textContent = t('settings.applicationSaving');
  try {
    const updated = await invoke<ApplicationSettingsView>('mothx/manage/application/patch', { patch });
    cache.application = updated;
    cache.settings = undefined;
    await refreshDraftConfigOptions();
    await renderApplication();
    toast(t('settings.applicationSaved'));
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  } finally {
    button.disabled = false;

    button.textContent = label || t('settings.applicationSave');
  }
}

async function renderEnv(): Promise<void> {
  const container = require$('#manage-env');
  if (!hasFeature('manageEnv')) {
    unsupportedRow(container, 'manageEnv');
    return;
  }
  const view = await guard('manageEnv', () => invoke<EnvView>('mothx/manage/env/get', {}), cache.env);
  cache.env = view || cache.env;
  container.textContent = '';
  if (!cache.env) {
    unsupportedRow(container, 'manageEnv');
    return;
  }
  renderEnvSettings(container, cache.env);
}

type EnvDraft = { value: string; deleted: boolean; isNew: boolean; touched: boolean };

function renderEnvSettings(container: HTMLElement, view: EnvView): void {
  const variables = (view.variables || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const drafts: Record<string, EnvDraft> = {};
  for (const variable of variables) {
    drafts[variable.name] = { value: '', deleted: false, isNew: false, touched: false };
  }

  const root = el('div', 'application-settings-workspace');
  const header = el('div', 'application-settings-header');
  const copy = el('div');
  copy.append(
    el('div', 'provider-section-eyebrow', t('settings.envGroup')),
    el('div', 'provider-section-title', t('settings.envTitle')),
    el('div', 'row-desc', t('settings.envDesc')),
  );
  const save = el('button', 'btn-primary', t('settings.envSave')) as HTMLButtonElement;
  header.append(copy, save);
  root.appendChild(header);
  root.appendChild(el('div', 'row-desc', t('settings.envHint')));

  const listCard = applicationCard(t('settings.envVariables'), t('settings.envVariablesDesc'));
  const list = el('div', 'env-list');

  function renderList(): void {
    list.textContent = '';
    const names = Object.keys(drafts).filter((name) => !drafts[name].deleted).sort();
    if (names.length === 0) {
      const empty = el('div', 'env-empty');
      empty.append(el('strong', '', t('settings.envEmpty')), el('span', '', t('settings.envEmptyHint')));
      list.appendChild(empty);
      return;
    }
    for (const name of names) {
      const row = el('div', 'env-row');
      const nameEl = el('code', 'env-name', name);
      const input = applicationInput(drafts[name].value, 'password');
      input.placeholder = t('settings.envValueConfigured');
      input.setAttribute('aria-label', `${t('settings.envValue')}: ${name}`);
      input.addEventListener('input', () => {
        drafts[name].value = input.value;
        drafts[name].touched = true;
      });
      const remove = el('button', 'btn-ghost', t('settings.envRemoveButton')) as HTMLButtonElement;
      remove.addEventListener('click', () => {
        drafts[name].deleted = true;
        renderList();
      });
      row.append(nameEl, input, remove);
      list.appendChild(row);
    }
  }

  renderList();
  listCard.grid.appendChild(list);
  root.appendChild(listCard.card);

  const addCard = applicationCard(t('settings.envAdd'), t('settings.envAddDesc'));
  const newName = applicationInput('');
  newName.placeholder = 'MY_VARIABLE';
  newName.autocomplete = 'off';
  const newValue = applicationInput('', 'password');
  newValue.placeholder = t('settings.envValue');
  const addButton = el('button', 'btn-primary', t('settings.envAddButton')) as HTMLButtonElement;
  addCard.grid.append(
    applicationField(t('settings.envName'), newName),
    applicationField(t('settings.envValue'), newValue),
    addButton,
  );
  root.appendChild(addCard.card);

  addButton.addEventListener('click', () => {
    const name = newName.value.trim();
    if (!name) {
      toast(t('settings.envNameRequired'));
      return;
    }
    if (drafts[name] && !drafts[name].deleted) {
      toast(t('settings.envDuplicate'));
      return;
    }
    drafts[name] = { value: newValue.value, deleted: false, isNew: true, touched: true };
    newName.value = '';
    newValue.value = '';
    renderList();
  });

  save.addEventListener('click', () => {
    const set: { name: string; value: string }[] = [];
    const unset: string[] = [];
    for (const [name, draft] of Object.entries(drafts)) {
      if (draft.deleted) {
        unset.push(name);
      } else if (draft.isNew || draft.touched) {
        set.push({ name, value: draft.value });
      }
    }
    if (set.length === 0 && unset.length === 0) return;
    void saveEnvPatch(save, { set, unset });
  });

  container.appendChild(root);
}

async function saveEnvPatch(button: HTMLButtonElement, patch: EnvPatch): Promise<void> {
  button.disabled = true;
  const label = button.textContent;
  button.textContent = t('settings.envSaving');
  try {
    const updated = await invoke<EnvView>('mothx/manage/env/patch', patch);
    cache.env = updated;
    await renderEnv();
    toast(t('settings.envSaved'));
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  } finally {
    button.disabled = false;
    button.textContent = label || t('settings.envSave');
  }
}

async function renderChannels(): Promise<void> {
  const container = require$('#manage-channels');
  if (!hasFeature('manageChannels')) {
    unsupportedRow(container, 'manageChannels');
    return;
  }
  const view = await guard('manageChannels', () => invoke<ChannelsConfigView>('mothx/manage/channels/get', {}), cache.channels);
  cache.channels = view || cache.channels;
  container.textContent = '';
  if (!cache.channels) {
    unsupportedRow(container, 'manageChannels');
    return;
  }
  renderChannelsSettings(container, cache.channels);
}

function renderChannelsSettings(container: HTMLElement, view: ChannelsConfigView): void {
  const wechat = view.wechat || {};
  const feishu = view.feishu || {};

  const root = el('div', 'application-settings-workspace');
  const header = el('div', 'application-settings-header');
  const copy = el('div');
  copy.append(
    el('div', 'provider-section-eyebrow', t('settings.channelsGroup')),
    el('div', 'provider-section-title', t('settings.channelsTitle')),
    el('div', 'row-desc', t('settings.channelsDesc')),
  );
  header.append(copy);
  root.appendChild(header);

  root.appendChild(el('div', 'row-desc', t('settings.channelsHint')));

  const artifactCard = applicationCard(t('settings.channelsArtifact'), t('settings.channelsArtifactDesc'));
  const artifactEnabled = applicationToggle(t('settings.channelsArtifactEnabled'), view.artifact === true);
  const artifactSave = el('button', 'btn-primary', t('settings.channelsSave')) as HTMLButtonElement;
  artifactCard.grid.append(artifactEnabled.field);
  artifactCard.card.appendChild(artifactSave);
  root.appendChild(artifactCard.card);

  const wechatCard = applicationCard(t('settings.channelsWechat'), t('settings.channelsWechatDesc'));
  const wechatEnabled = applicationToggle(t('settings.channelsEnabled'), wechat.enabled === true);
  const wechatWorkDir = applicationInput(wechat.workDir || '');
  const wechatAutoTyping = applicationToggle(t('settings.channelsAutoTyping'), wechat.autoTyping !== false);
  const wechatCred = applicationInput('', 'password');
  wechatCred.placeholder = wechat.credentialConfigured ? t('settings.channelsCredConfigured') : t('settings.channelsCredUnset');
  const wechatClearCred = applicationToggle(t('settings.channelsClearCred'), false);
  const wechatSave = el('button', 'btn-primary', t('settings.channelsSave')) as HTMLButtonElement;
  wechatCard.grid.append(
    wechatEnabled.field,
    applicationField(t('settings.channelsWorkDir'), wechatWorkDir),
    wechatAutoTyping.field,
    applicationField(t('settings.channelsCredPath'), wechatCred),
    wechatClearCred.field,
  );
  wechatCard.card.appendChild(wechatSave);
  root.appendChild(wechatCard.card);

  const feishuCard = applicationCard(t('settings.channelsFeishu'), t('settings.channelsFeishuDesc'));
  const feishuEnabled = applicationToggle(t('settings.channelsEnabled'), feishu.enabled === true);
  const feishuWorkDir = applicationInput(feishu.workDir || '');
  const feishuAppId = applicationInput('', 'password');
  feishuAppId.placeholder = feishu.appIDConfigured ? t('settings.channelsAppIDConfigured') : t('settings.channelsAppIDUnset');
  const feishuAppSecret = applicationInput('', 'password');
  feishuAppSecret.placeholder = feishu.appSecretConfigured ? t('settings.channelsAppSecretConfigured') : t('settings.channelsAppSecretUnset');
  const feishuClearAppId = applicationToggle(t('settings.channelsClearAppID'), false);
  const feishuClearAppSecret = applicationToggle(t('settings.channelsClearAppSecret'), false);
  const feishuSave = el('button', 'btn-primary', t('settings.channelsSave')) as HTMLButtonElement;
  feishuCard.grid.append(
    feishuEnabled.field,
    applicationField(t('settings.channelsWorkDir'), feishuWorkDir),
    applicationField(t('settings.channelsAppID'), feishuAppId),
    applicationField(t('settings.channelsAppSecret'), feishuAppSecret),
    feishuClearAppId.field,
    feishuClearAppSecret.field,
  );
  feishuCard.card.appendChild(feishuSave);
  root.appendChild(feishuCard.card);

  wechatSave.addEventListener('click', () => {
    const workDir = wechatWorkDir.value.trim();
    if (!workDir) {
      toast(t('settings.channelsWorkDirRequired'));
      return;
    }
    const patch: ChannelsConfigPatch = {
      wechat: { enabled: wechatEnabled.input.checked, workDir, autoTyping: wechatAutoTyping.input.checked },
    };
    if (wechatClearCred.input.checked) {
      patch.wechat!.clearCredPath = true;
    } else if (wechatCred.value.trim()) {
      patch.wechat!.credPath = wechatCred.value.trim();
    }
    void saveChannelsConfig(wechatSave, patch);
  });

  artifactSave.addEventListener('click', () => {
    void saveChannelsConfig(artifactSave, { artifact: artifactEnabled.input.checked });
  });

  feishuSave.addEventListener('click', () => {
    const workDir = feishuWorkDir.value.trim();
    if (!workDir) {
      toast(t('settings.channelsWorkDirRequired'));
      return;
    }
    const patch: ChannelsConfigPatch = {
      feishu: { enabled: feishuEnabled.input.checked, workDir },
    };
    if (feishuClearAppId.input.checked) {
      patch.feishu!.clearAppId = true;
    } else if (feishuAppId.value.trim()) {
      patch.feishu!.appId = feishuAppId.value.trim();
    }
    if (feishuClearAppSecret.input.checked) {
      patch.feishu!.clearAppSecret = true;
    } else if (feishuAppSecret.value.trim()) {
      patch.feishu!.appSecret = feishuAppSecret.value.trim();
    }
    void saveChannelsConfig(feishuSave, patch);
  });

  container.appendChild(root);
}

async function saveChannelsConfig(button: HTMLButtonElement, patch: ChannelsConfigPatch): Promise<void> {
  button.disabled = true;
  const label = button.textContent;
  button.textContent = t('settings.channelsSaving');
  try {
    const updated = await invoke<ChannelsConfigView>('mothx/manage/channels/patch', { patch });
    cache.channels = updated;
    await renderChannels();
    toast(t('settings.channelsSaved'));
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  } finally {
    button.disabled = false;
    button.textContent = label || t('settings.channelsSave');
  }
}

async function renderServe(): Promise<void> {
  const container = require$('#manage-serve');
  if (!hasFeature('manageServeConfig')) {
    unsupportedRow(container, 'manageServeConfig');
    return;
  }
  const view = await guard('manageServeConfig', () => invoke<ServeConfigView>('mothx/manage/serve/get', {}), cache.serve);
  cache.serve = view || cache.serve;
  container.textContent = '';
  if (!cache.serve) {
    unsupportedRow(container, 'manageServeConfig');
    return;
  }
  renderServeSettings(container, cache.serve);
}

function renderServeSettings(container: HTMLElement, view: ServeConfigView): void {
  const api = view.api || {};
  const features = view.features || {};
  const webUI = view.webUI || {};
  const cron = view.cron || {};
  const memory = view.memory || {};
  const security = view.security || {};
  const agent = view.agent || {};

  const root = el('div', 'application-settings-workspace');
  const header = el('div', 'application-settings-header');
  const copy = el('div');
  copy.append(
    el('div', 'provider-section-eyebrow', t('settings.serveGroup')),
    el('div', 'provider-section-title', t('settings.serveTitle')),
    el('div', 'row-desc', t('settings.serveDesc')),
  );
  const save = el('button', 'btn-primary', t('settings.serveSave')) as HTMLButtonElement;
  header.append(copy, save);
  root.appendChild(header);

  const runtimeCard = applicationCard(t('settings.serveRuntime'), t('settings.serveRuntimeDesc'));
  const listen = applicationInput(api.listen || '');
  const webUIDir = applicationInput(webUI.dir || '');
  const requestTimeout = applicationNumber(api.requestTimeoutSeconds, 1);
  const backgroundRunMax = applicationNumber(api.backgroundRunMaxSeconds, 1);
  const maxConcurrent = applicationNumber(api.maxConcurrentRequests ?? 0, 0);
  const logLevel = applicationSelect(api.logLevel || 'info', ['debug', 'info', 'warn', 'error']);
  const defaultMode = applicationSelect(api.defaultMode || 'yolo', ['yolo', 'agent', 'plan', 'os']);
  const defaultThinking = applicationSelect(api.defaultThinkingLevel || 'medium', ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
  const systemPromptMode = applicationSelect(api.systemPromptMode || 'append', ['append', 'ignore']);
  runtimeCard.grid.append(
    applicationField(t('settings.serveListen'), listen),
    applicationField(t('settings.serveWebUIDir'), webUIDir),
    applicationField(t('settings.serveRequestTimeout'), requestTimeout),
    applicationField(t('settings.serveBackgroundRunMax'), backgroundRunMax),
    applicationField(t('settings.serveMaxConcurrent'), maxConcurrent),
    applicationField(t('settings.serveLogLevel'), logLevel),
    applicationField(t('settings.serveDefaultMode'), defaultMode),
    applicationField(t('settings.serveDefaultThinking'), defaultThinking),
    applicationField(t('settings.serveSystemPromptMode'), systemPromptMode),
  );
  root.appendChild(runtimeCard.card);

  const featuresCard = applicationCard(t('settings.serveFeatures'), t('settings.serveFeaturesDesc'));
  const webUIFeature = applicationToggle(t('settings.serveWebUI'), features.webUI === true);
  const openAIAPIFeature = applicationToggle(t('settings.serveOpenAIAPI'), features.openAIAPI === true);
  const multiAgentFeature = applicationToggle(t('settings.serveMultiAgent'), features.multiAgent === true);
  const cronFeature = applicationToggle(t('settings.serveCronFeature'), features.cron === true);
  const memoryFeature = applicationToggle(t('settings.serveMemoryFeature'), features.memory === true);
  featuresCard.grid.append(webUIFeature.field, openAIAPIFeature.field, multiAgentFeature.field, cronFeature.field, memoryFeature.field);
  root.appendChild(featuresCard.card);

  const capabilitiesCard = applicationCard(t('settings.serveCapabilities'), t('settings.serveCapabilitiesDesc'));
  const enableDelegate = applicationToggle(t('settings.serveEnableDelegate'), api.enableDelegate === true);
  const enableWorkflows = applicationToggle(t('settings.serveEnableWorkflows'), api.enableWorkflows === true);
  const enableWebSearch = applicationToggle(t('settings.serveEnableWebSearch'), api.enableWebSearch === true);
  const enableBrowser = applicationToggle(t('settings.serveEnableBrowser'), api.enableBrowser === true);
  const enableArtifact = applicationToggle(t('settings.serveEnableArtifact'), api.enableArtifact === true);
  const enableA2AMaster = applicationToggle(t('settings.serveEnableA2AMaster'), api.enableA2AMaster === true);
  capabilitiesCard.grid.append(
    enableDelegate.field, enableWorkflows.field, enableWebSearch.field, enableBrowser.field, enableArtifact.field, enableA2AMaster.field,
  );
  root.appendChild(capabilitiesCard.card);

  const outputCard = applicationCard(t('settings.serveOutput'), t('settings.serveOutputDesc'));
  const toolMode = applicationSelect((api.toolVisibility?.mode) || 'content', ['content', 'sse_event', 'none']);
  const toolDetail = applicationSelect((api.toolVisibility?.detail) || 'collapsed', ['collapsed', 'expanded']);
  outputCard.grid.append(
    applicationField(t('settings.serveToolMode'), toolMode),
    applicationField(t('settings.serveToolDetail'), toolDetail),
  );
  root.appendChild(outputCard.card);

  const automationCard = applicationCard(t('settings.serveAutomation'), t('settings.serveAutomationDesc'));
  const cronEnabled = applicationToggle(t('settings.serveCronEnabled'), cron.enabled === true);
  const cronInterval = applicationNumber(cron.interval, 1);
  const memoryEnabled = applicationToggle(t('settings.serveMemoryEnabled'), memory.enabled === true);
  const memoryPath = applicationInput(memory.path || '');
  automationCard.grid.append(
    cronEnabled.field,
    applicationField(t('settings.serveCronInterval'), cronInterval),
    memoryEnabled.field,
    applicationField(t('settings.serveMemoryPath'), memoryPath),
  );
  root.appendChild(automationCard.card);

  const securityCard = applicationCard(t('settings.serveSecurity'), t('settings.serveSecurityDesc'));
  const smartApprovals = applicationToggle(t('settings.serveSmartApprovals'), security.smartApprovals === true);
  securityCard.grid.append(smartApprovals.field);
  root.appendChild(securityCard.card);

  const sessionsCard = applicationCard(t('settings.serveSessions'), t('settings.serveSessionsDesc'));
  const idleTimeout = applicationNumber(api.session?.idleTimeoutSeconds ?? 1800, 1);
  const maxSessions = applicationNumber(api.session?.maxSessions ?? 0, 0);
  maxSessions.placeholder = t('settings.serveMaxSessionsHint');
  sessionsCard.grid.append(
    applicationField(t('settings.serveIdleTimeout'), idleTimeout),
    applicationField(t('settings.serveMaxSessions'), maxSessions),
  );
  root.appendChild(sessionsCard.card);

  const agentCard = applicationCard(t('settings.serveAgent'), t('settings.serveAgentDesc'));
  const maxTurns = applicationNumber(agent.maxTurns, 1);
  const budgetPressure = applicationToggle(t('settings.serveBudgetPressure'), agent.budgetPressure === true);
  const contextPressure = applicationToggle(t('settings.serveContextPressure'), agent.contextPressure === true);
  const budgetThreshold = applicationFloatInput(agent.budgetPressureThreshold ?? 0.2, 0, 1, 0.01);
  const contextThreshold = applicationFloatInput(agent.contextPressureThreshold ?? 0.55, 0, 1, 0.01);
  const runStaleTimeout = applicationNumber(agent.runStaleTimeoutSeconds, 1);
  const runMaxDuration = applicationNumber(agent.runMaxDurationSeconds, 1);
  const agentBackgroundRunMax = applicationNumber(agent.backgroundRunMaxSecs, 1);
  agentCard.grid.append(
    applicationField(t('settings.serveMaxTurns'), maxTurns),
    budgetPressure.field, contextPressure.field,
    applicationField(t('settings.serveBudgetThreshold'), budgetThreshold),
    applicationField(t('settings.serveContextThreshold'), contextThreshold),
    applicationField(t('settings.serveRunStaleTimeout'), runStaleTimeout),
    applicationField(t('settings.serveRunMaxDuration'), runMaxDuration),
    applicationField(t('settings.serveAgentBackgroundRunMax'), agentBackgroundRunMax),
  );
  root.appendChild(agentCard.card);

  const lobsterCard = applicationCard(t('settings.serveLobsterMode'), t('settings.serveLobsterModeDesc'));
  const lobsterMode = applicationToggle(t('settings.serveLobsterMode'), view.lobsterMode === true);
  lobsterCard.grid.append(lobsterMode.field);
  root.appendChild(lobsterCard.card);

  save.addEventListener('click', () => {
    const webUIEnabled = webUIFeature.input.checked;
    const cronEnabledValue = cronEnabled.input.checked;
    const memoryEnabledValue = memoryEnabled.input.checked;
    const multiAgentValue = multiAgentFeature.input.checked;
    void saveServeConfig(save, {
      api: {
        listen: listen.value.trim(),
        defaultMode: defaultMode.value,
        defaultThinkingLevel: defaultThinking.value,
        enableSubAgents: multiAgentValue,
        enableDelegate: enableDelegate.input.checked,
        enableWorkflows: enableWorkflows.input.checked,
        enableWebSearch: enableWebSearch.input.checked,
        enableBrowser: enableBrowser.input.checked,
        enableArtifact: enableArtifact.input.checked,
        enableA2AMaster: enableA2AMaster.input.checked,
        toolVisibility: { mode: toolMode.value, detail: toolDetail.value },
        systemPromptMode: systemPromptMode.value,
        requestTimeoutSeconds: applicationInteger(requestTimeout, 1),
        backgroundRunMaxSeconds: applicationInteger(backgroundRunMax, 1),
        maxConcurrentRequests: applicationInteger(maxConcurrent, 0),
        logLevel: logLevel.value,
        session: {
          idleTimeoutSeconds: applicationInteger(idleTimeout, 1),
          maxSessions: applicationInteger(maxSessions, 0),
        },
      },
      features: {
        webUI: webUIEnabled,
        openAIAPI: openAIAPIFeature.input.checked,
        multiAgent: multiAgentValue,
        cron: cronEnabledValue,
        memory: memoryEnabledValue,
      },
      webUI: { enabled: webUIEnabled, dir: webUIDir.value.trim() },
      cron: { enabled: cronEnabledValue, interval: applicationInteger(cronInterval, 1) },
      memory: { enabled: memoryEnabledValue, path: memoryPath.value.trim() },
      security: { smartApprovals: smartApprovals.input.checked },
      agent: {
        maxTurns: applicationInteger(maxTurns, 1),
        budgetPressure: budgetPressure.input.checked,
        contextPressure: contextPressure.input.checked,
        budgetPressureThreshold: applicationFloat(budgetThreshold, 0, 1),
        contextPressureThreshold: applicationFloat(contextThreshold, 0, 1),
        runStaleTimeoutSeconds: applicationInteger(runStaleTimeout, 1),
        runMaxDurationSeconds: applicationInteger(runMaxDuration, 1),
        backgroundRunMaxSecs: applicationInteger(agentBackgroundRunMax, 1),
      },
      lobsterMode: lobsterMode.input.checked,
    });
  });
  container.appendChild(root);
}

function applicationFloatInput(value: number, min: number, max: number, step: number): HTMLInputElement {
  const input = applicationInput(String(value), 'number');
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  return input;
}

function applicationFloat(input: HTMLInputElement, min: number, max: number): number {
  const value = Number(input.value);
  if (Number.isFinite(value) && value >= min && value <= max) return value;
  return min;
}

async function saveServeConfig(button: HTMLButtonElement, patch: Record<string, unknown>): Promise<void> {
  button.disabled = true;
  const label = button.textContent;
  button.textContent = t('settings.serveSaving');
  try {
    const updated = await invoke<ServeConfigView>('mothx/manage/serve/patch', { patch });
    cache.serve = updated;
    await renderServe();
    toast(t('settings.serveSaved'));
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  } finally {
    button.disabled = false;
    button.textContent = label || t('settings.serveSave');
  }
}

async function renderProviders(): Promise<void> {
  const container = require$('#manage-providers');
  if (!hasFeature('manageProviders') && !hasFeature('manageSettings')) {
    unsupportedRow(container, 'manageProviders');
    return;
  }
  const view = await guard('manageSettings', () => invoke<SettingsView>('mothx/manage/settings/get', {}), cache.settings);
  cache.settings = view || cache.settings;
  const catalog = await guard('manageProviders', () => invoke<ProviderCatalog>('mothx/manage/providers/list', {}), cache.providerCatalog);
  cache.providerCatalog = catalog || cache.providerCatalog;
  container.textContent = '';
  if (hasFeature('manageProviderConfig') && cache.providerCatalog?.providerConfigs) {
    renderProviderWorkspace(container, cache.settings || {}, cache.providerCatalog);
    return;
  }
  const providers = cache.settings?.providers || [];
  if (providers.length === 0) {
    unsupportedRow(container, 'manageSettings');
    return;
  }
  for (const provider of providers) {
    const row = el('div', 'row-item');
    const icon = el('div', 'row-icon');
    icon.appendChild(iconSpan('cpu'));
    const main = el('div', 'row-main');
    const title = el('div', 'row-title');
    title.appendChild(el('span', '', provider.name));
    if (cache.settings?.defaultProvider === provider.name) {
      title.appendChild(el('span', 'badge badge-accent', t('settings.isDefault')));
    }
    const desc = el('div', 'row-desc');
    desc.textContent = [provider.maskedKey || 'no-key', provider.baseUrl, provider.modelCount ? `${provider.modelCount} models` : '']
      .filter(Boolean)
      .join(' · ');
    main.append(title, desc);
    row.append(icon, main);
    const test = el('button', 'btn-ghost', t('settings.test'));
    test.addEventListener('click', () => {
      void testProvider(provider.name);
    });
    row.appendChild(test);
    const setKey = el('button', 'btn-ghost', t('settings.setKey'));
    setKey.addEventListener('click', () => {
      void setProviderKey(provider.name);
    });
    row.appendChild(setKey);
    if (cache.settings?.defaultProvider !== provider.name) {
      const makeDefault = el('button', 'btn-ghost', t('settings.default'));
      makeDefault.addEventListener('click', () => {
        void patchSettings({ defaultProvider: provider.name });
      });
      row.appendChild(makeDefault);
    }
    container.appendChild(row);
  }
}

// Render the provider/model management workspace:
// 1) a default-runtime card at the top
// 2) a two-pane catalog + tabbed editor below
function renderProviderWorkspace(container: HTMLElement, settings: SettingsView, catalog: ProviderCatalog): void {
  container.className = 'provider-workspace';
  const providers = catalog.providerConfigs || [];
  if (!providerDraft || (!providers.some((provider) => provider.id === activeProviderID) && providerDraft.id !== activeProviderID)) {
    const initial = providers.find((provider) => provider.id === activeProviderID)
      || providers.find((provider) => provider.id === settings.defaultProvider || provider.isDefault)
      || providers.find((provider) => provider.globalOverride || provider.apiKeyConfigured)
      || providers[0];
    if (initial) {
      activeProviderID = initial.id;
      providerDraft = buildProviderDraft(initial);
      providerEditorTab = 'connection';
    }
  }

  const defaultsCard = renderDefaultRuntimeCard(settings, catalog);
  container.appendChild(defaultsCard);

  const workspace = el('div', 'provider-catalog-layout');
  const catalogPane = el('div', 'provider-catalog-pane');
  const editorPane = el('div', 'provider-editor-pane');
  workspace.append(catalogPane, editorPane);
  container.appendChild(workspace);

  renderProviderCatalog(catalogPane, settings, catalog, editorPane);
  renderProviderEditor(editorPane, settings, catalog);
}

// These are the provider configuration fields that Desktop can truthfully
// render today. The data itself is always a secret-safe ACP projection of the
// shared config schema; the renderer owns only temporary form inputs.
function renderDefaultRuntimeCard(settings: SettingsView, catalog: ProviderCatalog): HTMLElement {
  const card = el('div', 'provider-defaults-card');
  card.appendChild(el('div', 'provider-section-title', t('settings.providerDefaults')));
  card.appendChild(el('div', 'row-desc', t('settings.providerDefaultsDesc')));

  const providers = catalog.providerConfigs || [];
  const providerSelect = document.createElement('select');
  providerSelect.className = 'settings-select';
  const modelSelect = document.createElement('select');
  modelSelect.className = 'settings-select';
  const thinkingSelect = document.createElement('select');
  thinkingSelect.className = 'settings-select';

  for (const level of ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']) {
    const option = document.createElement('option');
    option.value = level;
    option.textContent = level;
    thinkingSelect.appendChild(option);
  }

  const selectedProvider = settings.defaultProvider || catalog.defaultProvider || providers[0]?.id || '';
  for (const provider of providers) {
    const option = document.createElement('option');
    option.value = provider.id;
    option.textContent = provider.id;
    providerSelect.appendChild(option);
  }
  providerSelect.value = selectedProvider;
  thinkingSelect.value = settings.thinkingLevel || 'medium';

  const rebuildModels = (preferred = '') => {
    modelSelect.textContent = '';
    const choices = (catalog.models || []).filter((model) => model.provider === providerSelect.value && model.id);
    for (const model of choices) {
      const option = document.createElement('option');
      option.value = String(model.id);
      option.textContent = model.name && model.name !== model.id ? `${model.id} · ${model.name}` : String(model.id);
      modelSelect.appendChild(option);
    }
    const fallback = choices[0]?.id || '';
    modelSelect.value = choices.some((model) => model.id === preferred) ? preferred : fallback;
  };
  rebuildModels(settings.defaultModel || catalog.defaultModel || '');
  providerSelect.addEventListener('change', () => rebuildModels());

  const controls = el('div', 'provider-default-controls');
  controls.append(
    labeledControl(t('settings.defaultProviderLabel'), providerSelect),
    labeledControl(t('settings.defaultModelLabel'), modelSelect),
    labeledControl(t('settings.thinkingLabel'), thinkingSelect),
  );
  const saveDefaults = el('button', 'btn-primary provider-save-defaults', t('settings.saveDefaults'));
  saveDefaults.addEventListener('click', () => {
    void patchSettings({
      defaultProvider: providerSelect.value,
      defaultModel: modelSelect.value,
      thinkingLevel: thinkingSelect.value,
    });
  });
  controls.appendChild(saveDefaults);

  card.appendChild(controls);
  return card;
}

function renderProviderCatalog(
  container: HTMLElement,
  settings: SettingsView,
  catalog: ProviderCatalog,
  editorPane: HTMLElement,
): void {
  const header = el('div', 'provider-catalog-header');
  header.appendChild(el('div', 'provider-section-title', t('settings.providerCatalog')));

  const search = document.createElement('input');
  search.className = 'provider-catalog-search';
  search.type = 'search';
  search.placeholder = t('settings.providerCatalogSearch');
  search.value = providerSearch;
  search.addEventListener('input', () => {
    providerSearch = search.value.trim().toLowerCase();
    renderList();
  });

  const scopeToggle = el('div', 'provider-scope-toggle');
  const configuredBtn = el('button', providerCatalogScope === 'configured' ? 'active' : '', t('settings.scopeConfigured'));
  const allBtn = el('button', providerCatalogScope === 'all' ? 'active' : '', t('settings.scopeAll'));
  configuredBtn.addEventListener('click', () => {
    providerCatalogScope = 'configured';
    updateScopeButtons();
    renderList();
  });
  allBtn.addEventListener('click', () => {
    providerCatalogScope = 'all';
    updateScopeButtons();
    renderList();
  });
  scopeToggle.append(configuredBtn, allBtn);

  const controls = el('div', 'provider-catalog-controls');
  controls.append(search, scopeToggle);

  const list = el('div', 'provider-catalog-list');
  const addBtn = el('button', 'btn-ghost provider-catalog-add', t('settings.addProvider'));
  addBtn.prepend(iconSpan('plus'));
  addBtn.addEventListener('click', async () => {
    const id = await promptModal({ title: t('settings.newProvider'), initialValue: 'provider', okLabel: t('modal.ok'), cancelLabel: t('modal.cancel') });
    if (!id) return;
    const trimmed = id.trim();
    if (!trimmed) return;
    const configs = catalog.providerConfigs || [];
    if (configs.some((p) => p.id === trimmed)) {
      toast(t('settings.providerIDExists'));
      selectProvider(trimmed, catalog, editorPane);
      return;
    }
    providerDraft = { id: trimmed, provider: { api: 'openai-chat', models: [] }, globalOverride: true };
    activeProviderID = trimmed;
    providerEditorTab = 'connection';
    renderProviderEditor(editorPane, settings, catalog);
    renderList();
  });

  container.append(header, controls, list, addBtn);

  function updateScopeButtons(): void {
    configuredBtn.className = providerCatalogScope === 'configured' ? 'active' : '';
    allBtn.className = providerCatalogScope === 'all' ? 'active' : '';
  }

  function renderList(): void {
    list.textContent = '';
    const items = filteredProviders(catalog);
    if (items.length === 0) {
      list.appendChild(el('div', 'provider-catalog-empty', t('settings.noProviders')));
      return;
    }
    for (const provider of items) {
      const row = el('div', `provider-catalog-item ${provider.id === activeProviderID ? 'active' : ''}`);
      const identity = el('div', 'provider-catalog-identity');
      identity.appendChild(iconSpan('cpu'));
      const main = el('div', 'provider-catalog-main');
      const title = el('div', 'provider-catalog-title');
      title.appendChild(el('span', '', provider.id));
      if (provider.isDefault) {
        title.appendChild(el('span', 'badge badge-accent', t('settings.isDefault')));
      }
      if (provider.globalOverride) {
        title.appendChild(el('span', 'badge badge-blue', t('settings.configured')));
      }
      main.appendChild(title);
      const meta = [provider.maskedKey || t('settings.noKey'), provider.provider.baseUrl, `${providerModels(provider).length} ${t('settings.models')}`]
        .filter(Boolean)
        .join(' · ');
      main.appendChild(el('div', 'provider-catalog-meta', meta));
      identity.appendChild(main);
      row.appendChild(identity);
      row.addEventListener('click', () => {
        selectProvider(provider.id, catalog, editorPane);
      });
      list.appendChild(row);
    }
  }

  renderList();
}

function filteredProviders(catalog: ProviderCatalog): ProviderConfigView[] {
  const configs = [...(catalog.providerConfigs || [])];
  if (providerDraft && !configs.some((provider) => provider.id === providerDraft?.id)) configs.push(providerDraft);
  const search = providerSearch;
  const visible = configs.filter((provider) => {
    if (providerCatalogScope === 'configured' && !provider.globalOverride && !provider.apiKeyConfigured && !provider.isDefault) return false;
    if (!search) return true;
    return [provider.id, provider.provider.vendor, provider.provider.baseUrl, provider.maskedKey]
      .filter(Boolean).join(' ').toLowerCase().includes(search);
  });
  return visible;
}

function selectProvider(id: string, catalog: ProviderCatalog, editorPane: HTMLElement): void {
  const provider = (catalog.providerConfigs || []).find((p) => p.id === id);
  if (!provider) return;
  activeProviderID = id;
  providerDraft = buildProviderDraft(provider);
  providerEditorTab = 'connection';
  renderProviderEditor(editorPane, cache.settings || {}, catalog);
  // Re-render catalog to update active highlight.
  void renderProviders();
}

function buildProviderDraft(provider: ProviderConfigView): ProviderConfigView {
  return {
    id: provider.id,
    provider: {
      vendor: provider.provider.vendor,
      baseUrl: provider.provider.baseUrl,
      httpProxy: provider.provider.httpProxy,
      forceHTTP11: provider.provider.forceHTTP11,
      api: provider.provider.api,
      thinkingFormat: provider.provider.thinkingFormat,
      cacheControl: provider.provider.cacheControl,
      maxImagesPerRequest: provider.provider.maxImagesPerRequest,
      models: providerModels(provider).map((model) => ({ ...model, input: [...(model.input || [])] })),
    },
    maskedKey: provider.maskedKey,
    apiKeyConfigured: provider.apiKeyConfigured,
    isDefault: provider.isDefault,
    globalOverride: provider.globalOverride,
  };
}

function renderProviderEditor(container: HTMLElement, settings: SettingsView, catalog: ProviderCatalog): void {
  container.textContent = '';
  const provider = providerDraft;
  if (!provider) {
    container.appendChild(el('div', 'provider-editor-empty', t('settings.noProviderSelected')));
    return;
  }

  const header = el('div', 'provider-editor-header');
  const identity = el('div', 'provider-editor-identity');
  identity.appendChild(iconSpan('cpu', 'md'));
  const titleWrap = el('div', 'provider-editor-title-wrap');
  const title = el('div', 'provider-editor-title', provider.id);
  if (provider.isDefault) {
    title.appendChild(el('span', 'badge badge-accent', t('settings.isDefault')));
  }
  titleWrap.appendChild(title);
  titleWrap.appendChild(el('div', 'provider-editor-subtitle', [provider.provider.vendor || '', provider.provider.baseUrl || ''].filter(Boolean).join(' · ') || ' '));
  identity.appendChild(titleWrap);
  header.appendChild(identity);

  const actions = el('div', 'provider-editor-header-actions');
  const test = el('button', 'btn-ghost', t('settings.test')) as HTMLButtonElement;
  const canTest = (catalog.providerConfigs || []).some((candidate) => candidate.id === provider.id);
  test.disabled = !canTest;
  if (!canTest) test.title = t('settings.saveProviderFirst');
  test.addEventListener('click', () => { void testProvider(provider.id, providerModels(provider)[0]?.id ? String(providerModels(provider)[0].id) : undefined); });
  const save = el('button', 'btn-primary', t('settings.saveProvider'));
  save.addEventListener('click', () => { void saveProviderFromDraft(provider, settings, catalog); });
  actions.append(test, save);
  header.appendChild(actions);

  const tabBar = el('div', 'provider-editor-tabs');
  const tabs: { key: ProviderEditorTab; label: string }[] = [
    { key: 'connection', label: t('settings.connectionTab') },
    { key: 'models', label: t('settings.modelsTab') },
    { key: 'advanced', label: t('settings.advancedTab') },
  ];
  for (const tab of tabs) {
    const btn = el('button', tab.key === providerEditorTab ? 'active' : '', tab.label);
    btn.addEventListener('click', () => {
      providerEditorTab = tab.key;
      renderProviderEditor(container, settings, catalog);
    });
    tabBar.appendChild(btn);
  }

  const body = el('div', 'provider-editor-body');
  if (providerEditorTab === 'connection') {
    body.appendChild(renderConnectionPanel(provider, catalog));
  } else if (providerEditorTab === 'models') {
    body.appendChild(renderModelsPanel(provider));
  } else {
    body.appendChild(renderAdvancedPanel(provider, settings, catalog));
  }

  container.append(header, tabBar, body);
}

function renderConnectionPanel(provider: ProviderConfigView, catalog: ProviderCatalog): HTMLElement {
  const panel = el('div', 'provider-tab-panel');
  const grid = el('div', 'provider-form-grid connection-grid');
  const isNew = !provider.globalOverride && !(catalog.providerConfigs || []).some((p) => p.id === provider.id && p.globalOverride);

  const idInput = providerInput(t('settings.providerID'), provider.id, 'text');
  idInput.disabled = !isNew;
  const vendor = providerInput(t('settings.providerVendor'), provider.provider.vendor || '');
  const api = providerSelect(t('settings.providerAPI'), provider.provider.api || 'openai-chat', ['openai-chat', 'openai-responses', 'anthropic-messages', 'google-gemini', 'google-vertex']);
  const baseURL = providerInput(t('settings.providerBaseURL'), provider.provider.baseUrl || '');
  const apiKey = providerInput(t('settings.providerAPIKey'), '', 'password');
  apiKey.placeholder = provider.maskedKey || t('settings.keyUnchanged');
  const proxy = providerInput(t('settings.httpProxy'), provider.provider.httpProxy || '');
  const forceHTTP11 = document.createElement('input');
  forceHTTP11.type = 'checkbox';
  forceHTTP11.checked = provider.provider.forceHTTP11 === true;

  grid.append(
    labeledControl(t('settings.providerID'), idInput),
    labeledControl(t('settings.providerVendor'), vendor),
    labeledControl(t('settings.providerAPI'), api),
    labeledControl(t('settings.providerBaseURL'), baseURL),
    labeledControl(t('settings.providerAPIKey'), apiKey),
    labeledControl(t('settings.httpProxy'), proxy),
    labeledControl(t('settings.forceHTTP11'), forceHTTP11),
  );

  // Bind changes back to the draft.
  idInput.addEventListener('input', () => { provider.id = idInput.value.trim() || provider.id; });
  vendor.addEventListener('input', () => { provider.provider.vendor = vendor.value.trim(); });
  api.addEventListener('change', () => { provider.provider.api = api.value; });
  baseURL.addEventListener('input', () => { provider.provider.baseUrl = baseURL.value.trim(); });
  proxy.addEventListener('input', () => { provider.provider.httpProxy = proxy.value.trim(); });
  forceHTTP11.addEventListener('change', () => { provider.provider.forceHTTP11 = forceHTTP11.checked; });
  apiKey.value = draftSecret(provider);
  apiKey.addEventListener('input', () => { setDraftSecret(provider, apiKey.value); });

  panel.appendChild(grid);
  return panel;
}

function renderModelsPanel(provider: ProviderConfigView): HTMLElement {
  const panel = el('div', 'provider-tab-panel');
  const models = provider.provider.models || (provider.provider.models = []);

  const header = el('div', 'provider-list-heading');
  header.appendChild(el('div', 'provider-section-title', t('settings.models')));
  const modelActions = el('div', 'provider-actions');
  const addModel = el('button', 'btn-ghost', t('settings.addModel'));
  const discover = el('button', 'btn-ghost', t('settings.discoverModels'));
  modelActions.append(addModel, discover);
  header.appendChild(modelActions);
  panel.appendChild(header);

  const list = el('div', 'provider-model-list');
  panel.appendChild(list);

  const renderList = () => {
    list.textContent = '';
    if (models.length === 0) {
      list.appendChild(el('div', 'row-desc', t('settings.noModels')));
      return;
    }
    for (const model of models) {
      const row = el('div', 'provider-model-row');
      const id = providerInput(t('settings.modelID'), String(model.id || ''));
      const name = providerInput(t('settings.modelName'), String(model.name || ''));
      const context = providerInput(t('settings.modelContext'), model.contextWindow ? String(model.contextWindow) : '', 'number');
      const maxTokens = providerInput(t('settings.modelMaxTokens'), model.maxTokens ? String(model.maxTokens) : '', 'number');
      const input = providerInput(t('settings.modelInput'), (model.input || []).join(', '));
      const reasoning = document.createElement('input');
      reasoning.type = 'checkbox';
      reasoning.checked = model.reasoning === true;
      row.append(
        labeledControl(t('settings.modelID'), id), labeledControl(t('settings.modelName'), name),
        labeledControl(t('settings.modelContext'), context), labeledControl(t('settings.modelMaxTokens'), maxTokens),
        labeledControl(t('settings.modelInput'), input), labeledControl(t('settings.modelReasoning'), reasoning),
      );
      const remove = el('button', 'btn-deny', t('settings.removeModel'));
      remove.addEventListener('click', () => {
        const index = models.indexOf(model);
        if (index >= 0) models.splice(index, 1);
        renderList();
      });
      row.appendChild(remove);
      id.addEventListener('input', () => { model.id = id.value; });
      name.addEventListener('input', () => { model.name = name.value; });
      context.addEventListener('input', () => { model.contextWindow = numberInput(context.value); });
      maxTokens.addEventListener('input', () => { model.maxTokens = numberInput(maxTokens.value); });
      input.addEventListener('input', () => { model.input = input.value.split(',').map((item) => item.trim()).filter(Boolean); });
      reasoning.addEventListener('change', () => { model.reasoning = reasoning.checked; });
      list.appendChild(row);
    }
  };

  addModel.addEventListener('click', () => {
    models.push({ id: '', name: '', input: ['text'] });
    renderList();
  });
  discover.addEventListener('click', () => {
    const connection = draftConnectionFields(provider);
    void discoverProviderModels(connection, models, renderList);
  });
  renderList();

  return panel;
}

function renderAdvancedPanel(provider: ProviderConfigView, settings: SettingsView, catalog: ProviderCatalog): HTMLElement {
  const panel = el('div', 'provider-tab-panel');
  const grid = el('div', 'provider-form-grid');
  const thinking = providerInput(t('settings.providerThinkingFormat'), provider.provider.thinkingFormat || '');
  const imageLimit = providerInput(t('settings.maxImagesPerRequest'), provider.provider.maxImagesPerRequest === undefined ? '' : String(provider.provider.maxImagesPerRequest), 'number');
  const clearKey = document.createElement('input');
  clearKey.type = 'checkbox';
  clearKey.checked = draftClearKey(provider);

  grid.append(
    labeledControl(t('settings.providerThinkingFormat'), thinking),
    labeledControl(t('settings.maxImagesPerRequest'), imageLimit),
    labeledControl(t('settings.clearProviderKey'), clearKey),
  );

  thinking.addEventListener('input', () => { provider.provider.thinkingFormat = thinking.value.trim(); });
  imageLimit.addEventListener('input', () => { provider.provider.maxImagesPerRequest = imageLimitInput(imageLimit.value); });
  clearKey.addEventListener('change', () => {
    setDraftClearKey(provider, clearKey.checked);
  });

  if (provider.globalOverride) {
    const danger = el('div', 'provider-danger-zone');
    danger.appendChild(el('div', 'provider-section-title', t('settings.dangerZone')));
    const reset = el('button', 'btn-deny', t('settings.resetProvider')) as HTMLButtonElement;
    reset.disabled = provider.isDefault === true;
    if (reset.disabled) reset.title = t('settings.resetDefaultBlocked');
    reset.addEventListener('click', () => {
      if (reset.disabled || !confirmDialog(t('settings.confirmResetProvider', { n: provider.id }))) return;
      void deleteProvider(provider.id);
    });
    danger.appendChild(reset);
    panel.appendChild(danger);
  }

  panel.appendChild(grid);
  return panel;
}

function labeledControl(label: string, control: HTMLElement): HTMLElement {
  const wrapper = el('label', 'provider-default-control');
  wrapper.appendChild(el('span', '', label));
  wrapper.appendChild(control);
  return wrapper;
}

function providerModels(provider: ProviderConfigView): ProviderModelView[] {
  return (provider.provider.models || []).map((model) => ({ ...model, input: [...(model.input || [])] }));
}

function providerInput(_label: string, value: string, type = 'text'): HTMLInputElement {
  const input = document.createElement('input');
  input.className = 'settings-input';
  input.type = type;
  input.value = value;
  return input;
}

function providerSelect(_label: string, value: string, options: string[]): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'settings-select';
  for (const choice of options) {
    const option = document.createElement('option');
    option.value = choice;
    option.textContent = choice;
    select.appendChild(option);
  }
  if (!options.includes(value) && value) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
  select.value = value || options[0] || '';
  return select;
}

function numberInput(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function imageLimitInput(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= -1 ? parsed : undefined;
}

type ProviderDraftInternal = ProviderConfigView & {
  __desktopApiKey?: string;
  __desktopClearKey?: boolean;
};

function draftSecret(provider: ProviderConfigView): string {
  return (provider as ProviderDraftInternal).__desktopApiKey || '';
}

function setDraftSecret(provider: ProviderConfigView, value: string): void {
  (provider as ProviderDraftInternal).__desktopApiKey = value;
}

function draftClearKey(provider: ProviderConfigView): boolean {
  return (provider as ProviderDraftInternal).__desktopClearKey === true;
}

function setDraftClearKey(provider: ProviderConfigView, value: boolean): void {
  (provider as ProviderDraftInternal).__desktopClearKey = value;
}

function draftConnectionFields(provider: ProviderConfigView): {
  api: HTMLSelectElement; baseURL: HTMLInputElement; apiKey: HTMLInputElement; proxy: HTMLInputElement; forceHTTP11: HTMLInputElement;
} {
  const api = providerSelect(t('settings.providerAPI'), provider.provider.api || 'openai-chat', ['openai-chat', 'openai-responses', 'anthropic-messages', 'google-gemini', 'google-vertex']);
  const baseURL = providerInput(t('settings.providerBaseURL'), provider.provider.baseUrl || '');
  const apiKey = providerInput(t('settings.providerAPIKey'), draftSecret(provider), 'password');
  const proxy = providerInput(t('settings.httpProxy'), provider.provider.httpProxy || '');
  const forceHTTP11 = document.createElement('input');
  forceHTTP11.type = 'checkbox';
  forceHTTP11.checked = provider.provider.forceHTTP11 === true;
  return { api, baseURL, apiKey, proxy, forceHTTP11 };
}

async function discoverProviderModels(
  fields: { api: HTMLSelectElement; baseURL: HTMLInputElement; apiKey: HTMLInputElement; proxy: HTMLInputElement; forceHTTP11: HTMLInputElement },
  models: ProviderModelView[],
  render: () => void,
): Promise<void> {
  try {
    const result = await invoke<{ models?: ProviderModelView[] }>('mothx/manage/providers/discover', {
      api: fields.api.value, baseUrl: fields.baseURL.value.trim(), apiKey: fields.apiKey.value.trim(),
      httpProxy: fields.proxy.value.trim(), forceHTTP11: fields.forceHTTP11.checked,
    });
    let added = 0;
    for (const model of result.models || []) {
      const id = String(model.id || '').trim();
      if (!id || models.some((entry) => entry.id === id)) continue;
      models.push({ ...model, id, name: String(model.name || id), input: [...(model.input || ['text'])] });
      added += 1;
    }
    render();
    toast(t('settings.modelsDiscovered', { n: added }));
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
}

async function saveProviderFromDraft(provider: ProviderConfigView, settings: SettingsView, catalog: ProviderCatalog): Promise<void> {
  const nextID = provider.id.trim();
  if (!nextID) {
    toast(t('settings.providerIDRequired'));
    return;
  }
  const models = providerModels(provider);
  if (models.some((model) => !String(model.id || '').trim())) {
    toast(t('settings.modelIDRequired'));
    return;
  }
  const value: Record<string, unknown> = {
    vendor: provider.provider.vendor?.trim(), api: provider.provider.api?.trim(), baseUrl: provider.provider.baseUrl?.trim(),
    httpProxy: provider.provider.httpProxy?.trim(), forceHTTP11: provider.provider.forceHTTP11 === true,
    thinkingFormat: provider.provider.thinkingFormat?.trim(), models,
  };
  const max = provider.provider.maxImagesPerRequest;
  if (max !== undefined) value.maxImagesPerRequest = max;
  const previousProvider = (catalog.providerConfigs || []).find((p) => p.id === activeProviderID);
  const request: Record<string, unknown> = { id: nextID, provider: value };
  if (previousProvider && nextID !== previousProvider.id) request.previousId = previousProvider.id;

  // The API key stays only in the transient renderer draft. It is never copied
  // into the ACP catalog, local storage, or a settings projection.
  if (draftSecret(provider).trim()) {
    request.apiKey = draftSecret(provider).trim();
  } else if (draftClearKey(provider)) {
    request.apiKey = '';
  }

  try {
    await invoke<ProviderCatalog>('mothx/manage/providers/save', request);
    activeProviderID = nextID;
    providerDraft = undefined;
    cache.settings = undefined;
    cache.providerCatalog = undefined;
    await renderProviders();
    await refreshDraftConfigOptions();
    toast(t('settings.providerSaved'));
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
}

async function saveProvider(request: Record<string, unknown>): Promise<void> {
  try {
    await invoke<ProviderCatalog>('mothx/manage/providers/save', request);
    cache.settings = undefined;
    cache.providerCatalog = undefined;
    await renderProviders();
    await refreshDraftConfigOptions();
    toast(t('settings.providerSaved'));
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
}

async function deleteProvider(id: string): Promise<void> {
  try {
    await invoke<ProviderCatalog>('mothx/manage/providers/delete', { id });
    if (activeProviderID === id) activeProviderID = '';
    providerDraft = undefined;
    cache.settings = undefined;
    cache.providerCatalog = undefined;
    await renderProviders();
    await refreshDraftConfigOptions();
    toast(t('settings.providerReset'));
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
}

async function testProvider(name: string, model?: string): Promise<void> {
  const result = await guard('manageProviders', () => invoke<{ ok?: boolean; latencyMs?: number; error?: string }>('mothx/manage/providers/test', { provider: name, model }), null);
  if (!result) return;
  if (result.ok) toast(t('settings.testOk', { n: name, ms: result.latencyMs ?? 0 }));
  else toast(t('settings.testFail', { n: name, e: result.error || 'unknown' }));
}

async function setProviderKey(name: string): Promise<void> {
  const key = await promptModal({ title: t('settings.keyModalTitle', { n: name }), initialValue: '', okLabel: t('modal.ok'), cancelLabel: t('modal.cancel') });
  if (!key) return;
  await patchSettings({ providerKey: { name, key } });
}

async function patchSettings(patch: Record<string, unknown>): Promise<void> {
  const view = await guard('manageSettings', () => invoke<SettingsView>('mothx/manage/settings/patch', { patch }), null);
  if (view) {
    cache.settings = view;
    cache.providerCatalog = undefined;
    await renderProviders();
    await refreshDraftConfigOptions();
  }
}

async function renderKnowledgeBases(): Promise<void> {
  const container = require$('#manage-knowledge-bases');
  if (!hasFeature('manageKnowledgeBases')) {
    unsupportedRow(container, 'manageKnowledgeBases');
    return;
  }
  const result = await guard('manageKnowledgeBases', () => invoke<{ knowledgeBases?: KnowledgeBaseView[] }>('mothx/manage/knowledge-bases/list', {}), null);
  if (result) cache.knowledgeBases = result.knowledgeBases || [];
  container.textContent = '';
  if (!cache.knowledgeBases) {
    unsupportedRow(container, 'manageKnowledgeBases');
    return;
  }

  const header = el('div', 'application-settings-header');
  const copy = el('div');
  copy.append(
    el('div', 'provider-section-eyebrow', t('settings.knowledge')),
    el('div', 'provider-section-title', t('settings.knowledgeTitle')),
    el('div', 'row-desc', t('settings.knowledgeDesc')),
  );
  const add = el('button', 'btn-primary', t('settings.knowledgeAdd')) as HTMLButtonElement;
  add.appendChild(iconSpan('plus', 'sm'));
  add.addEventListener('click', () => {
    creatingKnowledgeBase = true;
    void renderKnowledgeBases();
  });
  header.append(copy, add);
  container.appendChild(header);

  const defaults = await knowledgeBaseDefaults();
  const mcpResult = hasFeature('manageMcp')
    ? await guard('manageMcp', () => invoke<{ servers?: McpServerView[] }>('mothx/manage/mcp/list', {}), null)
    : null;
  if (mcpResult) cache.mcp = mcpResult.servers || [];
  const mcpServers = cache.mcp || [];
  for (const view of cache.knowledgeBases) {
    container.appendChild(await renderKnowledgeBaseEditor(view, defaults, false, mcpServers));
  }
  if (creatingKnowledgeBase) {
    container.appendChild(await renderKnowledgeBaseEditor(undefined, defaults, true, mcpServers));
  }
  if (!creatingKnowledgeBase && cache.knowledgeBases.length === 0) {
    container.appendChild(el('div', 'row-desc', t('settings.knowledgeEmpty')));
  }
}

async function knowledgeBaseDefaults(): Promise<{ spec: KnowledgeBaseSpec; providers: string[]; models: ProviderCatalog['models'] }> {
  const settings = cache.settings || await guard('manageSettings', () => invoke<SettingsView>('mothx/manage/settings/get', {}), {});
  cache.settings = settings || cache.settings;
  let catalog = cache.providerCatalog;
  if (!catalog && hasFeature('manageProviders')) {
    catalog = await guard('manageProviders', () => invoke<ProviderCatalog>('mothx/manage/providers/list', {}), undefined);
    cache.providerCatalog = catalog || cache.providerCatalog;
  }
  const providerNames = (catalog?.providers || settings?.providers || []).map((provider) => String(provider.name || '').trim()).filter(Boolean);
  const provider = settings?.defaultProvider || catalog?.defaultProvider || providerNames[0] || '';
  const allModels = catalog?.models || [];
  const model = settings?.defaultModel || catalog?.defaultModel || knowledgeBaseModels(allModels, provider)[0] || '';
  return {
    spec: {
      name: '', rootDir: '', preprocessProfile: 'documents', provider, model,
      mode: settings?.defaultMode || 'yolo', thinkingLevel: settings?.thinkingLevel || '',
      schedule: 'manual', enabled: true,
    },
    providers: providerNames,
    models: allModels,
  };
}

function knowledgeBaseModels(models: ProviderCatalog['models'], provider: string): string[] {
  return (models || [])
    .filter((model) => String(model.provider || '') === provider)
    .map((model) => String(model.id || '').trim())
    .filter(Boolean);
}

function knowledgeBaseSelect(value: string, options: string[]): HTMLSelectElement {
  return applicationSelect(value, options.length > 0 ? options : value ? [value] : ['']);
}

function replaceKnowledgeBaseSelectOptions(select: HTMLSelectElement, value: string, options: string[]): void {
  select.textContent = '';
  const choices = options.length > 0 ? options : value ? [value] : [''];
  for (const choice of choices) {
    const option = document.createElement('option');
    option.value = choice;
    option.textContent = choice || t('settings.knowledgeNoModels');
    select.appendChild(option);
  }
  select.value = choices.includes(value) ? value : choices[0] || '';
}

async function renderKnowledgeBaseEditor(view: KnowledgeBaseView | undefined, defaults: { spec: KnowledgeBaseSpec; providers: string[]; models: ProviderCatalog['models'] }, creating: boolean, mcpServers: McpServerView[] = []): Promise<HTMLElement> {
  const base = view?.knowledgeBase;
  const source = base ? { ...base } : { ...defaults.spec };
  const card = applicationCard(base ? base.name : t('settings.knowledgeNew'), base ? knowledgeBaseStatus(view) : t('settings.knowledgeNewDesc'));
  const name = applicationInput(source.name);
  const root = applicationInput(source.rootDir);
  const rootField = applicationField(t('settings.knowledgeRootDir'), root, true);
  const choose = el('button', 'btn-ghost', t('settings.knowledgeChooseRoot')) as HTMLButtonElement;
  choose.type = 'button';
  choose.appendChild(iconSpan('folder', 'sm'));
  choose.addEventListener('click', async () => {
    const selected = await desktop.chooseDirectory(root.value.trim() || undefined);
    if (selected) root.value = selected;
  });
  rootField.appendChild(choose);

  const profile = knowledgeBaseSelect(source.preprocessProfile, ['documents', 'code', 'notes', 'mixed']);
  const provider = knowledgeBaseSelect(source.provider, defaults.providers);
  const model = knowledgeBaseSelect(source.model, knowledgeBaseModels(defaults.models, provider.value));
  provider.addEventListener('change', () => {
    const choices = knowledgeBaseModels(defaults.models, provider.value);
    replaceKnowledgeBaseSelectOptions(model, choices[0] || '', choices);
  });
  const mode = knowledgeBaseSelect(source.mode, ['yolo', 'agent', 'plan', 'os']);
  const thinking = applicationInput(source.thinkingLevel || '');
  const schedule = applicationInput(source.schedule || 'manual');
  schedule.placeholder = 'manual / hourly / daily / @every 6h / 5-field cron';
  const enabled = applicationToggle(t('settings.knowledgeEnabled'), source.enabled !== false);
  card.grid.append(
    applicationField(t('settings.knowledgeName'), name), rootField,
    applicationField(t('settings.knowledgeProfile'), profile), applicationField(t('settings.knowledgeProvider'), provider),
    applicationField(t('settings.knowledgeModel'), model), applicationField(t('settings.knowledgeMode'), mode),
    applicationField(t('settings.knowledgeThinking'), thinking), applicationField(t('settings.knowledgeSchedule'), schedule),
    enabled.field,
  );

  if (view?.snapshot) {
    const stats = el('div', 'row-desc');
    stats.textContent = t('settings.knowledgeStats', {
      f: view.snapshot.fileCount ?? 0, c: view.snapshot.chunkCount ?? 0,
      n: view.snapshot.nodeCount ?? 0, e: view.snapshot.edgeCount ?? 0,
    });
    card.card.appendChild(stats);
  }

  if (base && hasFeature('manageMcp')) {
    const mcpName = knowledgeBaseMcpName(base.id);
    const mcpEntry = mcpServers.find((server) => server.name === mcpName);
    const willEnable = !mcpEntry || mcpEntry.enabled === false;
    const mcpSection = el('div', 'application-settings-card');
    const mcpHead = el('div', 'application-settings-card-head');
    mcpHead.append(
      el('div', 'provider-section-title', t('settings.knowledgeMcpTitle')),
      el('div', 'row-desc', t('settings.knowledgeMcpDesc')),
    );
    mcpSection.appendChild(mcpHead);
    const mcpBody = el('div', 'application-settings-grid');
    const mcpStatus = el('div', 'row-desc');
    mcpStatus.textContent = mcpEntry
      ? (mcpEntry.enabled === false ? t('settings.knowledgeMcpDisabled') : t('settings.knowledgeMcpEnabled'))
      : t('settings.knowledgeMcpNotConfigured');
    const mcpHint = el('div', 'row-desc', t('settings.knowledgeMcpHint'));
    const mcpAction = el('button', 'btn-ghost', willEnable
      ? (mcpEntry ? t('settings.knowledgeMcpEnable') : t('settings.knowledgeMcpConfigure'))
      : t('settings.knowledgeMcpDisable')) as HTMLButtonElement;
    mcpAction.type = 'button';
    mcpAction.addEventListener('click', async () => {
      mcpAction.disabled = true;
      try {
        await applyKnowledgeBaseMcp(base.id, willEnable, mcpServers);
        toast(t('settings.knowledgeMcpSaved'));
        await renderKnowledgeBases();
      } catch (error) {
        toast(error instanceof Error ? error.message : String(error));
        mcpAction.disabled = false;
      }
    });
    mcpBody.append(mcpStatus, mcpAction, mcpHint);
    mcpSection.appendChild(mcpBody);
    card.card.appendChild(mcpSection);
  }

  const actions = el('div', 'provider-editor-actions');
  const save = el('button', 'btn-primary', creating ? t('settings.knowledgeCreate') : t('settings.knowledgeSave')) as HTMLButtonElement;
  const cancel = el('button', 'btn-ghost', t('modal.cancel')) as HTMLButtonElement;
  cancel.type = 'button';
  cancel.addEventListener('click', () => {
    if (creating) {
      creatingKnowledgeBase = false;
      void renderKnowledgeBases();
    }
  });
  save.addEventListener('click', async () => {
    const knowledgeBase: KnowledgeBaseSpec = {
      name: name.value.trim(), rootDir: root.value.trim(), preprocessProfile: profile.value,
      provider: provider.value, model: model.value, mode: mode.value, thinkingLevel: thinking.value.trim(),
      schedule: schedule.value.trim(), enabled: enabled.input.checked,
    };
    try {
      if (creating) {
        await invoke('mothx/manage/knowledge-bases/create', { knowledgeBase });
        creatingKnowledgeBase = false;
        toast(t('settings.knowledgeCreated'));
      } else if (base) {
        await invoke('mothx/manage/knowledge-bases/update', { id: base.id, knowledgeBase });
        toast(t('settings.knowledgeSaved'));
      }
      await renderKnowledgeBases();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    }
  });
  actions.append(save, cancel);
  if (base) {
    const scan = el('button', 'btn-ghost', t('settings.knowledgeScan')) as HTMLButtonElement;
    scan.type = 'button';
    scan.disabled = source.enabled === false;
    scan.addEventListener('click', async () => {
      scan.disabled = true;
      try {
        await invoke('mothx/manage/knowledge-bases/scan', { id: base.id });
        toast(t('settings.knowledgeScanned'));
        await renderKnowledgeBases();
      } catch (error) {
        toast(error instanceof Error ? error.message : String(error));
      } finally {
        scan.disabled = source.enabled === false;
      }
    });
    const remove = el('button', 'btn-deny', t('settings.knowledgeDelete')) as HTMLButtonElement;
    remove.type = 'button';
    remove.addEventListener('click', async () => {
      if (!confirmDialog(t('settings.knowledgeDeleteConfirm', { n: base.name }))) return;
      try {
        await invoke('mothx/manage/knowledge-bases/delete', { id: base.id });
        toast(t('settings.knowledgeDeleted'));
        await renderKnowledgeBases();
      } catch (error) {
        toast(error instanceof Error ? error.message : String(error));
      }
    });
    actions.append(scan, remove);
  }
  card.card.appendChild(actions);
  return card.card;
}

function knowledgeBaseStatus(view: KnowledgeBaseView): string {
  const base = view.knowledgeBase;
  if (!base.enabled) return t('settings.knowledgeDisabled');
  if (!view.snapshot) return t('settings.knowledgeUnindexed');
  const status = view.status || view.snapshot.status;
  return t('settings.knowledgeStatus', { s: status || t('settings.knowledgeUnindexed') });
}

function knowledgeBaseMcpName(baseId: string): string {
  return `knowledge-${baseId}`;
}

async function applyKnowledgeBaseMcp(baseId: string, enabled: boolean, currentServers: McpServerView[]): Promise<void> {
  const name = knowledgeBaseMcpName(baseId);
  const existing = currentServers.find((server) => server.name === name);
  const command = state.appInfo.runtimeBinary || 'mothx';
  const canonical: McpServerView = {
    name,
    type: 'stdio',
    command,
    args: ['knowledge-mcp', 'serve', '--knowledge-base', baseId],
    enabled,
  };
  // The list projection includes env/header key names for display. mcp/set
  // deliberately rejects those read-only fields, so submit only its writable
  // standard MCP schema and let ACP preserve secret values by server name.
  const writable = (server: McpServerView): McpServerView => ({
    name: server.name, type: server.type, command: server.command, args: server.args,
    url: server.url, messageUrl: server.messageUrl, enabled: server.enabled,
  });
  const others = currentServers.filter((server) => server.name !== name).map(writable);
  if (enabled) {
    // Enable/configure: upsert the deterministic stdio server with the canonical command/args.
    const server = existing ? { ...writable(existing), ...canonical } : canonical;
    await invoke('mothx/manage/mcp/set', { servers: [...others, server] });
  } else {
    // Disable: retain every other entry and only flip the deterministic server's enabled flag.
    const server = existing ? { ...writable(existing), enabled: false } : { ...canonical, enabled: false };
    await invoke('mothx/manage/mcp/set', { servers: [...others, server] });
  }
}

async function renderSkills(): Promise<void> {
  const container = require$('#manage-skills');
  if (!hasFeature('manageSkills')) {
    unsupportedRow(container, 'manageSkills');
    return;
  }
  const skills = await guard('manageSkills', () => invoke<{ skills?: SkillView[] }>('mothx/manage/skills/list', {}).then((r) => r.skills || []), cache.skills);
  cache.skills = skills || cache.skills;
  container.textContent = '';
  const list = cache.skills || [];
  if (list.length === 0) {
    unsupportedRow(container, 'manageSkills');
    return;
  }
  for (const skill of list) {
    const row = el('div', 'row-item');
    const icon = el('div', 'row-icon');
    icon.appendChild(iconSpan('zap'));
    const main = el('div', 'row-main');
    main.appendChild(el('div', 'row-title', skill.name));
    main.appendChild(el('div', 'row-desc', [skill.description, skill.source].filter(Boolean).join(' · ')));
    row.append(icon, main);
    const toggle = el('button', 'btn-ghost', skill.enabled === false ? t('settings.off') : t('settings.on'));
    if (skill.enabled !== false) toggle.classList.add('selected');
    toggle.addEventListener('click', () => {
      void invoke('mothx/manage/skills/set', { name: skill.name, enabled: skill.enabled === false })
        .then(() => renderSkills())
        .catch((error: unknown) => toast(error instanceof Error ? error.message : String(error)));
    });
    row.appendChild(toggle);
    container.appendChild(row);
  }
}

async function renderSkillHub(): Promise<void> {
  const container = require$('#manage-skillhub');
  if (!hasFeature('manageSkillHub')) {
    unsupportedRow(container, 'manageSkillHub');
    return;
  }
  const view = await guard('manageSkillHub', () => invoke<SkillHubView>('mothx/manage/skillhub/get', {}), cache.skillHub);
  cache.skillHub = view || cache.skillHub;
  container.textContent = '';
  const current = cache.skillHub;
  if (!current) {
    unsupportedRow(container, 'manageSkillHub');
    return;
  }
  // Keep the loaded view stable for the editor callbacks below. The cache may
  // be refreshed by another settings render while this form is still open.
  const skillHub = current;
  const root = el('div', 'application-settings-workspace');
  const header = el('div', 'application-settings-header');
  const copy = el('div');
  copy.append(
    el('div', 'provider-section-eyebrow', t('settings.skillhub')),
    el('div', 'provider-section-title', t('settings.skillhubTitle')),
    el('div', 'row-desc', t('settings.skillhubDesc')),
  );
  const save = el('button', 'btn-primary', t('settings.skillhubSave')) as HTMLButtonElement;
  header.append(copy, save);
  root.appendChild(header);

  const defaultsCard = applicationCard(t('settings.skillhubDefaults'), t('settings.skillhubDefaultsDesc'));
  const defaultMarket = applicationInput(skillHub.defaultMarket || '');
  const defaultScope = applicationSelect(skillHub.defaultInstallScope || 'project', ['project', 'global']);
  const officialHandles = applicationTextarea((skillHub.officialHandles || []).join('\n'), 3);
  defaultsCard.grid.append(
    applicationField(t('settings.skillhubDefaultMarket'), defaultMarket),
    applicationField(t('settings.skillhubDefaultScope'), defaultScope),
    applicationField(t('settings.skillhubOfficialHandles'), officialHandles, true),
  );
  root.appendChild(defaultsCard.card);

  const marketsCard = applicationCard(t('settings.skillhubMarkets'), t('settings.skillhubMarketsDesc'));
  const marketList = el('div', 'skillhub-market-list');
  const marketEditors: Array<{
    id: HTMLInputElement; name: HTMLInputElement; siteURL: HTMLInputElement; apiURL: HTMLInputElement;
    enabled: HTMLInputElement; token: HTMLInputElement; clearToken: HTMLInputElement;
  }> = [];

  function renderMarketEditors(markets: SkillHubMarketView[]): void {
    marketList.textContent = '';
    marketEditors.length = 0;
    for (const market of markets) {
      const item = el('div', 'skillhub-market-item');
      const idInput = applicationInput(market.id);
      idInput.readOnly = true;
      const nameInput = applicationInput(market.name || '');
      const siteURLInput = applicationInput(market.siteURL || '');
      const apiURLInput = applicationInput(market.apiURL || '');
      const enabled = applicationToggle(t('settings.skillhubMarketEnabled'), market.enabled !== false);
      const token = applicationInput('', 'password');
      token.placeholder = market.apiTokenConfigured ? t('settings.skillhubTokenConfigured') : t('settings.skillhubTokenUnset');
      const clearToken = applicationToggle(t('settings.skillhubClearToken'), false);
      const remove = el('button', 'btn-deny', t('settings.skillhubMarketRemove')) as HTMLButtonElement;
      remove.addEventListener('click', () => {
        const next = skillHub.markets?.filter((entry) => entry.id !== market.id) || [];
        skillHub.markets = next;
        renderMarketEditors(next);
      });
      const fields = el('div', 'skillhub-market-fields');
      fields.append(
        applicationField(t('settings.skillhubMarketId'), idInput),
        applicationField(t('settings.skillhubMarketName'), nameInput),
        applicationField(t('settings.skillhubMarketSiteURL'), siteURLInput),
        applicationField(t('settings.skillhubMarketApiURL'), apiURLInput),
        enabled.field,
        applicationField(t('settings.skillhubMarketToken'), token),
        clearToken.field,
      );
      item.append(fields, remove);
      marketList.appendChild(item);
      marketEditors.push({ id: idInput, name: nameInput, siteURL: siteURLInput, apiURL: apiURLInput, enabled: enabled.input, token, clearToken: clearToken.input });
    }
  }

  renderMarketEditors(skillHub.markets || []);
  const addRow = el('div', 'application-settings-field');
  const add = el('button', 'btn-ghost') as HTMLButtonElement;
  add.appendChild(iconSpan('plus'));
  add.appendChild(el('span', '', t('settings.skillhubMarketAdd')));
  add.addEventListener('click', async () => {
    const id = await promptModal({ title: t('settings.skillhubMarketId'), initialValue: '', okLabel: t('modal.ok'), cancelLabel: t('modal.cancel') });
    if (!id || !id.trim()) return;
    const trimmed = id.trim();
    if (skillHub.markets?.some((entry) => entry.id === trimmed)) {
      toast(t('settings.skillhubMarketIdExists'));
      return;
    }
    const next = [...(skillHub.markets || []), { id: trimmed, name: '', siteURL: '', apiURL: '', enabled: true, apiTokenConfigured: false }];
    skillHub.markets = next;
    renderMarketEditors(next);
  });
  addRow.appendChild(add);
  marketsCard.grid.append(marketList, addRow);
  root.appendChild(marketsCard.card);

  save.addEventListener('click', async () => {
    save.disabled = true;
    const label = save.textContent;
    save.textContent = t('settings.skillhubSaving');
    try {
      const markets = marketEditors.map((editor) => ({
        id: editor.id.value.trim(),
        name: editor.name.value.trim(),
        siteURL: editor.siteURL.value.trim(),
        apiURL: editor.apiURL.value.trim(),
        enabled: editor.enabled.checked,
        ...(editor.clearToken.checked ? { clearApiToken: true } : editor.token.value.trim() ? { apiToken: editor.token.value.trim() } : {}),
      }));
      const patch: Record<string, unknown> = {
        defaultMarket: defaultMarket.value.trim(),
        defaultInstallScope: defaultScope.value,
        officialHandles: applicationLines(officialHandles.value),
        markets,
      };
      const updated = await invoke<SkillHubView>('mothx/manage/skillhub/patch', { patch });
      cache.skillHub = updated;
      await renderSkillHub();
      toast(t('settings.skillhubSaved'));
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    } finally {
      save.disabled = false;
      save.textContent = label || t('settings.skillhubSave');
    }
  });

  container.appendChild(root);
}

async function renderMcp(): Promise<void> {
  const container = require$('#manage-mcp');
  if (!hasFeature('manageMcp')) {
    unsupportedRow(container, 'manageMcp');
    return;
  }
  const result = await guard('manageMcp', () => invoke<{ servers?: McpServerView[] }>('mothx/manage/mcp/list', {}), null);
  if (result) cache.mcp = result.servers || [];
  container.textContent = '';
  for (const server of cache.mcp || []) {
    const row = el('div', 'row-item');
    const icon = el('div', 'row-icon');
    icon.appendChild(iconSpan('globe'));
    const main = el('div', 'row-main');
    main.appendChild(el('div', 'row-title', server.name));
    main.appendChild(el('div', 'row-desc', [server.command ? `stdio: ${server.command}` : server.url, server.enabled === false ? t('settings.off') : t('settings.on'), server.envKeys?.length ? `env: ${server.envKeys.join(',')}` : ''].filter(Boolean).join(' · ')));
    row.append(icon, main);
    const remove = el('button', 'btn-deny', t('settings.mcpRemove'));
    remove.addEventListener('click', () => {
      const next = (cache.mcp || []).filter((entry) => entry.name !== server.name);
      void invoke('mothx/manage/mcp/set', { servers: next })
        .then(() => renderMcp())
        .catch((error: unknown) => toast(error instanceof Error ? error.message : String(error)));
    });
    row.appendChild(remove);
    container.appendChild(row);
  }
  const addRow = el('div', 'row-item');
  const add = el('button', 'btn-ghost');
  add.appendChild(iconSpan('plus'));
  add.appendChild(el('span', '', t('settings.mcpAdd')));
  add.addEventListener('click', () => {
    void addMcpServer();
  });
  addRow.appendChild(add);
  container.appendChild(addRow);
}

async function addMcpServer(): Promise<void> {
  const name = await promptModal({ title: t('settings.mcpName'), initialValue: '', okLabel: t('modal.ok'), cancelLabel: t('modal.cancel') });
  if (!name) return;
  const target = await promptModal({ title: t('settings.mcpCommand'), initialValue: '', okLabel: t('modal.ok'), cancelLabel: t('modal.cancel') });
  const servers = [...(cache.mcp || [])];
  if (target && target.trim()) {
    const parts = target.trim().split(/\s+/);
    servers.push({ name, command: parts[0], args: parts.slice(1), enabled: true });
  } else {
    const url = await promptModal({ title: t('settings.mcpUrl'), initialValue: 'http://', okLabel: t('modal.ok'), cancelLabel: t('modal.cancel') });
    if (!url) return;
    servers.push({ name, url, enabled: true });
  }
  try {
    await invoke('mothx/manage/mcp/set', { servers });
    await renderMcp();
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
}

async function renderMemory(): Promise<void> {
  const input = require$('#manage-memory-input') as HTMLTextAreaElement;
  const save = require$('#manage-memory-save') as HTMLButtonElement;
  if (!hasFeature('manageMemory')) {
    input.disabled = true;
    input.placeholder = t('manage.unsupported');
    save.disabled = true;
    return;
  }
  input.disabled = false;
  save.disabled = false;
  const result = await guard('manageMemory', () => invoke<{ content?: string }>('mothx/manage/memory/get', {}), null);
  if (result) cache.memory = result.content || '';
  input.value = cache.memory || '';
}

export function bindManage(): void {
  require$('#manage-memory-save').addEventListener('click', async () => {
    const input = require$('#manage-memory-input') as HTMLTextAreaElement;
    try {
      const result = await invoke<{ size?: number }>('mothx/manage/memory/put', { content: input.value });
      toast(t('settings.memorySaved', { n: result?.size ?? input.value.length }));
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    }
  });
}

async function renderCron(): Promise<void> {
  const container = require$('#manage-cron');
  if (!hasFeature('manageCron')) {
    unsupportedRow(container, 'manageCron');
    return;
  }
  const result = await guard('manageCron', () => invoke<{ jobs?: CronJobView[] }>('mothx/manage/cron/list', {}), null);
  cache.cron = result?.jobs || cache.cron;
  const jobs = cache.cron || [];
  container.textContent = '';

  const root = el('div', 'application-settings-workspace cron-settings-workspace');
  const header = el('div', 'application-settings-header');
  const copy = el('div');
  copy.append(
    el('div', 'provider-section-eyebrow', t('automation.title')),
    el('div', 'provider-section-title', t('automation.subtitle')),
  );
  const add = el('button', 'btn-primary', t('automation.new')) as HTMLButtonElement;
  add.prepend(iconSpan('plus'));
  add.addEventListener('click', () => {
    cronDraft = { id: '', name: '', schedule: '', prompt: '', mode: 'yolo', enabled: true };
    void renderCron();
  });
  header.append(copy, add);
  root.appendChild(header);

  const list = el('div', 'row-list cron-job-list');
  if (jobs.length === 0) {
    list.appendChild(el('div', 'row-item', t('automation.empty')));
  }
  for (const job of jobs) {
    const row = el('div', 'row-item cron-job-row');
    const icon = el('div', 'row-icon');
    icon.appendChild(iconSpan('clock'));
    const main = el('div', 'row-main');
    const title = el('div', 'row-title');
    title.appendChild(el('span', '', job.name || job.id));
    const statusClass = job.enabled === false ? 'st-pending' : 'st-working';
    const statusLabel = job.enabled === false ? t('automation.paused') : t('automation.active');
    title.appendChild(el('span', `status-chip ${statusClass}`, statusLabel));
    const meta = [
      job.schedule,
      job.mode,
      job.workDir,
      job.lastRun ? `${t('automation.lastRun')}: ${formatCronTime(job.lastRun)}${job.lastStatus ? ` · ${job.lastStatus}` : ''}` : '',
      job.lastError ? `${t('automation.lastError')}: ${job.lastError}` : '',
      job.nextRun ? `next: ${formatCronTime(job.nextRun)}` : '',
      job.runCount ? `runs: ${job.runCount}` : '',
      job.provider ? `provider: ${job.provider}` : '',
      job.model ? `model: ${job.model}` : '',
    ].filter(Boolean).join(' · ');
    const desc = el('div', 'row-desc', [meta, job.prompt].filter(Boolean).join(' \u2014 '));
    main.append(title, desc);
    row.append(icon, main);

    const run = el('button', 'btn-ghost', t('automation.runNow')) as HTMLButtonElement;
    run.prepend(iconSpan('zap'));
    run.addEventListener('click', () => {
      void invoke('mothx/manage/cron/run', { id: job.id })
        .then(() => toast(t('automation.ran')))
        .catch((error: unknown) => toast(error instanceof Error ? error.message : String(error)));
    });
    const toggle = el('button', 'btn-ghost', job.enabled === false ? t('automation.resume') : t('automation.pause')) as HTMLButtonElement;
    toggle.addEventListener('click', () => {
      void invoke('mothx/manage/cron/update', { id: job.id, enabled: job.enabled === false })
        .then(() => {
          toast(t('automation.updated'));
          return renderCron();
        })
        .catch((error: unknown) => toast(error instanceof Error ? error.message : String(error)));
    });
    const edit = el('button', 'btn-ghost', t('automation.edit')) as HTMLButtonElement;
    edit.addEventListener('click', () => {
      cronDraft = { ...job };
      void renderCron();
    });
    const remove = el('button', 'btn-deny', t('automation.delete')) as HTMLButtonElement;
    remove.addEventListener('click', () => {
      if (!confirmDialog(t('automation.confirmDelete'))) return;
      void invoke('mothx/manage/cron/remove', { id: job.id })
        .then(() => {
          toast(t('automation.removed'));
          if (cronDraft?.id === job.id) cronDraft = undefined;
          return renderCron();
        })
        .catch((error: unknown) => toast(error instanceof Error ? error.message : String(error)));
    });
    row.append(run, toggle, edit, remove);
    list.appendChild(row);
  }
  root.appendChild(list);

  if (cronDraft) {
    root.appendChild(renderCronEditor(jobs));
  }
  container.appendChild(root);
}

function formatCronTime(value: string): string {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  } catch {
    return value;
  }
}

function renderCronEditor(jobs: CronJobView[]): HTMLElement {
  const isNew = !cronDraft?.id;
  const card = el('div', 'application-settings-card cron-editor-card');
  const head = el('div', 'application-settings-card-head');
  head.append(
    el('div', 'provider-section-title', isNew ? t('automation.new') : t('automation.name')),
    el('div', 'row-desc', isNew ? '' : cronDraft?.id || ''),
  );
  card.appendChild(head);

  const grid = el('div', 'application-settings-grid');
  const nameInput = applicationInput(cronDraft?.name || '');
  const scheduleInput = applicationInput(cronDraft?.schedule || '');
  const promptInput = applicationTextarea(cronDraft?.prompt || '', 4);
  const modeSelect = applicationSelect(cronDraft?.mode || 'yolo', ['agent', 'yolo']);
  const enabledToggle = applicationToggle(t('automation.enabled'), cronDraft?.enabled !== false);

  grid.append(
    applicationField(t('automation.name'), nameInput),
    applicationField(t('automation.schedule'), scheduleInput),
    applicationField(t('automation.mode'), modeSelect),
    enabledToggle.field,
    applicationField(t('automation.prompt'), promptInput, true),
  );
  card.appendChild(grid);

  const actions = el('div', 'cron-editor-actions');
  const save = el('button', 'btn-primary', t('settings.applicationSave')) as HTMLButtonElement;
  save.textContent = isNew ? t('automation.new') : t('settings.applicationSave');
  const base = cronDraft!;
  save.addEventListener('click', () => {
    void saveCronDraft({
      ...base,
      name: nameInput.value.trim(),
      schedule: scheduleInput.value.trim(),
      prompt: promptInput.value.trim(),
      mode: modeSelect.value,
      enabled: enabledToggle.input.checked,
    });
  });
  const cancel = el('button', 'btn-ghost', t('modal.cancel')) as HTMLButtonElement;
  cancel.addEventListener('click', () => {
    cronDraft = undefined;
    void renderCron();
  });
  actions.append(save, cancel);
  card.appendChild(actions);
  return card;
}

async function saveCronDraft(draft: CronJobView): Promise<void> {
  if (!draft.name || !draft.schedule || !draft.prompt) {
    toast(t('prompt.empty'));
    return;
  }
  try {
    if (!draft.id) {
      await invoke('mothx/manage/cron/create', {
        name: draft.name,
        schedule: draft.schedule,
        prompt: draft.prompt,
        mode: draft.mode || 'yolo',
        enabled: draft.enabled !== false,
      });
      toast(t('automation.created'));
    } else {
      await invoke('mothx/manage/cron/update', {
        id: draft.id,
        name: draft.name,
        schedule: draft.schedule,
        prompt: draft.prompt,
        mode: draft.mode || 'yolo',
        enabled: draft.enabled !== false,
      });
      toast(t('automation.updated'));
    }
    cronDraft = undefined;
    cache.cron = undefined;
    await renderCron();
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
}

async function renderStats(): Promise<void> {
  const container = require$('#manage-stats');
  const chart = require$('#manage-stats-chart');
  if (!hasFeature('manageStats')) {
    container.textContent = '';
    container.appendChild(el('div', 'card', t('manage.unsupported')));
    chart.textContent = '';
    return;
  }
  const summary = await guard('manageStats', () => invoke<StatsSummary>('mothx/manage/stats/summary', {}), cache.stats);
  cache.stats = summary || cache.stats;
  const series = await guard('manageStats', () => invoke<{ points?: StatsPoint[] }>('mothx/manage/stats/timeseries', { group: 'day', days: 14 }).catch(() => ({ points: [] })), { points: [] });
  cache.points = series?.points || [];
  container.textContent = '';
  const s = cache.stats || {};
  const cards: [string, string][] = [
    [t('stats.sessions'), String(s.sessions ?? 0)],
    [t('stats.runs'), String(s.runs ?? 0)],
    [t('stats.tokens'), String((s.tokens?.input ?? 0) + (s.tokens?.output ?? 0))],
    [t('stats.cost'), s.cost ? `$${s.cost.toFixed(4)}` : '$0'],
  ];
  for (const [label, value] of cards) {
    const card = el('div', 'card');
    card.appendChild(el('div', 'card-title', label));
    card.appendChild(el('div', 'card-desc', value));
    container.appendChild(card);
  }
  chart.textContent = '';
  const max = Math.max(1, ...cache.points.map((p) => p.runs || 0));
  for (const point of cache.points) {
    const bar = el('div', '');
    const height = Math.round(((point.runs || 0) / max) * 70) + 4;
    bar.style.width = '14px';
    bar.style.height = `${height}px`;
    bar.style.background = point.runs ? 'var(--accent)' : 'var(--placeholder-bg)';
    bar.style.borderRadius = '3px';
    bar.title = `${point.date || ''} · ${point.runs || 0} runs`;
    chart.appendChild(bar);
  }
}

// ---------------------------------------------------------------------------
// Expert team (主角团) management
// ---------------------------------------------------------------------------

function expertWorkspace(): string {
  return state.activeSessionCwd || state.newSessionCwd || '';
}

async function renderExperts(): Promise<void> {
  const container = require$('#manage-experts');
  if (!hasFeature('manageExperts')) {
    unsupportedRow(container, 'manageExperts');
    return;
  }
  const scope = expertScope;
  const cwd = scope === 'project' ? expertWorkspace() : undefined;
  const params: Record<string, unknown> = { scope };
  if (cwd) params.cwd = cwd;

  const view = await guard('manageExperts', () => invoke<ExpertListView>('mothx/manage/experts/list', params), cache.experts);
  cache.experts = view || cache.experts;
  container.textContent = '';
  if (!cache.experts) {
    unsupportedRow(container, 'manageExperts');
    return;
  }
  renderExpertsWorkspace(container, cache.experts);
}

function renderExpertsWorkspace(container: HTMLElement, listView: ExpertListView): void {
  const scope = (listView.scope || expertScope) as ExpertScope;
  const cwd = listView.cwd || expertWorkspace();

  const root = el('div', 'application-settings-workspace');
  const header = el('div', 'application-settings-header');
  const copy = el('div');
  copy.append(
    el('div', 'provider-section-eyebrow', t('settings.experts')),
    el('div', 'provider-section-title', t('settings.expertsTitle')),
    el('div', 'row-desc', t('settings.expertsDesc')),
  );
  const add = el('button', 'btn-primary', t('settings.expertsAdd')) as HTMLButtonElement;
  add.prepend(iconSpan('plus', 'sm'));
  add.addEventListener('click', () => {
    void createExpertDraft();
  });
  header.append(copy, add);
  root.appendChild(header);

  const scopeCard = applicationCard(t('settings.expertsScope'), t('settings.expertsScopeDesc'));
  const scopeToggle = el('div', 'provider-scope-toggle');
  const globalBtn = el('button', scope === 'global' ? 'active' : '', t('settings.expertsScopeGlobal'));
  const projectBtn = el('button', scope === 'project' ? 'active' : '', t('settings.expertsScopeProject'));
  globalBtn.addEventListener('click', () => {
    if (expertScope === 'global') return;
    expertScope = 'global';
    expertDraft = undefined;
    creatingExpert = false;
    cache.experts = undefined;
    void renderExperts();
  });
  projectBtn.addEventListener('click', () => {
    if (expertScope === 'project') return;
    if (!expertWorkspace()) {
      toast(t('settings.expertsProjectCwdRequired'));
      return;
    }
    expertScope = 'project';
    expertDraft = undefined;
    creatingExpert = false;
    cache.experts = undefined;
    void renderExperts();
  });
  scopeToggle.append(globalBtn, projectBtn);
  scopeCard.grid.appendChild(scopeToggle);
  if (scope === 'project') {
    scopeCard.grid.appendChild(el('div', 'row-desc', t('settings.expertsProjectCwd', { w: cwd })));
  }
  root.appendChild(scopeCard.card);

  if (expertDraft) {
    root.appendChild(renderExpertEditor(listView));
  }

  const listCard = applicationCard(t('settings.expertsCatalog'), t('settings.expertsCatalogDesc'));
  const list = el('div', 'row-list');
  const items = listView.effectiveExperts || listView.experts || [];
  if (items.length === 0) {
    list.appendChild(el('div', 'row-item', t('settings.expertsEmpty')));
  }
  for (const item of items) {
    list.appendChild(renderExpertRow(item, scope));
  }
  listCard.grid.appendChild(list);
  root.appendChild(listCard.card);

  container.appendChild(root);
}

function renderExpertRow(item: ExpertSummary, scope: ExpertScope): HTMLElement {
  const row = el('div', 'row-item');
  const iconBox = el('div', 'row-icon');
  iconBox.appendChild(iconSpan(item.source === 'builtin' ? 'book' : 'users'));
  const main = el('div', 'row-main');
  const title = el('div', 'row-title');
  title.appendChild(el('span', '', displayName(item)));
  const sourceBadge = el('span', `badge ${item.source === 'builtin' ? 'badge-blue' : 'badge-accent'}`, sourceLabel(item.source));
  title.appendChild(sourceBadge);
  if (item.invalid) {
    title.appendChild(el('span', 'badge', t('settings.expertsInvalid')));
  }
  const detail = [item.name, item.expertType, item.invalidReason].filter(Boolean).join(' · ');
  main.append(title, el('div', 'row-desc', detail));
  row.append(iconBox, main);

  if (item.source !== 'builtin') {
    const canEdit = item.source === scope;
    const edit = el('button', 'btn-ghost', t('settings.expertsEdit')) as HTMLButtonElement;
    edit.disabled = !canEdit;
    if (!canEdit) edit.title = t('settings.expertsEditScopeHint');
    edit.addEventListener('click', () => {
      if (!canEdit) return;
      void editExpert(scope, item.name);
    });
    const remove = el('button', 'btn-deny', t('settings.expertsDelete')) as HTMLButtonElement;
    remove.disabled = !canEdit;
    if (!canEdit) remove.title = t('settings.expertsDeleteScopeHint');
    remove.addEventListener('click', () => {
      if (!canEdit) return;
      if (!confirmDialog(t('settings.expertsDeleteConfirm', { n: item.name }))) return;
      void deleteExpert(scope, item.name);
    });
    row.append(edit, remove);
  }
  return row;
}

function displayName(item: ExpertSummary): string {
  if (item.displayName) {
    const locale = getLocale();
    if (locale === 'en') return item.displayName.en || item.displayName.zh || item.name;
    return item.displayName.zh || item.displayName.en || item.name;
  }
  return item.name;
}

function sourceLabel(source?: string): string {
  if (source === 'builtin') return t('settings.expertsBuiltin');
  if (source === 'project') return t('settings.expertsProject');
  if (source === 'global') return t('settings.expertsGlobal');
  return source || '';
}

async function createExpertDraft(): Promise<void> {
  const name = await promptModal({ title: t('settings.expertsNewName'), initialValue: '', okLabel: t('modal.ok'), cancelLabel: t('modal.cancel') });
  const trimmed = name?.trim();
  if (!trimmed) return;
  creatingExpert = true;
  expertDraft = {
    scope: expertScope,
    manifest: {
      schemaVersion: 1,
      name: trimmed,
      expertType: 'agent',
      agentName: 'lead',
      displayName: { zh: '', en: '' },
      members: [{ id: 'lead', name: { zh: '主角', en: 'Lead' }, role: 'lead' }],
    },
    agents: {
      lead: '---\nname: lead\n---\n',
    },
  };
  void renderExperts();
}

async function editExpert(scope: ExpertScope, name: string): Promise<void> {
  const params: Record<string, unknown> = { scope, name };
  const cwd = scope === 'project' ? expertWorkspace() : undefined;
  if (cwd) params.cwd = cwd;
  try {
    const result = await invoke<ExpertListView>('mothx/manage/experts/get', params);
    if (result?.bundle) {
      creatingExpert = false;
      expertDraft = result.bundle as ExpertBundle;
      void renderExperts();
    }
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
}

function renderExpertEditor(listView: ExpertListView): HTMLElement {
  const draft = expertDraft!;
  const isNew = creatingExpert;
  const card = applicationCard(isNew ? t('settings.expertNew') : draft.manifest.name, isNew ? t('settings.expertNewDesc') : t('settings.expertEditDesc'));

  const nameInput = applicationInput(draft.manifest.name);
  nameInput.disabled = !isNew;
  const displayZh = applicationInput(draft.manifest.displayName?.zh || '');
  const displayEn = applicationInput(draft.manifest.displayName?.en || '');
  const typeSelect = applicationSelect(draft.manifest.expertType || 'agent', ['agent', 'team']);
  const agentName = applicationInput(draft.manifest.agentName || '');
  const categoryId = applicationInput(draft.manifest.categoryId || '');

  card.grid.append(
    applicationField(t('settings.expertName'), nameInput),
    applicationField(t('settings.expertDisplayZh'), displayZh),
    applicationField(t('settings.expertDisplayEn'), displayEn),
    applicationField(t('settings.expertType'), typeSelect),
    applicationField(t('settings.expertAgentName'), agentName),
    applicationField(t('settings.expertCategoryId'), categoryId),
  );

  const membersCard = applicationCard(t('settings.expertMembers'), t('settings.expertMembersDesc'));
  const membersList = el('div', 'provider-model-list');
  const memberEditors: Array<{ id: HTMLInputElement; role: HTMLSelectElement; nameZh: HTMLInputElement; nameEn: HTMLInputElement }> = [];
  const members = [...(draft.manifest.members || [])];

  function renderMemberEditors(): void {
    membersList.textContent = '';
    memberEditors.length = 0;
    for (const member of members) {
      const row = el('div', 'provider-model-row');
      const idInput = applicationInput(member.id || '');
      idInput.disabled = true;
      const roleSelect = applicationSelect(member.role || 'member', ['lead', 'member']);
      const nameZhInput = applicationInput(member.name?.zh || '');
      const nameEnInput = applicationInput(member.name?.en || '');
      const remove = el('button', 'btn-deny', t('settings.expertRemoveAgent')) as HTMLButtonElement;
      remove.addEventListener('click', () => {
        const idx = members.indexOf(member);
        if (idx >= 0) members.splice(idx, 1);
        renderMemberEditors();
      });
      row.append(
        labeledControl(t('settings.expertMemberId'), idInput),
        labeledControl(t('settings.expertMemberRole'), roleSelect),
        labeledControl(t('settings.expertMemberNameZh'), nameZhInput),
        labeledControl(t('settings.expertMemberNameEn'), nameEnInput),
        remove,
      );
      membersList.appendChild(row);
      memberEditors.push({ id: idInput, role: roleSelect, nameZh: nameZhInput, nameEn: nameEnInput });
    }
  }
  renderMemberEditors();

  const addMember = el('button', 'btn-ghost', t('settings.expertAddMember')) as HTMLButtonElement;
  addMember.prepend(iconSpan('plus', 'sm'));
  addMember.addEventListener('click', async () => {
    const id = await promptModal({ title: t('settings.expertMemberId'), initialValue: '', okLabel: t('modal.ok'), cancelLabel: t('modal.cancel') });
    const trimmed = id?.trim();
    if (!trimmed) return;
    if (members.some((member) => member.id === trimmed)) {
      toast(t('settings.expertMemberIdExists'));
      return;
    }
    members.push({ id: trimmed, name: { zh: '', en: '' }, role: 'member' });
    renderMemberEditors();
  });
  membersCard.grid.append(membersList, addMember);
  card.card.appendChild(membersCard.card);

  const agentsCard = applicationCard(t('settings.expertAgents'), t('settings.expertAgentsDesc'));
  const agentsList = el('div', 'provider-model-list');
  const agentEditors: Array<{ id: HTMLInputElement; source: HTMLTextAreaElement }> = [];
  const agents = { ...(draft.agents || {}) };

  function renderAgentEditors(): void {
    agentsList.textContent = '';
    agentEditors.length = 0;
    for (const [id, source] of Object.entries(agents)) {
      const row = el('div', 'provider-model-row');
      const idInput = applicationInput(id);
      idInput.disabled = true;
      const sourceInput = applicationTextarea(source, 5);
      const remove = el('button', 'btn-deny', t('settings.expertRemoveAgent')) as HTMLButtonElement;
      remove.addEventListener('click', () => {
        delete agents[id];
        renderAgentEditors();
      });
      row.append(labeledControl(t('settings.expertAgentId'), idInput), labeledControl(t('settings.expertAgentSource'), sourceInput), remove);
      agentsList.appendChild(row);
      agentEditors.push({ id: idInput, source: sourceInput });
    }
  }
  renderAgentEditors();

  const addAgent = el('button', 'btn-ghost', t('settings.expertAddAgent')) as HTMLButtonElement;
  addAgent.prepend(iconSpan('plus', 'sm'));
  addAgent.addEventListener('click', async () => {
    const id = await promptModal({ title: t('settings.expertAgentId'), initialValue: '', okLabel: t('modal.ok'), cancelLabel: t('modal.cancel') });
    const trimmed = id?.trim();
    if (!trimmed) return;
    if (agents[trimmed] !== undefined) {
      toast(t('settings.expertAgentIdExists'));
      return;
    }
    agents[trimmed] = `---\nname: ${trimmed}\n---\n`;
    renderAgentEditors();
  });

  agentsCard.grid.append(agentsList, addAgent);
  card.card.appendChild(agentsCard.card);

  const actions = el('div', 'provider-editor-actions');
  const save = el('button', 'btn-primary', isNew ? t('settings.expertCreate') : t('settings.expertSave')) as HTMLButtonElement;
  const cancel = el('button', 'btn-ghost', t('modal.cancel')) as HTMLButtonElement;
  cancel.addEventListener('click', () => {
    expertDraft = undefined;
    creatingExpert = false;
    void renderExperts();
  });
  save.addEventListener('click', async () => {
    const nextName = isNew ? nameInput.value.trim() : draft.manifest.name;
    if (!nextName) {
      toast(t('settings.expertNameRequired'));
      return;
    }
    const nextAgents: Record<string, string> = {};
    for (const editor of agentEditors) {
      const id = editor.id.value.trim();
      if (!id) continue;
      nextAgents[id] = editor.source.value;
    }
    if (Object.keys(nextAgents).length === 0) {
      toast(t('settings.expertAgentsRequired'));
      return;
    }
    const nextMembers: ExpertMemberMeta[] = [];
    for (const editor of memberEditors) {
      const id = editor.id.value.trim();
      if (!id) continue;
      nextMembers.push({
        id,
        role: editor.role.value || 'member',
        name: { zh: editor.nameZh.value.trim(), en: editor.nameEn.value.trim() },
      });
    }
    if (nextMembers.length === 0) {
      toast(t('settings.expertMembersRequired'));
      return;
    }
    const lead = nextMembers.find((member) => member.role === 'lead') || nextMembers[0];
    if (typeSelect.value === 'team' && (!lead || lead.role !== 'lead')) {
      toast(t('settings.expertLeadRequired'));
      return;
    }
    const teamInfo: ExpertTeamInfo | undefined = typeSelect.value === 'team'
      ? { leadAgent: lead.id, memberAgents: nextMembers.filter((member) => member.id !== lead.id).map((member) => member.id) }
      : undefined;
    const next: ExpertBundle = {
      scope: draft.scope || expertScope,
      manifest: {
        ...draft.manifest,
        schemaVersion: draft.manifest.schemaVersion || 1,
        name: nextName,
        displayName: { zh: displayZh.value.trim(), en: displayEn.value.trim() },
        expertType: typeSelect.value || 'agent',
        agentName: agentName.value.trim() || lead.id,
        categoryId: categoryId.value.trim(),
        members: nextMembers,
        ...(teamInfo ? { teamInfo } : {}),
      },
      agents: nextAgents,
    };
    await saveExpertBundle(save, isNew, next);
  });
  actions.append(save, cancel);
  if (!isNew) {
    const remove = el('button', 'btn-deny', t('settings.expertDelete')) as HTMLButtonElement;
    remove.addEventListener('click', async () => {
      if (!confirmDialog(t('settings.expertsDeleteConfirm', { n: draft.manifest.name }))) return;
      await deleteExpert(expertScope, draft.manifest.name);
    });
    actions.appendChild(remove);
  }
  card.card.appendChild(actions);
  return card.card;
}

async function saveExpertBundle(button: HTMLButtonElement, isNew: boolean, bundle: ExpertBundle): Promise<void> {
  button.disabled = true;
  const label = button.textContent;
  button.textContent = t('settings.expertSaving');
  try {
    const scope = bundle.scope as ExpertScope;
    const params: Record<string, unknown> = { scope };
    const cwd = scope === 'project' ? expertWorkspace() : undefined;
    if (cwd) params.cwd = cwd;
    if (isNew) {
      await invoke<ExpertBundle>('mothx/manage/experts/create', { ...params, bundle });
      toast(t('settings.expertCreated'));
    } else {
      await invoke<ExpertBundle>('mothx/manage/experts/update', { ...params, bundle });
      toast(t('settings.expertSaved'));
    }
    expertDraft = undefined;
    creatingExpert = false;
    cache.experts = undefined;
    await renderExperts();
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  } finally {
    button.disabled = false;
    button.textContent = label || t('settings.expertSave');
  }
}

async function deleteExpert(scope: ExpertScope, name: string): Promise<void> {
  try {
    const params: Record<string, unknown> = { scope, name };
    const cwd = scope === 'project' ? expertWorkspace() : undefined;
    if (cwd) params.cwd = cwd;
    await invoke('mothx/manage/experts/delete', params);
    toast(t('settings.expertDeleted'));
    expertDraft = undefined;
    creatingExpert = false;
    cache.experts = undefined;
    await renderExperts();
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
}
