import type { Env } from './env';

/** Idempotent, memoized-per-isolate schema bootstrap so the first projection
 * cannot race the first lobby query. */
let schemaReady: Promise<void> | undefined;
export function ensureSchema(env: Env): Promise<void> {
  if (!schemaReady) {
    schemaReady = env.DB.batch([
      env.DB.prepare('CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, mode TEXT NOT NULL, status TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, title TEXT NOT NULL, search TEXT NOT NULL, card TEXT NOT NULL)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS games_lobby ON games(mode, hidden, created_at DESC)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS games_library ON games(status, hidden, created_at DESC, id)'),
    ]).then(() => undefined);
  }
  return schemaReady;
}
