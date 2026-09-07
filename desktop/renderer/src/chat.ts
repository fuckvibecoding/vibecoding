// 聊天视图：转录渲染、流式更新、计划/工具/审批/提问/制品卡片。
// 所有 session/update 与 _mothx/session_event 都投影到 state.transcript，
// 再按 key 增量同步 DOM（保留原型视觉：气泡/卡片/状态 chip）。

import { acp, desktop, invoke } from './api';
import { createMothxLogo, hydrateIcons, iconSVG } from './icons';
import { getLocale, t } from './i18n';
import { emit, setSessionStatus, state, type ToolCallContentShape, type TranscriptItem } from './state';
import { el, formatBytes, iconSpan, renderAgentText, require$, toast } from './ui';

const itemElements = new Map<string, HTMLElement>();
let autoScroll = true;

const TOOL_ICONS: Record<string, string> = {
  read: 'doc',
  edit: 'edit',
  search: 'search',
  execute: 'terminal',
  delete: 'trash',
  move: 'share',
  think: 'sparkle',
  fetch: 'globe',
  image: 'image',
  plan: 'list',
  other: 'cpu',
};

export const STATUS_CLASS: Record<string, string> = {
  idle: 'st-idle',
  loading: 'st-planning',
  planning: 'st-planning',
  working: 'st-working',
  pending: 'st-pending',
  completed: 'st-completed',
  failed: 'st-failed',
  cancelled: 'st-cancelled',
};

export function scrollChat(force = false): void {
  const stream = require$('#chat-stream');
  if (force) autoScroll = true;
  if (autoScroll) stream.scrollTop = stream.scrollHeight;
}

export function bindChatScroll(): void {
  const stream = require$('#chat-stream');
  stream.addEventListener('scroll', () => {
    autoScroll = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 80;
  });
}

export function clearTranscript(sessionId: string | null): void {
  state.transcript = [];
  state.transcriptSessionId = sessionId;
  state.currentPlanKey = null;
  state.artifactRunCount = 0;
  state.pendingUserKey = null;
  state.usage = null;
  itemElements.clear();
  const inner = require$('#chat-inner');
  inner.textContent = '';
}

function upsert(item: TranscriptItem): void {
  const existing = state.transcript.find((entry) => entry.key === item.key);
  if (existing) Object.assign(existing, item);
  else state.transcript.push(item);
}

function findItem(key: string): TranscriptItem | undefined {
  return state.transcript.find((entry) => entry.key === key);
}

// ===== session/update 投影 =====

