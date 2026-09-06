// 通用 UI 原语：toast、弹出菜单、模态框、DOM 帮助函数。

import { hydrateIcons } from './icons';

export function $(selector: string): HTMLElement | null {
  return document.querySelector(selector);
}

export function require$(selector: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`missing element: ${selector}`);
  return el;
}

let toastTimer: number | undefined;
export function toast(message: string): void {
  const el = require$('#toast');
  el.textContent = message;
  el.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2600);
}

export function hideMenus(): void {
  document.querySelectorAll('.pop-menu').forEach((menu) => menu.classList.remove('show'));
}

export function showMenu(menu: HTMLElement, anchor: HTMLElement): void {
  hideMenus();
  menu.classList.add('show');
  const rect = anchor.getBoundingClientRect();
  const menuWidth = menu.offsetWidth;
  const menuHeight = menu.offsetHeight;
  let left = rect.left;
  let top = rect.bottom + 6;
  if (left + menuWidth > window.innerWidth - 8) left = window.innerWidth - menuWidth - 8;
  if (top + menuHeight > window.innerHeight - 8) top = rect.top - menuHeight - 6;
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
}

export function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function iconSpan(name: string, size: 'sm' | 'md' | 'lg' = 'sm'): HTMLElement {
  const span = document.createElement('span');
  span.className = size === 'md' ? 'wi' : `wi ${size}`;
  span.dataset.icon = name;
  hydrateIcons(span);
  return span;
}

// 简易 Markdown 渲染：**bold**、`code`、``` 块。仅用于 agent 文本，
// 输出全部经 textContent 转义后组装，避免 HTML 注入。
export function renderAgentText(target: HTMLElement, text: string): void {
  target.textContent = '';
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      const strong = document.createElement('strong');
      strong.textContent = part.slice(2, -2);
      target.appendChild(strong);
    } else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      const code = document.createElement('code');
      code.textContent = part.slice(1, -1);
      target.appendChild(code);
    } else {
      target.appendChild(document.createTextNode(part));
    }
  }
}

export function formatBytes(size?: number): string {
  if (!size || size <= 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export interface ModalOptions {
  title: string;
  initialValue?: string;
  okLabel: string;
  cancelLabel: string;
  allowEmpty?: boolean;
}

// promptModal 返回输入值；取消返回 null。
export function promptModal(options: ModalOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const backdrop = require$('#rename-modal');
    const input = require$('#rename-input') as HTMLInputElement;
    const ok = require$('#rename-ok');
    const cancel = require$('#rename-cancel');
    const titleEl = backdrop.querySelector<HTMLElement>('.modal-title');
    if (titleEl) titleEl.textContent = options.title;
    ok.textContent = options.okLabel;
    cancel.textContent = options.cancelLabel;
    input.value = options.initialValue || '';
    backdrop.hidden = false;
    input.focus();
    input.select();

    const cleanup = (value: string | null) => {
      backdrop.hidden = true;
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
      backdrop.removeEventListener('mousedown', onBackdrop);
      resolve(value);
    };
    const submittedValue = () => {
      const value = input.value.trim();
      return value || options.allowEmpty ? value : null;
    };
    const onOk = () => cleanup(submittedValue());
    const onCancel = () => cleanup(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter') cleanup(submittedValue());
      if (event.key === 'Escape') cleanup(null);
    };
    const onBackdrop = (event: MouseEvent) => {
      if (event.target === backdrop) cleanup(null);
    };
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKey);
    backdrop.addEventListener('mousedown', onBackdrop);
  });
}

// confirmDialog 使用原生阻塞对话框（Electron 下为系统样式），
// 仅用于删除等破坏性确认。
export function confirmDialog(message: string): boolean {
  return window.confirm(message);
}
