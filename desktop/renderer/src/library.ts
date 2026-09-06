// 资料库视图：mothx/attachment/list 的跨会话制品清单（Phase 1.8）。
// 无发现键时保持缺口占位卡片。

import { invoke } from './api';
import { openArtifactMeta } from './chat';
import { t } from './i18n';
import { hasFeature, state } from './state';
import { el, formatBytes, iconSpan, require$ } from './ui';

interface AttachmentMeta {
  attachmentId: string;
  filename: string;
  kind: string;
  mediaType?: string;
  size?: number;
  status?: string;
  runId?: string;
  createdAt?: string;
}

const MAX_SESSIONS_SCAN = 25;

export async function renderLibrary(): Promise<void> {
  const gap = require$('#library-gap');
  const list = require$('#library-list');
  if (!hasFeature('attachmentList')) {
    gap.hidden = false;
    list.hidden = true;
    return;
  }
  gap.hidden = true;
  list.hidden = false;
  list.textContent = '';
  list.appendChild(el('div', 'row-item', t('library.loading')));
  const groups: { sessionId: string; title: string; items: AttachmentMeta[] }[] = [];
  for (const session of state.sessions.slice(0, MAX_SESSIONS_SCAN)) {
    try {
      const result = await invoke<{ attachments?: AttachmentMeta[] }>('mothx/attachment/list', {
        sessionId: session.sessionId,
        status: 'generated',
      });
      const items = result.attachments || [];
      if (items.length > 0) {
        groups.push({ sessionId: session.sessionId, title: session.title || session.sessionId.slice(0, 8), items });
      }
    } catch {
      // 单会话失败不阻断整体清单。
    }
  }
  list.textContent = '';
  if (groups.length === 0) {
    list.hidden = true;
    gap.hidden = false;
    gap.querySelector('.gap-title')!.textContent = t('gap.libraryTitleShort');
    gap.querySelector('.gap-desc')!.textContent = t('library.unsupported');
    return;
  }
  for (const group of groups) {
    const header = el('div', 'row-item');
    const icon = el('div', 'row-icon');
    icon.appendChild(iconSpan('msg'));
    const main = el('div', 'row-main');
    main.appendChild(el('div', 'row-title', t('library.sessionGroup', { s: group.title })));
    header.append(icon, main);
    header.appendChild(el('span', 'badge badge-accent', String(group.items.length)));
    list.appendChild(header);
    for (const item of group.items) {
      const row = el('div', 'row-item clickable');
      const itemIcon = el('div', 'row-icon');
      itemIcon.appendChild(iconSpan(item.kind === 'image' ? 'image' : 'doc'));
      const rowMain = el('div', 'row-main');
      rowMain.appendChild(el('div', 'row-title', item.filename));
      rowMain.appendChild(el('div', 'row-desc', [item.kind, item.mediaType, formatBytes(item.size), item.createdAt].filter(Boolean).join(' · ')));
      row.append(itemIcon, rowMain);
      row.appendChild(iconSpan('chevron'));
      row.addEventListener('click', () => {
        void openArtifactMeta(group.sessionId, {
          artifactId: item.attachmentId,
          filename: item.filename,
          mediaType: item.mediaType,
          artifactKind: item.kind,
          size: item.size,
        });
      });
      list.appendChild(row);
    }
  }
}
