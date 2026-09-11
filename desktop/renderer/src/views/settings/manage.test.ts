import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const manageApi = await readFile(new URL('../../core/manage-api.ts', import.meta.url), 'utf8');
const translations = await readFile(new URL('../../core/i18n.ts', import.meta.url), 'utf8');
const settingsView = await readFile(new URL('./SettingsView.tsx', import.meta.url), 'utf8');
const settingsNav = await readFile(new URL('../../core/settings-nav.ts', import.meta.url), 'utf8');
const appearance = await readFile(new URL('./AppearancePanel.tsx', import.meta.url), 'utf8');
const theme = await readFile(new URL('../../core/theme.ts', import.meta.url), 'utf8');
const styles = await readFile(new URL('../../index.css', import.meta.url), 'utf8');
const providersPanel = await readFile(new URL('./ProvidersPanel.tsx', import.meta.url), 'utf8');
const applicationPanel = await readFile(new URL('./ApplicationPanel.tsx', import.meta.url), 'utf8');
const skillsView = await readFile(new URL('../SkillsView.tsx', import.meta.url), 'utf8');
const skillhubCore = await readFile(new URL('../../core/skillhub.ts', import.meta.url), 'utf8');
const composerCore = await readFile(new URL('../../core/composer.ts', import.meta.url), 'utf8');
const composerTsx = await readFile(new URL('../../components/Composer.tsx', import.meta.url), 'utf8');
const knowledgePanel = await readFile(new URL('./KnowledgePanel.tsx', import.meta.url), 'utf8');
const libraryView = await readFile(new URL('../LibraryView.tsx', import.meta.url), 'utf8');
const cronPanel = await readFile(new URL('./CronPanel.tsx', import.meta.url), 'utf8');
const automationCore = await readFile(new URL('../../core/automation.ts', import.meta.url), 'utf8');
const servePanel = await readFile(new URL('./ServePanel.tsx', import.meta.url), 'utf8');
const channelsPanel = await readFile(new URL('./ChannelsPanel.tsx', import.meta.url), 'utf8');
const envPanel = await readFile(new URL('./EnvPanel.tsx', import.meta.url), 'utf8');
const expertsPanel = await readFile(new URL('./ExpertsPanel.tsx', import.meta.url), 'utf8');
const skillhubPanel = await readFile(new URL('./SkillHubPanel.tsx', import.meta.url), 'utf8');
const main = await readFile(new URL('../../main.tsx', import.meta.url), 'utf8');
const sidebar = await readFile(new URL('../../components/Sidebar.tsx', import.meta.url), 'utf8');

function assertAcpMethods(source: string, methods: string[]): void {
  for (const method of methods) {
    assert.match(source, new RegExp(method.replaceAll('/', '\\/')), `${method} must be used through ACP`);
  }
}

function assertBilingual(keys: string[]): void {
  for (const key of keys) {
    const occurrences = translations.split(`'${key}'`).length - 1;
    assert.equal(occurrences, 2, `${key} must be present in both translation maps`);
  }
}

test('provider settings use the ACP management projection instead of desktop persistence', () => {
  assertAcpMethods(manageApi, [
    'mothx/manage/settings/get',
    'mothx/manage/settings/patch',
    'mothx/manage/providers/list',
    'mothx/manage/providers/save',
    'mothx/manage/providers/delete',
    'mothx/manage/providers/discover',
    'mothx/manage/application/get',
    'mothx/manage/application/patch',
  ]);
  assert.doesNotMatch(manageApi, /desktop\.storeSet\([^)]*(provider|model)/i, 'provider/model configuration must not enter the Desktop store');
  assert.doesNotMatch(providersPanel, /desktop\.storeSet|localStorage/i, 'provider panel must not persist locally');
});

test('three-pane settings load only the active ACP-backed tab', () => {
  assert.match(settingsView, /activeTab === 'providers' \? <ProvidersPanel \/> : null/, 'panels must mount only for the active tab');
  assert.match(settingsView, /activeTab === 'application' \? <ApplicationPanel \/> : null/, 'application panel must be lazy');
  assert.match(settingsNav, /ManagedSettingsTab/, 'management rendering must be addressed by tab');
  assert.doesNotMatch(settingsView, /renderManageSections/, 'hidden panels must not be eagerly loaded as a batch');
  assert.doesNotMatch(main, /renderManageSections|loadApplication|loadServe/, 'startup must not preload hidden management tabs');
  assert.doesNotMatch(sidebar, /renderManageSections/, 'opening settings must not restore eager loading');
});

