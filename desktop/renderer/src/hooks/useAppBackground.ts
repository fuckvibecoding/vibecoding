import { useAppState } from '@/hooks/useAppState';

// useAppBackground:当前是否启用了用户背景图,以及作用范围(全局/仅首页)。
// 结构面板据此切换为半透明毛玻璃表面,保持任意图片上的可读性。
export function useAppBackground(): { app: boolean; home: boolean; hasImage: boolean } {
  const { store } = useAppState();
  const hasImage = store.homeBackgroundImage.trim() !== '';
  return {
    hasImage,
    app: hasImage && store.homeBackgroundScope === 'app',
    home: hasImage && store.homeBackgroundScope === 'home',
  };
}
