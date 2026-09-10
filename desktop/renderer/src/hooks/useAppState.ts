// React ↔ 中央状态桥:useSyncExternalStore 订阅 core/state 的版本号。
// 组件在渲染期直接读取 state 字段(与旧的 renderAll 全量刷新语义一致)。

import { useSyncExternalStore } from 'react';

import { getStateVersion, hasFeature, state, subscribe, type AppState } from '@/core/state';

export function useAppState(): AppState {
  useSyncExternalStore(subscribe, getStateVersion, getStateVersion);
  return state;
}

export function useFeature(key: string): boolean {
  useAppState();
  return hasFeature(key);
}
