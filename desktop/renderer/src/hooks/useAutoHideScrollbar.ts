// 侧边栏滚动条:默认隐藏,交互(指针进入/滚轮/滚动)时显示,静置 2s 后隐藏。
// 延续旧 renderer 的 .scrolling 类切换语义,类样式在 index.css 组件层。

import { useEffect, type RefObject } from 'react';

export function useAutoHideScrollbar(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    let hideTimer: number | undefined;
    let pointerInside = false;
    const show = () => {
      container.classList.add('scrolling');
      window.clearTimeout(hideTimer);
      if (pointerInside) return;
      hideTimer = window.setTimeout(() => container.classList.remove('scrolling'), 2000);
    };
    const enter = () => {
      pointerInside = true;
      container.classList.add('scrolling');
      window.clearTimeout(hideTimer);
    };
    const leave = () => {
      pointerInside = false;
      show();
    };
    container.addEventListener('pointerenter', enter);
    container.addEventListener('pointerleave', leave);
    container.addEventListener('wheel', show, { passive: true });
    container.addEventListener('scroll', show, { passive: true });
    return () => {
      window.clearTimeout(hideTimer);
      container.removeEventListener('pointerenter', enter);
      container.removeEventListener('pointerleave', leave);
      container.removeEventListener('wheel', show);
      container.removeEventListener('scroll', show);
    };
  }, [ref]);
}
