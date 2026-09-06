import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const manage = await readFile(new URL('./manage.ts', import.meta.url), 'utf8');
const translations = await readFile(new URL('./i18n.ts', import.meta.url), 'utf8');
const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const settings = await readFile(new URL('./settings.ts', import.meta.url), 'utf8');
const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
const sidebar = await readFile(new URL('./sidebar.ts', import.meta.url), 'utf8');

test('provider settings use the ACP management projection instead of desktop persistence', () => {
  for (const method of [
    'mothx/manage/settings/get',
    'mothx/manage/settings/patch',
    'mothx/manage/providers/list',
    'mothx/manage/providers/save',
    'mothx/manage/providers/delete',
    'mothx/manage/providers/discover',
    'mothx/manage/application/get',
    'mothx/manage/application/patch',
  ]) {
    assert.match(manage, new RegExp(method.replaceAll('/', '\\/')), `${method} must be used through ACP`);
  }
  assert.doesNotMatch(manage, /desktop\.storeSet\([^)]*(provider|model)/i, 'provider/model configuration must not enter the Desktop store');
});

test('three-pane settings load only the active ACP-backed tab', () => {
  assert.match(settings, /activateSettingsView/, 'entering settings must explicitly activate one detail tab');
  assert.match(settings, /renderManageSection\(activeSettingsTab\)/, 'only the selected management tab may request ACP data');
  assert.match(manage, /ManagedSettingsTab/, 'management rendering must be addressed by tab');
  assert.doesNotMatch(manage, /renderManageSections/, 'hidden panels must not be eagerly loaded as a batch');
  assert.doesNotMatch(main, /renderManageSections/, 'startup must not preload hidden management tabs');
  assert.doesNotMatch(sidebar, /renderManageSections/, 'opening settings must not restore eager loading');
});

test('capability-gap copy describes runtime discovery rather than completed historical phases', () => {
  assert.doesNotMatch(translations, /P0-1.*(?:补齐中|in progress)|P1-7/, 'gap copy must not claim completed ACP work is pending');
  assert.match(translations, /未声明该能力/, 'Chinese copy must explain capability discovery');
  assert.match(translations, /Not declared by this runtime/, 'English copy must explain capability discovery');
  assert.doesNotMatch(index, /P0-1.*补齐中|P1-7/, 'static fallback copy must not contradict the runtime');
});

test('provider/model management translations remain bilingual', () => {
  for (const key of [
    'settings.providerDefaults', 'settings.providerCatalog', 'settings.addProvider',
    'settings.addModel', 'settings.discoverModels', 'settings.saveProvider',
    'settings.providerCatalogSearch', 'settings.scopeConfigured', 'settings.scopeAll',
    'settings.connectionTab', 'settings.modelsTab', 'settings.advancedTab',
    'settings.saveProviderFirst', 'settings.resetDefaultBlocked',
    'settings.tab.application', 'settings.applicationTitle', 'settings.applicationSave',
    'settings.applicationSafety', 'settings.applicationImageToken',
  ]) {
    const occurrences = translations.split(`'${key}'`).length - 1;
    assert.equal(occurrences, 2, `${key} must be present in both translation maps`);
  }
});

test('provider management renders a catalog and tabbed draft editor without local persistence', () => {
  assert.match(manage, /renderProviderWorkspace/, 'provider settings need a dedicated workspace');
  assert.match(manage, /provider-catalog-layout/, 'workspace needs a provider catalog pane');
  assert.match(manage, /provider-editor-tabs/, 'provider editor needs connection, model, and advanced tabs');
  assert.match(manage, /draftSecret/, 'an unsaved key must survive tab navigation only in renderer memory');
  assert.doesNotMatch(manage, /localStorage[^\n]*(provider|apiKey|model)/i, 'provider drafts must not be persisted locally');
});

test('application settings remain an ACP projection and redact secret configuration', () => {
  assert.match(manage, /manageApplicationSettings/, 'application panel must gate on the ACP capability');
  assert.match(manage, /mothx\/manage\/application\/get/, 'application state must load through ACP');
  assert.match(manage, /mothx\/manage\/application\/patch/, 'application state must save through ACP');
  assert.match(manage, /tokenConfigured/, 'the UI should use a configured state rather than a returned token');
  assert.doesNotMatch(manage, /desktop\.storeSet\([^)]*(application|sandbox|token|webSearch)/i, 'application settings must not enter the Desktop store');
});

