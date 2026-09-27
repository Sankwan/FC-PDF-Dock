// SQLite storage (Node's built-in node:sqlite, no native add-ons).
//
// Deliberately minimal. PDFDock exists so staff don't put sensitive files
// into free online tools; it doesn't monitor staff. So we keep:
//   users     the email address, when the account was created, and whether IT has disabled it
//   codes     one pending sign-in code per email, as a keyed hash (never the code itself)
//   sessions  a keyed hash of each session token and its fixed expiry
// No names, no staff IDs, no sign-in history, no activity, no IP addresses,
// and no documents.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const openDb = (file) => {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      email          TEXT PRIMARY KEY,
      status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
      created_at     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS codes (
      email          TEXT PRIMARY KEY,
      code_hash      TEXT NOT NULL,
      attempts       INTEGER NOT NULL DEFAULT 0,
      created_at     INTEGER NOT NULL,
      expires_at     INTEGER NOT NULL
    );

    -- One row per code sent, used only for the hourly send limit; pruned
    -- after an hour.
    CREATE TABLE IF NOT EXISTS code_sends (
      email          TEXT NOT NULL,
      sent_at        INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS code_sends_email ON code_sends (email, sent_at);

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash     TEXT PRIMARY KEY,
      email          TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
      expires_at     INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_email ON sessions (email);
  `);

  const q = {
    getUser: db.prepare("SELECT * FROM users WHERE email = ?"),
    insertUser: db.prepare("INSERT OR IGNORE INTO users (email, created_at) VALUES (?, ?)"),
    setStatus: db.prepare("UPDATE users SET status = ? WHERE email = ?"),
    deleteUser: db.prepare("DELETE FROM users WHERE email = ?"),
    listUsers: db.prepare("SELECT * FROM users ORDER BY email"),

    getCode: db.prepare("SELECT * FROM codes WHERE email = ?"),
    upsertCode: db.prepare(`INSERT INTO codes (email, code_hash, attempts, created_at, expires_at)
                            VALUES (?, ?, 0, ?, ?)
                            ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, attempts = 0,
                              created_at = excluded.created_at, expires_at = excluded.expires_at`),
    bumpAttempts: db.prepare("UPDATE codes SET attempts = attempts + 1 WHERE email = ?"),
    deleteCode: db.prepare("DELETE FROM codes WHERE email = ?"),

    logSend: db.prepare("INSERT INTO code_sends (email, sent_at) VALUES (?, ?)"),
    countSends: db.prepare("SELECT COUNT(*) AS n FROM code_sends WHERE email = ? AND sent_at > ?"),

    insertSession: db.prepare("INSERT INTO sessions (token_hash, email, expires_at) VALUES (?, ?, ?)"),
    getSession: db.prepare(`SELECT s.*, u.status FROM sessions s JOIN users u ON u.email = s.email WHERE s.token_hash = ?`),
    deleteSession: db.prepare("DELETE FROM sessions WHERE token_hash = ?"),
    deleteUserSessions: db.prepare("DELETE FROM sessions WHERE email = ?"),

    pruneCodes: db.prepare("DELETE FROM codes WHERE expires_at < ?"),
    pruneSends: db.prepare("DELETE FROM code_sends WHERE sent_at < ?"),
    pruneSessions: db.prepare("DELETE FROM sessions WHERE expires_at < ?"),
  };

  const prune = () => {
    const now = Date.now();
    q.pruneCodes.run(now);
    q.pruneSends.run(now - 3600_000);
    q.pruneSessions.run(now);
  };

  return { db, q, prune };
};
