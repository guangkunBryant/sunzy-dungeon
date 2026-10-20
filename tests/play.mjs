// M3-M5 verification: boot, first-gesture audio unlock, scripted movement,
// screenshot ladder, save/reload matrix.
// Usage: node play.mjs [--port 8082] [--mode play|save]
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const DIST = join(process.cwd(), '..', 'web', 'build', 'dist', 'webapp');
const PORT = Number(process.argv[process.argv.indexOf('--port') + 1] ?? 8082);
const MODE = process.argv.includes('--save') ? 'save' : 'play';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg', '.css': 'text/css', '.ico': 'image/x-icon', '.atlas': 'text/plain',
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const s = await stat(join(DIST, p)).catch(() => null);
    if (!s || s.isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream' });
    res.end(await readFile(join(DIST, p)));
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

await mkdir('screenshots', { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle'] });
const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
const errors = [];
const logs = [];
page.on('console', (m) => {
  logs.push(`[console:${m.type()}] ${m.text()}`);
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('canvas', { timeout: 90000 });

// M3: first user gesture (unlocks AudioContext), then screenshot ladder over boot sequence
await page.mouse.click(360, 640);
const ladder = ['l1-boot', 'l2-5s', 'l3-15s', 'l4-30s'];
for (const [i, name] of ladder.entries()) {
  await page.waitForTimeout(i === 0 ? 2000 : i === 1 ? 3000 : i === 2 ? 10000 : 15000);
  await page.screenshot({ path: `screenshots/${name}.png` });
}

if (MODE === 'play') {
  // M3: scripted keyboard movement (arrows) for ~20 turns worth of steps
  const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press(keys[Math.floor(Math.random() * 4)]);
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: 'screenshots/m3-after-movement.png' });
}

if (MODE === 'save') {
  // M4: save/reload matrix — reach a state, reload, screenshot title/continue
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { timeout: 90000 });
  await page.waitForTimeout(15000);
  await page.screenshot({ path: 'screenshots/m4-after-reload.png' });
}

const ALLOW = ['AudioContext was not allowed to start'];
const realErrors = errors.filter((e) => !ALLOW.some((a) => e.includes(a)));

console.log('--- result ---');
console.log(`mode: ${MODE}`);
console.log(`console_errors: ${errors.length} (allowlisted: ${errors.length - realErrors.length})`);
for (const e of errors) console.log(`  ${e}`);
console.log('--- console log tail ---');
for (const l of logs.slice(-50)) console.log(l);

await browser.close();
server.close();
process.exit(realErrors.length === 0 ? 0 : 1);
