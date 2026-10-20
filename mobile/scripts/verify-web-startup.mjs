import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Run the complete packaged app in a fresh browser. No accounts are created,
// credentials entered, or backend requests allowed by this startup check.
const root = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../www/', import.meta.url));
const types = { '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(resolve(root) + sep)) { response.writeHead(403).end(); return; }
  try { response.setHeader('Content-Type', types[extname(file)] || 'text/html'); response.end(await readFile(file)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error('App startup error:', error.message); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
  await page.goto(origin);
  await page.locator('#store-login-username-input').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#store-login-password-input').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#store-login-submit-btn').innerText(), '로그인하기');
  await page.locator('[data-landingtab="staff"]').click();
  await page.getByRole('group', { name: '직원·매니저 로그인', exact: true }).waitFor({ state: 'visible' });
  await page.locator('[data-landingtab="owner"]').click();
  await page.getByRole('group', { name: '사장님 로그인', exact: true }).waitFor({ state: 'visible' });
  await page.reload();
  await page.locator('#store-login-submit-btn').waitFor({ state: 'visible' });
  assert.deepEqual(errors, [], 'Packaged app must start and reopen without JavaScript errors');
  console.log('Packaged app startup, owner/staff login tabs, and reopen: passed');
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
