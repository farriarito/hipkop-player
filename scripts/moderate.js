'use strict';
// Server-side/operator CLI; never embed the admin token into the H5.
async function main() {
  const [command = 'list', id] = process.argv.slice(2);
  const origin = process.env.HIPKOP_PUBLIC_ORIGIN, token = process.env.HIPKOP_ADMIN_TOKEN;
  if (!origin || !token) throw new Error('Set HIPKOP_PUBLIC_ORIGIN and HIPKOP_ADMIN_TOKEN');
  if (!['list','approve','reject'].includes(command) || (command !== 'list' && !/^\d+$/.test(id || ''))) throw new Error('Usage: node scripts/moderate.js list|approve <id>|reject <id>');
  const response = await fetch(new URL(command === 'list' ? '/api/admin/posts' : `/api/admin/posts/${id}`, origin), {
    method: command === 'list' ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(command === 'list' ? {} : { body: JSON.stringify({ status: command === 'approve' ? 'published' : 'rejected' }) })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${data.error}`);
  console.log(JSON.stringify(data, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
