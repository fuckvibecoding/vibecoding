import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

// 通用列表页骨架:滚动容器 + 居中内容列 + 页头(标题/副标题/右侧动作)。
export function PageScroll({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('h-full min-h-0 overflow-y-auto', className)}>{children}</div>;
}

export function PageInner({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-[min(880px,94%)] py-6 pb-12', className)}>{children}</div>;
}

export function PageHead({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-5 flex items-start gap-3', className)}>
      <div className="min-w-0">
        <div className="text-[19px] font-bold text-strong">{title}</div>
        {subtitle ? <div className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{subtitle}</div> : null}
      </div>
      {actions ? <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// 行列表:圆角卡片容器 + 分隔行。
export function RowList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-border bg-card', className)}>
      {children}
    </div>
  );
}

export function RowItem({
  icon,
  title,
  desc,
  children,
  onClick,
  className,
  align = 'center',
}: {
  icon?: ReactNode;
  title?: ReactNode;
  desc?: ReactNode;
  children?: ReactNode;
  onClick?: () => void;
  className?: string;
  align?: 'center' | 'start';
}) {
  return (
    <div
      className={cn(
        'flex gap-3 border-b border-border px-4 py-3 last:border-b-0',
        align === 'center' ? 'items-center' : 'items-start',
        onClick && 'cursor-pointer hover:bg-hoverbg',
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {icon ? (
        <div className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-placeholder text-muted-foreground [&_svg]:size-4">
          {icon}
        </div>
      ) : null}
      {(title || desc) && (
        <div className="min-w-0 flex-1">
          {title ? <div className="flex items-center gap-2 text-[13px] font-semibold text-strong">{title}</div> : null}
          {desc ? <div className="mt-0.5 break-all text-[11.5px] text-muted-foreground">{desc}</div> : null}
        </div>
      )}
      {children}
    </div>
  );
}

export function RowIcon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-placeholder text-muted-foreground [&_svg]:size-4', className)}>
      {children}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="py-14 text-center text-faint">
      {icon ? <div className="mx-auto mb-3 opacity-50 [&_svg]:size-10">{icon}</div> : null}
      <div className="mb-1 text-[14px] font-semibold text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

// 能力缺口卡片:runtime 未声明该能力时的占位。
export function GapCard({ icon, title, desc, meta, children }: { icon: ReactNode; title: string; desc: string; meta?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-borderstrong bg-card p-7 text-center text-muted-foreground">
      <div className="text-faint [&_svg]:size-10">{icon}</div>
      <div className="text-[14px] font-semibold text-muted-foreground">{title}</div>
      <div className="max-w-[560px] text-[12.5px] leading-[1.7] text-faint">{desc}</div>
      {meta ? <div className="font-mono text-[11px] text-faint">{meta}</div> : null}
      {children ? <div className="mt-1.5 w-full text-left">{children}</div> : null}
    </div>
  );
}

export function GroupLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('px-1 pt-3.5 pb-1.5 text-[11px] font-semibold tracking-[.3px] text-muted-foreground', className)}>
      {children}
    </div>
  );
}
