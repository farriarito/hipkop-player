'use strict';

// Native SPA production bundle: no framework transpiler or unrelated assets.
// Config resolves relative to dist; mount a writable catalog with HIPKOP_DB_PATH
// and HIPKOP_MEDIA_DIR in deployments, and start using `node dist/server.js`.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'dist');
if (!destination.startsWith(`${root}${path.sep}`) || path.basename(destination) !== 'dist') {
  throw new Error('Invalid production directory');
}
fs.mkdirSync(destination, { recursive: true });
for (const name of ['public', 'src']) {
  const output = path.join(destination, name);
  // Known, literal workspace-scoped output only; never touch local source/data.
  if (fs.existsSync(output)) fs.rmSync(output, { recursive: true, force: true });
  fs.cpSync(path.join(root, name), output, { recursive: true });
}
fs.copyFileSync(path.join(root, 'server.js'), path.join(destination, 'server.js'));
// Ops scripts a deployment may run against its own catalog. The verify-* and
// asset-pipeline scripts stay out: they belong to development, not the image.
const opsScripts = ['warm-media.js', 'backfill-artist-art.js', 'sync-once.js', 'taxonomy-agent.js'];
fs.mkdirSync(path.join(destination, 'scripts'), { recursive: true });
for (const name of opsScripts) {
  fs.copyFileSync(path.join(root, 'scripts', name), path.join(destination, 'scripts', name));
}
fs.copyFileSync(path.join(root, '.env.example'), path.join(destination, '.env.example'));
const sourcePackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(destination, 'package.json'), JSON.stringify({
  name: sourcePackage.name,
  version: sourcePackage.version,
  private: true,
  type: 'commonjs',
  main: 'server.js',
  engines: sourcePackage.engines,
  scripts: { start: 'node --env-file-if-exists=.env server.js' }
}, null, 2));
fs.writeFileSync(path.join(destination, 'README.txt'),
  'HIPKOP native production package\nNode >=22.5.0.\nRun: node --env-file-if-exists=.env server.js\n' +
  'Configure HIPKOP_DB_PATH and HIPKOP_MEDIA_DIR for your persistent catalog/media; .env and local data are not exported.\n');
console.log(`Built production server and assets: ${destination}`);