export function applySessionUpdate(sessionId: string, update: Record<string, unknown>): void {
  if (state.transcriptSessionId && state.transcriptSessionId !== sessionId) {
    // 非当前转录会话的事件只维护侧边栏/标题等元数据。
    applyMetaOnlyUpdate(sessionId, update);
    return;
  }
  const kind = String(update.sessionUpdate || '');
  switch (kind) {
    case 'user_message_chunk': {
      const messageId = String(update.messageId || `user-${state.transcript.length}`);
      const text = contentText(update.content);
      const key = `user:${messageId}`;
      // 乐观气泡归并：发送时本地先插入的气泡被 server 回显认领。
      if (state.pendingUserKey) {
        const index = state.transcript.findIndex((entry) => entry.key === state.pendingUserKey);
        state.pendingUserKey = null;
        if (index >= 0) {
          state.transcript.splice(index, 1, { kind: 'user', key, text });
          syncTranscript();
          scrollChat();
          return;
        }
      }
      const existing = findItem(key);
      if (existing && existing.kind === 'user') existing.text += text;
      else upsert({ kind: 'user', key, text });
      syncTranscript();
      scrollChat();
      return;
    }
    case 'agent_message_chunk': {
      const messageId = String(update.messageId || `agent-${state.transcript.length}`);
      const text = contentText(update.content);
      const key = `agent:${messageId}`;
      const existing = findItem(key);
      if (existing && existing.kind === 'agent') existing.text += text;
      else upsert({ kind: 'agent', key, text });
      syncTranscript();
      scrollChat();
      return;
    }
    case 'agent_thought_chunk': {
      const messageId = String(update.messageId || `thought-${state.transcript.length}`);
      const text = contentText(update.content);
      const key = `thought:${messageId}`;
      const existing = findItem(key);
      if (existing && existing.kind === 'thought') existing.text += text;
      else upsert({ kind: 'thought', key, text, open: false });
      syncTranscript();
      scrollChat();
      return;
    }
    case 'tool_call': {
      const toolCallId = String(update.toolCallId || '');
      if (!toolCallId) return;
      upsert({
        kind: 'tool',
        key: `tool:${toolCallId}`,
        toolCallId,
        title: String(update.title || toolCallId),
        toolKind: String(update.kind || 'other'),
        status: String(update.status || 'pending'),
        open: false,
        rawInput: (update.rawInput as Record<string, unknown>) || undefined,
        contents: [],
        locations: (update.locations as { path: string }[]) || undefined,
      });
      syncTranscript();
      scrollChat();
      return;
    }
    case 'tool_call_update': {
      const toolCallId = String(update.toolCallId || '');
      if (!toolCallId) return;
      const key = `tool:${toolCallId}`;
      let item = findItem(key);
      if (!item || item.kind !== 'tool') {
        item = { kind: 'tool', key, toolCallId, title: String(update.title || toolCallId), toolKind: 'other', status: 'pending', open: false, contents: [] };
        state.transcript.push(item);
      }
      if (update.title) item.title = String(update.title);
      if (update.kind) item.toolKind = String(update.kind);
      if (update.status) item.status = String(update.status);
      if (update.rawInput) item.rawInput = update.rawInput as Record<string, unknown>;
      if (update.locations) item.locations = update.locations as { path: string }[];
      const contents = update.content;
      if (Array.isArray(contents) && contents.length > 0) {
        item.contents = contents as ToolCallContentShape[];
      }
      if (item.status === 'completed' || item.status === 'failed') maybeAddToolArtifactFallback(sessionId, item);
      syncTranscript();
      scrollChat();
      return;
    }
    case 'plan': {
      const entries = (update.entries as { content: string; priority: string; status: string }[]) || [];
      const key = state.currentPlanKey || `plan:${Date.now()}`;
      state.currentPlanKey = key;
      upsert({ kind: 'plan', key, entries });
      syncTranscript();
      scrollChat();
      return;
    }
    case 'artifact': {
      // P0-1 制品投影（docs/proposal/desktop-acp-frontend-gap-proposal.md）。
      const artifactId = String(update.artifactId || '');
      const filename = String(update.filename || artifactId || 'artifact');
      const key = `artifact:${artifactId || filename}`;
      upsert({
        kind: 'artifact',
        key,
        artifactId,
        filename,
        artifactKind: String(update.kind || 'file'),
        mediaType: update.mediaType ? String(update.mediaType) : undefined,
        size: typeof update.size === 'number' ? update.size : undefined,
      });
      state.artifactRunCount += 1;
      syncTranscript();
      scrollChat();
      return;
    }
    case 'usage_update': {
      state.usage = {
        used: Number(update.used || 0),
        size: Number(update.size || 0),
        cost: update.cost ? Number((update.cost as { amount?: number }).amount || 0) : state.usage?.cost,
      };
      emit();
      return;
    }
    case 'available_commands_update': {
      state.availableCommands = (update.availableCommands as typeof state.availableCommands) || [];
      emit();
      return;
    }
    case 'current_mode_update': {
      state.currentMode = String(update.currentModeId || state.currentMode);
      emit();
      return;
    }
    case 'config_option_update': {
      const options = (update.configOptions as typeof state.configOptions) || [];
      if (options.length > 0) {
        state.configOptions = options;
        const mode = options.find((option) => option.id === 'mode');
        if (mode) state.currentMode = mode.currentValue;
      }
      emit();
      return;
    }
    case 'session_info_update': {
      applyTitleUpdate(sessionId, String(update.title || ''));
      return;
    }
    default:
      return;
  }
}

function applyMetaOnlyUpdate(sessionId: string, update: Record<string, unknown>): void {
  const kind = String(update.sessionUpdate || '');
  if (kind === 'session_info_update') applyTitleUpdate(sessionId, String(update.title || ''));
  if (kind === 'available_commands_update') {
    state.availableCommands = (update.availableCommands as typeof state.availableCommands) || [];
    emit();
  }
  if (kind === 'config_option_update' && sessionId === state.activeSessionId) {
    const options = (update.configOptions as typeof state.configOptions) || [];
    if (options.length > 0) state.configOptions = options;
    emit();
  }
}

function applyTitleUpdate(sessionId: string, title: string): void {
  if (!title) return;
  const session = state.sessions.find((entry) => entry.sessionId === sessionId);
  if (session) session.title = title;
  if (sessionId === state.activeSessionId) state.activeTitle = title;
  emit();
}

function contentText(content: unknown): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  const block = content as { type?: string; text?: string };
  if (block.type === 'text' && typeof block.text === 'string') return block.text;
  return '';
}

