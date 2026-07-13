import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config, dirs } from './config.js';

// Ensure the data directory layout exists before opening the DB (task 1.4)
fs.mkdirSync(config.dataDir, { recursive: true });
for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });

export const db = new Database(path.join(config.dataDir, 'db.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000'); // tolerate a concurrent cron/script writer

db.exec(`
  CREATE TABLE IF NOT EXISTS guests (
    id         INTEGER PRIMARY KEY,
    code       TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL,
    is_admin   INTEGER NOT NULL DEFAULT 0,
    revoked_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE IF NOT EXISTS media (
    id          TEXT PRIMARY KEY,
    uploader_id INTEGER NOT NULL REFERENCES guests(id),
    filename    TEXT NOT NULL,
    ext         TEXT NOT NULL,
    type        TEXT NOT NULL CHECK (type IN ('photo','video')),
    size        INTEGER NOT NULL,
    sha256      TEXT NOT NULL UNIQUE,
    taken_at    TEXT NOT NULL,
    uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    status      TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','ready','failed')),
    width       INTEGER,
    height      INTEGER,
    duration_s  REAL
  );

  CREATE INDEX IF NOT EXISTS idx_media_taken    ON media(taken_at);
  CREATE INDEX IF NOT EXISTS idx_media_uploaded ON media(uploaded_at);
  CREATE INDEX IF NOT EXISTS idx_media_uploader ON media(uploader_id);
`);

// Lightweight migrations for DBs created before a column existed.
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
ensureColumn('media', 'width', 'width INTEGER');
ensureColumn('media', 'height', 'height INTEGER');
ensureColumn('media', 'duration_s', 'duration_s REAL');
ensureColumn('media', 'pinned_at', 'pinned_at TEXT');
db.exec('CREATE INDEX IF NOT EXISTS idx_media_pinned ON media(pinned_at)');

// "New since your last visit" — updated after each gallery load (group 11.1)
ensureColumn('guests', 'last_seen_at', 'last_seen_at TEXT');

// Favorites / ♥ reactions (group 11.3)
db.exec(`
  CREATE TABLE IF NOT EXISTS media_reactions (
    media_id   TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    guest_id   INTEGER NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (media_id, guest_id)
  );
  CREATE INDEX IF NOT EXISTS idx_reactions_media ON media_reactions(media_id);
`);

// Comments on media + a shared guestbook of notes to the couple
db.exec(`
  CREATE TABLE IF NOT EXISTS media_comments (
    id         INTEGER PRIMARY KEY,
    media_id   TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    guest_id   INTEGER NOT NULL REFERENCES guests(id),
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_comments_media ON media_comments(media_id, created_at);

  CREATE TABLE IF NOT EXISTS notes (
    id         INTEGER PRIMARY KEY,
    guest_id   INTEGER NOT NULL REFERENCES guests(id),
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at);
`);

/** Generate a human-typable access code like "ROSE-7K3M" (no ambiguous 0/O/1/I). */
export function generateCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const pick = (n) =>
    Array.from(crypto.randomBytes(n), (b) => alphabet[b % alphabet.length]).join('');
  return `${pick(4)}-${pick(4)}`;
}

/** First boot: create the admin guest and print the code once. */
export function bootstrapAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM guests').get().n;
  if (count > 0) return;
  const code = generateCode();
  db.prepare('INSERT INTO guests (code, name, is_admin) VALUES (?, ?, 1)').run(code, config.adminName);
  console.log(`\n★ Admin guest "${config.adminName}" created — access code: ${code}\n  (shown only once; if lost, run: node scripts/reset-admin.mjs — do NOT delete db.sqlite)\n`);
}
