// 自动化视图:mothx/manage/cron/* 的实体化 UI;无 manageCron 发现键时显示
// 能力缺口卡片。新建/编辑通过 Dialog 表单,行为与旧 cron-modal 一致。

import { useCallback, useEffect, useState } from 'react';
import { Clock, Plus, RefreshCw, Square, Trash2, Zap } from 'lucide-react';

import { GapCard, PageHead, PageInner, PageScroll, RowItem, RowList } from '@/components/layout';
import { StatusChip } from '@/components/StatusChip';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  createCronJob,
  notifyCronCompleted,
  refreshCronJobs,
  removeCronJobWithConfirm,
  runCronJobNow,
  toggleCronJob,
  type CronJobView,
} from '@/core/automation';
import { cronCompletedEvents } from '@/core/bus';
import { t } from '@/core/i18n';
import { formatCronTime } from '@/core/manage-api';
import { hasFeature } from '@/core/state';
import { toast } from '@/core/ui-host';

function CronDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState('');
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState('yolo');

  useEffect(() => {
    if (open) {
      setName('');
      setSchedule('');
      setPrompt('');
      setMode('yolo');
    }
  }, [open]);

  const submit = async () => {
    if (!name.trim() || !schedule.trim() || !prompt.trim()) {
      toast(t('prompt.empty'));
      return;
    }
    try {
      await createCronJob({ name: name.trim(), schedule: schedule.trim(), prompt: prompt.trim(), mode, enabled: true });
      onOpenChange(false);
      toast(t('automation.created'));
      onCreated();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('automation.new')}</DialogTitle>
        </DialogHeader>
        <Input placeholder={t('automation.name')} value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        <Input placeholder={t('automation.schedule')} value={schedule} onChange={(event) => setSchedule(event.target.value)} />
        <Textarea placeholder={t('automation.prompt')} rows={3} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        <Select value={mode} onValueChange={setMode}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="yolo">yolo</SelectItem>
            <SelectItem value="agent">agent</SelectItem>
            <SelectItem value="plan">plan</SelectItem>
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('modal.cancel')}
          </Button>
          <Button onClick={() => void submit()}>{t('modal.ok')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CronRow({ job, onChanged }: { job: CronJobView; onChanged: () => void }) {
  const meta = [job.schedule, job.prompt, job.mode, job.lastRun ? `${t('automation.lastRun')}: ${formatCronTime(job.lastRun)}${job.lastStatus ? ` (${job.lastStatus})` : ''}` : '']
    .filter(Boolean)
    .join(' · ');
  return (
    <RowItem
      icon={<Zap />}
      title={
        <>
          <span className="truncate">{job.name || job.id}</span>
          <StatusChip
            variant={job.enabled === false ? 'pending' : 'working'}
            label={job.enabled === false ? t('automation.pause') : t('automation.resume')}
          />
        </>
      }
      desc={meta}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('automation.runNow')}
            onClick={async () => {
              await runCronJobNow(job.id);
            }}
          >
            <Zap />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('automation.runNow')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={job.enabled === false ? t('automation.resume') : t('automation.pause')}
            onClick={async () => {
              if (await toggleCronJob(job)) onChanged();
            }}
          >
            {job.enabled === false ? <RefreshCw /> : <Square />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{job.enabled === false ? t('automation.resume') : t('automation.pause')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('automation.delete')}
            className="hover:text-danger"
            onClick={async () => {
              if (await removeCronJobWithConfirm(job.id)) onChanged();
            }}
          >
            <Trash2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('automation.delete')}</TooltipContent>
      </Tooltip>
    </RowItem>
  );
}

export function AutomationView() {
  const [jobs, setJobs] = useState<CronJobView[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const supported = hasFeature('manageCron');

  const reload = useCallback(async () => {
    setJobs(await refreshCronJobs());
  }, []);

  useEffect(() => {
    if (!supported) {
      setJobs(null);
      return;
    }
    void reload();
    return cronCompletedEvents.on(() => {
      void reload();
    });
  }, [reload, supported]);

  return (
    <PageScroll>
      <PageInner>
        <PageHead
          title={t('automation.title')}
          subtitle={t('automation.subtitle')}
          actions={
            <Button disabled={!supported} onClick={() => setDialogOpen(true)}>
              <Plus />
              {t('automation.new')}
            </Button>
          }
        />
        {supported ? (
          <RowList>
            {jobs === null ? (
              <div className="px-4 py-3 text-[11.5px] text-muted-foreground">…</div>
            ) : jobs.length === 0 ? (
              <div className="px-4 py-3 text-[12.5px] text-muted-foreground">{t('automation.empty')}</div>
            ) : (
              jobs.map((job) => <CronRow key={job.id} job={job} onChanged={() => void reload()} />)
            )}
          </RowList>
        ) : (
          <GapCard icon={<Clock />} title={t('gap.title')} desc={t('gap.automationDesc')} />
        )}
        <CronDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={() => void reload()} />
      </PageInner>
    </PageScroll>
  );
}