// publish_artifact 工具调用的降级投影：P0 artifact 事件缺席时也能看到制品。
function maybeAddToolArtifactFallback(sessionId: string, item: Extract<TranscriptItem, { kind: 'tool' }>): void {
  if (!item.title.startsWith('publish_artifact')) return;
  if (item.status !== 'completed') return;
  const already = state.transcript.some(
    (entry) => entry.kind === 'artifact' && !entry.fromToolCall && entry.filename === String((item.rawInput?.filename as string) || basename(String(item.rawInput?.path || ''))),
  );
  if (already) return;
  const path = String(item.rawInput?.path || '');
  const filename = String(item.rawInput?.filename || basename(path) || 'artifact');
  upsert({ kind: 'artifact', key: `artifact-tool:${item.toolCallId}`, artifactId: '', filename, artifactKind: String(item.rawInput?.kind || 'auto'), fromToolCall: true, size: undefined, mediaType: undefined });
  void sessionId;
  void path;
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

// ===== _mothx/session_event 投影 =====

export function applySessionEvent(event: Record<string, unknown>): void {
  const sessionId = String(event.sessionId || '');
  const name = String(event.event || '');
  if (name === 'run_status') {
    // Phase 1.1：run 生命周期投影，侧边栏状态点的协议源。
    const status = String(event.status || '');
    const mapped = status === 'running' ? 'working' : status;
    if (mapped) setSessionStatus(sessionId, mapped);
    emit();
    return;
  }
  if (name === 'workspace') {
    // Desktop does not use ACP's optional process-wide workspace window.
    // Session cwd remains the only work-directory projection in the UI.
    return;
  }
  if (name === 'decision_deadline') {
    const requestId = String(event.requestId || '');
    const remaining = Number(event.remainingMs || 0);
    const item = state.transcript.find(
      (entry) => (entry.kind === 'permission' || entry.kind === 'question') && entry.requestId === requestId && !entry.resolved,
    );
    if (item && (item.kind === 'permission' || item.kind === 'question')) {
      item.deadline = Date.now() + remaining;
      syncTranscript();
    }
    return;
  }
  if (name === 'subagent') {
    if (!matchesTranscript(sessionId)) return;
    const agentId = String(event.agentId || '');
    if (!agentId) return;
    const status = String(event.status || 'started');
    const memberName = String(event.memberDisplayName || event.memberId || event.title || event.agentId);
    const emoji = String(event.memberEmoji || '');
    upsert({
      kind: 'subagent', key: `subagent:${agentId}`, agentId, status,
      title: emoji ? `${emoji} ${memberName}` : memberName,
      role: event.memberRole ? String(event.memberRole) : undefined,
      expertId: event.expertId ? String(event.expertId) : undefined,
    });
    syncTranscript();
    scrollChat();
    return;
  }
  if (name === 'terminal') {
    const status = String(event.status || 'completed');
    if (state.runningSessionId && state.runningSessionId === sessionId) {
      state.promptInFlight = false;
      state.runningSessionId = null;
    } else {
      state.promptInFlight = false;
    }
    if (status === 'completed') {
      state.runStatus = 'completed';
      setSessionStatus(sessionId, 'completed');
    } else if (status === 'cancelled') {
      state.runStatus = 'cancelled';
      setSessionStatus(sessionId, 'cancelled');
    } else {
      state.runStatus = 'failed';
      setSessionStatus(sessionId, 'failed');
      const info = event.errorInfo as { code?: string; message?: string; retryable?: boolean } | undefined;
      if (matchesTranscript(sessionId)) {
        upsert({
          kind: 'error',
          key: `error:${sessionId}:${Date.now()}`,
          message: String(event.error || info?.message || status),
          code: info?.code,
          retryable: info?.retryable,
        });
        syncTranscript();
      }
    }
    state.currentPlanKey = null;
    emit();
    scrollChat();
    return;
  }
  if (!matchesTranscript(sessionId)) return;
  if (name === 'status') {
    upsert({ kind: 'status', key: `status:${sessionId}:${Date.now()}`, text: String(event.message || ''), spin: true });
    syncTranscript();
    scrollChat();
    return;
  }
  if (name === 'retry') {
    const message = String((event as { message?: string }).message || '');
    upsert({ kind: 'status', key: `retry:${sessionId}:${Date.now()}`, text: t('chat.retrying', { m: message }), spin: true });
    syncTranscript();
    return;
  }
  if (name === 'compaction_start') {
    upsert({ kind: 'status', key: `compaction:${sessionId}:${Date.now()}`, text: t('chat.compaction'), spin: true });
    syncTranscript();
    return;
  }
}

function matchesTranscript(sessionId: string): boolean {
  return !state.transcriptSessionId || state.transcriptSessionId === sessionId;
}

// ===== 反向请求（审批/提问） =====

export function applyReverseRequest(id: number | string, method: string, params: Record<string, unknown>): void {
  const requestId = String(id);
  if (method === 'session/request_permission') {
    const toolCall = (params.toolCall || {}) as { toolCallId?: string; title?: string; kind?: string; rawInput?: Record<string, unknown> };
    const options = (params.options || []) as { optionId: string; name: string; kind: string }[];
    const sessionId = String(params.sessionId || state.activeSessionId || '');
    if (!matchesTranscript(sessionId)) return;
    state.runStatus = 'pending';
    setSessionStatus(sessionId, 'pending');
    upsert({
      kind: 'permission',
      key: `permission:${requestId}`,
      requestId,
      sessionId,
      title: String(toolCall.title || toolCall.toolCallId || 'tool'),
      toolKind: String(toolCall.kind || 'other'),
      rawInput: toolCall.rawInput,
      options,
    });
    syncTranscript();
    scrollChat();
    emit();
    return;
  }
  if (method === 'mothx/requestQuestion' || method === '_mothx/request_question' || method === 'elicitation/create') {
    const sessionId = String(params.sessionId || state.activeSessionId || '');
    if (!matchesTranscript(sessionId)) return;
    const promptText = String(params.prompt || params.question || params.message || '');
    const explanation = String(params.explanation || params.placeholder || '');
    const rawOptions = (params.options || []) as { id?: string; label?: string }[] | string[];
    const options = rawOptions.map((option) =>
      typeof option === 'string' ? { id: option, label: option } : { id: String(option.id ?? option.label ?? ''), label: String(option.label ?? option.id ?? '') },
    );
    state.runStatus = 'pending';
    setSessionStatus(sessionId, 'pending');
    upsert({
      kind: 'question',
      key: `question:${requestId}`,
      requestId,
      sessionId,
      prompt: promptText,
      explanation: explanation || undefined,
      options,
    });
    syncTranscript();
    scrollChat();
    emit();
  }
}

export function resolvePermission(item: Extract<TranscriptItem, { kind: 'permission' }>, optionId: string): void {
  item.resolved = optionId;
  acp.respond(item.requestId, { outcome: { outcome: 'selected', optionId } });
  finishDecision(item.sessionId);
  syncTranscript();
  emit();
}

export function cancelPermission(item: Extract<TranscriptItem, { kind: 'permission' }>): void {
  item.resolved = t('chat.cancelled');
  acp.respond(item.requestId, { outcome: { outcome: 'cancelled' } });
  finishDecision(item.sessionId);
  syncTranscript();
  emit();
}

export function resolveQuestion(item: Extract<TranscriptItem, { kind: 'question' }>, answer: string): void {
  item.resolved = answer;
  acp.respond(item.requestId, { answer, ok: true });
  finishDecision(item.sessionId);
  syncTranscript();
  emit();
}

export function cancelQuestion(item: Extract<TranscriptItem, { kind: 'question' }>): void {
  item.resolved = t('chat.cancelled');
  acp.respond(item.requestId, { cancelled: true });
  finishDecision(item.sessionId);
  syncTranscript();
  emit();
}

function finishDecision(sessionId: string): void {
  const stillPending = state.transcript.some(
    (entry) => ((entry.kind === 'permission' || entry.kind === 'question') && !entry.resolved) && entry.sessionId === sessionId,
  );
  if (!stillPending) {
    state.runStatus = state.promptInFlight ? 'working' : 'completed';
    if (sessionId) setSessionStatus(sessionId, state.promptInFlight ? 'working' : 'completed');
  }
}

// 运行被取消/终止时，把未决决策标记为已取消（server 端也会 $/cancel_request）。
export function terminalizePendingDecisions(): void {
  let changed = false;
  for (const entry of state.transcript) {
    if ((entry.kind === 'permission' || entry.kind === 'question') && !entry.resolved) {
      entry.resolved = t('chat.cancelled');
      acp.cancelReverse(entry.requestId);
      changed = true;
    }
  }
  if (changed) syncTranscript();
}

// ===== DOM 同步 =====

export function syncTranscript(): void {
  const inner = require$('#chat-inner');
  const seen = new Set<string>();
  for (const item of state.transcript) {
    seen.add(item.key);
    let node = itemElements.get(item.key);
    if (!node) {
      node = buildItem(item);
      itemElements.set(item.key, node);
      inner.appendChild(node);
    } else {
      updateItem(node, item);
    }
  }
  for (const [key, node] of [...itemElements.entries()]) {
    if (!seen.has(key)) {
      node.remove();
      itemElements.delete(key);
    }
  }
  hydrateIcons(inner);
}

function buildItem(item: TranscriptItem): HTMLElement {
  switch (item.kind) {
    case 'user': {
      const row = el('div', 'msg-user fade-in');
      const bubble = el('div', 'bubble');
      bubble.textContent = item.text;
      row.appendChild(bubble);
      row.dataset.text = item.text;
      return row;
    }
    case 'agent': {
      const row = el('div', 'msg-agent fade-in');
      const avatar = el('span', 'avatar');
      avatar.appendChild(createMothxLogo());
      const body = el('div', 'msg-agent-body');
      const text = el('div', 'agent-text');
      renderAgentText(text, item.text);
      body.appendChild(text);
      const actions = el('div', 'msg-actions');
      const copy = el('button', 'icon-btn');
      copy.title = t('chat.copied');
      copy.appendChild(iconSpan('copy'));
      copy.addEventListener('click', () => {
        void navigator.clipboard.writeText(item.text).then(() => toast(t('chat.copied')));
      });
      actions.appendChild(copy);
      body.appendChild(actions);
      row.appendChild(avatar);
      row.appendChild(body);
      row.dataset.text = item.text;
      return row;
    }
    case 'thought': {
      const block = el('div', 'thought-block fade-in');
      const toggle = el('button', 'thought-toggle') as HTMLButtonElement;
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', String(item.open));
      toggle.appendChild(iconSpan('chevron', 'sm'));
      toggle.querySelector('.wi')?.classList.add('chev');
      const label = el('span', '', t('chat.thinking'));
      toggle.appendChild(label);
      const text = el('div', 'thought-text');
      text.textContent = item.text;
      block.appendChild(toggle);
      block.appendChild(text);
      toggle.addEventListener('click', () => {
        block.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(block.classList.contains('open')));
        const current = findItem(item.key);
        if (current && current.kind === 'thought') current.open = block.classList.contains('open');
      });
      if (item.open) block.classList.add('open');
      block.dataset.text = item.text;
      return block;
    }
    case 'tool':
      return buildToolCard(item);
    case 'plan':
      return buildPlanCard(item);
    case 'artifact':
      return buildArtifactCard(item);
    case 'permission':
      return buildPermissionCard(item);
    case 'question':
      return buildQuestionCard(item);
    case 'status': {
      const row = el('div', 'status-line fade-in');
      if (item.spin) row.appendChild(el('span', 'spinner'));
      row.appendChild(el('span', '', item.text));
      row.dataset.text = item.text;
      return row;
    }
    case 'subagent': {
      const card = el('div', 'subagent-card fade-in');
      const head = el('div', 'subagent-head');
      head.appendChild(iconSpan('users'));
      head.appendChild(el('span', 'sa-title', `${t('chat.subagent')} · ${item.title}`));
      const badge = el('span', `t-badge tb-${item.status === 'completed' ? 'completed' : item.status === 'failed' ? 'failed' : 'in_progress'}`, item.status);
      head.appendChild(badge);
      card.appendChild(head);
      const detail = [item.role, item.expertId].filter(Boolean).join(' · ');
      if (detail) card.appendChild(el('div', 'model-desc', detail));
      card.dataset.status = item.status;
      card.dataset.title = item.title;
      card.dataset.detail = detail;
      return card;
    }
    case 'error': {
      const card = el('div', 'error-card fade-in');
      const title = el('div', 'error-title');
      title.appendChild(iconSpan('alert'));
      title.appendChild(el('span', '', t('status.failed')));
      const message = el('div', 'error-message');
      message.textContent = item.message;
      card.appendChild(title);
      card.appendChild(message);
      const meta = el('div', 'error-meta');
      if (item.code) meta.appendChild(el('span', '', `code: ${item.code}`));
      if (item.retryable) meta.appendChild(el('span', '', 'retryable'));
      if (meta.childElementCount > 0) card.appendChild(meta);
      card.dataset.text = item.message;
      return card;
    }
    default:
      return el('div');
  }
}

