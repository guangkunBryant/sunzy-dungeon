// Stepwise UI explorer: run an action list from CLI JSON, screenshot after each.
// Usage: node step.mjs '[["click",360,833],["wait",2000],["shot","step1"],["key","Enter"],["wait",1500],["shot","step2"]]'
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const DIST = join(process.cwd(), '..', 'web', 'build', 'dist', 'webapp');
const PORT = 8083;
const actionsFile = process.argv[2] ?? 'actions.json';
const actions = JSON.parse(await readFile(join(process.cwd(), actionsFile), 'utf8'));

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
    if (!s || s.isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream' });
    res.end(await readFile(join(DIST, p)));
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
await mkdir('screenshots', { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle'] });
const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
const errors = [];
const allMsgs = [];
page.on('pageerror', (e) => { errors.push(e.message); allMsgs.push(`[pageerror] ${e.message}`); });
page.on('console', (m) => {
  allMsgs.push(`[${m.type()}] ${m.text()}`);
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('canvas', { timeout: 90000 });
await page.waitForTimeout(12000); // boot to title

const canvasBox = await page.locator('canvas').boundingBox();
const scale = canvasBox ? { x: canvasBox.width / 720, y: canvasBox.height / 1280 } : { x: 1, y: 1 };

for (const a of actions) {
  const [op, ...args] = a;
  if (op === 'click') {
    await page.mouse.click(360 + args[0] * scale.x, 640 + args[1] * scale.y);
  } else if (op === 'absClick') {
    await page.mouse.click(args[0], args[1]);
  } else if (op === 'key') {
    await page.keyboard.press(args[0]);
  } else if (op === 'type') {
    await page.keyboard.type(args[0]);
  } else if (op === 'wait') {
    await page.waitForTimeout(args[0]);
  } else if (op === 'shot') {
    await page.screenshot({ path: `screenshots/${args[0]}.png` });
    console.log(`shot: screenshots/${args[0]}.png`);
  } else if (op === 'reload') {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('canvas', { timeout: 90000 });
  } else if (op === 'eval') {
    // eval: dump indexedDB database names + record keys for save diagnosis
    const out = await page.evaluate(async () => {
      const dbs = await indexedDB.databases();
      const result = [];
      for (const d of dbs) {
        const entry = { name: d.name, version: d.version, stores: {} };
        try {
          const db = await new Promise((res, rej) => {
            const rq = indexedDB.open(d.name);
            rq.onsuccess = () => res(rq.result);
            rq.onerror = () => rej(rq.error);
          });
          for (const sn of db.objectStoreNames) {
            const keys = await new Promise((res, rej) => {
              const tx = db.transaction(sn, 'readonly');
              const rq = tx.objectStore(sn).getAllKeys();
              rq.onsuccess = () => res(rq.result);
              rq.onerror = () => rej(rq.error);
            });
            entry.stores[sn] = keys;
          }
          db.close();
        } catch (e) { entry.error = String(e); }
        result.push(entry);
      }
      return result;
    });
    console.log('--- indexedDB dump ---');
    for (const db of out) {
      console.log(`db: ${db.name} v${db.version}${db.error ? ' ERROR: ' + db.error : ''}`);
      for (const [sn, keys] of Object.entries(db.stores ?? {})) {
        console.log(`  store "${sn}": ${keys.length} keys -> ${JSON.stringify(keys)}`);
      }
    }
  }
}

console.log(`errors: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log(`  ${e}`);
// canvas freeze detection: hash canvas pixels twice, 1s apart
try {
  const h1 = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? c.toDataURL().length + ':' + c.toDataURL().slice(-64) : 'no-canvas';
  });
  await page.waitForTimeout(1000);
  const h2 = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? c.toDataURL().length + ':' + c.toDataURL().slice(-64) : 'no-canvas';
  });
  console.log(`canvas_updating: ${h1 !== h2}`);
} catch (e) { console.log(`freeze-probe-failed: ${e.message}`); }
console.log('--- all console messages (last 25) ---');
for (const m of allMsgs.slice(-25)) console.log(m);
console.log('--- trace search ---');
const traces = allMsgs.filter((m) => /TRACE/i.test(m));
for (const m of traces) console.log(m);
console.log(`(trace lines: ${traces.length})`);
console.log('--- fatal/error search ---');
const fatalIdx = [];
allMsgs.forEach((m, i) => { if (/Fatal|Exception|Error|group/i.test(m)) fatalIdx.push(i); });
for (const i of fatalIdx) {
  console.log(`>>> match at #${i}: ${allMsgs[i].slice(0, 200)}`);
  for (let j = i + 1; j < Math.min(allMsgs.length, i + 25); j++) {
    if (/startGroup|endGroup/.test(allMsgs[j]) && j !== i) break;
    console.log(`    stack: ${allMsgs[j].slice(0, 250)}`);
  }
}
console.log(`(total messages: ${allMsgs.length}, matches: ${fatalIdx.length})`);
await browser.close();
server.close();
