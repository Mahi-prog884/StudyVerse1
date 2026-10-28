// SQLite database (Node's built-in node:sqlite, no native modules to compile)
let DatabaseSync;
try { ({ DatabaseSync } = require('node:sqlite')); }
catch {
  console.error('\nERROR: this Node.js (' + process.version + ') has no built-in SQLite.\n' +
    'Install Node.js 22.13 or newer (LTS) from https://nodejs.org, reopen the terminal, and run again.\n');
  process.exit(1);
}
const path = require('node:path');
const fs = require('node:fs');

const dir = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(dir, { recursive: true });
let db;
try { db = new DatabaseSync(path.join(dir, 'studyverse.db')); }
catch (e) {
  console.error('\nERROR: cannot open the database in ' + dir + '\n' + e.message +
    '\nTip: move the project out of OneDrive/Dropbox (for example C:\\projects), or set DATA_DIR to another folder.\n');
  process.exit(1);
}
// WAL is faster, but fails on some synced/network folders, so fall back to the default mode
try { db.exec('PRAGMA journal_mode = WAL;'); } catch { db.exec('PRAGMA journal_mode = DELETE;'); }

db.exec(`
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_salt  TEXT NOT NULL,
  pass_hash  TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS documents (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  text       TEXT NOT NULL,
  hash       TEXT NOT NULL,
  summary    TEXT NOT NULL DEFAULT '',
  chat       TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, hash)
);
CREATE INDEX IF NOT EXISTS idx_docs_user ON documents(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS progress (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`);

// --- lightweight migrations for databases created by earlier versions ---
const cols = t => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
if (!cols('users').includes('show_on_board'))
  db.exec('ALTER TABLE users ADD COLUMN show_on_board INTEGER NOT NULL DEFAULT 1');
if (!cols('progress').includes('xp')) {
  db.exec('ALTER TABLE progress ADD COLUMN xp INTEGER NOT NULL DEFAULT 0');
  db.exec("UPDATE progress SET xp = MAX(0, CAST(COALESCE(json_extract(state, '$.xp'), 0) AS INTEGER))");
}
db.exec('CREATE INDEX IF NOT EXISTS idx_progress_xp ON progress(xp DESC)');

const q = {
  addUser:     db.prepare('INSERT INTO users (username, pass_salt, pass_hash, created_at) VALUES (?, ?, ?, ?)'),
  userByName:  db.prepare('SELECT * FROM users WHERE username = ?'),
  addSession:  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'),
  session:     db.prepare(`SELECT u.id, u.username, s.expires_at FROM sessions s
                           JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`),
  delSession:  db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  purge:       db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
  getState:    db.prepare('SELECT state FROM progress WHERE user_id = ?'),
  putState:    db.prepare(`INSERT INTO progress (user_id, state, xp, updated_at) VALUES (?, ?, ?, ?)
                           ON CONFLICT(user_id) DO UPDATE SET state = excluded.state, xp = excluded.xp, updated_at = excluded.updated_at`),
  listDocs:    db.prepare(`SELECT id, name, length(text) AS chars, summary <> '' AS has_summary,
                           json_array_length(chat) AS msgs, created_at, updated_at
                           FROM documents WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100`),
  countDocs:   db.prepare('SELECT COUNT(*) AS n FROM documents WHERE user_id = ?'),
  docByHash:   db.prepare('SELECT * FROM documents WHERE user_id = ? AND hash = ?'),
  getDoc:      db.prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?'),
  addDoc:      db.prepare('INSERT INTO documents (user_id, name, text, hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'),
  touchDoc:    db.prepare('UPDATE documents SET updated_at = ? WHERE id = ? AND user_id = ?'),
  renameDoc:   db.prepare('UPDATE documents SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?'),
  setSummary:  db.prepare('UPDATE documents SET summary = ?, updated_at = ? WHERE id = ? AND user_id = ?'),
  setChat:     db.prepare('UPDATE documents SET chat = ?, updated_at = ? WHERE id = ? AND user_id = ?'),
  delDoc:      db.prepare('DELETE FROM documents WHERE id = ? AND user_id = ?'),
  userById:    db.prepare('SELECT * FROM users WHERE id = ?'),
  board:       db.prepare(`SELECT u.username, p.xp FROM progress p JOIN users u ON u.id = p.user_id
                           WHERE u.show_on_board = 1 ORDER BY p.xp DESC, u.created_at ASC LIMIT 20`),
  rankOf:      db.prepare(`SELECT COUNT(*) + 1 AS rank FROM progress p JOIN users u ON u.id = p.user_id
                           WHERE u.show_on_board = 1 AND p.xp > ?`),
  myXp:        db.prepare('SELECT xp FROM progress WHERE user_id = ?'),
  setBoard:    db.prepare('UPDATE users SET show_on_board = ? WHERE id = ?'),
  setPass:     db.prepare('UPDATE users SET pass_salt = ?, pass_hash = ? WHERE id = ?'),
  otherSess:   db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?'),
  delUser:     db.prepare('DELETE FROM users WHERE id = ?'),
};

module.exports = { db, q };
