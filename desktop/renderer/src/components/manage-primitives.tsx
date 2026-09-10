import type { ReactNode } from 'react';

import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ACP 管理面板的统一卡片/字段原语:eyebrow+标题+描述的头部卡、分组卡、
// 三列字段网格、标签字段与开关行。保持旧 application-settings-* 的信息
// 层级,但由 shadcn 控件承载交互。

export function ManageHeader({
  eyebrow,
  title,
  desc,
  actions,
}: {
  eyebrow?: string;
  title: string;
  desc?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3.5 rounded-[14px] border border-border bg-card p-4 shadow-panel max-[760px]:flex-col">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-0.5 text-[10px] font-bold uppercase leading-tight tracking-[.08em] text-faint">{eyebrow}</div>
        ) : null}
        <div className="text-[14px] font-bold leading-snug text-strong">{title}</div>
        {desc ? <div className="mt-1 max-w-[680px] text-[11.5px] leading-snug text-muted-foreground">{desc}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}

export function ManageCard({
  title,
  desc,
  children,
  className,
}: {
  title?: string;
  desc?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-[14px] border border-border bg-card p-4 shadow-panel', className)}>
      {title ? (
        <div className="mb-3">
          <div className="text-[14px] font-bold leading-snug text-strong">{title}</div>
          {desc ? <div className="mt-1 text-[11.5px] leading-snug text-muted-foreground">{desc}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function ManageWorkspace({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-3', className)}>{children}</div>;
}

export function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'grid grid-cols-3 items-start gap-2.5 max-[760px]:grid-cols-1',
        className
      )}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
  full,
  className,
}: {
  label: string;
  children: ReactNode;
  full?: boolean;
  className?: string;
}) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1.5 text-[11px] font-semibold text-muted-foreground', full && 'col-span-full max-[760px]:col-auto', className)}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function ToggleField({
  label,
  desc,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-h-[34px] items-center justify-between gap-2.5 rounded-[9px] border border-border bg-background px-2.5 py-2 hover:border-borderstrong">
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold text-strong">{label}</span>
        {desc ? <span className="block text-[10px] leading-snug text-muted-foreground">{desc}</span> : null}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  );
}

export function UnsupportedRow({ text }: { text: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="px-4 py-3 text-[11.5px] text-muted-foreground">{text}</div>
    </div>
  );
}

// 字符串选项下拉:当前值不在选项内时自动追加,避免受控 Select 丢值。
export function OptionSelect({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const choices = options.includes(value) || !value ? options : [...options, value];
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn('w-full', className)} aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {choices.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
