// Pure task-tree selectors. Keeping them DOM-free makes the global session
// semantics testable without a renderer or a local persistence substitute.

import type { ListedSessionShape, ProjectShape } from './state';

export function matchesTaskSearch(session: ListedSessionShape, projects: ProjectShape[], keyword: string): boolean {
  const query = keyword.trim().toLowerCase();
  if (!query) return true;
  const project = projects.find((entry) => entry.id === session._meta?.projectId);
  return [session.sessionId, session.title, session.cwd, project?.name]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

export function sortTaskSessions(sessions: ListedSessionShape[]): ListedSessionShape[] {
  return [...sessions].sort((left, right) => (right.updatedAt || '').localeCompare(left.updatedAt || ''));
}