test('skillhub settings use the ACP management projection and never persist locally', () => {
  for (const method of [
    'mothx/manage/skillhub/get',
    'mothx/manage/skillhub/patch',
  ]) {
    assert.match(manage, new RegExp(method.replaceAll('/', '\\/')), `${method} must be used through ACP`);
  }
  assert.match(manage, /manageSkillHub/, 'skillhub panel must gate on the ACP capability');
  assert.match(manage, /apiTokenConfigured/, 'skillhub UI should use a configured state rather than a returned token');
  assert.match(manage, /clearApiToken/, 'skillhub UI must support clearing the token through ACP');
  assert.doesNotMatch(manage, /desktop\.storeSet\([^)]*(skillhub|market)/i, 'skillhub configuration must not enter the Desktop store');
});

test('skillhub management translations remain bilingual', () => {
  for (const key of [
    'settings.tab.skillhub', 'settings.skillhubGroup', 'settings.skillhub',
    'settings.skillhubTitle', 'settings.skillhubSave', 'settings.skillhubDefaultMarket',
    'settings.skillhubDefaultScope', 'settings.skillhubOfficialHandles',
    'settings.skillhubMarkets', 'settings.skillhubMarketAdd', 'settings.skillhubMarketToken',
    'settings.skillhubTokenConfigured', 'settings.skillhubClearToken',
  ]) {
    const occurrences = translations.split(`'${key}'`).length - 1;
    assert.equal(occurrences, 2, `${key} must be present in both translation maps`);
  }
});

test('knowledge-base settings stay ACP-backed and keep source files outside Desktop storage', () => {
  for (const method of [
    'mothx/manage/knowledge-bases/list',
    'mothx/manage/knowledge-bases/create',
    'mothx/manage/knowledge-bases/update',
    'mothx/manage/knowledge-bases/scan',
    'mothx/manage/knowledge-bases/delete',
  ]) {
    assert.match(manage, new RegExp(method.replaceAll('/', '\\/')), `${method} must be used through ACP`);
  }
  assert.match(manage, /manageKnowledgeBases/, 'knowledge-base panel must gate on the ACP capability');
  assert.match(manage, /desktop\.chooseDirectory/, 'source selection must use the Desktop-controlled directory picker');
  assert.doesNotMatch(manage, /desktop\.storeSet\([^)]*(knowledge|rootDir|preprocessProfile)/i, 'knowledge-base configuration must not enter the Desktop store');
  assert.doesNotMatch(manage, /readFileBase64\([^)]*(knowledge|rootDir)/i, 'Desktop must not read knowledge-source files');
});

test('knowledge-base settings translations remain bilingual', () => {
  for (const key of [
    'settings.tab.knowledge', 'settings.knowledgeGroup', 'settings.knowledgeTitle',
    'settings.knowledgeRootDir', 'settings.knowledgeProfile', 'settings.knowledgeProvider',
    'settings.knowledgeModel', 'settings.knowledgeSchedule', 'settings.knowledgeScan',
    'settings.knowledgeDeleteConfirm',
  ]) {
    const occurrences = translations.split(`'${key}'`).length - 1;
    assert.equal(occurrences, 2, `${key} must be present in both translation maps`);
  }
});

test('composer sends selected knowledge bases as a Desktop-only Runtime input reference', async () => {
  const composer = await readFile(new URL('./composer.ts', import.meta.url), 'utf8');
  for (const marker of ['knowledgeBaseRefs', 'knowledgeBaseContext', "surface: 'desktop'", 'mothx/manage/knowledge-bases/list']) {
    assert.match(composer, new RegExp(marker.replaceAll('/', '\\/')), `${marker} must participate in the Desktop knowledge-base flow`);
  }
  assert.doesNotMatch(composer, /BuildUserMessage|provider\.NewUserMessage|readFileBase64\([^)]*knowledge/i, 'composer must not construct provider content or read a knowledge source');
});