function updateItem(node: HTMLElement, item: TranscriptItem): void {
  switch (item.kind) {
    case 'user': {
      if (node.dataset.text !== item.text) {
        node.dataset.text = item.text;
        const bubble = node.querySelector('.bubble');
        if (bubble) bubble.textContent = item.text;
      }
      return;
    }
    case 'agent': {
      if (node.dataset.text !== item.text) {
        node.dataset.text = item.text;
        const text = node.querySelector<HTMLElement>('.agent-text');
        if (text) renderAgentText(text, item.text);
      }
      return;
    }
    case 'thought': {
      if (node.dataset.text !== item.text) {
        node.dataset.text = item.text;
        const text = node.querySelector('.thought-text');
        if (text) text.textContent = item.text;
      }
      return;
    }
    case 'tool':
      updateToolCard(node, item);
      return;
    case 'plan':
      updatePlanCard(node, item);
      return;
    case 'permission':
    case 'question':
      if (item.resolved && !node.classList.contains('resolved')) rebuildDecisionCard(node, item);
      else updateDeadline(node, item);
      return;
    case 'subagent': {
      if (node.dataset.title !== item.title) {
        node.dataset.title = item.title;
        const title = node.querySelector('.sa-title');
        if (title) title.textContent = `${t('chat.subagent')} · ${item.title}`;
      }
      if (node.dataset.status !== item.status) {
        node.dataset.status = item.status;
        const badge = node.querySelector('.t-badge');
        if (badge) {
          badge.className = `t-badge tb-${item.status === 'completed' ? 'completed' : item.status === 'failed' ? 'failed' : 'in_progress'}`;
          badge.textContent = item.status;
        }
      }
      const detail = [item.role, item.expertId].filter(Boolean).join(' · ');
      if (node.dataset.detail !== detail) {
        node.dataset.detail = detail;
        const current = node.querySelector('.model-desc');
        if (detail) {
          if (current) current.textContent = detail;
          else node.appendChild(el('div', 'model-desc', detail));
        } else {
          current?.remove();
        }
      }
      return;
    }
    case 'status':
    case 'error':
    case 'artifact':
      return;
    default:
      return;
  }
}

