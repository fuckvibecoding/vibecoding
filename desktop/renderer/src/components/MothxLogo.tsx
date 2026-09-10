import { cn } from '@/lib/utils';

// 品牌 logo:与打包应用使用同一资源(build 脚本把 mothx.png 复制到
// dist/renderer 根目录,index.html 相对引用)。
export function MothxLogo({ className }: { className?: string }) {
  return (
    <img
      src="mothx.png"
      alt=""
      aria-hidden="true"
      className={cn('size-full object-contain', className)}
    />
  );
}