test('cron settings use the ACP management plane and never persist locally', () => {
  for (const method of [
    'mothx/manage/cron/list',
    'mothx/manage/cron/create',
    'mothx/manage/cron/update',
    'mothx/manage/cron/remove',
    'mothx/manage/cron/run',
  ]) {
    assert.match(manage, new RegExp(method.replaceAll('/', '\\/')), `${method} must be used through ACP`);
  }
  assert.match(manage, /renderCron/, 'cron settings need a dedicated renderer');
  assert.doesNotMatch(manage, /desktop\.storeSet\([^)]*cron/i, 'cron configuration must not enter the Desktop store');
});

test('cron settings translations remain bilingual', () => {
  for (const key of [
    'settings.category.automation', 'settings.tab.cron', 'settings.tab.cronDesc', 'settings.cronGroup',
    'automation.edit', 'automation.enabled', 'automation.active', 'automation.paused', 'automation.lastError',
  ]) {
    const occurrences = translations.split(`'${key}'`).length - 1;
    assert.equal(occurrences, 2, `${key} must be present in both translation maps`);
  }
});

test('serve settings use the ACP management projection instead of desktop persistence', () => {
  for (const method of [
    'mothx/manage/serve/get',
    'mothx/manage/serve/patch',
  ]) {
    assert.match(manage, new RegExp(method.replaceAll('/', '\\/')), `${method} must be used through ACP`);
  }
  assert.match(manage, /manageServeConfig/, 'serve panel must gate on the ACP capability');
  assert.doesNotMatch(manage, /desktop\.storeSet\([^)]*(serve|serveConfig)/i, 'serve configuration must not enter the Desktop store');
});

test('serve settings translations remain bilingual', () => {
  for (const key of [
    'settings.tab.serve', 'settings.tab.serveDesc', 'settings.serveGroup',
    'settings.serveTitle', 'settings.serveDesc', 'settings.serveSave',
    'settings.serveSaving', 'settings.serveSaved', 'settings.serveRuntime',
    'settings.serveListen', 'settings.serveWebUIDir', 'settings.serveRequestTimeout',
    'settings.serveMaxConcurrent', 'settings.serveLogLevel', 'settings.serveDefaultMode',
    'settings.serveFeatures', 'settings.serveMultiAgent', 'settings.serveCapabilities',
    'settings.serveEnableWebSearch', 'settings.serveEnableBrowser',
    'settings.serveOutput', 'settings.serveToolMode', 'settings.serveToolDetail',
    'settings.serveAutomation', 'settings.serveCronEnabled', 'settings.serveCronInterval',
    'settings.serveMemoryEnabled', 'settings.serveMemoryPath', 'settings.serveSecurity',
    'settings.serveSmartApprovals', 'settings.serveAgent', 'settings.serveMaxTurns',
    'settings.serveBudgetPressure', 'settings.serveContextPressure',
    'settings.serveBudgetThreshold', 'settings.serveContextThreshold',
    'settings.serveLobsterMode', 'settings.serveSessions', 'settings.serveSessionsDesc',
    'settings.serveIdleTimeout', 'settings.serveMaxSessions', 'settings.serveMaxSessionsHint',
  ]) {
    const occurrences = translations.split(`'${key}'`).length - 1;
    assert.equal(occurrences, 2, `${key} must be present in both translation maps`);
  }
});

test('serve settings render an ACP-backed form without local persistence', () => {
  assert.match(manage, /renderServe/, 'serve settings need a dedicated renderer');
  assert.match(manage, /ServeConfigView/, 'serve settings need a typed view');
  assert.match(manage, /application-settings-workspace/, 'serve settings should reuse application settings cards');
  assert.doesNotMatch(manage, /localStorage[^\n]*(serve|serveConfig)/i, 'serve drafts must not be persisted locally');
});

