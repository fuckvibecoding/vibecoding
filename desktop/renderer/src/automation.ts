// 自动化视图（Phase 3）：mothx/manage/cron/* 的实体化 UI。
// 无 manageCron 发现键时保持缺口占位卡片。

import { invoke } from './api';
import { t } from './i18n';
import { hasFeature } from './state';
import { confirmDialog, el, iconSpan, require$, toast } from './ui';

export interface CronJobView {
  id: string;
  name?: string;
  schedule?: string;
  prompt?: string;
  mode?: string;
  enabled?: boolean;
  lastRun?: string;
  lastStatus?: string;
  [key: string]: unknown;
}

let jobs: CronJobView[] = [];

export async function renderAutomation(): Promise<void> {
  const gap = require$('#automation-gap');
  const list = require$('#automation-list');
  const newButton = require$('#automation-new') as HTMLButtonElement;
  if (!hasFeature('manageCron')) {
    gap.hidden = false;
    list.hidden = true;
    newButton.disabled = true;
    return;
  }
  newButton.disabled = false;
  gap.hidden = true;
  list.hidden = false;
  try {
    const result = await invoke<{ jobs?: CronJobView[] }>('mothx/manage/cron/list', {});
    jobs = result.jobs || [];
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
    jobs = [];
  }
  list.textContent = '';
  if (jobs.length === 0) {
    list.appendChild(el('div', 'row-item', t('automation.empty')));
    return;
  }
  for (const job of jobs) {
    const row = el('div', 'row-item');
    const icon = el('div', 'row-icon');
    icon.appendChild(iconSpan('zap'));
    const main = el('div', 'row-main');
    const title = el('div', 'row-title');
    title.appendChild(el('span', '', job.name || job.id));
    title.appendChild(
      el('span', `status-chip ${job.enabled === false ? 'st-pending' : 'st-working'}`, job.enabled === false ? t('automation.pause') : t('automation.resume')),
    );
    const desc = el('div', 'row-desc');
    desc.textContent = [job.schedule, job.prompt, job.mode, job.lastRun ? `${t('automation.lastRun')}: ${job.lastRun}${job.lastStatus ? ` (${job.lastStatus})` : ''}` : '']
      .filter(Boolean)
      .join(' · ');
    main.append(title, desc);
    row.append(icon, main);

    const run = el('button', 'icon-btn');
    run.title = t('automation.runNow');
    run.appendChild(iconSpan('zap'));
    run.addEventListener('click', () => {
      void invoke('mothx/manage/cron/run', { id: job.id })
        .then(() => toast(t('automation.ran')))
        .catch((error: unknown) => toast(error instanceof Error ? error.message : String(error)));
    });
    const toggle = el('button', 'icon-btn');
    toggle.title = job.enabled === false ? t('automation.resume') : t('automation.pause');
    toggle.appendChild(iconSpan(job.enabled === false ? 'refresh' : 'stop'));
    toggle.addEventListener('click', () => {
      void invoke('mothx/manage/cron/update', { id: job.id, enabled: job.enabled === false })
        .then(() => {
          toast(t('automation.updated'));
          return renderAutomation();
        })
        .catch((error: unknown) => toast(error instanceof Error ? error.message : String(error)));
    });
    const remove = el('button', 'icon-btn');
    remove.title = t('automation.delete');
    remove.appendChild(iconSpan('trash'));
    remove.addEventListener('click', () => {
      if (!confirmDialog(t('automation.confirmDelete'))) return;
      void invoke('mothx/manage/cron/remove', { id: job.id })
        .then(() => {
          toast(t('automation.removed'));
          return renderAutomation();
        })
        .catch((error: unknown) => toast(error instanceof Error ? error.message : String(error)));
    });
    row.append(run, toggle, remove);
    list.appendChild(row);
  }
}

export function bindAutomation(): void {
  require$('#automation-new').addEventListener('click', () => openCronModal());
  require$('#cron-cancel').addEventListener('click', () => {
    require$('#cron-modal').hidden = true;
  });
  require$('#cron-modal').addEventListener('mousedown', (event) => {
    if (event.target === require$('#cron-modal')) require$('#cron-modal').hidden = true;
  });
  require$('#cron-ok').addEventListener('click', () => {
    void submitCronModal();
  });
}

function openCronModal(): void {
  (require$('#cron-name') as HTMLInputElement).value = '';
  (require$('#cron-schedule') as HTMLInputElement).value = '';
  (require$('#cron-prompt') as HTMLTextAreaElement).value = '';
  require$('#cron-modal').hidden = false;
  (require$('#cron-name') as HTMLInputElement).focus();
}

async function submitCronModal(): Promise<void> {
  const name = (require$('#cron-name') as HTMLInputElement).value.trim();
  const schedule = (require$('#cron-schedule') as HTMLInputElement).value.trim();
  const prompt = (require$('#cron-prompt') as HTMLTextAreaElement).value.trim();
  const mode = (require$('#cron-mode') as HTMLSelectElement).value;
  if (!name || !schedule || !prompt) {
    toast(t('prompt.empty'));
    return;
  }
  try {
    await invoke('mothx/manage/cron/create', { name, schedule, prompt, mode, enabled: true });
    require$('#cron-modal').hidden = true;
    toast(t('automation.created'));
    await renderAutomation();
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
}

// cron_completed 事件：toast + 视图刷新（由 main.ts 调用）。
export function notifyCronCompleted(event: Record<string, unknown>): void {
  const status = String(event.status || '');
  const name = String(event.jobId || '');
  toast(status === 'completed' || status === 'success' ? t('automation.completed', { n: name }) : t('automation.failed', { n: name }));
  void renderAutomation();
}