// ---- 工具卡片 ----

function toolSummary(item: Extract<TranscriptItem, { kind: 'tool' }>): string {
  const input = item.rawInput || {};
  const command = input.command;
  if (typeof command === 'string' && command !== '') return command;
  const path = input.path;
  if (typeof path === 'string' && path !== '') return path;
  const pattern = input.pattern;
  if (typeof pattern === 'string' && pattern !== '') return pattern;
  return item.title;
}

function buildToolCard(item: Extract<TranscriptItem, { kind: 'tool' }>): HTMLElement {
  const card = el('div', 'tool-card fade-in');
  const head = el('button', 'tool-head') as HTMLButtonElement;
  head.type = 'button';
  head.setAttribute('aria-expanded', String(item.open));
  head.appendChild(iconSpan(TOOL_ICONS[item.toolKind] || 'cpu'));
  const name = el('span', 't-name', toolSummary(item));
  name.title = item.title;
  head.appendChild(name);
  const badge = el('span', `t-badge tb-${item.status}`, statusLabel(item.status));
  head.appendChild(badge);
  const chev = iconSpan('chevron', 'sm');
  chev.classList.add('chev');
  head.appendChild(chev);
  const body = el('div', 'tool-body');
  card.appendChild(head);
  card.appendChild(body);
  head.addEventListener('click', () => {
    card.classList.toggle('open');
    const open = card.classList.contains('open');
    head.setAttribute('aria-expanded', String(open));
    const current = findItem(item.key);
    if (current && current.kind === 'tool') current.open = open;
  });
  if (item.open) card.classList.add('open');
  renderToolBody(body, item);
  card.dataset.status = item.status;
  card.dataset.title = toolSummary(item);
  return card;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending': return getLocale() === 'zh' ? '排队中' : 'pending';
    case 'in_progress': return getLocale() === 'zh' ? '执行中' : 'running';
    case 'completed': return getLocale() === 'zh' ? '完成' : 'done';
    case 'failed': return getLocale() === 'zh' ? '失败' : 'failed';
    default: return status;
  }
}

