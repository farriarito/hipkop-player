'use strict';

// Thin, dependency-free data layer on top of Node's built-in SQLite driver.
// Rows come back as null-prototype objects, so every helper normalises them
// into plain JSON-friendly objects before they reach the API layer.

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const config = require('./config');
const schema = require('./schema');

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
fs.mkdirSync(config.mediaDir, { recursive: true });

const db = new DatabaseSync(config.dbPath);
db.exec(schema);

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

module.exports = { db, run, get, all, transaction, toPlain, nowIso, json };