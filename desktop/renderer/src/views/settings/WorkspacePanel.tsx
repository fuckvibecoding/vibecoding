// 工作区面板:新会话默认工作目录 + 最近目录。更改默认目录不重启 ACP、
// 不筛选任务、不影响已有会话(每个会话保存自己的工作目录)。

import { Folder } from 'lucide-react';

import { RowItem, RowList } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { desktop } from '@/core/api';
import { t } from '@/core/i18n';
import { setDefaultWorkingDirectoryNext } from '@/core/theme';
import { toast } from '@/core/ui-host';
import { useAppState } from '@/hooks/useAppState';
import { basename } from '@/lib/utils';

export function WorkspacePanel() {
  const appState = useAppState();
  const defaultWorkDir = appState.newSessionCwd || appState.store.lastWorkspace || '…';
  const recents = appState.store.recentWorkspaces.filter((entry) => entry !== defaultWorkDir);

  const choose = async () => {
    const picked = await desktop.chooseDirectory(appState.newSessionCwd || appState.store.lastWorkspace || '');
    if (!picked) return;
    setDefaultWorkingDirectoryNext(picked);
    toast(t('settings.defaultWorkDirSaved', { w: basename(picked) }));
  };

  return (
    <section>
      <RowList>
        <RowItem
          icon={<Folder />}
          title={t('settings.currentWorkspace')}
          desc={defaultWorkDir}
        >
          <Button variant="outline" onClick={() => void choose()}>
            <Folder />
            {t('settings.choose')}
          </Button>
        </RowItem>
        {recents.length > 0 ? (
          <>
            <div className="border-b border-border px-4 pt-2.5 pb-1.5 text-[11px] font-semibold tracking-[.3px] text-muted-foreground">
              {t('settings.recent')}
            </div>
            {recents.map((entry) => (
              <RowItem
                key={entry}
                icon={<Folder />}
                title={basename(entry)}
                desc={entry}
                onClick={() => {
                  setDefaultWorkingDirectoryNext(entry);
                  toast(t('settings.defaultWorkDirSaved', { w: basename(entry) }));
                }}
              />
            ))}
          </>
        ) : null}
        <RowItem title={t('settings.sessionWorkDir')} desc={t('settings.sessionWorkDirDesc')} icon={<Folder />} />
      </RowList>
    </section>
  );
}
