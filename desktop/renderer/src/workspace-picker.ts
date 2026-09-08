// Decides which canonical directory scope a composer picker is allowed to
// change. It intentionally owns no directory value or persistence: the ACP
// session API owns active-session cwd, while the Desktop store owns only the
// next-session default.
export type WorkspacePickerTarget =
  | { kind: 'session'; sessionId: string }
  | { kind: 'next-session' };

export interface WorkspacePickerActions {
  changeSessionWorkingDirectory: (sessionId: string) => unknown;
  chooseNextSessionWorkingDirectory: () => unknown;
}

export function workspacePickerTarget(activeSessionId: string | null): WorkspacePickerTarget {
  return activeSessionId ? { kind: 'session', sessionId: activeSessionId } : { kind: 'next-session' };
}

export function applyWorkspacePickerTarget(activeSessionId: string | null, actions: WorkspacePickerActions): WorkspacePickerTarget {
  const target = workspacePickerTarget(activeSessionId);
  if (target.kind === 'session') actions.changeSessionWorkingDirectory(target.sessionId);
  else actions.chooseNextSessionWorkingDirectory();
  return target;
}