function updateToolCard(node: HTMLElement, item: Extract<TranscriptItem, { kind: 'tool' }>): void {
  const badge = node.querySelector('.t-badge');
  if (badge) {
    badge.className = `t-badge tb-${item.status}`;
    badge.textContent = statusLabel(item.status);
  }
  const name = node.querySelector<HTMLElement>('.t-name');
  const summary = toolSummary(item);
  if (name && node.dataset.title !== summary) {
    node.dataset.title = summary;
    name.textContent = summary;
    name.title = item.title;
  }
  if (node.dataset.status !== item.status) {
    node.dataset.status = item.status;
  }
  const body = node.querySelector('.tool-body');
  if (body) renderToolBody(body as HTMLElement, item);
}

function renderToolBody(body: HTMLElement, item: Extract<TranscriptItem, { kind: 'tool' }>): void {
  const signature = JSON.stringify([item.rawInput ?? null, item.contents, item.locations ?? null]);
  if (body.dataset.signature === signature) return;
  body.dataset.signature = signature;
  body.textContent = '';
  if (item.rawInput && Object.keys(item.rawInput).length > 0) {
    body.appendChild(el('div', 'tool-section-label', t('chat.toolInput')));
    const pre = el('div', 'tool-code');
    pre.textContent = prettyInput(item.rawInput);
    body.appendChild(pre);
  }
  for (const content of item.contents) {
    if (content.type === 'diff') {
      body.appendChild(el('div', 'tool-section-label', 'diff'));
      body.appendChild(buildDiffView(content.path || '', content.oldText ?? null, content.newText || ''));
    } else if (content.content) {
      const text = content.content.text || '';
      if (!text.trim()) continue;
      body.appendChild(el('div', 'tool-section-label', t('chat.toolOutput')));
      const pre = el('div', 'tool-code');
      pre.textContent = text.length > 12000 ? `${text.slice(0, 12000)}\n…` : text;
      body.appendChild(pre);
    }
  }
  if (item.locations && item.locations.length > 0) {
    const meta = el('div', 'diff-path', item.locations.map((location) => location.path).join('\n'));
    body.appendChild(meta);
  }
  hydrateIcons(body);
}

function prettyInput(input: Record<string, unknown>): string {
  const command = input.command;
  if (typeof command === 'string' && command !== '') {
    const extra = Object.keys(input).filter((key) => key !== 'command');
    return extra.length === 0 ? command : JSON.stringify(input, null, 2);
  }
  return JSON.stringify(input, null, 2);
}

// 行级 LCS diff；超大文件降级为整段展示。
function buildDiffView(path: string, oldText: string | null, newText: string): HTMLElement {
  const view = el('div', 'diff-view');
  if (path) view.appendChild(el('div', 'diff-path', path));
  const newLines = newText.split('\n');
  if (oldText === null) {
    for (const line of newLines.slice(0, 400)) view.appendChild(el('div', 'diff-line add', `+ ${line}`));
    return view;
  }
  const oldLines = oldText.split('\n');
  if (oldLines.length > 1500 || newLines.length > 1500) {
    for (const line of oldLines.slice(0, 200)) view.appendChild(el('div', 'diff-line del', `- ${line}`));
    view.appendChild(el('div', 'diff-line', '…'));
    for (const line of newLines.slice(0, 200)) view.appendChild(el('div', 'diff-line add', `+ ${line}`));
    return view;
  }
  const rows = oldLines.length;
  const cols = newLines.length;
  const dp: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0));
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      dp[i][j] = oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  let budget = 800;
  while (i < rows && j < cols && budget > 0) {
    if (oldLines[i] === newLines[j]) {
      view.appendChild(el('div', 'diff-line', `  ${oldLines[i]}`));
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      view.appendChild(el('div', 'diff-line del', `- ${oldLines[i]}`));
      i += 1;
    } else {
      view.appendChild(el('div', 'diff-line add', `+ ${newLines[j]}`));
      j += 1;
    }
    budget -= 1;
  }
  while (i < rows && budget > 0) {
    view.appendChild(el('div', 'diff-line del', `- ${oldLines[i]}`));
    i += 1;
    budget -= 1;
  }
  while (j < cols && budget > 0) {
    view.appendChild(el('div', 'diff-line add', `+ ${newLines[j]}`));
    j += 1;
    budget -= 1;
  }
  if (budget <= 0) view.appendChild(el('div', 'diff-line', '…'));
  return view;
}

// ---- 计划卡片 ----

function buildPlanCard(item: Extract<TranscriptItem, { kind: 'plan' }>): HTMLElement {
  const card = el('div', 'plan-card fade-in');
  const head = el('div', 'plan-head');
  head.appendChild(iconSpan('list', 'md'));
  head.appendChild(el('span', '', t('chat.plan', { n: item.entries.length })));
  const steps = el('div', 'plan-steps');
  card.appendChild(head);
  card.appendChild(steps);
  card.dataset.count = String(item.entries.length);
  renderPlanSteps(steps, item);
  return card;
}

