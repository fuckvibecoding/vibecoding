import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { DIAGNOSTIC_LOGS_MAX, mergeDiagnosticLogs } from './diagnostic-logs.ts';
import type { DiagnosticLogEntry } from './api.ts';

const api = await readFile(new URL('./api.ts', import.meta.url), 'utf8');
const settings = await readFile(new URL('./settings.ts', import.meta.url), 'utf8');
const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const translations = await readFile(new URL('./i18n.ts', import.meta.url), 'utf8');

test('diagnostic logs use the restricted Desktop bridge only', () => {
  assert.match(api, /getDiagnosticLogs:\s*\(\)\s*=>\s*bridge\(\)\.desktop\.getDiagnosticLogs\(\)/, 'renderer must fetch logs through the Desktop bridge');
  assert.match(api, /onDiagnosticLog:\s*\([\s\S]*?\)\s*=>\s*bridge\(\)\.desktop\.onDiagnosticLog\([\s\S]*?\)/, 'renderer must subscribe through the Desktop bridge');
});

test('diagnostic logs never touch localStorage or the Desktop store', () => {
  assert.doesNotMatch(settings, /localStorage\s*[\[.]/i, 'diagnostic logs must not be persisted in localStorage');
  assert.doesNotMatch(settings, /desktop\.storeSet\([^)]*diagnostic/i, 'diagnostic logs must not be persisted in the Desktop store');
  assert.doesNotMatch(settings, /desktop\.storeSet\([^)]*log/i, 'log filter or entries must not enter the Desktop store');
});

test('diagnostic log rendering uses textContent and does not insert HTML', () => {
  assert.match(settings, /textContent/, 'log rendering must use textContent');
  assert.doesNotMatch(settings, /innerHTML\s*=/, 'log rendering must not assign innerHTML');
  assert.doesNotMatch(settings, /\.html\(/, 'log rendering must not use HTML insertion helpers');
});

test('diagnostic log page has a filter, refresh, bounded list, and empty state', () => {
  assert.match(index, /diagnostic-logs-filter/, 'log viewer needs a filter input');
  assert.match(index, /diagnostic-logs-refresh/, 'log viewer needs a refresh button');
  assert.match(index, /diagnostic-logs-list/, 'log viewer needs a list container');
  assert.match(index, /diagnostic-logs-empty/, 'log viewer needs an empty state');
  assert.match(index, /diagnostic-logs-count/, 'log viewer needs a count display');
});

test('diagnostic log translations remain bilingual', () => {
  for (const key of [
    'settings.diagnosticLogs',
    'settings.diagnosticLogsFilter',
    'settings.diagnosticLogsEmpty',
    'settings.diagnosticLogsCount',
  ]) {
    const occurrences = translations.split(`'${key}'`).length - 1;
    assert.equal(occurrences, 2, `${key} must be present in both translation maps`);
  }
});

test('diagnostic log code does not reference session working directory state', () => {
  // The log viewer must not change the per-session cwd separation.
  const start = settings.indexOf('function renderDiagnosticLogs');
  const end = settings.indexOf('export function bindSettings', start);
  const block = settings.slice(start, end);
  assert.doesNotMatch(block, /activeSessionCwd|newSessionCwd/, 'diagnostic log code must not reference per-session cwd state');
});

test('mergeDiagnosticLogs preserves live entries over a late snapshot', () => {
  const live: DiagnosticLogEntry[] = [
    { id: 1, timestamp: '2024-01-01T00:00:00Z', source: 'desktop', message: 'a' },
    { id: 3, timestamp: '2024-01-01T00:00:02Z', source: 'acp', message: 'live-c' },
  ];
  const snapshot: DiagnosticLogEntry[] = [
    { id: 2, timestamp: '2024-01-01T00:00:01Z', source: 'acp', message: 'b' },
    { id: 3, timestamp: '2024-01-01T00:00:02Z', source: 'acp', message: 'snapshot-c' },
  ];
  const merged = mergeDiagnosticLogs(live, snapshot);
  assert.deepEqual(merged.map((e) => e.id), [1, 2, 3]);
  assert.equal(merged.find((e) => e.id === 3)?.message, 'live-c');
});

test('mergeDiagnosticLogs adds snapshot-only entries and sorts by id', () => {
  const current: DiagnosticLogEntry[] = [
    { id: 5, timestamp: '2024-01-01T00:00:04Z', source: 'renderer', message: 'e' },
  ];
  const snapshot: DiagnosticLogEntry[] = [
    { id: 2, timestamp: '2024-01-01T00:00:01Z', source: 'desktop', message: 'b' },
    { id: 7, timestamp: '2024-01-01T00:00:06Z', source: 'acp', message: 'g' },
  ];
  const merged = mergeDiagnosticLogs(current, snapshot);
  assert.deepEqual(merged.map((e) => e.id), [2, 5, 7]);
});

test('mergeDiagnosticLogs deduplicates by id', () => {
  const entry: DiagnosticLogEntry = { id: 1, timestamp: '2024-01-01T00:00:00Z', source: 'desktop', message: 'x' };
  const merged = mergeDiagnosticLogs([entry], [entry]);
  assert.equal(merged.length, 1);
});

test('mergeDiagnosticLogs bounds to DIAGNOSTIC_LOGS_MAX and keeps newest', () => {
  const current: DiagnosticLogEntry[] = [];
  for (let i = 0; i < 500; i++) {
    current.push({ id: i + 1, timestamp: '2024-01-01T00:00:00Z', source: 'desktop', message: `m${i}` });
  }
  const merged = mergeDiagnosticLogs(current, []);
  assert.equal(merged.length, DIAGNOSTIC_LOGS_MAX);
  assert.equal(merged[0].id, 101);
  assert.equal(merged[DIAGNOSTIC_LOGS_MAX - 1].id, 500);
});
