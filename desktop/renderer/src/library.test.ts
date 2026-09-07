import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// Minimal DOM stub for i18n setLocale in a Node static test.
(globalThis as { document?: { documentElement: { lang: string } } }).document = { documentElement: { lang: '' } };

import {
  ARTIFACT_FEATURE,
  ARTIFACT_LIST_METHOD,
  KNOWLEDGE_BASE_FEATURE,
  KNOWLEDGE_BASE_LIST_METHOD,
  formatKnowledgeBaseStatus,
} from './library.ts';
import { setLocale, t } from './i18n.ts';

const here = dirname(fileURLToPath(import.meta.url));
const librarySource = readFileSync(join(here, 'library.ts'), 'utf8');

test('knowledge bases load through the canonical ACP list method', () => {
  assert.equal(KNOWLEDGE_BASE_LIST_METHOD, 'mothx/manage/knowledge-bases/list');
  assert.equal(KNOWLEDGE_BASE_FEATURE, 'manageKnowledgeBases');
  assert.match(librarySource, /invoke<.*KnowledgeBaseView.*>\(KNOWLEDGE_BASE_LIST_METHOD/);
  assert.match(librarySource, /hasFeature\(KNOWLEDGE_BASE_FEATURE\)/);
});

test('artifact path remains the original ACP attachment list', () => {
  assert.equal(ARTIFACT_LIST_METHOD, 'mothx/attachment/list');
  assert.equal(ARTIFACT_FEATURE, 'attachmentList');
  assert.match(librarySource, /invoke<.*AttachmentMeta.*>\(ARTIFACT_LIST_METHOD/);
  assert.match(librarySource, /hasFeature\(ARTIFACT_FEATURE\)/);
});

test('knowledge-base status formatter reflects enabled/index state and snapshot stats', () => {
  setLocale('en');
  const ready = formatKnowledgeBaseStatus({
    knowledgeBase: { id: 'kb-1', name: 'Docs', enabled: true },
    snapshot: { status: 'ready', fileCount: 5, chunkCount: 10, nodeCount: 20, edgeCount: 30 },
    status: 'ready',
  });
  assert.match(ready, /ready/i);

  const unindexed = formatKnowledgeBaseStatus({
    knowledgeBase: { id: 'kb-2', name: 'Draft', enabled: true },
  });
  assert.equal(unindexed, t('library.knowledgeUnindexed'));

  const disabled = formatKnowledgeBaseStatus({
    knowledgeBase: { id: 'kb-3', name: 'Old', enabled: false },
  });
  assert.equal(disabled, t('library.knowledgeDisabled'));
});

test('library UI copy is present in both zh and en', () => {
  setLocale('zh');
  const zhTitle = t('library.title');
  const zhManage = t('library.manageKnowledge');
  setLocale('en');
  const enTitle = t('library.title');
  const enManage = t('library.manageKnowledge');
  assert.notEqual(zhTitle, enTitle);
  assert.match(zhTitle, /知识库/);
  assert.match(enTitle, /Knowledge bases/i);
  assert.notEqual(zhManage, enManage);
});

test('library does not persist KB config or read source files locally', () => {
  const forbidden = [
    'localStorage',
    'desktop.storeSet',
    'readFileBase64',
    'fs.readFile',
    'manage/knowledge-bases/create',
    'manage/knowledge-bases/update',
    'manage/knowledge-bases/delete',
    'manage/knowledge-bases/scan',
  ];
  for (const token of forbidden) {
    assert.ok(!librarySource.includes(token), `library.ts must not contain ${token}`);
  }
});

test('manage-knowledge action routes to Settings knowledge tab', () => {
  assert.match(librarySource, /switchView\(['"]settings['"]\)/);
  assert.match(librarySource, /openSettingsTab\(['"]knowledge['"]\)/);
});
