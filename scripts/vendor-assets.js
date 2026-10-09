'use strict';

// Keep first-party UI assets local. No CDN is needed at runtime.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const copy = (from, to) => {
  const target = path.join(root, 'public', to);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, 'node_modules', from), target);
};
copy('gsap/dist/gsap.min.js', 'vendor/gsap.min.js');
copy('gsap/dist/ScrollTrigger.min.js', 'vendor/ScrollTrigger.min.js');
for (const weight of [400, 500, 600, 700, 800]) {
  copy(`@fontsource/outfit/files/outfit-latin-${weight}-normal.woff2`, `assets/fonts/outfit-${weight}.woff2`);
}
copy('@fontsource/outfit/LICENSE', 'assets/fonts/OFL.txt');
