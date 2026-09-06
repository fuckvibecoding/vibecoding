import type { DiagnosticLogEntry } from './api';

export const DIAGNOSTIC_LOGS_MAX = 400;

// Merge a snapshot (e.g. from desktop.getDiagnosticLogs) with the live entries
// already received through the subscription. Live entries win over snapshot
// entries with the same id so that a late snapshot cannot overwrite real-time
// entries the renderer has already observed. The result is deduplicated by id,
// sorted chronologically by id, and bounded to DIAGNOSTIC_LOGS_MAX.
export function mergeDiagnosticLogs(
  current: DiagnosticLogEntry[],
  snapshot: DiagnosticLogEntry[],
): DiagnosticLogEntry[] {
  const byId = new Map<number, DiagnosticLogEntry>();
  for (const entry of current) {
    byId.set(entry.id, entry);
  }
  for (const entry of snapshot) {
    if (!byId.has(entry.id)) {
      byId.set(entry.id, entry);
    }
  }
  return Array.from(byId.values())
    .sort((a, b) => a.id - b.id)
    .slice(-DIAGNOSTIC_LOGS_MAX);
}
