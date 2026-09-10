// 聊天/任务视图:头部(状态 chip + 标题 + 分叉/重命名/删除)、转录流与
// 底部 composer。

import { Pencil, Share2, Trash2 } from 'lucide-react';

import { ChatStream } from '@/components/ChatStream';
import { Composer } from '@/components/Composer';
import { StatusChip } from '@/components/StatusChip';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { t } from '@/core/i18n';
import { deleteSession, forkSession, renameSession } from '@/core/sessions';
import { STATUS_VARIANT } from '@/core/transcript';
import { useAppState } from '@/hooks/useAppState';
import { useAppBackground } from '@/hooks/useAppBackground';
import { cn } from '@/lib/utils';

export function ChatView() {
  const appState = useAppState();
  const background = useAppBackground();

  return (
    <section className="absolute inset-0 flex flex-col">
      <header
        className={cn(
          'flex h-[46px] shrink-0 items-center gap-2.5 border-b border-border px-4',
          background.app && 'border-b-transparent bg-transparent'
        )}
      >
        <StatusChip variant={STATUS_VARIANT[appState.runStatus] || 'idle'} label={t(`status.${appState.runStatus}`)} />
        <div className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-strong">
          {appState.activeTitle || t('chat.newTask')}
        </div>
        <div className="flex gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('chat.fork')}
                onClick={() => {
                  if (appState.activeSessionId) void forkSession(appState.activeSessionId);
                }}
              >
                <Share2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('chat.fork')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('chat.rename')}
                onClick={() => {
                  if (appState.activeSessionId) void renameSession(appState.activeSessionId);
                }}
              >
                <Pencil />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('chat.rename')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('chat.delete')}
                onClick={() => {
                  if (appState.activeSessionId) void deleteSession(appState.activeSessionId);
                }}
              >
                <Trash2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('chat.delete')}</TooltipContent>
          </Tooltip>
        </div>
      </header>

      <ChatStream />

      <footer
        className={cn(
          'shrink-0 border-t border-border bg-background pt-2.5 pb-3.5',
          background.app && 'border-t-transparent bg-transparent'
        )}
      >
        <div className="mx-auto w-[min(820px,92%)]">
          <Composer source="chat" />
        </div>
      </footer>
    </section>
  );
}