test('serve session limits are projected through ACP and rendered as a dedicated card', () => {
  assert.match(manage, /api\.session\b/, 'serve API view must include the session section');
  assert.match(manage, /session:\s*\{\s*idleTimeoutSeconds:[\s\S]*maxSessions:/, 'serve save patch must include session limits');
  assert.match(manage, /settings\.serveSessions/, 'session limits card title must be translated');
  assert.match(manage, /settings\.serveIdleTimeout/, 'idle timeout label must be translated');
  assert.match(manage, /settings\.serveMaxSessions/, 'max sessions label must be translated');
  assert.doesNotMatch(manage, /localStorage[^\n]*(session|idleTimeout|maxSessions)/i, 'session limit drafts must not be persisted locally');
});

test('channel settings use the ACP management projection and never persist locally', () => {
  for (const method of [
    'mothx/manage/channels/get',
    'mothx/manage/channels/patch',
  ]) {
    assert.match(manage, new RegExp(method.replaceAll('/', '\\/')), `${method} must be used through ACP`);
  }
  assert.match(manage, /manageChannels/, 'channels panel must gate on the ACP capability');
  assert.match(manage, /credentialConfigured/, 'WeChat UI should use a configured state rather than a returned credential path');
  assert.match(manage, /appIDConfigured/, 'Feishu UI should use a configured state rather than a returned app ID');
  assert.match(manage, /appSecretConfigured/, 'Feishu UI should use a configured state rather than a returned app secret');
  assert.match(manage, /clearCredPath/, 'WeChat UI must support clearing the credential through ACP');
  assert.match(manage, /clearAppId/, 'Feishu UI must support clearing the app ID through ACP');
  assert.match(manage, /clearAppSecret/, 'Feishu UI must support clearing the app secret through ACP');
  assert.doesNotMatch(manage, /desktop\.storeSet\([^)]*(channel|wechat|feishu|appId|appSecret|credPath)/i, 'channel configuration must not enter the Desktop store');
});

test('channel settings translations remain bilingual', () => {
  for (const key of [
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
  ]) {
    const occurrences = translations.split(`'${key}'`).length - 1;
    assert.equal(occurrences, 2, `${key} must be present in both translation maps`);
  }
});

test('channel settings render ACP-backed cards without local persistence', () => {
  assert.match(manage, /renderChannels/, 'channel settings need a dedicated renderer');
  assert.match(manage, /ChannelsConfigView/, 'channel settings need a typed view');
  assert.match(manage, /manage-channels/, 'channel settings need a container in the HTML');
  assert.doesNotMatch(manage, /localStorage[^\n]*(channel|wechat|feishu)/i, 'channel drafts must not be persisted locally');
});


test('env settings use the ACP management projection and never persist locally', () => {
  for (const method of [
    'mothx/manage/env/get',
    'mothx/manage/env/patch',
  ]) {
    assert.match(manage, new RegExp(method.replaceAll('/', '\\/')), `${method} must be used through ACP`);
  }
  assert.match(manage, /renderEnv/, 'env panel must gate on the ACP capability');
  assert.match(manage, /hasFeature\('manageEnv'\)/, 'env panel must check the manageEnv feature');
  assert.match(manage, /applicationInput\([^\n]*'password'\)/, 'env value inputs must mask secret values');
  assert.doesNotMatch(manage, /desktop\.storeSet\([^)]*(env|variable)/i, 'env configuration must not enter the Desktop store');
  assert.doesNotMatch(manage, /localStorage[^\n]*(env|variable)/i, 'env drafts must not be persisted locally');
});

test('env settings translations remain bilingual', () => {
  for (const key of [
    'settings.tab.env', 'settings.tab.envDesc', 'settings.envGroup',
    'settings.envTitle', 'settings.envDesc', 'settings.envHint',
    'settings.envVariables', 'settings.envVariablesDesc', 'settings.envAdd',
    'settings.envAddDesc', 'settings.envName', 'settings.envValue',
    'settings.envNameRequired', 'settings.envValueConfigured',
    'settings.envEmpty', 'settings.envEmptyHint', 'settings.envDuplicate',
    'settings.envSave', 'settings.envSaving', 'settings.envSaved',
    'settings.envAddButton', 'settings.envRemoveButton',
  ]) {
    const occurrences = translations.split(`'${key}'`).length - 1;
    assert.equal(occurrences, 2, `${key} must be present in both translation maps`);
  }
});

test('env settings render an ACP-backed panel with a container in the HTML', () => {
  assert.match(manage, /renderEnvSettings/, 'env settings need a dedicated renderer');
  assert.match(manage, /EnvView/, 'env settings need a typed view');
  assert.match(index, /id=\"manage-env\"/, 'env settings need a container in the HTML');
});