function planStepClass(status: string): string {
  switch (status) {
    case 'completed':
    case 'done':
      return 'done';
    case 'in_progress':
    case 'running':
      return 'doing';
    case 'failed':
      return 'failed';
    default:
      return '';
  }
}

function renderPlanSteps(container: HTMLElement, item: Extract<TranscriptItem, { kind: 'plan' }>): void {
  container.textContent = '';
  for (const entry of item.entries) {
    const step = el('div', `plan-step ${planStepClass(entry.status)}`.trim());
    const check = el('span', 'step-check');
    check.innerHTML = iconSVG('check');
    step.appendChild(check);
    step.appendChild(el('span', '', entry.content));
    container.appendChild(step);
  }
}

function updatePlanCard(node: HTMLElement, item: Extract<TranscriptItem, { kind: 'plan' }>): void {
  const signature = JSON.stringify(item.entries);
  if (node.dataset.signature === signature) return;
  node.dataset.signature = signature;
  const head = node.querySelector('.plan-head span:last-child');
  if (head) head.textContent = t('chat.plan', { n: item.entries.length });
  const steps = node.querySelector('.plan-steps');
  if (steps) renderPlanSteps(steps as HTMLElement, item);
}

// ---- 制品卡片 ----

function buildArtifactCard(item: Extract<TranscriptItem, { kind: 'artifact' }>): HTMLElement {
  const card = el('div', 'artifact-card fade-in');
  card.appendChild(el('div', 'artifact-title', item.fromToolCall ? t('chat.artifactFallback') : t('chat.artifacts', { n: 1 })));
  const list = el('div', 'artifact-list');
  list.appendChild(buildArtifactItem(item));
  card.appendChild(list);
  return card;
}

function buildArtifactItem(item: Extract<TranscriptItem, { kind: 'artifact' }>): HTMLElement {
  const chip = el('div', 'artifact-item');
  const icon = el('span', 'a-icon');
  icon.innerHTML = iconSVG(item.artifactKind === 'image' ? 'image' : 'doc');
  const meta = el('span');
  const name = el('span', 'a-name', item.filename);
  const sub = el('span', 'a-meta', [item.artifactKind, formatBytes(item.size)].filter(Boolean).join(' · '));
  meta.appendChild(name);
  meta.appendChild(document.createElement('br'));
  meta.appendChild(sub);
  chip.appendChild(icon);
  chip.appendChild(meta);
  chip.addEventListener('click', () => {
    void openArtifact(item);
  });
  return chip;
}

async function openArtifact(item: Extract<TranscriptItem, { kind: 'artifact' }>): Promise<void> {
  return openArtifactMeta(state.transcriptSessionId || state.activeSessionId, item);
}

