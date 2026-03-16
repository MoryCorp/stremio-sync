import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dbPath = process.env.DATABASE_PATH || './data/stremio-config.db';
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    stremio_auth_key TEXT NOT NULL,
    encrypted_password TEXT NOT NULL,
    password_iv TEXT NOT NULL,
    password_tag TEXT NOT NULL,
    last_sync_at TEXT,
    last_sync_status TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS master_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    addons_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT DEFAULT (datetime('now'))
  );

  INSERT OR IGNORE INTO master_config (id, addons_json) VALUES (1, '[]');

  CREATE TABLE IF NOT EXISTS sync_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Clean old sync logs on startup (30 days)
db.exec(`DELETE FROM sync_logs WHERE created_at < datetime('now', '-30 days')`);

// Prepared statements
const stmts = {
  getUsers: db.prepare('SELECT id, email, last_sync_at, last_sync_status, created_at FROM users'),
  getUserById: db.prepare('SELECT * FROM users WHERE id = ?'),
  getUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  createUser: db.prepare(`
    INSERT INTO users (email, stremio_auth_key, encrypted_password, password_iv, password_tag)
    VALUES (@email, @authKey, @encryptedPassword, @iv, @tag)
  `),
  updateUserAuthKey: db.prepare(`
    UPDATE users SET stremio_auth_key = ?, updated_at = datetime('now') WHERE id = ?
  `),
  updateUserSyncStatus: db.prepare(`
    UPDATE users SET last_sync_at = datetime('now'), last_sync_status = ?, updated_at = datetime('now') WHERE id = ?
  `),
  deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
  getMasterConfig: db.prepare('SELECT addons_json, updated_at FROM master_config WHERE id = 1'),
  setMasterConfig: db.prepare(`
    UPDATE master_config SET addons_json = ?, updated_at = datetime('now') WHERE id = 1
  `),
  addSyncLog: db.prepare(`
    INSERT INTO sync_logs (user_id, action, status, message) VALUES (?, ?, ?, ?)
  `),
  getSyncLogs: db.prepare(`
    SELECT sl.*, u.email FROM sync_logs sl
    LEFT JOIN users u ON sl.user_id = u.id
    ORDER BY sl.created_at DESC LIMIT ?
  `),
  getLastSyncPerUser: db.prepare(`
    SELECT sl.user_id, u.email, sl.action, sl.status, sl.message, sl.created_at
    FROM sync_logs sl
    INNER JOIN (
      SELECT user_id, MAX(created_at) as max_created
      FROM sync_logs WHERE action = 'deploy'
      GROUP BY user_id
    ) latest ON sl.user_id = latest.user_id AND sl.created_at = latest.max_created
    LEFT JOIN users u ON sl.user_id = u.id
  `),
};

export function getUsers() {
  return stmts.getUsers.all();
}

export function getUserById(id) {
  return stmts.getUserById.get(id);
}

export function getUserByEmail(email) {
  return stmts.getUserByEmail.get(email);
}

export function createUser({ email, authKey, encryptedPassword, iv, tag }) {
  return stmts.createUser.run({ email, authKey, encryptedPassword, iv, tag });
}

export function updateUserAuthKey(id, authKey) {
  return stmts.updateUserAuthKey.run(authKey, id);
}

export function updateUserSyncStatus(id, status) {
  return stmts.updateUserSyncStatus.run(status, id);
}

export function deleteUser(id) {
  return stmts.deleteUser.run(id);
}

export function getMasterConfig() {
  const row = stmts.getMasterConfig.get();
  return { addons: JSON.parse(row.addons_json), updatedAt: row.updated_at };
}

export function setMasterConfig(addons) {
  return stmts.setMasterConfig.run(JSON.stringify(addons));
}

export function addSyncLog(userId, action, status, message = null) {
  return stmts.addSyncLog.run(userId, action, status, message);
}

export function getSyncLogs(limit = 50) {
  return stmts.getSyncLogs.all(limit);
}

export function getLastSyncPerUser() {
  return stmts.getLastSyncPerUser.all();
}

export function close() {
  db.close();
}
