// 资料库数据动作:ACP 投影的知识库状态。知识库完整编辑仍集中在设置页,
// 避免 renderer 复制配置或索引生命周期。

import { invoke } from './api';
import { t } from './i18n';
import type { KnowledgeBaseView } from './manage-api';

export const KNOWLEDGE_BASE_LIST_METHOD = 'mothx/manage/knowledge-bases/list';
export const KNOWLEDGE_BASE_FEATURE = 'manageKnowledgeBases';

// 宽松的状态投影:格式化只依赖 name/enabled/snapshot 字段,便于独立测试。
export interface KnowledgeBaseStatusView {
  knowledgeBase?: { id?: string; name?: string; enabled?: boolean };
  snapshot?: { status?: string; fileCount?: number; chunkCount?: number; nodeCount?: number; edgeCount?: number } | null;
  status?: string;
}

export function formatKnowledgeBaseStatus(view: KnowledgeBaseStatusView): string {
  const base = view.knowledgeBase;
  if (base && !base.enabled) return t('library.knowledgeDisabled');
  const snapshot = view.snapshot;
  if (!snapshot) return t('library.knowledgeUnindexed');
  return t('library.knowledgeStatus', {
    s: view.status || snapshot.status || t('library.knowledgeUnindexed'),
  });
}

export async function loadKnowledgeBaseViews(): Promise<KnowledgeBaseView[]> {
  const result = await invoke<{ knowledgeBases?: KnowledgeBaseView[] }>(KNOWLEDGE_BASE_LIST_METHOD, {});
  return result.knowledgeBases || [];
}
