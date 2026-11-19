-- D1 index schema. The worker also applies this automatically (idempotent) on
-- first lobby/judgment query; this file exists for manual setup:
--   npx wrangler d1 execute DB --remote --file=worker/schema.sql
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  title TEXT NOT NULL,
  search TEXT NOT NULL,
  card TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS games_lobby ON games(mode, hidden, created_at DESC);
CREATE INDEX IF NOT EXISTS games_library ON games(status, hidden, created_at DESC, id);
