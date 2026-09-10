// UI 宿主桥:core 动作层的 toast / 输入对话框 / 危险确认 / 图片预览都通过
// 这里请求,由 React 侧注册的宿主实现(sonner + shadcn Dialog/AlertDialog)。
// core 因此保持零 DOM 依赖,可在 Node 测试中直接导入。

export interface PromptModalOptions {
  title: string;
  initialValue?: string;
  okLabel: string;
  cancelLabel: string;
  allowEmpty?: boolean;
  placeholder?: string;
  multiline?: boolean;
  secret?: boolean;
}

export interface UiHost {
  toast(message: string): void;
  prompt(options: PromptModalOptions): Promise<string | null>;
  confirm(message: string): Promise<boolean>;
  previewImage(source: string): void;
}

// 未注册宿主时的安全回退:不抛错、不阻塞进程,破坏性操作默认取消。
const fallbackHost: UiHost = {
  toast() {
    /* no host mounted */
  },
  prompt() {
    return Promise.resolve(null);
  },
  confirm() {
    return Promise.resolve(false);
  },
  previewImage() {
    /* no host mounted */
  },
};

let host: UiHost = fallbackHost;

export function registerUiHost(next: UiHost): () => void {
  const previous = host;
  host = next;
  return () => {
    if (host === next) host = previous;
  };
}

export function toast(message: string): void {
  host.toast(message);
}

// promptModal 返回输入值;取消返回 null。
export function promptModal(options: PromptModalOptions): Promise<string | null> {
  return host.prompt(options);
}

// confirmDanger 用于删除等破坏性确认,由 shadcn AlertDialog 承载。
export function confirmDanger(message: string): Promise<boolean> {
  return host.confirm(message);
}

export function previewImage(source: string): void {
  host.previewImage(source);
}
