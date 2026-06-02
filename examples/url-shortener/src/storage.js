import Database from 'better-sqlite3';

export function openStorage(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS urls (
      code TEXT PRIMARY KEY,
      long_url TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const insertStmt = db.prepare('INSERT OR IGNORE INTO urls(code, long_url) VALUES (?, ?)');
  const selectStmt = db.prepare('SELECT long_url FROM urls WHERE code = ?');

  return {
    put(code, longUrl) {
      const info = insertStmt.run(code, longUrl);
      return { inserted: info.changes === 1 };
    },
    get(code) {
      const row = selectStmt.get(code);
      return row ? { longUrl: row.long_url } : null;
    },
    close() {
      db.close();
    },
  };
}
