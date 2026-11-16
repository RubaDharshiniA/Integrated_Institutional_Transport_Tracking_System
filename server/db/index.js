const path = require('path');
const fs = require('fs');
require('dotenv').config();

let pool = null;
let sqliteDb = null;
let dbType = 'sqlite'; // 'postgres' | 'sqlite'

// Initialize SQLite database
function initSqlite(dbFilePath) {
  const sqlite3 = require('sqlite3').verbose();
  const dir = path.dirname(dbFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new sqlite3.Database(dbFilePath, (err) => {
    if (err) {
      console.error('[DB] Failed to connect to SQLite:', err.message);
    } else {
      console.log(`[DB] Connected to SQLite database at ${dbFilePath}`);
    }
  });

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON;');
  return db;
}

// Convert PostgreSQL parameterized query ($1, $2...) to SQLite (?, ?...)
function convertPgToSqlite(sql) {
  // Replace $1, $2 with ?
  let sqliteSql = sql.replace(/\$\d+/g, '?');

  // Replace ILIKE with LIKE
  sqliteSql = sqliteSql.replace(/\bILIKE\b/gi, 'LIKE');

  // Replace interval subtraction if present: CURRENT_TIMESTAMP - INTERVAL 'X minutes'
  sqliteSql = sqliteSql.replace(/CURRENT_TIMESTAMP\s*-\s*INTERVAL\s*'(\d+)\s*minutes'/gi, "datetime('now', '-$1 minutes')");

  return sqliteSql;
}

async function initializeDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  const requestedDbType = process.env.DB_TYPE;

  if ((requestedDbType === 'postgres' || databaseUrl) && requestedDbType !== 'sqlite') {
    try {
      const { Pool } = require('pg');
      pool = new Pool({
        connectionString: databaseUrl || 'postgresql://postgres:postgres@localhost:5432/transport_db',
        connectionTimeoutMillis: 2000
      });

      // Quick test query to verify if PostgreSQL server is alive
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      dbType = 'postgres';
      console.log('[DB] Successfully connected to PostgreSQL database');
      return;
    } catch (err) {
      console.warn(`[DB] PostgreSQL connection unavailable (${err.message}). Falling back to local SQLite database.`);
      pool = null;
    }
  }

  // SQLite fallback
  const dbPath = process.env.SQLITE_PATH || path.join(__dirname, '..', '..', 'data', 'transport.db');
  sqliteDb = initSqlite(dbPath);
  dbType = 'sqlite';
}

// Initialize immediately or on first query
let initPromise = null;
function ensureInit() {
  if (!initPromise) {
    initPromise = initializeDatabase();
  }
  return initPromise;
}

/**
 * Universal query function: works with both PostgreSQL and SQLite.
 * Returns { rows: [...], rowCount: number, lastID: number }
 */
async function query(sql, params = []) {
  await ensureInit();

  if (dbType === 'postgres' && pool) {
    const res = await pool.query(sql, params);
    return {
      rows: res.rows,
      rowCount: res.rowCount,
      command: res.command
    };
  }

  // SQLite Execution
  return new Promise((resolve, reject) => {
    const sqliteSql = convertPgToSqlite(sql);
    const trimmed = sqliteSql.trim();
    const isSelect = /^(SELECT|PRAGMA)/i.test(trimmed);
    const hasReturning = /RETURNING/i.test(trimmed);

    if (isSelect || hasReturning) {
      sqliteDb.all(sqliteSql, params, (err, rows) => {
        if (err) return reject(err);
        resolve({
          rows: rows || [],
          rowCount: rows ? rows.length : 0
        });
      });
    } else {
      sqliteDb.run(sqliteSql, params, function (err) {
        if (err) return reject(err);
        resolve({
          rows: [],
          rowCount: this.changes,
          lastID: this.lastID
        });
      });
    }
  });
}

function getDbType() {
  return dbType;
}

async function close() {
  if (pool) {
    await pool.end();
  }
  if (sqliteDb) {
    return new Promise((resolve) => sqliteDb.close(resolve));
  }
}

module.exports = {
  query,
  ensureInit,
  getDbType,
  close
};
