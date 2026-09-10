// 主题与应用背景:Desktop 本地视觉偏好(主题/语言/背景图)只进入
// desktop-store.json;背景图通过 CSS 变量注入根壳层,不复制进会话或 ACP。

import { desktop } from './api';
import { emit, state } from './state';

export function applyTheme(theme: 'light' | 'dark'): void {
  state.store.theme = theme;
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme;
  }
  void desktop.storeSet({ theme }).catch(() => undefined);
  emit();
}

export function applyLocalePreference(locale: 'zh' | 'en'): void {
  state.store.locale = locale;
  void desktop.storeSet({ locale }).catch(() => undefined);
  emit();
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function homeImageURL(path: string): string {
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
export function applyHomeBackground(root: HTMLElement | null): void {
  if (!root) return;
  const source = homeImageURL(state.store.homeBackgroundImage);
  if (!source) {
    root.classList.remove('has-app-background');
    root.classList.remove('has-home-background');
    for (const property of ['--app-user-image', '--app-user-image-opacity', '--app-user-image-blur', '--app-user-image-size', '--app-user-image-repeat', '--app-user-image-position', '--app-background-veil', '--app-surface-veil', '--app-surface-blur']) root.style.removeProperty(property);
    return;
  }
  const fit = state.store.homeBackgroundFit;
  const positions: Record<typeof state.store.homeBackgroundPosition, string> = { center: 'center', left: 'left center', right: 'right center', top: 'center top', bottom: 'center bottom' };
  const opacity = clampNumber(state.store.homeBackgroundOpacity, 0, 100) / 100;
  root.classList.toggle('has-app-background', state.store.homeBackgroundScope === 'app');
  root.classList.toggle('has-home-background', state.store.homeBackgroundScope === 'home');
  root.style.setProperty('--app-user-image', `url("${source}")`);
  root.style.setProperty('--app-user-image-opacity', String(opacity));
  root.style.setProperty('--app-user-image-blur', `${clampNumber(state.store.homeBackgroundBlur, 0, 24)}px`);
  root.style.setProperty('--app-user-image-size', fit === 'stretch' ? '100% 100%' : fit === 'tile' ? 'auto' : fit);
  root.style.setProperty('--app-user-image-repeat', fit === 'tile' ? 'repeat' : 'no-repeat');
  root.style.setProperty('--app-user-image-position', positions[state.store.homeBackgroundPosition]);
  // A full-opacity image deliberately removes the former fixed pale/dark veils
  // and surface blur, so the selected image remains genuinely visible.
  root.style.setProperty('--app-background-veil', String((1 - opacity) * 0.72));
  root.style.setProperty('--app-surface-veil', String((1 - opacity) * 0.68));
  root.style.setProperty('--app-surface-blur', `${Math.round((1 - opacity) * 10)}px`);
}

export type HomeBackgroundPatch = Partial<Pick<typeof state.store, 'homeBackgroundImage' | 'homeBackgroundOpacity' | 'homeBackgroundBlur' | 'homeBackgroundScope' | 'homeBackgroundFit' | 'homeBackgroundPosition'>>;

export function updateHomeBackground(patch: HomeBackgroundPatch, persist: boolean): void {
  if (patch.homeBackgroundImage !== undefined) state.store.homeBackgroundImage = patch.homeBackgroundImage;
  if (patch.homeBackgroundOpacity !== undefined) state.store.homeBackgroundOpacity = clampNumber(patch.homeBackgroundOpacity, 0, 100);
  if (patch.homeBackgroundBlur !== undefined) state.store.homeBackgroundBlur = clampNumber(patch.homeBackgroundBlur, 0, 24);
  if (patch.homeBackgroundScope !== undefined) state.store.homeBackgroundScope = patch.homeBackgroundScope;
  if (patch.homeBackgroundFit !== undefined) state.store.homeBackgroundFit = patch.homeBackgroundFit;
  if (patch.homeBackgroundPosition !== undefined) state.store.homeBackgroundPosition = patch.homeBackgroundPosition;
  if (persist) void desktop.storeSet(patch);
  emit();
}

export function setDefaultWorkingDirectoryNext(cwd: string): void {
  // 仅更新下一次 session/new 的候选目录;不触碰已有会话,也不重启 ACP。
  state.newSessionCwd = cwd;
  state.dirConfirmed = true;
  state.store.lastWorkspace = cwd;
  void desktop.storeSet({ lastWorkspace: cwd });
  emit();
}

export { clampNumber };
