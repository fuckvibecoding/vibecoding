// 自动化数据动作:mothx/manage/cron/* 的视图无关封装。
// 无 manageCron 发现键时组件显示缺口卡片。

import { cronCompletedEvents } from './bus';
import { t } from './i18n';
import { loadCronJobs, removeCronJob, runCronJob, updateCronJob, createCronJob, type CronJobView } from './manage-api';
import { confirmDanger, toast } from './ui-host';

export type { CronJobView };
export { loadCronJobs, createCronJob, updateCronJob };

export async function refreshCronJobs(): Promise<CronJobView[]> {
  const jobs = await loadCronJobs();
  return jobs || [];
}

export async function runCronJobNow(id: string): Promise<void> {
  try {
    await runCronJob(id);
    toast(t('automation.ran'));
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
}

export async function toggleCronJob(job: CronJobView): Promise<boolean> {
  try {
    await updateCronJob({ id: job.id, enabled: job.enabled === false });
    toast(t('automation.updated'));
    return true;
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
    return false;
  }
}

export async function removeCronJobWithConfirm(id: string): Promise<boolean> {
  if (!await confirmDanger(t('automation.confirmDelete'))) return false;
  try {
    await removeCronJob(id);
    toast(t('automation.removed'));
    return true;
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
    return false;
  }
}

// cron_completed 事件:toast + 通知已挂载的 Automation 视图刷新。
export function notifyCronCompleted(event: Record<string, unknown>): void {
  const status = String(event.status || '');
  const name = String(event.jobId || '');
  toast(status === 'completed' || status === 'success' ? t('automation.completed', { n: name }) : t('automation.failed', { n: name }));
  cronCompletedEvents.emit(event);
}
