// M0 boot probe: serve web/build/dist/webapp, load in headless Chromium (SwiftShader/ANGLE),
// assert canvas boots + no unexpected console errors, capture screenshot.
// Usage: node webtest.mjs boot [--port 8081]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const DIST = join(process.cwd(), '..', 'web', 'build', 'dist', 'webapp');
const PORT = Number(process.argv[process.argv.indexOf('--port') + 1] ?? 8081);

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg', '.css': 'text/css', '.ico': 'image/x-icon', '.atlas': 'text/plain',
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = join(DIST, p);
    const s = await stat(file).catch(() => null);
    if (!s || s.isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
console.log(`[webtest] serving ${DIST} on http://127.0.0.1:${PORT}/`);

const browser = await chromium.launch({ args: ['--use-gl=angle'] });
const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });

const errors = [];
const logs = [];
page.on('console', (m) => {
  const t = `[console:${m.type()}] ${m.text()}`;
  logs.push(t);
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });

// Wait for canvas element (M0 exit criterion)
let canvasFound = false;
try {
  await page.waitForSelector('canvas', { timeout: 90000 });
  canvasFound = true;
} catch { /* boot failed */ }

if (canvasFound) {
  // Give the game a few seconds to boot/render the title screen
  await page.waitForTimeout(15000);
  await page.screenshot({ path: 'screenshots/m0-boot.png' });
}

// Expected allowlisted error: Chrome autoplay policy (resumes on first user gesture)
const ALLOW = ['AudioContext was not allowed to start'];
const realErrors = errors.filter((e) => !ALLOW.some((a) => e.includes(a)));

console.log('--- result ---');
console.log(`canvas_found: ${canvasFound}`);
console.log(`console_errors: ${errors.length} (allowlisted: ${errors.length - realErrors.length})`);
for (const e of errors) console.log(`  ${e}`);
console.log('--- console log tail ---');
for (const l of logs.slice(-40)) console.log(l);

await browser.close();
server.close();
process.exit(canvasFound && realErrors.length === 0 ? 0 : 1);
