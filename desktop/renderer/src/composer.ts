// Composer：附件、模型/模式弹出菜单、发送与取消。
// 输入统一映射为 ACP content block（text / resource_link / resource），
// 走同一条 session/prompt 通道（home 与 chat 视图共用）。

import { acp, desktop, invoke } from './api';
import { scrollChat, terminalizePendingDecisions } from './chat';
import { t } from './i18n';
import { createSession, chooseWorkingDirectory, forkSession, refreshSessions } from './sessions';
import { activeSessionWorkspace, currentConfigOptions, emit, hasFeature, isReady, newSessionWorkspace, setSessionStatus, state, type AttachmentDraft, type KnowledgeBaseReferenceDraft, type SessionConfigOptionShape } from './state';
import { el, formatBytes, hideMenus, iconSpan, require$, showMenu, toast } from './ui';
import { switchView } from './views';

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  uri?: string;
  mimeType?: string;
  data?: string;
  size?: number;
}

interface KnowledgeBaseListItem {
  knowledgeBase?: { id?: string; name?: string; enabled?: boolean };
  snapshot?: { status?: string; fileCount?: number; nodeCount?: number } | null;
  status?: string;
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  md: 'text/markdown', txt: 'text/plain', log: 'text/plain', json: 'application/json', pdf: 'application/pdf',
  html: 'text/html', css: 'text/css', js: 'text/javascript', ts: 'text/typescript', csv: 'text/csv',
};

