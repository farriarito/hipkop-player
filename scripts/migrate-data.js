'use strict';
// Private migration bundle. Never commit it or serve it from public/.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const config = require('../src/config');
const { SCHEMA, MIGRATIONS } = require('../src/schema');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const quote = value => `'${String(value).replace(/'/g, "''")}'`;
const baseName = value => String(value || '').split(/[\\/]/).pop();
const artName = name => /^[a-f0-9]{40}\.(jpg|jpeg|png|webp|gif|avif)$/.test(name);
function counts(db) {
  return Object.fromEntries(['artists','albums','tracks','community_posts','cover_cache'].map(table => [table, db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n]));
}
function check(db) {
  if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('SQLite integrity check failed');
  if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('SQLite foreign key check failed');
}
function migrate(db) {
  db.exec(SCHEMA);
  for (const [table, column, type] of MIGRATIONS) {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some(row => row.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
function exportData(destination) {
  const output = path.resolve(destination);
  if (fs.existsSync(output)) throw new Error('Output already exists; use a new private directory');
  if (output.startsWith(`${path.resolve(config.publicDir)}${path.sep}`)) throw new Error('Never export private data into public/');
  if (!fs.existsSync(config.dbPath)) throw new Error('Source database missing');
  fs.mkdirSync(path.join(output, 'media'), { recursive: true });
  const target = path.join(output, 'hipkop.sqlite');
  const source = new DatabaseSync(config.dbPath, { readOnly: true });
  try { source.exec('PRAGMA busy_timeout = 10000'); source.exec(`VACUUM INTO ${quote(target)}`); } finally { source.close(); }
  const copy = new DatabaseSync(target);
  const files = [], missing = [];
  let stats;
  try {
    migrate(copy);
    // Password hashes and accounts survive; active login sessions never travel.
    copy.exec("DELETE FROM sessions; UPDATE sync_jobs SET status = 'pending' WHERE status = 'running';");
    for (const row of copy.prepare("SELECT id, local_path FROM cover_cache WHERE status = 'ready'").all()) {
      const name = baseName(row.local_path), original = path.join(config.mediaDir, name);
      if (artName(name) && fs.existsSync(original)) {
        const file = path.join(output, 'media', name);
        if (!fs.existsSync(file)) { fs.copyFileSync(original, file); files.push({ name: `media/${name}`, bytes: fs.statSync(file).size, sha256: hash(file) }); }
        copy.prepare('UPDATE cover_cache SET local_path = ? WHERE id = ?').run(name, row.id);
      } else {
        missing.push(row.id);
        copy.prepare("UPDATE cover_cache SET local_path = NULL, status = 'pending' WHERE id = ?").run(row.id);
      }
    }
    check(copy); stats = counts(copy);
    copy.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode = DELETE;');
  } finally { copy.close(); }
  files.unshift({ name: 'hipkop.sqlite', bytes: fs.statSync(target).size, sha256: hash(target) });
  const manifest = { format: 'hipkop-private-migration-v1', createdAt: new Date().toISOString(), version: require('../package.json').version, counts: stats, missingCovers: missing.length, files };
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ output, counts: stats, mediaFiles: files.length - 1, missingCovers: missing.length }, null, 2));
  return manifest;
}
function verifyBundle(input) {
  const root = path.resolve(input), manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.format !== 'hipkop-private-migration-v1' || !Array.isArray(manifest.files)) throw new Error('Unsupported bundle');
  const names = new Set();
  for (const entry of manifest.files) {
    if (entry.name !== 'hipkop.sqlite' && !(entry.name.startsWith('media/') && artName(entry.name.slice(6)))) throw new Error('Unsafe bundle path');
    if (names.has(entry.name)) throw new Error('Duplicate manifest entry');
    names.add(entry.name);
    const file = path.join(root, entry.name);
    if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size !== entry.bytes || hash(file) !== entry.sha256) throw new Error(`Bundle checksum mismatch: ${entry.name}`);
  }
  if (!names.has('hipkop.sqlite')) throw new Error('Database missing from bundle');
  const db = new DatabaseSync(path.join(root, 'hipkop.sqlite'), { readOnly: true });
  try {
    check(db);
    if (JSON.stringify(counts(db)) !== JSON.stringify(manifest.counts)) throw new Error('Bundle record counts mismatch');
    for (const row of db.prepare("SELECT local_path FROM cover_cache WHERE status = 'ready'").all()) {
      if (!artName(row.local_path) || !names.has(`media/${row.local_path}`)) throw new Error('Cached cover missing from manifest');
    }
  } finally { db.close(); }
  return manifest;
}
function restoreData(input) {
  const manifest = verifyBundle(input);
  const dbPath = path.resolve(config.dbPath), mediaPath = path.resolve(config.mediaDir);
  if ([dbPath, `${dbPath}-wal`, `${dbPath}-shm`].some(file => fs.existsSync(file))) throw new Error('Destination database exists; stop service and back it up first. Restore never overwrites it.');
  if (fs.existsSync(mediaPath) && fs.readdirSync(mediaPath).length) throw new Error('Destination media directory must be empty');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.mkdirSync(mediaPath, { recursive: true });
  const copied = [];
  try {
    for (const entry of manifest.files.filter(file => file.name.startsWith('media/'))) {
      const target = path.join(mediaPath, entry.name.slice(6));
      fs.copyFileSync(path.join(input, entry.name), target, fs.constants.COPYFILE_EXCL); copied.push(target);
    }
    // Database last: an interrupted media restore cannot look like a usable catalog.
    fs.copyFileSync(path.join(input, 'hipkop.sqlite'), dbPath, fs.constants.COPYFILE_EXCL);
  } catch (error) {
    for (const file of copied) fs.unlinkSync(file);
    throw error;
  }
  console.log(JSON.stringify({ restored: dbPath, media: mediaPath, counts: manifest.counts, mediaFiles: copied.length }, null, 2));
  return manifest;
}
if (require.main === module) {
  try {
    const [command, input] = process.argv.slice(2);
    if (!input || !['export','verify','restore'].includes(command)) throw new Error('Usage: node scripts/migrate-data.js export|verify|restore <private-directory>');
    if (command === 'export') exportData(input);
    if (command === 'restore') restoreData(input);
    if (command === 'verify') console.log(JSON.stringify({ verified: true, ...verifyBundle(input) }, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { exportData, restoreData, verifyBundle };
