const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_DIR = process.env.DB_DIR || path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, 'freshwater.db');

let db = null;
let dbDirty = false;
let initPromise = null;

const SAVE_INTERVAL = 5000;

function saveToDisk() {
  if (!db || !dbDirty) return;
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
    dbDirty = false;
  } catch (e) {
    console.error('[DB] 持久化失败:', e.message);
  }
}

setInterval(saveToDisk, SAVE_INTERVAL);
process.on('SIGTERM', () => { try { saveToDisk(); } catch {} process.exit(0); });
process.on('SIGINT', () => { try { saveToDisk(); } catch {} process.exit(0); });

const DATE_FIELDS = ['recorded_at', 'start_time', 'end_time', 'created_at', 'updated_at'];
const ISO_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/;

function convertRow(obj) {
  const out = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (DATE_FIELDS.includes(k) && typeof v === 'string' && ISO_RE.test(v)) {
      out[k] = new Date(v);
    } else if (k === 'valve_open' || k === 'is_active') {
      out[k] = !!v;
    } else if (k === 'detail' && typeof v === 'string' && v.length > 0) {
      try { out[k] = JSON.parse(v); } catch { out[k] = v; }
    } else {
      out[k] = v;
    }
  }
  return out;
}

function normParams(params) {
  return params.map((p) => {
    if (p instanceof Date) return p.toISOString();
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

function ensureReady() {
  if (!initPromise) {
    throw new Error('数据库尚未初始化，请先调用 initDB()');
  }
  return initPromise;
}

async function initDB() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const SQL = await initSqlJs();
    let buf = null;
    try {
      if (fs.existsSync(DB_PATH)) buf = fs.readFileSync(DB_PATH);
    } catch {}
    db = buf ? new SQL.Database(buf) : new SQL.Database();

    db.run(`CREATE TABLE IF NOT EXISTS sensor_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tank_code TEXT NOT NULL,
      remaining_tons REAL NOT NULL,
      valve_open INTEGER NOT NULL DEFAULT 0,
      recorded_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS usage_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tank_code TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      start_tons REAL NOT NULL,
      end_tons REAL NOT NULL,
      consumed_tons REAL NOT NULL,
      duration_minutes INTEGER NOT NULL,
      merge_count INTEGER DEFAULT 0,
      start_reading_id INTEGER,
      end_reading_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_type TEXT NOT NULL,
      tank_code TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT,
      is_active INTEGER DEFAULT 1,
      detail TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS processing_markers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      last_processed_reading_id INTEGER DEFAULT 0,
      last_processed_segment_id INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_sensor_readings_tank_time ON sensor_readings(tank_code, recorded_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_sensor_readings_recorded_at ON sensor_readings(recorded_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_usage_segments_tank_time ON usage_segments(tank_code, start_time)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_usage_segments_start_time ON usage_segments(start_time)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(is_active)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_alerts_type_time ON alerts(alert_type, start_time)`);
    db.run(`INSERT OR IGNORE INTO processing_markers (id, last_processed_reading_id, last_processed_segment_id) VALUES (1, 0, 0)`);
    dbDirty = true;
    saveToDisk();
    console.log(`✅ SQLite 数据库已就绪: ${DB_PATH}`);
    return true;
  })();
  return initPromise;
}

function query(sql, params = []) {
  ensureReady();
  const np = normParams(params);
  const trimmed = sql.trim().toUpperCase();

  if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH') || trimmed.startsWith('PRAGMA')) {
    const stmt = db.prepare(sql);
    stmt.bind(np);
    const rows = [];
    while (stmt.step()) {
      rows.push(convertRow(stmt.getAsObject()));
    }
    stmt.free();
    return { rows };
  }

  db.run(sql, np);
  dbDirty = true;
  const info = db.exec('SELECT last_insert_rowid() AS id, changes() AS c')[0].values[0];
  return {
    rows: info[0] ? [{ id: info[0] }] : [],
    changes: info[1],
    lastInsertRowid: info[0],
  };
}

async function getClient() {
  await ensureReady();
  return {
    async query(sql, params = []) { return query(sql, params); },
    BEGIN() { db.run('BEGIN'); },
    COMMIT() { db.run('COMMIT'); dbDirty = true; },
    ROLLBACK() { db.run('ROLLBACK'); },
    release() {},
  };
}

module.exports = {
  initDB,
  query,
  getClient,
  db: {
    exec(sql) {
      ensureReady();
      db.run(sql);
      dbDirty = true;
      return db;
    },
    prepare(sql) {
      ensureReady();
      const stmt = db.prepare(sql);
      return {
        all(...params) {
          stmt.bind(normParams(params));
          const rows = [];
          while (stmt.step()) rows.push(convertRow(stmt.getAsObject()));
          stmt.free();
          return rows;
        },
        run(...params) {
          db.run(stmt.getSQL(), normParams(params));
          dbDirty = true;
          const info = db.exec('SELECT last_insert_rowid() AS id, changes() AS c')[0].values[0];
          return { lastInsertRowid: info[0], changes: info[1] };
        },
        get(...params) { return this.all(...params)[0]; },
      };
    },
  },
  pool: { connect: async () => { await ensureReady(); return await getClient(); } },
  _saveToDisk: saveToDisk,
};
