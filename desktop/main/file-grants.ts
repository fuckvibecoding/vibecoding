import { randomUUID } from 'node:crypto';

// A selected file is an explicit user gesture. Keep the authority that follows
// it in the main process as a short-lived, single-use token rather than giving
// the renderer a generic local-file read capability.
export class SelectedFileGrants {
  private readonly grants = new Map<string, { path: string; expiresAt: number }>();

  constructor(
    private readonly ttlMs = 5 * 60 * 1000,
    private readonly maxGrants = 128,
  ) {}

  issue(path: string, now = Date.now()): string {
    this.prune(now);
    while (this.grants.size >= this.maxGrants) {
      const oldest = this.grants.keys().next().value;
      if (!oldest) break;
      this.grants.delete(oldest);
    }
    const token = randomUUID();
    this.grants.set(token, { path, expiresAt: now + this.ttlMs });
    return token;
  }

  consume(token: string, now = Date.now()): string | null {
    this.prune(now);
    const grant = this.grants.get(token);
    if (!grant) return null;
    this.grants.delete(token);
    return grant.path;
  }

  private prune(now: number): void {
    for (const [token, grant] of this.grants) {
      if (grant.expiresAt <= now) this.grants.delete(token);
    }
  }
}
