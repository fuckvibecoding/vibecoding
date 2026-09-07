// 资料库视图：ACP 投影的知识库状态。知识库完整编辑仍集中在设置页，
// 避免 renderer 复制配置或索引生命周期。

import { invoke } from './api';
import { t } from './i18n';
import { openSettingsTab } from './settings';
import { hasFeature } from './state';
import { el, iconSpan, require$ } from './ui';
import { switchView } from './views';

interface KnowledgeBaseView {
  knowledgeBase?: { id?: string; name?: string; enabled?: boolean };
  snapshot?: { status?: string; fileCount?: number; chunkCount?: number; nodeCount?: number; edgeCount?: number } | null;
  status?: string;
}

export const KNOWLEDGE_BASE_LIST_METHOD = 'mothx/manage/knowledge-bases/list';
export const KNOWLEDGE_BASE_FEATURE = 'manageKnowledgeBases';

export async function renderLibrary(): Promise<void> {
  await renderKnowledgeBases();
}

export function formatKnowledgeBaseStatus(view: KnowledgeBaseView): string {
  const base = view.knowledgeBase;
  if (base && !base.enabled) return t('library.knowledgeDisabled');
  const snapshot = view.snapshot;
  if (!snapshot) return t('library.knowledgeUnindexed');
  return t('library.knowledgeStatus', {
    s: view.status || snapshot.status || t('library.knowledgeUnindexed'),
  });
}

async function renderKnowledgeBases(): Promise<void> {
  const section = require$('#library-knowledge-section');
  const list = require$('#library-knowledge-list');
  const manage = require$('#library-manage-knowledge') as HTMLButtonElement;
  section.hidden = false;
  manage.hidden = false;
  manage.onclick = () => {
    switchView('settings');
    openSettingsTab('knowledge');
  };
  list.textContent = '';
  if (!hasFeature(KNOWLEDGE_BASE_FEATURE)) {
    manage.hidden = true;
    list.appendChild(el('div', 'row-desc', t('library.knowledgeUnavailable')));
    return;
  }
  list.appendChild(el('div', 'row-item', t('library.knowledgeLoading')));
  try {
    const result = await invoke<{ knowledgeBases?: KnowledgeBaseView[] }>(KNOWLEDGE_BASE_LIST_METHOD, {});
    const knowledgeBases = result.knowledgeBases || [];
    list.textContent = '';
    if (knowledgeBases.length === 0) {
      list.appendChild(el('div', 'row-desc', t('library.knowledgeEmpty')));
      return;
    }
    for (const view of knowledgeBases) {
      const base = view.knowledgeBase;
      if (!base?.id) continue;
      const snapshot = view.snapshot;
      const row = el('div', 'row-item');
      const icon = el('div', 'row-icon');
      icon.appendChild(iconSpan('book'));
      const main = el('div', 'row-main');
      main.appendChild(el('div', 'row-title', base.name || base.id));
      main.appendChild(el('div', 'row-desc', formatKnowledgeBaseStatus(view)));
      if (snapshot) {
        main.appendChild(el('div', 'row-desc', t('library.knowledgeStats', {
          f: snapshot.fileCount ?? 0, c: snapshot.chunkCount ?? 0,
          n: snapshot.nodeCount ?? 0, e: snapshot.edgeCount ?? 0,
        })));
      }
      row.append(icon, main);
      row.appendChild(el('span', 'badge badge-accent', base.enabled === false ? t('settings.off') : t('settings.on')));
      list.appendChild(row);
    }
  } catch (error) {
    list.textContent = '';
    list.appendChild(el('div', 'row-desc', error instanceof Error ? error.message : String(error)));
  }
}