function guessMime(path: string): string | undefined {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return MIME_BY_EXT[ext];
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function fileUri(path: string): string {
  return `file://${encodeURI(path).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
}

function insideWorkspace(path: string): boolean {
  // resource_link 是会话输入，边界应是该会话（或待创建会话）的工作目录，
  // 不是 ACP 进程已协商的所有可访问目录。工作区外的文件走内嵌 resource。
  const roots = [activeSessionWorkspace() || newSessionWorkspace()];
  return roots.some((root) => !!root && path.startsWith(root.endsWith('/') ? root : `${root}/`));
}

export async function attachFiles(): Promise<void> {
  const files = await desktop.chooseFiles().catch(() => [] as { path: string; grant: string }[]);
  if (files.length === 0) return;
  for (const { path, grant } of files) {
    const name = basename(path);
    const mimeType = guessMime(path);
    const windows = desktop.platform() === 'win32';
    // resource_link 要求文件位于协商的工作区内；工作区外（以及 Windows 的
    // 盘符路径，file URI 解析存在平台歧义）统一内嵌为 base64 resource。
    if (!windows && insideWorkspace(path)) {
      state.attachments.push({ path, name, mimeType });
      continue;
    }
    const result = await desktop.readFileBase64(grant);
    if (!result.ok) {
      toast(result.error.includes('exceeds') ? t('attach.tooLarge') : t('attach.failed', { e: result.error }));
      continue;
    }
    state.attachments.push({ path, name, mimeType, size: result.size, embedded: true, data: result.data });
  }
  emit();
}

export function removeAttachment(path: string): void {
  state.attachments = state.attachments.filter((entry) => entry.path !== path);
  emit();
}

export function renderAttachRow(): void {
  for (const id of ['#attach-row-home', '#attach-row-chat']) {
    const row = require$(id);
    row.textContent = '';
    row.hidden = state.attachments.length === 0 && state.knowledgeBaseRefs.length === 0;
    for (const attachment of state.attachments) {
      row.appendChild(buildAttachChip(attachment));
    }
    for (const reference of state.knowledgeBaseRefs) {
      row.appendChild(buildKnowledgeBaseChip(reference));
    }
  }
  document.querySelectorAll<HTMLButtonElement>('[data-knowledge-base-menu]').forEach((button) => {
    button.hidden = !hasFeature('knowledgeBaseContext');
  });
}

function buildAttachChip(attachment: AttachmentDraft): HTMLElement {
  const chip = el('div', 'attach-chip');
  chip.appendChild(iconSpan(attachment.mimeType?.startsWith('image/') ? 'image' : 'doc'));
  const name = el('span', 'a-name', attachment.name + (attachment.embedded ? t('attach.outside') : ''));
  name.title = `${attachment.path}${attachment.size ? ` · ${formatBytes(attachment.size)}` : ''}`;
  chip.appendChild(name);
  const remove = el('button', '');
  remove.appendChild(iconSpan('x'));
  remove.addEventListener('click', () => removeAttachment(attachment.path));
  chip.appendChild(remove);
  return chip;
}

function buildKnowledgeBaseChip(reference: KnowledgeBaseReferenceDraft): HTMLElement {
  const chip = el('div', 'attach-chip knowledge-base-chip');
  chip.appendChild(iconSpan('book'));
  chip.appendChild(el('span', 'a-name', reference.name));
  const remove = el('button', '');
  remove.appendChild(iconSpan('x'));
  remove.addEventListener('click', () => {
    state.knowledgeBaseRefs = state.knowledgeBaseRefs.filter((entry) => entry.knowledgeBaseId !== reference.knowledgeBaseId);
    emit();
  });
  chip.appendChild(remove);
  return chip;
}

async function renderKnowledgeBaseMenu(menu: HTMLElement): Promise<void> {
  menu.textContent = '';
  menu.appendChild(menuHead(t('knowledge.loading')));
  try {
    const result = await invoke<{ knowledgeBases?: KnowledgeBaseListItem[] }>('mothx/manage/knowledge-bases/list', {});
    menu.textContent = '';
    const knowledgeBases = result.knowledgeBases || [];
    if (knowledgeBases.length === 0) {
      menu.appendChild(menuHead(t('knowledge.empty')));
      return;
    }
    menu.appendChild(menuHead(t('knowledge.menuTitle')));
    for (const view of knowledgeBases) {
      const base = view.knowledgeBase;
      const id = String(base?.id || '').trim();
      if (!id) continue;
      const name = String(base?.name || id);
      const indexed = view.status === 'completed' && view.snapshot?.status === 'completed';
      const enabled = base?.enabled !== false;
      const selected = state.knowledgeBaseRefs.some((entry) => entry.knowledgeBaseId === id);
      const item = el('button', `pop-item${selected ? ' selected' : ''}`) as HTMLButtonElement;
      item.appendChild(iconSpan(selected ? 'check' : 'book'));
      const label = el('span', 'p-label');
      label.appendChild(el('div', '', name));
      label.appendChild(el('div', 'model-desc', indexed
        ? t('knowledge.ready', { f: view.snapshot?.fileCount ?? 0, n: view.snapshot?.nodeCount ?? 0 })
        : enabled ? t('knowledge.unindexed') : t('knowledge.disabled')));
      item.appendChild(label);
      item.disabled = !indexed && !selected;
      item.addEventListener('click', () => {
        if (selected) {
          state.knowledgeBaseRefs = state.knowledgeBaseRefs.filter((entry) => entry.knowledgeBaseId !== id);
        } else {
          state.knowledgeBaseRefs = [...state.knowledgeBaseRefs, { knowledgeBaseId: id, name }];
        }
        hideMenus();
        emit();
      });
      menu.appendChild(item);
    }
  } catch (error) {
    menu.textContent = '';
    menu.appendChild(menuHead(error instanceof Error ? error.message : String(error)));
  }
}

export function buildPromptBlocks(text: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  if (text) blocks.push({ type: 'text', text });
  for (const attachment of state.attachments) {
    if (attachment.embedded && attachment.data) {
      blocks.push({ type: 'resource', name: attachment.name, mimeType: attachment.mimeType, data: attachment.data });
    } else {
      blocks.push({ type: 'resource_link', name: attachment.name, uri: fileUri(attachment.path), mimeType: attachment.mimeType });
    }
  }
  return blocks;
}

// 会话创建前用户在 home 选择的 model/provider/mode 暂存，session/new 后应用。
const pendingConfig: { provider?: string; model?: string; mode?: string } = {};

interface ProviderCatalogResult {
  providers?: { name?: string }[];
  models?: { id?: string; name?: string; provider?: string; reasoning?: boolean }[];
  defaultProvider?: string;
  defaultModel?: string;
}

// Ephemeral menu cache of the ACP response. It is not a provider catalog: it
// only lets the selected provider immediately swap to its already-projected
// model choices without inventing local resolution rules.
let draftModelsByProvider: Record<string, NonNullable<SessionConfigOptionShape['options']>> = {};

// Populate the next-task model picker from ACP's provider factory projection.
// The desktop only reshapes the protocol response for a menu; provider/model
// resolution and validation remain in the shared Runtime when the session is
// created and the pending values are applied.
export async function refreshDraftConfigOptions(): Promise<void> {
  if (!isReady() || !hasFeature('manageProviders')) return;
  try {
    const result = await invoke<ProviderCatalogResult>('mothx/manage/providers/list', {});
    const providerChoices = (result.providers || [])
      .map((provider) => ({ value: String(provider.name || ''), name: String(provider.name || '') }))
      .filter((provider) => provider.value !== '');
    const existingProvider = state.draftConfigOptions.find((option) => option.id === 'provider')?.currentValue;
    const preferredProvider = pendingConfig.provider || existingProvider || result.defaultProvider || '';
    const provider = providerChoices.some((choice) => choice.value === preferredProvider) ? preferredProvider : providerChoices[0]?.value || '';
    draftModelsByProvider = {};
    for (const model of result.models || []) {
      if (!model.provider || !model.id) continue;
      const choices = draftModelsByProvider[model.provider] || [];
      choices.push({
        value: String(model.id),
        name: String(model.name || model.id),
        description: model.reasoning ? 'reasoning' : '',
      });
      draftModelsByProvider[model.provider] = choices;
    }
    const modelChoices = draftModelsByProvider[provider] || [];
    const existingModel = state.draftConfigOptions.find((option) => option.id === 'model')?.currentValue;
    const preferredModel = pendingConfig.model || existingModel || (provider === result.defaultProvider ? result.defaultModel || '' : '');
    const model: string = modelChoices.some((choice) => choice.value === preferredModel) ? preferredModel : modelChoices[0]?.value || '';
    state.draftConfigOptions = [
      { type: 'select', id: 'provider', name: 'Provider', currentValue: provider, options: providerChoices },
      { type: 'select', id: 'model', name: 'Model', currentValue: model, options: modelChoices },
    ];
    if (provider) pendingConfig.provider = provider;
    if (model) pendingConfig.model = model;
    emit();
  } catch (error) {
    desktop.log(`providers/list for next task failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function setDraftConfigOption(configId: string, value: string): void {
  if (configId === 'provider') {
    pendingConfig.provider = value;
    const provider = state.draftConfigOptions.find((option) => option.id === 'provider');
    if (provider) provider.currentValue = value;
    const model = state.draftConfigOptions.find((option) => option.id === 'model');
    const choices = draftModelsByProvider[value] || [];
    if (model) model.options = choices;
    const nextModel = choices[0]?.value || '';
    if (model) model.currentValue = nextModel;
    pendingConfig.model = nextModel || undefined;
    return;
  }
  if (configId === 'model') {
    pendingConfig.model = value;
  }
  const option = state.draftConfigOptions.find((entry) => entry.id === configId);
  if (option) option.currentValue = value;
}

export async function applyConfigOption(configId: string, value: string): Promise<void> {
  if (configId === 'provider') pendingConfig.provider = value;
  if (configId === 'model') pendingConfig.model = value;
  if (configId === 'mode') pendingConfig.mode = value;
  if (!state.activeSessionId) {
    setDraftConfigOption(configId, value);
    if (configId === 'mode') state.currentMode = value;
    emit();
    return;
  }
  try {
    const result = await invoke<{ configOptions?: typeof state.configOptions }>('session/set_config_option', {
      sessionId: state.activeSessionId,
      configId,
      value,
    });
    if (Array.isArray(result?.configOptions) && result.configOptions.length > 0) {
      state.configOptions = result.configOptions;
    }
    if (configId === 'mode') state.currentMode = value;
  } catch (error) {
    toast(`${configId}: ${error instanceof Error ? error.message : String(error)}`);
  }
  emit();
}

async function flushPendingConfig(sessionId: string): Promise<void> {
  for (const [configId, value] of Object.entries(pendingConfig)) {
    if (!value) continue;
    try {
      const result = await invoke<{ configOptions?: SessionConfigOptionShape[] }>('session/set_config_option', { sessionId, configId, value });
      if (Array.isArray(result?.configOptions) && result.configOptions.length > 0) {
        state.configOptions = result.configOptions;
      }
    } catch (error) {
      desktop.log(`set_config_option ${configId}=${value} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  pendingConfig.provider = undefined;
  pendingConfig.model = undefined;
  pendingConfig.mode = undefined;
}

export async function sendPrompt(text: string, source: 'home' | 'chat'): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed && state.attachments.length === 0) {
    toast(t('prompt.empty'));
    return;
  }
  if (!isReady()) {
    toast(t('prompt.notConnected'));
    return;
  }
  if (state.promptInFlight && state.runningSessionId === state.activeSessionId) {
    toast(t('prompt.busy'));
    return;
  }
  let sessionId = state.activeSessionId;
  if (!sessionId) {
    // 新建对话先确认工作目录（用户取消则放弃发送）。
    if (!state.dirConfirmed) {
      const picked = await chooseWorkingDirectory();
      if (!picked) return;
    }
    try {
      const created = await createSession();
      sessionId = created.sessionId;
      state.activeSessionCwd = created.cwd;
    } catch (error) {
      toast(t('prompt.sessionFailed', { e: error instanceof Error ? error.message : String(error) }));
      return;
    }
    state.activeSessionId = sessionId;
    state.activeTitle = trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed || t('chat.newTask');
    state.transcriptSessionId = sessionId;
    await flushPendingConfig(sessionId);
    await refreshSidebarAfterCreate(sessionId);
  }
  const input = source === 'home' ? require$('#home-input') as HTMLTextAreaElement : require$('#chat-input') as HTMLTextAreaElement;
  const blocks = buildPromptBlocks(trimmed);
  const attachmentNote = state.attachments.map((entry) => entry.name).join(', ');
  input.value = '';
  autoGrow(input);
  state.attachments = [];
  if (source === 'home') switchView('chat');

  // 乐观用户气泡：server 回显 user_message_chunk 后按 messageId 归并。
  const localKey = `user-local:${Date.now()}`;
  state.pendingUserKey = localKey;
  state.transcript.push({ kind: 'user', key: localKey, text: trimmed || attachmentNote });
  state.currentPlanKey = null;
  state.promptInFlight = true;
  state.runningSessionId = sessionId;
  state.runStatus = state.currentMode === 'plan' ? 'planning' : 'working';
  setSessionStatus(sessionId, 'working');
  emit();
  renderAttachRow();
  scrollChat(true);

  const cwd = activeSessionWorkspace();
  if (!cwd) {
    const message = t('prompt.sessionWorkspaceUnavailable');
    state.runStatus = 'failed';
    setSessionStatus(sessionId, 'failed');
    state.transcript.push({ kind: 'error', key: `error-prompt:${Date.now()}`, message });
    terminalizePendingDecisions();
    state.promptInFlight = false;
    state.runningSessionId = null;
    emit();
    return;
  }
  const knowledgeBaseRefs = state.knowledgeBaseRefs.map((reference) => ({ knowledgeBaseId: reference.knowledgeBaseId, required: reference.required === true }));
  invoke<{ stopReason?: string }>('session/prompt', {
    sessionId,
    prompt: blocks,
    ...(knowledgeBaseRefs.length > 0 ? { knowledgeBaseRefs } : {}),
    _meta: { mothx: { workspace: { cwd }, ...(knowledgeBaseRefs.length > 0 ? { surface: 'desktop' } : {}) } },
  })
    .then((result) => {
      const reason = String(result?.stopReason || 'end_turn');
      if (state.runStatus === 'failed' || state.runStatus === 'cancelled') return;
      state.runStatus = reason === 'cancelled' || reason === 'aborted' ? 'cancelled' : 'completed';
      setSessionStatus(sessionId!, state.runStatus);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      state.runStatus = 'failed';
      setSessionStatus(sessionId!, 'failed');
      state.transcript.push({ kind: 'error', key: `error-prompt:${Date.now()}`, message });
      terminalizePendingDecisions();
    })
    .finally(() => {
      if (state.runningSessionId === sessionId) {
        state.promptInFlight = false;
        state.runningSessionId = null;
      }
      state.currentPlanKey = null;
      emit();
      scrollChat();
    });
}

async function refreshSidebarAfterCreate(sessionId: string): Promise<void> {
  // session/new 已持久化会话；刷新列表让侧边栏立即出现新任务。
  await refreshSessions();
  const session = state.sessions.find((entry) => entry.sessionId === sessionId);
  if (session && !session.title) session.title = state.activeTitle;
  emit();
}

export function cancelRun(): void {
  const target = state.runningSessionId || state.activeSessionId;
  if (!target) return;
  acp.notify('session/cancel', { sessionId: target });
  if (target === state.activeSessionId) state.runStatus = 'cancelled';
  terminalizePendingDecisions();
  setSessionStatus(target, 'cancelled');
  emit();
}

export function autoGrow(textarea: HTMLTextAreaElement): void {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
}

export function bindComposer(textareaId: string, sendId: string, source: 'home' | 'chat'): void {
  const textarea = require$(textareaId) as HTMLTextAreaElement;
  const send = require$(sendId);
  textarea.addEventListener('input', () => autoGrow(textarea));
  textarea.addEventListener('paste', (event) => {
    const files = Array.from(event.clipboardData?.files || []);
    const images = files.filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) return;
    event.preventDefault();
    for (const image of images) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        const comma = dataUrl.indexOf(',');
        if (comma < 0) return;
        state.attachments.push({
          path: `clipboard:${Date.now()}:${image.name || 'image'}`,
          name: image.name || t('attach.pasteName', { n: state.attachments.length + 1 }),
          mimeType: image.type,
          size: image.size,
          embedded: true,
          data: dataUrl.slice(comma + 1),
        });
        emit();
      };
      reader.readAsDataURL(image);
    }
  });
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendPrompt(textarea.value, source);
    }
  });
  send.addEventListener('click', () => {
    void sendPrompt(textarea.value, source);
  });
}

// ===== 模型 / 模式弹出菜单 =====

export function renderModelMenu(): void {
  const menu = require$('#model-menu');
  menu.textContent = '';
  const configOptions = currentConfigOptions();
  const providerOption = configOptions.find((option) => option.id === 'provider');
  const modelOption = configOptions.find((option) => option.id === 'model');
  if (providerOption && providerOption.options?.length) {
    menu.appendChild(menuHead('Provider'));
    for (const choice of providerOption.options) {
      menu.appendChild(menuItem('cpu', choice.name, '', choice.value === providerOption.currentValue, () => {
        void applyConfigOption('provider', choice.value);
        hideMenus();
      }));
    }
  }
  if (modelOption && modelOption.options?.length) {
    menu.appendChild(menuHead('Model'));
    for (const choice of modelOption.options) {
      menu.appendChild(menuItem('cpu', choice.name, choice.description || '', choice.value === modelOption.currentValue, () => {
        void applyConfigOption('model', choice.value);
        hideMenus();
      }));
    }
  }
  if (menu.childElementCount === 0) {
    menu.appendChild(menuHead(t('menu.noCommands')));
  }
}

export function renderModeMenu(): void {
  const menu = require$('#mode-menu');
  menu.textContent = '';
  const modeOption = state.configOptions.find((option) => option.id === 'mode');
  const modes = modeOption?.options?.length
    ? modeOption.options
    : [
        { value: 'agent', name: 'Agent' },
        { value: 'plan', name: 'Plan' },
        { value: 'yolo', name: 'Yolo' },
        { value: 'os', name: 'OS' },
      ];
  const current = modeOption?.currentValue || state.currentMode;
  menu.appendChild(menuHead('Mode'));
  for (const mode of modes) {
    menu.appendChild(menuItem('sliders', mode.name, mode.description || '', mode.value === current, () => {
      void applyConfigOption('mode', mode.value);
      hideMenus();
    }));
  }
  const thinkingOption = state.configOptions.find((option) => option.id === 'thinking_level');
  if (thinkingOption && thinkingOption.options?.length) {
    menu.appendChild(menuHead('Thinking'));
    for (const choice of thinkingOption.options) {
      menu.appendChild(menuItem('sparkle', choice.name, '', choice.value === thinkingOption.currentValue, () => {
        void applyConfigOption('thinking_level', choice.value);
      hideMenus();
    }));
  }
  const expertOption = state.configOptions.find((option) => option.id === 'expert');
  if (expertOption && expertOption.options?.length && state.activeSessionId) {
    menu.appendChild(menuHead('Expert'));
    for (const choice of expertOption.options) {
      menu.appendChild(menuItem('users', choice.name, choice.description || '', choice.value === expertOption.currentValue, () => {
        const sessionId = state.activeSessionId;
        hideMenus();
        if (!sessionId || choice.value === expertOption.currentValue) return;
        // Session identity cannot be overwritten. Choosing another expert
        // creates a Runtime-owned fork; initial bind/unbind stays in-place.
        if (expertOption.currentValue) {
          void forkSession(sessionId, choice.value);
          return;
        }
        void applyConfigOption('expert', choice.value);
      }));
    }
  }
}
}

function menuHead(label: string): HTMLElement {
  return el('div', 'pop-head', label);
}

function menuItem(icon: string, label: string, description: string, selected: boolean, onClick: () => void): HTMLElement {
  const item = el('button', `pop-item${selected ? ' selected' : ''}`);
  item.appendChild(iconSpan(icon));
  const body = el('span', 'p-label');
  body.appendChild(el('div', '', label));
  if (description) body.appendChild(el('div', 'model-desc', description));
  item.appendChild(body);
  item.addEventListener('click', onClick);
  return item;
}

export function renderCapsMenu(): void {
  const menu = require$('#caps-menu');
  menu.textContent = '';
  menu.appendChild(menuHead(t('menu.capabilities')));
  const booleans = state.configOptions.filter((option) => option.id === 'sandbox' || option.id === 'browser' || option.id === 'web_search');
  if (booleans.length === 0) {
    menu.appendChild(el('div', 'pop-item', t('menu.noCommands')));
    return;
  }
  for (const option of booleans) {
    const on = option.currentValue === 'true';
    const item = el('button', 'pop-item');
    item.appendChild(iconSpan(on ? 'check' : 'x'));
    const label = el('span', 'p-label');
    label.appendChild(el('div', '', option.name || option.id));
    item.appendChild(label);
    item.appendChild(el('span', 'p-hint', on ? 'on' : 'off'));
    if (on) item.classList.add('selected');
    item.addEventListener('click', () => {
      void applyConfigOption(option.id, on ? 'false' : 'true');
      hideMenus();
    });
    menu.appendChild(item);
  }
}

export function bindMenus(): void {
  const plusMenu = require$('#plus-menu');
  const openPlus = (event: MouseEvent, anchor: HTMLElement) => {
    event.stopPropagation();
    renderPlusCommands();
    showMenu(plusMenu, anchor);
  };
  require$('#plus-btn').addEventListener('click', (event) => openPlus(event, event.currentTarget as HTMLElement));
  require$('#plus-btn2').addEventListener('click', (event) => openPlus(event, event.currentTarget as HTMLElement));
  require$('#plus-attach').addEventListener('click', () => {
    hideMenus();
    void attachFiles();
  });

  const knowledgeMenu = require$('#knowledge-menu');
  const openKnowledge = (event: MouseEvent, anchor: HTMLElement) => {
    event.stopPropagation();
    if (!hasFeature('knowledgeBaseContext')) return;
    showMenu(knowledgeMenu, anchor);
    void renderKnowledgeBaseMenu(knowledgeMenu);
  };
  require$('#knowledge-btn').addEventListener('click', (event) => openKnowledge(event, event.currentTarget as HTMLElement));
  require$('#knowledge-btn2').addEventListener('click', (event) => openKnowledge(event, event.currentTarget as HTMLElement));

  const modelMenu = require$('#model-menu');
  const openModel = (event: MouseEvent) => {
    event.stopPropagation();
    renderModelMenu();
    showMenu(modelMenu, event.currentTarget as HTMLElement);
  };
  require$('#model-btn').addEventListener('click', openModel);
  require$('#model-btn2').addEventListener('click', openModel);

  const modeMenu = require$('#mode-menu');
  const openMode = (event: MouseEvent) => {
    event.stopPropagation();
    renderModeMenu();
    showMenu(modeMenu, event.currentTarget as HTMLElement);
  };
  require$('#mode-btn').addEventListener('click', openMode);
  require$('#mode-btn2').addEventListener('click', openMode);

  const capsMenu = require$('#caps-menu');
  const openCaps = (event: MouseEvent) => {
    event.stopPropagation();
    renderCapsMenu();
    showMenu(capsMenu, event.currentTarget as HTMLElement);
  };
  require$('#caps-btn').addEventListener('click', openCaps);
  require$('#caps-btn2').addEventListener('click', openCaps);

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (!target.closest('.pop-menu') && !target.closest('#plus-btn') && !target.closest('#plus-btn2') && !target.closest('#model-btn') && !target.closest('#model-btn2') && !target.closest('#mode-btn') && !target.closest('#mode-btn2') && !target.closest('#caps-btn') && !target.closest('#caps-btn2')) {
      hideMenus();
    }
  });
}

function renderPlusCommands(): void {
  const container = require$('#plus-commands');
  container.textContent = '';
  if (state.availableCommands.length === 0) {
    container.appendChild(el('div', 'pop-item', t('menu.noCommands')));
    return;
  }
  for (const command of state.availableCommands.slice(0, 30)) {
    const item = el('button', 'pop-item');
    item.appendChild(iconSpan('slash'));
    const label = el('span', 'p-label');
    label.appendChild(el('div', '', command.name));
    if (command.description) label.appendChild(el('div', 'model-desc', command.description));
    item.appendChild(label);
    item.addEventListener('click', () => {
      hideMenus();
      injectToComposer(`${command.name} `);
    });
    container.appendChild(item);
  }
}

export function injectToComposer(text: string): void {
  const target = state.view === 'chat' ? require$('#chat-input') : require$('#home-input');
  const textarea = target as HTMLTextAreaElement;
  textarea.value = text + textarea.value;
  autoGrow(textarea);
  textarea.focus();
}