export async function openArtifactMeta(
  sessionId: string | null,
  item: { artifactId: string; filename: string; mediaType?: string; artifactKind: string; size?: number; fromToolCall?: boolean },
): Promise<void> {
  if (item.fromToolCall || !item.artifactId) {
    // A mutable worktree path is not an artifact capability. Older tool-only
    // updates cannot be opened directly by the renderer; canonical artifacts
    // must be fetched through ACP with their attachment ID.
    desktop.log(`artifact open skipped without ACP attachment ID: ${item.filename}`);
    toast(t('artifact.notSupported'));
    return;
  }
  try {
    const result = await invoke<{ filename?: string; mediaType?: string; size?: number; contentBase64?: string }>(
      'mothx/attachment/fetch',
      { sessionId, attachmentId: item.artifactId },
    );
    const data = result?.contentBase64 || '';
    const mediaType = result?.mediaType || item.mediaType || 'application/octet-stream';
    if (mediaType.startsWith('image/')) {
      const img = require$('#preview-image') as HTMLImageElement;
      img.src = `data:${mediaType};base64,${data}`;
      require$('#preview-modal').hidden = false;
      return;
    }
    toast(t('artifact.saved'));
    desktop.log(`artifact fetched via ACP: ${item.filename} (${mediaType})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const rpcCode = (error as { code?: number }).code;
    const dataCode = (error as { data?: { code?: string } }).data?.code || '';
    if (rpcCode === -32601) toast(t('artifact.notSupported'));
    else if (dataCode === 'attachment_too_large') toast(t('artifact.openFailed', { e: dataCode }));
    else toast(t('artifact.openFailed', { e: message }));
  }
}

// ---- 审批卡片 ----

function buildPermissionCard(item: Extract<TranscriptItem, { kind: 'permission' }>): HTMLElement {
  const card = el('div', 'decision-card fade-in');
  const head = el('div', 'decision-head');
  head.appendChild(iconSpan('shield'));
  head.appendChild(el('span', '', `${t('chat.approvalTitle')} · ${item.title}`));
  head.appendChild(el('span', 'decision-deadline'));
  const body = el('div', 'decision-body');
  if (item.rawInput && Object.keys(item.rawInput).length > 0) {
    const pre = el('div', 'tool-code');
    pre.textContent = prettyInput(item.rawInput);
    body.appendChild(pre);
  }
  card.appendChild(head);
  card.appendChild(body);
  updateDeadline(card, item);
  if (item.resolved) {
    card.classList.add('resolved');
    body.appendChild(el('div', 'decision-resolved-note', t('chat.resolved', { v: item.resolved })));
  } else {
    const actions = el('div', 'decision-actions');
    for (const option of item.options) {
      const button = option.kind === 'reject_once' ? el('button', 'btn-deny', option.name || t('chat.reject')) : el('button', 'btn-allow', option.name || t('chat.allow'));
      button.addEventListener('click', () => resolvePermission(item, option.optionId));
      actions.appendChild(button);
    }
    const skip = el('button', 'btn-deny', t('chat.cancelled'));
    skip.addEventListener('click', () => cancelPermission(item));
    actions.appendChild(skip);
    body.appendChild(actions);
  }
  hydrateIcons(card);
  return card;
}

// ---- 提问卡片 ----

function buildQuestionCard(item: Extract<TranscriptItem, { kind: 'question' }>): HTMLElement {
  const card = el('div', 'decision-card fade-in');
  const head = el('div', 'decision-head');
  head.appendChild(iconSpan('question'));
  head.appendChild(el('span', '', t('chat.questionTitle')));
  head.appendChild(el('span', 'decision-deadline'));
  const body = el('div', 'decision-body');
  if (item.prompt) body.appendChild(el('div', 'decision-question', item.prompt));
  if (item.explanation) body.appendChild(el('div', 'decision-explain', item.explanation));
  card.appendChild(head);
  card.appendChild(body);
  updateDeadline(card, item);
  if (item.resolved) {
    card.classList.add('resolved');
    body.appendChild(el('div', 'decision-resolved-note', t('chat.resolved', { v: item.resolved })));
  } else {
    if (item.options.length > 0) {
      const actions = el('div', 'decision-actions');
      for (const option of item.options) {
        const button = el('button', 'btn-ghost', option.label);
        button.addEventListener('click', () => resolveQuestion(item, option.label));
        actions.appendChild(button);
      }
      body.appendChild(actions);
    }
    const inputRow = el('div', 'decision-input');
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = t('chat.answerPlaceholder');
    const submit = el('button', 'btn-allow', t('chat.submit'));
    const skip = el('button', 'btn-deny', t('chat.skip'));
    const doSubmit = () => {
      const value = input.value.trim();
      if (!value) return;
      resolveQuestion(item, value);
    };
    submit.addEventListener('click', doSubmit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') doSubmit();
    });
    skip.addEventListener('click', () => cancelQuestion(item));
    inputRow.appendChild(input);
    inputRow.appendChild(submit);
    inputRow.appendChild(skip);
    body.appendChild(inputRow);
  }
  hydrateIcons(card);
  return card;
}

type DecisionItem = Extract<TranscriptItem, { kind: 'permission' }> | Extract<TranscriptItem, { kind: 'question' }>;

function rebuildDecisionCard(node: HTMLElement, item: DecisionItem): void {
  const fresh = item.kind === 'permission' ? buildPermissionCard(item) : buildQuestionCard(item);
  node.replaceWith(fresh);
  itemElements.set(item.key, fresh);
}

function deadlineText(deadline: number): string {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return t('chat.deadlineExpired');
  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const label = minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `${seconds}s`;
  return t('chat.deadline', { t: label });
}

function updateDeadline(node: HTMLElement, item: Extract<TranscriptItem, { kind: 'permission' }> | Extract<TranscriptItem, { kind: 'question' }>): void {
  const span = node.querySelector<HTMLElement>('.decision-deadline');
  if (!span) return;
  if (!item.deadline || item.resolved) {
    span.textContent = '';
    return;
  }
  span.textContent = deadlineText(item.deadline);
}

// 全局 1s ticker：刷新未决审批/提问卡片的倒计时文本。
export function startDeadlineTicker(): void {
  window.setInterval(() => {
    for (const item of state.transcript) {
      if ((item.kind !== 'permission' && item.kind !== 'question') || !item.deadline || item.resolved) continue;
      const node = itemElements.get(item.key);
      if (node) updateDeadline(node, item);
    }
  }, 1000);
}

// 复制完整转录（聊天头部动作）。
export function transcriptAsMarkdown(): string {
  const lines: string[] = [];
  for (const item of state.transcript) {
    switch (item.kind) {
      case 'user':
        lines.push(`## 👤 User\n\n${item.text}\n`);
        break;
      case 'agent':
        lines.push(`## 🤖 MothX\n\n${item.text}\n`);
        break;
      case 'thought':
        lines.push(`<details><summary>${t('chat.thinking')}</summary>\n\n${item.text}\n\n</details>\n`);
        break;
      case 'tool':
        lines.push(`> 🔧 ${item.title} — ${item.status}\n`);
        break;
      case 'plan':
        lines.push(item.entries.map((entry) => `- [${entry.status}] ${entry.content}`).join('\n') + '\n');
        break;
      case 'artifact':
        lines.push(`> 📦 artifact: ${item.filename}\n`);
        break;
      case 'error':
        lines.push(`> ❌ ${item.message}\n`);
        break;
      default:
        break;
    }
  }
  return lines.join('\n');
}
