import assert from 'node:assert/strict';
import test from 'node:test';

import { activeSessionWorkspace, currentConfigOptions, newSessionWorkspace, state, workspace } from './state.ts';
import { sessionWorkingDirectory } from './sessions.ts';

test('workspace boundaries keep an active session separate from the next-session selection', () => {
  const previous = {
    connection: state.connection,
    store: state.store,
    newSessionCwd: state.newSessionCwd,
    activeSessionCwd: state.activeSessionCwd,
  };
  try {
    state.connection = { state: 'ready', workspace: '/projects/runtime-root' };
    state.store = { ...state.store, lastWorkspace: '/projects/remembered' };
    state.newSessionCwd = '/projects/next-session';
    state.activeSessionCwd = '/projects/open-session';

    assert.equal(newSessionWorkspace(), '/projects/next-session');
    assert.equal(activeSessionWorkspace(), '/projects/open-session');
    assert.equal(workspace(), '/projects/open-session');

    // Selecting a directory for a later task must not alter the currently
    // open session's request workspace.
    state.newSessionCwd = '/projects/another-task';
    assert.equal(newSessionWorkspace(), '/projects/another-task');
    assert.equal(activeSessionWorkspace(), '/projects/open-session');
    assert.equal(workspace(), '/projects/open-session');

    state.activeSessionCwd = '';
    assert.equal(activeSessionWorkspace(), '');
    assert.equal(workspace(), '/projects/another-task');

    // The persisted Desktop default wins over ACP's process start directory.
    // That process directory is a first-run fallback, never a session
    // workspace or access boundary.
    state.newSessionCwd = '';
    assert.equal(newSessionWorkspace(), '/projects/remembered');
  } finally {
    state.connection = previous.connection;
    state.store = previous.store;
    state.newSessionCwd = previous.newSessionCwd;
    state.activeSessionCwd = previous.activeSessionCwd;
  }
});

test('next-task model selection is independent from an open session configuration', () => {
  const previous = {
    activeSessionId: state.activeSessionId,
    configOptions: state.configOptions,
    draftConfigOptions: state.draftConfigOptions,
  };
  try {
    state.configOptions = [{ type: 'select', id: 'model', name: 'Model', currentValue: 'session-model' }];
    state.draftConfigOptions = [{ type: 'select', id: 'model', name: 'Model', currentValue: 'draft-model' }];
    state.activeSessionId = 'open-session';
    assert.equal(currentConfigOptions()[0]?.currentValue, 'session-model');

    state.activeSessionId = null;
    assert.equal(currentConfigOptions()[0]?.currentValue, 'draft-model');
  } finally {
    state.activeSessionId = previous.activeSessionId;
    state.configOptions = previous.configOptions;
    state.draftConfigOptions = previous.draftConfigOptions;
  }
});

test('a historical session keeps its own cwd regardless of the next-task default', () => {
  const previous = {
    sessions: state.sessions,
    activeSessionId: state.activeSessionId,
    activeSessionCwd: state.activeSessionCwd,
    newSessionCwd: state.newSessionCwd,
  };
  try {
    state.newSessionCwd = '/projects/next-task';
    state.activeSessionId = null;
    state.activeSessionCwd = '';
    state.sessions = [{ sessionId: 'historical', cwd: '/projects/historical', provider: 'provider', model: 'model' }];
    assert.equal(sessionWorkingDirectory('historical'), '/projects/historical');
  } finally {
    state.sessions = previous.sessions;
    state.activeSessionId = previous.activeSessionId;
    state.activeSessionCwd = previous.activeSessionCwd;
    state.newSessionCwd = previous.newSessionCwd;
  }
});

test('a missing next-session preference never adopts the ACP process cwd', () => {
  const previous = {
    connection: state.connection,
    store: state.store,
    newSessionCwd: state.newSessionCwd,
    activeSessionCwd: state.activeSessionCwd,
  };
  try {
    state.connection = { state: 'ready', workspace: '/runtime/only' };
    state.store = { ...state.store, lastWorkspace: '' };
    state.newSessionCwd = '';
    state.activeSessionCwd = '';

    assert.equal(newSessionWorkspace(), '');
    assert.equal(activeSessionWorkspace(), '');
    assert.equal(workspace(), '');
  } finally {
    state.connection = previous.connection;
    state.store = previous.store;
    state.newSessionCwd = previous.newSessionCwd;
    state.activeSessionCwd = previous.activeSessionCwd;
  }
});
