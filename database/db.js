/**
 * db.js — Wrapper PostgreSQL (Supabase) com API compatível com o codebase
 * Usa pg (node-postgres) com pool de conexões
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// Converte ? para $1, $2, $3...
function toPostgres(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

class Statement {
  constructor(sql) {
    this.originalSql = sql;
    this.sql = toPostgres(sql);
    this.isInsert = /^\s*INSERT/i.test(sql);
    this.isSettingsTable = /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+settings/i.test(sql);
  }

  _normalize(args) {
    if (args.length === 0) return [];
    if (args.length === 1 && Array.isArray(args[0])) return args[0];
    return args;
  }

  async run(...args) {
    const params = this._normalize(args);
    let sql = this.sql;
    const needsReturning = this.isInsert && !this.isSettingsTable;
    if (needsReturning) sql += ' RETURNING id';

    const result = await pool.query(sql, params.length ? params : undefined);
    return {
      lastInsertRowid: (needsReturning && result.rows[0]) ? result.rows[0].id : null,
      changes: result.rowCount
    };
  }

  async get(...args) {
    const params = this._normalize(args);
    const result = await pool.query(this.sql, params.length ? params : undefined);
    return result.rows[0] || undefined;
  }

  async all(...args) {
    const params = this._normalize(args);
    const result = await pool.query(this.sql, params.length ? params : undefined);
    return result.rows;
  }
}

function getDb() {
  return {
    prepare(sql) { return new Statement(sql); },
    async exec(sql) { await pool.query(sql); },
    pool
  };
}

async function initializeDatabase() {
  await pool.query('SELECT 1');
  console.log('✅ Conectado ao Supabase PostgreSQL');
}

module.exports = { getDb, initializeDatabase };
