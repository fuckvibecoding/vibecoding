// MCP 服务器面板:mothx/manage/mcp 投影。新增走 名称 → 命令(或 URL)的
// 引导式对话框;删除即从 servers 列表中移除后整体 set。

import { useEffect, useState } from 'react';
import { Globe, Plus } from 'lucide-react';

import { RowItem, RowList } from '@/components/layout';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { t } from '@/core/i18n';
import { loadMcp, setMcpServers, type McpServerView } from '@/core/manage-api';
import { hasFeature } from '@/core/state';
import { toast } from '@/core/ui-host';
import { useAppState } from '@/hooks/useAppState';

export function McpPanel() {
  const appState = useAppState();
  const ready = appState.connection.state === 'ready';
  const supported = hasFeature('manageMcp');
  const [servers, setServers] = useState<McpServerView[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [url, setUrl] = useState('http://');

  const reload = async () => {
    const loaded = await loadMcp();
    setServers(loaded || []);
  };

  useEffect(() => {
    if (!ready || !supported) return;
    let cancelled = false;
    void loadMcp().then((loaded) => {
      if (!cancelled) setServers(loaded || []);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, supported]);

  if (!supported) {
    return (
      <RowList>
        <div className="px-4 py-3 text-[11.5px] text-muted-foreground">{t('manage.unsupported')}</div>
      </RowList>
    );
  }

  const addServer = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const next = [...(servers || [])];
    const commandText = command.trim();
    if (commandText) {
      const parts = commandText.split(/\s+/);
      next.push({ name: trimmedName, command: parts[0], args: parts.slice(1), enabled: true });
    } else {
      const trimmedUrl = url.trim();
      if (!trimmedUrl) return;
      next.push({ name: trimmedName, url: trimmedUrl, enabled: true });
    }
    try {
      await setMcpServers(next);
      setDialogOpen(false);
      setName('');
      setCommand('');
      setUrl('http://');
      await reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    }
  };

  const removeServer = async (server: McpServerView) => {
    const next = (servers || []).filter((entry) => entry.name !== server.name);
    try {
      await setMcpServers(next);
      await reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <RowList>
        {(servers || []).map((server) => (
          <RowItem
            key={server.name}
            icon={<Globe />}
            title={server.name}
            desc={[
              server.command ? `stdio: ${server.command}` : server.url,
              server.enabled === false ? t('settings.off') : t('settings.on'),
              server.envKeys?.length ? `env: ${server.envKeys.join(',')}` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          >
            <Button variant="deny" size="sm" onClick={() => void removeServer(server)}>
              {t('settings.mcpRemove')}
            </Button>
          </RowItem>
        ))}
        {servers === null ? <div className="px-4 py-3 text-[11.5px] text-muted-foreground">…</div> : null}
        <RowItem>
          <Button variant="outline" onClick={() => setDialogOpen(true)}>
            <Plus />
            {t('settings.mcpAdd')}
          </Button>
        </RowItem>
      </RowList>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.mcpAdd')}</DialogTitle>
          </DialogHeader>
          <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <span>{t('settings.mcpName')}</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </label>
          <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <span>{t('settings.mcpCommand')}</span>
            <Input value={command} placeholder="npx -y @modelcontextprotocol/server-everything" onChange={(event) => setCommand(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <span>{t('settings.mcpUrl')}</span>
            <Input value={url} disabled={command.trim() !== ''} onChange={(event) => setUrl(event.target.value)} />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('modal.cancel')}
            </Button>
            <Button onClick={() => void addServer()}>{t('modal.ok')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
