import assert from 'node:assert/strict';
import test from 'node:test';

import { sessionListParams } from './sessions.ts';
import { matchesTaskSearch, sortTaskSessions } from './task-tree.ts';

test('canonical session list request scopes project, ungrouped, and search before pagination', () => {
  assert.deepEqual(sessionListParams({ scope: 'all' }), {});
  assert.deepEqual(sessionListParams({ scope: 'project', projectId: 'project-a' }, 'opaque-next'), {
    cursor: 'opaque-next', scope: 'project', projectId: 'project-a',
  });
  assert.deepEqual(sessionListParams({ scope: 'ungrouped', query: 'desktop' }), {
    scope: 'ungrouped', query: 'desktop',
  });
});

test('task tree search covers session id, title, cwd, and canonical project name', () => {
  const session = {
    sessionId: 'session-123', cwd: '/work/mothx', title: 'Fix sidebar', provider: 'openai', model: 'model',
    updatedAt: '2026-09-06T08:00:00Z', _meta: { projectId: 'project-a' },
  };
  const projects = [{ id: 'project-a', name: 'Desktop refresh' }];
  for (const query of ['123', 'sidebar', '/work/mothx', 'desktop refresh']) {
    assert.equal(matchesTaskSearch(session, projects, query), true, query);
  }
  assert.equal(matchesTaskSearch(session, projects, 'unrelated'), false);
});

test('task tree keeps the newest loaded sessions first without using a directory filter', () => {
  const sessions = [
    { sessionId: 'older', cwd: '/a', provider: 'p', model: 'm', updatedAt: '2026-09-01T00:00:00Z' },
    { sessionId: 'newer', cwd: '/b', provider: 'p', model: 'm', updatedAt: '2026-09-05T00:00:00Z' },
    { sessionId: 'newest', cwd: '/c', provider: 'p', model: 'm', updatedAt: '2026-09-07T00:00:00Z' },
  ];
  assert.deepEqual(sortTaskSessions(sessions).map((entry) => entry.sessionId), ['newest', 'newer', 'older']);
});
