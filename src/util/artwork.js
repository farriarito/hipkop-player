'use strict';
// Pin validated DNS results to the actual TLS connection. Validate every redirect,
// limit bytes while streaming, and keep the timeout active until the body ends.
const https = require('node:https');
const dns = require('node:dns');
const net = require('node:net');
const blocked = new net.BlockList();
for (const [ip, prefix] of [['0.0.0.0',8], ['10.0.0.0',8], ['100.64.0.0',10], ['127.0.0.0',8], ['169.254.0.0',16], ['172.16.0.0',12], ['192.168.0.0',16], ['192.0.0.0',24], ['198.18.0.0',15], ['224.0.0.0',4], ['240.0.0.0',4]]) blocked.addSubnet(ip, prefix, 'ipv4');
for (const [ip, prefix] of [['::',128], ['::1',128], ['fc00::',7], ['fe80::',10], ['ff00::',8]]) blocked.addSubnet(ip, prefix, 'ipv6');
function publicIp(address) {
  const family = net.isIP(address);
  if (family === 6 && /^::ffff:/i.test(address)) return false;
  return family && !blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
}
async function fetchArtwork(source, { hostAllowed, maxBytes, timeout }, redirects = 0) {
  const url = new URL(source);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !hostAllowed(url.hostname)) throw new Error('unsafe_artwork_url');
  const addresses = await dns.promises.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(item => !publicIp(item.address))) throw new Error('unsafe_artwork_address');
  return new Promise((resolve, reject) => {
    let complete = false;
    const fail = error => { if (!complete) { complete = true; clearTimeout(timer); reject(error); } };
    const request = https.get(url, {
      lookup: (_host, options, callback) => {
        const selected = addresses.find(item => !options.family || item.family === options.family) || addresses[0];
        callback(null, options.all ? [selected] : selected.address, selected.family);
      },
      headers: { 'User-Agent': 'HIPKOP/1.0', Accept: 'image/*' }
    }, response => {
      if ([301,302,303,307,308].includes(response.statusCode)) {
        response.destroy();
        if (redirects >= 4 || !response.headers.location) { fail(new Error('artwork_redirect_limit')); return; }
        complete = true; clearTimeout(timer);
        fetchArtwork(new URL(response.headers.location, url), { hostAllowed, maxBytes, timeout }, redirects + 1).then(resolve, reject);
        return;
      }
      const contentType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (response.statusCode !== 200 || !['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(contentType)) {
        response.destroy(); fail(new Error('invalid_artwork_response')); return;
      }
      let bytes = 0, chunks = [];
      if (Number(response.headers['content-length']) > maxBytes) { response.destroy(); fail(new Error('image_too_large')); return; }
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > maxBytes) { chunks = []; response.destroy(); fail(new Error('image_too_large')); return; }
        chunks.push(chunk);
      });
      response.on('error', fail);
      response.on('end', () => {
        if (complete) return;
        complete = true; clearTimeout(timer); resolve({ buffer: Buffer.concat(chunks), contentType });
      });
    });
    const timer = setTimeout(() => request.destroy(new Error('artwork_timeout')), timeout);
    request.on('error', fail);
  });
}
module.exports = { fetchArtwork, publicIp };