test('appearance and language are a first-level settings category', () => {
  const workspaceStart = settingsNav.indexOf("id: 'workspace'");
  const appearanceCategory = settingsNav.indexOf("id: 'appearance', label: 'settings.tab.appearance'");
  assert.ok(workspaceStart >= 0 && appearanceCategory > workspaceStart, 'appearance category must follow workspace');
  const workspaceCategory = settingsNav.slice(workspaceStart, appearanceCategory);
  assert.doesNotMatch(workspaceCategory, /id: 'appearance'/, 'workspace must not retain appearance as a nested tab');
  assert.match(settingsNav.slice(appearanceCategory), /tabs: \[\s*\{ id: 'appearance'/, 'appearance category must retain its appearance tab');
});

test('app background controls cover the sidebar and preserve a clear full-opacity image', () => {
  assert.match(theme, /has-app-background/, 'application-level background class must be used');
  assert.match(theme, /--app-background-veil', String\(\(1 - opacity\) \* 0\.72\)/, 'home veil must be derived from selected opacity');
  assert.match(theme, /--app-surface-veil', String\(\(1 - opacity\) \* 0\.68\)/, 'app surfaces must clear as opacity increases');
  assert.match(theme, /--app-surface-blur', `\$\{Math\.round\(\(1 - opacity\) \* 10\)\}px`/, 'app surface blur must clear as opacity increases');
  assert.match(sidebar, /app-surface-veil border-r-transparent/, 'sidebar must reveal the app background without a gray seam');
  assert.match(styles, /--app-control-bg:/, 'global background must provide readable control surfaces');
  assert.match(styles, /\.app-titlebar-surface \{/, 'window controls need a dedicated readable titlebar surface');
  assert.match(styles, /\.home-background-layer \{/, 'Home-only mode must not leak the image outside Home');
  assert.match(styles, /var\(--app-surface-veil/, 'surface opacity must be configurable instead of a fixed white veil');
  assert.match(appearance, /homeBackgroundFit/, 'the fit control must exist');
  assert.match(appearance, /homeBackgroundPosition/, 'the position control must exist');
  assert.match(appearance, /homeBackgroundScope/, 'the scope toggle must exist');
  assertBilingual([
    'settings.homeBackgroundFit', 'settings.homeBackgroundFitCover', 'settings.homeBackgroundFitContain',
    'settings.homeBackgroundFitStretch', 'settings.homeBackgroundFitTile', 'settings.homeBackgroundPosition',
    'settings.homeBackgroundPositionCenter', 'settings.homeBackgroundPositionLeft', 'settings.homeBackgroundPositionRight',
    'settings.homeBackgroundPositionTop', 'settings.homeBackgroundPositionBottom',
    'settings.homeBackgroundScope', 'settings.homeBackgroundScopeApp', 'settings.homeBackgroundScopeHome',
  ]);
});

test('capability-gap copy describes runtime discovery rather than completed historical phases', () => {
  assert.doesNotMatch(translations, /P0-1.*(?:补齐中|in progress)|P1-7/, 'gap copy must not claim completed ACP work is pending');
  assert.match(translations, /未声明该能力/, 'Chinese copy must explain capability discovery');
  assert.match(translations, /Not declared by this runtime/, 'English copy must explain capability discovery');
});

test('provider/model management translations remain bilingual', () => {
  assertBilingual([
    'settings.providerDefaults', 'settings.providerCatalog', 'settings.addProvider',
    'settings.addModel', 'settings.discoverModels', 'settings.saveProvider',
    'settings.providerCatalogSearch', 'settings.scopeConfigured', 'settings.scopeAll',
    'settings.connectionTab', 'settings.modelsTab', 'settings.advancedTab',
    'settings.saveProviderFirst', 'settings.resetDefaultBlocked',
    'settings.tab.application', 'settings.applicationTitle', 'settings.applicationSave',
    'settings.applicationSafety', 'settings.applicationImageToken',
    'settings.applicationEnableArtifact', 'settings.applicationEnableACPArtifact',
  ]);
});

test('provider management renders a catalog and tabbed draft editor without local persistence', () => {
  assert.match(providersPanel, /grid-cols-\[minmax\(230px,\.7fr\)_minmax\(0,1\.8fr\)\]/, 'workspace needs a provider catalog pane beside the editor');
  assert.match(providersPanel, /<TabsTrigger value="connection">/, 'provider editor needs a connection tab');
  assert.match(providersPanel, /<TabsTrigger value="models">/, 'provider editor needs a models tab');
  assert.match(providersPanel, /<TabsTrigger value="advanced">/, 'provider editor needs an advanced tab');
  assert.match(providersPanel, /secret\.apiKey/, 'an unsaved key must survive tab navigation only in renderer memory');
  assert.doesNotMatch(providersPanel, /localStorage[^\n]*(provider|apiKey|model)/i, 'provider drafts must not be persisted locally');
});

test('application settings remain an ACP projection and redact secret configuration', () => {
  assert.match(manageApi, /manageApplicationSettings/, 'application panel must gate on the ACP capability');
  assertAcpMethods(manageApi, ['mothx/manage/application/get', 'mothx/manage/application/patch']);
  assert.match(applicationPanel, /enableArtifact/, 'application settings must expose the TUI/CLI artifact switch');
  assert.match(applicationPanel, /enableACPArtifact/, 'application settings must expose the Desktop/ACP artifact switch');
  assert.match(applicationPanel, /tokenConfigured/, 'the UI should use a configured state rather than a returned token');
  assert.doesNotMatch(applicationPanel, /desktop\.storeSet|localStorage/i, 'application settings must not persist locally');
});

test('artifact toggles default to off and are kept separate from protocol capability', () => {
  assert.match(applicationPanel, /enableArtifact: defaults\.enableArtifact === true/, 'TUI/CLI artifact toggle must default to off');
  assert.match(applicationPanel, /enableACPArtifact: defaults\.enableACPArtifact === true/, 'Desktop/ACP artifact toggle must default to off');
  assert.doesNotMatch(applicationPanel, /enableArtifact !== false/, 'TUI/CLI artifact toggle must not default to on');
  assert.doesNotMatch(applicationPanel, /enableACPArtifact !== false/, 'Desktop/ACP artifact toggle must not default to on');
  assert.match(servePanel, /enableArtifact: api\.enableArtifact === true/, 'WebUI/API artifact toggle must default to off');
  assert.match(channelsPanel, /loaded\.artifact === true/, 'Channel artifact toggle must default to off');
});

test('skillhub settings use the ACP management projection and never persist locally', () => {
  assertAcpMethods(manageApi, ['mothx/manage/skillhub/get', 'mothx/manage/skillhub/patch']);
  assert.match(manageApi, /manageSkillHub/, 'skillhub panel must gate on the ACP capability');
  assert.match(skillhubPanel, /apiTokenConfigured/, 'skillhub UI should use a configured state rather than a returned token');
  assert.match(skillhubPanel, /clearApiToken/, 'skillhub UI must support clearing the token through ACP');
  assert.doesNotMatch(skillhubPanel, /desktop\.storeSet|localStorage/i, 'skillhub configuration must not persist locally');
});

test('skillhub management translations remain bilingual', () => {
  assertBilingual([
    'settings.tab.skillhub', 'settings.skillhubGroup', 'settings.skillhub',
    'settings.skillhubTitle', 'settings.skillhubSave', 'settings.skillhubDefaultMarket',
    'settings.skillhubDefaultScope', 'settings.skillhubOfficialHandles',
    'settings.skillhubMarkets', 'settings.skillhubMarketAdd', 'settings.skillhubMarketToken',
    'settings.skillhubTokenConfigured', 'settings.skillhubClearToken',
  ]);
});

test('online skills catalog is capability-gated and remains an ACP projection', () => {
  assert.match(skillsView, /hasFeature\('manageSkillHubCatalog'\)/, 'catalog must be hidden for older ACP runtimes');
  assertAcpMethods(skillhubCore, [
    'mothx/manage/skillhub/markets', 'mothx/manage/skillhub/search', 'mothx/manage/skillhub/detail',
    'mothx/manage/skillhub/targets', 'mothx/manage/skillhub/install', 'mothx/manage/skillhub/activate',
    'mothx/manage/skillhub/uninstall',
  ]);
  assert.doesNotMatch(skillhubCore, /fetch\(|desktop\.storeSet|localStorage/i, 'catalog must not add HTTP or Desktop-owned persistence');
  assert.doesNotMatch(skillsView, /desktop\.storeSet|localStorage/i, 'catalog UI must not persist locally');
  assertBilingual(['skills.marketplace', 'skills.marketplaceSearch', 'skills.install', 'skills.activate', 'skills.uninstall', 'skills.confirmUpdate']);
});

test('knowledge-base settings stay ACP-backed and keep source files outside Desktop storage', () => {
  assertAcpMethods(manageApi, [
    'mothx/manage/knowledge-bases/list',
    'mothx/manage/knowledge-bases/create',
    'mothx/manage/knowledge-bases/update',
    'mothx/manage/knowledge-bases/scan',
    'mothx/manage/knowledge-bases/delete',
  ]);
  assert.match(manageApi, /manageKnowledgeBases/, 'knowledge-base panel must gate on the ACP capability');
  assert.match(knowledgePanel, /desktop\.chooseDirectory/, 'source selection must use the Desktop-controlled directory picker');
  assert.doesNotMatch(knowledgePanel, /desktop\.storeSet\([^)]*(knowledge|rootDir|preprocessProfile)/i, 'knowledge-base configuration must not enter the Desktop store');
  assert.doesNotMatch(knowledgePanel, /readFileBase64\([^)]*(knowledge|rootDir)/i, 'Desktop must not read knowledge-source files');
});

test('knowledge scans start in the background and surfaces poll progress periodically', () => {
  assert.match(knowledgePanel, /await scanKnowledgeBase\(base\.id\)/, 'scan button must call the scan RPC');
  assert.match(knowledgePanel, /settings\.knowledgeScanStarted/, 'scan must report background start instead of waiting for completion');
  assert.match(knowledgePanel, /window\.setInterval\(\(\) => void reload\(\), 3000\)/, 'panel must poll progress while a scan runs');
  assert.match(knowledgePanel, /view\.indexing\?\.running/, 'panel must drive polling from the projected indexing state');
  assert.match(libraryView, /window\.setInterval\(\(\) => void reload\(\), 4000\)/, 'library view must poll indexing progress');
  assert.match(libraryView, /knowledgeIndexingText\(view\.indexing\)/, 'library rows must show live progress');
  assert.match(manageApi, /indexing\?: KnowledgeIndexProgressView/, 'view type must carry the indexing projection');
});

test('knowledge-base settings translations remain bilingual', () => {
  assertBilingual([
    'settings.tab.knowledge', 'settings.knowledgeGroup', 'settings.knowledgeTitle',
    'settings.knowledgeRootDir', 'settings.knowledgeProfile', 'settings.knowledgeProvider',
    'settings.knowledgeModel', 'settings.knowledgeSchedule', 'settings.knowledgeScan',
    'settings.knowledgeDeleteConfirm',
  ]);
});

test('knowledge-base editor configures a deterministic stdio MCP server through ACP', () => {
  assertAcpMethods(manageApi, ['mothx/manage/mcp/list', 'mothx/manage/mcp/set']);
  assert.match(knowledgePanel, /knowledgeBaseMcpName\(base\.id\)/, 'MCP server name must derive from the knowledge-base ID');
  assert.match(manageApi, /knowledge-mcp.*serve.*--knowledge-base.*baseId/, 'MCP server args must target the knowledge-base ID');
  assert.match(manageApi, /state\.appInfo\.runtimeBinary \|\| 'mothx'/, 'MCP command must use the bundled runtime binary with a mothx fallback');
  assert.match(manageApi, /type: 'stdio'/, 'MCP server must be configured as type stdio');
  assert.doesNotMatch(manageApi, /desktop\.storeSet\([^)]*knowledge[^)]*mcp/i, 'knowledge-base MCP configuration must not enter the Desktop store');
});

test('knowledge-base MCP configuration translations remain bilingual', () => {
  assertBilingual([
    'settings.knowledgeMcpTitle', 'settings.knowledgeMcpDesc', 'settings.knowledgeMcpStatus',
    'settings.knowledgeMcpNotConfigured', 'settings.knowledgeMcpEnabled', 'settings.knowledgeMcpDisabled',
    'settings.knowledgeMcpConfigure', 'settings.knowledgeMcpEnable', 'settings.knowledgeMcpDisable',
    'settings.knowledgeMcpSaved', 'settings.knowledgeMcpHint',
  ]);
});

test('composer no longer projects knowledge-base references through the prompt payload', () => {
  for (const marker of ['knowledgeBaseRefs', 'knowledgeBaseContext', 'mothx/manage/knowledge-bases/list']) {
    assert.doesNotMatch(composerCore, new RegExp(marker.replaceAll('/', '\\/')), `${marker} must be removed from the composer prompt path`);
  }
  assert.doesNotMatch(composerCore, /session\/prompt[\s\S]*knowledgeBaseRefs/, 'session/prompt must not send knowledgeBaseRefs');
  assert.doesNotMatch(composerCore, /BuildUserMessage|provider\.NewUserMessage|readFileBase64\([^)]*knowledge/i, 'composer must not construct provider content or read a knowledge source');
  assert.doesNotMatch(composerTsx, /knowledge-btn|knowledge-menu|knowledge-base-menu/, 'composer must not expose a prompt-local knowledge selector');
});

test('cron settings use the ACP management plane and never persist locally', () => {
  assertAcpMethods(manageApi, [
    'mothx/manage/cron/list',
    'mothx/manage/cron/create',
    'mothx/manage/cron/update',
    'mothx/manage/cron/remove',
    'mothx/manage/cron/run',
  ]);
  assert.match(cronPanel, /export function CronPanel/, 'cron settings need a dedicated panel');
  assert.match(automationCore, /loadCronJobs/, 'cron actions must reuse the shared loaders');
  assert.doesNotMatch(cronPanel, /desktop\.storeSet|localStorage/i, 'cron configuration must not enter the Desktop store');
});

test('cron settings translations remain bilingual', () => {
  assertBilingual([
    'settings.category.automation', 'settings.tab.cron', 'settings.tab.cronDesc', 'settings.cronGroup',
    'automation.edit', 'automation.enabled', 'automation.active', 'automation.paused', 'automation.lastError',
  ]);
});

test('serve settings use the ACP management projection instead of desktop persistence', () => {
  assertAcpMethods(manageApi, ['mothx/manage/serve/get', 'mothx/manage/serve/patch']);
  assert.match(servePanel, /manageServeConfig/, 'serve panel must gate on the ACP capability');
  assert.doesNotMatch(servePanel, /desktop\.storeSet|localStorage/i, 'serve configuration must not persist locally');
});

test('serve settings translations remain bilingual', () => {
  assertBilingual([
    'settings.tab.serve', 'settings.tab.serveDesc', 'settings.serveGroup',
    'settings.serveTitle', 'settings.serveDesc', 'settings.serveSave',
    'settings.serveSaving', 'settings.serveSaved', 'settings.serveRuntime',
    'settings.serveListen', 'settings.serveWebUIDir', 'settings.serveRequestTimeout',
    'settings.serveMaxConcurrent', 'settings.serveLogLevel', 'settings.serveDefaultMode',
    'settings.serveFeatures', 'settings.serveMultiAgent', 'settings.serveCapabilities',
    'settings.serveEnableWebSearch', 'settings.serveEnableBrowser', 'settings.serveEnableArtifact',
    'settings.serveOutput', 'settings.serveToolMode', 'settings.serveToolDetail',
    'settings.serveAutomation', 'settings.serveCronEnabled', 'settings.serveCronInterval',
    'settings.serveMemoryEnabled', 'settings.serveMemoryPath', 'settings.serveSecurity',
    'settings.serveSmartApprovals', 'settings.serveAgent', 'settings.serveMaxTurns',
    'settings.serveBudgetPressure', 'settings.serveContextPressure',
    'settings.serveBudgetThreshold', 'settings.serveContextThreshold',
    'settings.serveLobsterMode', 'settings.serveSessions', 'settings.serveSessionsDesc',
    'settings.serveIdleTimeout', 'settings.serveMaxSessions', 'settings.serveMaxSessionsHint',
  ]);
});

test('serve settings render an ACP-backed form without local persistence', () => {
  assert.match(servePanel, /export function ServePanel/, 'serve settings need a dedicated panel');
  assert.match(servePanel, /ServeForm/, 'serve settings need a typed form view');
  assert.match(servePanel, /ManageWorkspace/, 'serve settings should reuse the managed settings cards');
  assert.match(servePanel, /enableArtifact/, 'serve settings must expose the WebUI/API artifact switch');
});

test('serve session limits are projected through ACP and rendered as a dedicated card', () => {
  assert.match(servePanel, /api\.session\b/, 'serve API view must include the session section');
  assert.match(servePanel, /session: \{\s*idleTimeoutSeconds:[\s\S]*?maxSessions:/, 'serve save patch must include session limits');
  assert.match(servePanel, /settings\.serveSessions/, 'session limits card title must be translated');
  assert.match(servePanel, /settings\.serveIdleTimeout/, 'idle timeout label must be translated');
  assert.match(servePanel, /settings\.serveMaxSessions/, 'max sessions label must be translated');
});

test('channel settings use the ACP management projection and never persist locally', () => {
  assertAcpMethods(manageApi, ['mothx/manage/channels/get', 'mothx/manage/channels/patch']);
  assert.match(channelsPanel, /manageChannels/, 'channels panel must gate on the ACP capability');
  assert.match(channelsPanel, /credentialConfigured/, 'WeChat UI should use a configured state rather than a returned credential path');
  assert.match(channelsPanel, /appIDConfigured/, 'Feishu UI should use a configured state rather than a returned app ID');
  assert.match(channelsPanel, /appSecretConfigured/, 'Feishu UI should use a configured state rather than a returned app secret');
  assert.match(channelsPanel, /clearCredPath/, 'WeChat UI must support clearing the credential through ACP');
  assert.match(channelsPanel, /clearAppId/, 'Feishu UI must support clearing the app ID through ACP');
  assert.match(channelsPanel, /clearAppSecret/, 'Feishu UI must support clearing the app secret through ACP');
  assert.doesNotMatch(channelsPanel, /desktop\.storeSet|localStorage/i, 'channel configuration must not persist locally');
});

test('channel settings translations remain bilingual', () => {
  assertBilingual([
    'settings.tab.channels', 'settings.tab.channelsDesc', 'settings.channelsGroup',
    'settings.channelsTitle', 'settings.channelsDesc', 'settings.channelsSave',
    'settings.channelsSaving', 'settings.channelsSaved', 'settings.channelsWechat',
    'settings.channelsWechatDesc', 'settings.channelsFeishu', 'settings.channelsFeishuDesc',
    'settings.channelsEnabled', 'settings.channelsWorkDir', 'settings.channelsWorkDirRequired',
    'settings.channelsAutoTyping', 'settings.channelsCredPath', 'settings.channelsCredConfigured',
    'settings.channelsCredUnset', 'settings.channelsClearCred', 'settings.channelsAppID',
    'settings.channelsAppIDConfigured', 'settings.channelsAppIDUnset', 'settings.channelsAppSecret',
    'settings.channelsAppSecretConfigured', 'settings.channelsAppSecretUnset',
    'settings.channelsClearAppID', 'settings.channelsClearAppSecret', 'settings.channelsHint',
    'settings.channelsArtifact', 'settings.channelsArtifactDesc', 'settings.channelsArtifactEnabled',
  ]);
});

test('channel settings render ACP-backed cards without local persistence', () => {
  assert.match(channelsPanel, /export function ChannelsPanel/, 'channel settings need a dedicated panel');
  assert.match(channelsPanel, /ChannelsConfigView/, 'channel settings need a typed view');
  assert.match(channelsPanel, /artifact/, 'channel settings must expose an independent artifact switch');
});

test('env settings use the ACP management projection and never persist locally', () => {
  assertAcpMethods(manageApi, ['mothx/manage/env/get', 'mothx/manage/env/patch']);
  assert.match(envPanel, /hasFeature\('manageEnv'\)/, 'env panel must check the manageEnv feature');
  assert.match(envPanel, /type="password"/, 'env value inputs must mask secret values');
  assert.doesNotMatch(envPanel, /desktop\.storeSet|localStorage/i, 'env configuration must not persist locally');
});

test('env settings translations remain bilingual', () => {
  assertBilingual([
    'settings.tab.env', 'settings.tab.envDesc', 'settings.envGroup',
    'settings.envTitle', 'settings.envDesc', 'settings.envHint',
    'settings.envVariables', 'settings.envVariablesDesc', 'settings.envAdd',
    'settings.envAddDesc', 'settings.envName', 'settings.envValue',
    'settings.envNameRequired', 'settings.envValueConfigured',
    'settings.envEmpty', 'settings.envEmptyHint', 'settings.envDuplicate',
    'settings.envSave', 'settings.envSaving', 'settings.envSaved',
    'settings.envAddButton', 'settings.envRemoveButton',
  ]);
});

test('env settings render an ACP-backed panel with a typed view', () => {
  assert.match(envPanel, /export function EnvPanel/, 'env settings need a dedicated panel');
  assert.match(envPanel, /EnvView/, 'env settings need a typed view');
});

test('expert team settings use the ACP management projection and never persist locally', () => {
  assertAcpMethods(manageApi, [
    'mothx/manage/experts/list',
    'mothx/manage/experts/get',
    'mothx/manage/experts/create',
    'mothx/manage/experts/update',
    'mothx/manage/experts/delete',
  ]);
  assert.match(expertsPanel, /hasFeature\('manageExperts'\)/, 'experts panel must check the manageExperts feature');
  assert.doesNotMatch(expertsPanel, /desktop\.storeSet|localStorage/i, 'expert team configuration must not persist locally');
});

test('expert team management translations remain bilingual', () => {
  assertBilingual([
    'settings.tab.experts', 'settings.tab.expertsDesc', 'settings.expertsGroup',
    'settings.expertsTitle', 'settings.expertsDesc', 'settings.expertsAdd',
    'settings.expertsScope', 'settings.expertsScopeGlobal', 'settings.expertsScopeProject',
    'settings.expertsCatalog', 'settings.expertsEmpty', 'settings.expertsEdit',
    'settings.expertsDelete', 'settings.expertsBuiltin', 'settings.expertsGlobal',
    'settings.expertsProject', 'settings.expertName', 'settings.expertDisplayZh',
    'settings.expertDisplayEn', 'settings.expertType', 'settings.expertAgents',
    'settings.expertAddAgent', 'settings.expertCreate', 'settings.expertSave',
    'settings.expertSaved', 'settings.expertCreated', 'settings.expertDeleted',
    'settings.expertsDeleteConfirm', 'menu.expert',
    'settings.expertMembers', 'settings.expertMembersDesc', 'settings.expertMemberId',
    'settings.expertMemberRole', 'settings.expertAddMember', 'settings.expertMembersRequired',
  ]);
});

test('expert team settings render an ACP-backed panel with a typed bundle view', () => {
  assert.match(expertsPanel, /export function ExpertsPanel/, 'expert team settings need a dedicated panel');
  assert.match(expertsPanel, /ExpertBundle/, 'expert team settings need a typed bundle view');
});

test('expert team scope defaults to global and supports explicit project scope', () => {
  assert.match(expertsPanel, /useState<ExpertScope>\('global'\)/, 'default expert scope must be global');
  assert.match(expertsPanel, /switchScope\(entry\)/, 'project scope must be selectable');
  assert.match(manageApi, /state\.activeSessionCwd \|\| state\.newSessionCwd/, 'project scope must derive from the active/new workspace cwd');
  assert.doesNotMatch(expertsPanel, /desktop\.chooseDirectory/, 'expert scope must not open a directory picker');
});

test('expert team UI treats built-in teams as read-only catalog entries', () => {
  assert.match(expertsPanel, /item\.source === 'builtin'/, 'builtin teams must be detected in the catalog');
  assert.match(expertsPanel, /settings\.expertsBuiltin/, 'builtin source must have a translated label');
  assert.match(expertsPanel, /item\.source !== 'builtin' \? \(/, 'builtin teams must not expose edit/delete actions');
});