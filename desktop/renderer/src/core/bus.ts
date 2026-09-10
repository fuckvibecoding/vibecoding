// 极简 UI 信号总线:core 动作层通过它请求纯视图副作用(滚动、聚焦、注入
// 输入框),React 组件订阅并在挂载后消费。核心层不持有任何 DOM 引用。

type Listener<T> = (payload: T) => void;

class Emitter<T> {
  private listeners = new Set<Listener<T>>();

  on(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(payload: T): void {
    for (const listener of [...this.listeners]) listener(payload);
  }
}

export const chatScrollEvents = new Emitter<{ force: boolean }>();
export const composerInjectEvents = new Emitter<{ text: string }>();
export const composerReplaceEvents = new Emitter<{ text: string }>();
export const composerFocusEvents = new Emitter<{ which: 'home' | 'chat' }>();
export const cronCompletedEvents = new Emitter<Record<string, unknown>>();

// 注入请求可能发生在目标 composer 挂载之前(例如从技能页切回聊天后立即
// 注入指令)。未消费的文本保留在 pendingInjection,composer 挂载时先消费。
let pendingInjection: string | null = null;

export function requestComposerInjection(text: string): void {
  pendingInjection = text + (pendingInjection || '');
  composerInjectEvents.emit({ text });
}

// consumePendingInjection 返回尚未被实时事件消费的注入文本;调用方(挂载中
// 的 composer)负责将其前置到输入框并清空。
export function consumePendingInjection(): string | null {
  const value = pendingInjection;
  pendingInjection = null;
  return value;
}

// 替换语义(首页快捷卡片):目标输入框内容整体替换为提示词并聚焦。
let pendingReplacement: string | null = null;

export function requestComposerReplace(text: string): void {
  pendingReplacement = text;
  composerReplaceEvents.emit({ text });
}

export function consumePendingReplacement(): string | null {
  const value = pendingReplacement;
  pendingReplacement = null;
  return value;
}

export function requestChatScroll(force = false): void {
  chatScrollEvents.emit({ force });
}

export function requestComposerFocus(which: 'home' | 'chat'): void {
  composerFocusEvents.emit({ which });
}
