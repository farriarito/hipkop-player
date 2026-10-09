'use strict';

// Thin, dependency-free data layer on top of Node's built-in SQLite driver.
// Rows come back as null-prototype objects, so every helper normalises them
// into plain JSON-friendly objects before they reach the API layer.

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const config = require('./config');
const { SCHEMA, MIGRATIONS } = require('./schema');

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
fs.mkdirSync(config.mediaDir, { recursive: true });

const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA busy_timeout = 5000;');
db.exec(SCHEMA);

// CREATE TABLE IF NOT EXISTS never adds columns to an existing table, so apply
// additive migrations explicitly. Safe to run on every boot.
const tableColumns = (table) => {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return new Set(rows.map((row) => row.name));
};

const appliedMigrations = [];
for (const [table, column, ddl] of MIGRATIONS) {
  const columns = tableColumns(table);
  if (!columns.has(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    appliedMigrations.push(`${table}.${column}`);
  }
}

// These indexes depend on columns added by the migrations above. Creating
// them after the additive migration keeps older SQLite catalogs bootable.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_artists_bucket ON artists (genre_bucket, scene);
  CREATE INDEX IF NOT EXISTS idx_albums_bucket ON albums (genre_bucket, scene);
`);

const nowIso = () => new Date().toISOString();

const toPlain = (row) => {
  if (!row) return null;
  const out = {};
  for (const key of Object.keys(row)) out[key] = row[key];
  return out;
};

const run = (sql, params = []) => db.prepare(sql).run(...params);
const get = (sql, params = []) => toPlain(db.prepare(sql).get(...params));
const all = (sql, params = []) => db.prepare(sql).all(...params).map(toPlain);

const transaction = (fn) => {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
};

const json = (value) => (value === undefined || value === null ? null : JSON.stringify(value));

module.exports = { db, run, get, all, transaction, toPlain, nowIso, json, appliedMigrations };
