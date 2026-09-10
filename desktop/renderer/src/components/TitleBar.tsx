import { useState } from 'react';
import { Minus, Square, X } from 'lucide-react';

import { MothxLogo } from '@/components/MothxLogo';
import { desktop } from '@/core/api';
import { t } from '@/core/i18n';
import { useAppState } from '@/hooks/useAppState';
import { cn } from '@/lib/utils';
import { useAppBackground } from '@/hooks/useAppBackground';

// 标题栏:38px,可拖拽;Windows/Linux 自绘窗口按钮,macOS 使用原生红绿灯。
export function TitleBar() {
  const appState = useAppState();
  const background = useAppBackground();
  const [maximized, setMaximized] = useState(false);
  const isDarwin = desktop.platform() === 'darwin';

  return (
    <header
      className={cn(
        'titlebar-drag app-layer flex h-[var(--titlebar-h)] shrink-0 items-center justify-between border-b border-border bg-titlebar pr-2 pl-3',
        background.app && 'app-surface-veil border-b-transparent'
      )}
    >
      <div
        className={cn(
          'flex min-w-0 items-center gap-2',
          background.app && 'app-titlebar-surface rounded-lg py-0.5 pr-2 pl-1'
        )}
      >
        <span className="block size-5 shrink-0 rounded-[5px]">
          <MothxLogo />
        </span>
        <span
          className={cn(
            'text-[12.5px] font-semibold tracking-[.2px] text-strong',
            background.app && "text-strong [text-shadow:0_1px_2px_rgb(var(--app-outline-rgb)/.12)]"
          )}
        >
          MothX
        </span>
        <span
          className={cn(
            'rounded-lg bg-hoverbg px-1.5 py-px text-[10.5px] text-faint',
            background.app && 'border border-[rgb(var(--app-outline-rgb)/.1)] bg-[rgb(var(--app-outline-rgb)/.07)] text-muted-foreground'
          )}
        >
          v{appState.appInfo.version}
        </span>
      </div>

      {isDarwin ? null : (
        <div
          className={cn(
            'titlebar-no-drag flex gap-0.5',
            background.app && 'app-titlebar-surface rounded-lg p-0.5'
          )}
        >
          <button
            type="button"
            className={cn(
              'flex h-[26px] w-[34px] items-center justify-center rounded-md text-muted-foreground hover:bg-hoverbg hover:text-strong',
              background.app && 'rounded-[5px] border border-transparent hover:border-[var(--app-control-border-strong)] hover:bg-[var(--app-titlebar-control-hover)] hover:text-strong'
            )}
            title={t('win.minimize')}
            aria-label={t('win.minimize')}
            onClick={() => desktop.windowControl('minimize')}
          >
            <Minus className="size-4" />
          </button>
          <button
            type="button"
            className={cn(
              'flex h-[26px] w-[34px] items-center justify-center rounded-md text-muted-foreground hover:bg-hoverbg hover:text-strong',
              background.app && 'rounded-[5px] border border-transparent hover:border-[var(--app-control-border-strong)] hover:bg-[var(--app-titlebar-control-hover)] hover:text-strong'
            )}
            title={t('win.maximize')}
            aria-label={t('win.maximize')}
            onClick={() => {
              setMaximized((value) => !value);
              desktop.windowControl('maximize');
            }}
          >
            <Square className="size-3.5" />
          </button>
          <button
            type="button"
            className={cn(
              'flex h-[26px] w-[34px] items-center justify-center rounded-md text-muted-foreground hover:bg-danger hover:text-destructive-foreground',
              background.app && 'rounded-[5px] border border-transparent hover:border-transparent hover:bg-danger hover:text-destructive-foreground'
            )}
            title={t('win.close')}
            aria-label={t('win.close')}
            onClick={() => desktop.windowControl('close')}
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </header>
  );
}
