// Stepwise UI explorer: run an action list from CLI JSON, screenshot after each.
// Usage: node step.mjs '[["click",360,833],["wait",2000],["shot","step1"],["key","Enter"],["wait",1500],["shot","step2"]]'
// Live mode: node step.mjs --live setup.json
//   runs setup actions, then polls for ./live.cmd (JSON action array); executes it,
//   writes ./live.out {ok, error, errors, newMsgs, fatal} and deletes live.cmd.
//   ['quit'] as the last action ends the session cleanly.
import { createServer } from 'node:http';
import { readFile, stat, mkdir, access, unlink, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const DIST = join(process.cwd(), '..', 'web', 'build', 'dist', 'webapp');
const PORT = 8083;
const liveMode = process.argv[2] === '--live';
const actionsFile = liveMode ? process.argv[3] : (process.argv[2] ?? 'actions.json');
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

// Optional persistent browser profile: set SPD_TEST_PROFILE to a directory to
// keep IndexedDB/localStorage across step.mjs restarts (game saves survive).
const profileDir = process.env.SPD_TEST_PROFILE;
const browser = profileDir
  ? await chromium.launchPersistentContext(profileDir, { args: ['--use-gl=angle'], viewport: { width: 720, height: 1280 } })
  : await chromium.launch({ args: ['--use-gl=angle'] });
const page = (browser.pages && browser.pages().length)
  ? browser.pages()[0]
  : await browser.newPage({ viewport: { width: 720, height: 1280 } });
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

// Outputs from evaljs/savepeek during the current live.cmd batch (mirrored into live.out).
let liveOutputs = [];

async function runActions(list) {
  for (const a of list) {
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
    } else if (op === 'evaljs') {
      // evaljs: run arbitrary JS in the page, print JSON result.
      // Tries expression form first ("1+1"), falls back to async statement body
      // ("await foo(); return bar") evaluated as an async IIFE.
      let fn;
      try { fn = new Function('return (' + args[0] + ')'); }
      catch { fn = new Function('return (async () => { ' + args[0] + ' })()'); }
      const out = await page.evaluate(fn);
      const line = `evaljs: ${JSON.stringify(out)?.slice(0, 4000)}`;
      console.log(line);
      liveOutputs.push(line);
    } else if (op === 'savepeek') {
      // savepeek: read the game's IndexedDB save (uncompressed JSON, P7) and
      // report a compact state summary. Optional arg "map" adds the terrain
      // map + visited arrays encoded as one char per tile (charCode 48 + value).
      const withMap = args[0] === 'map';
      const out = await page.evaluate(async (wantMap) => {
        const openDb = (name) => new Promise((res, rej) => {
          const rq = indexedDB.open(name);
          rq.onsuccess = () => res(rq.result);
          rq.onerror = () => rej(rq.error);
        });
        const result = [];
        try {
          const db = await openDb('shattered-pixel-dungeon');
          for (const sn of db.objectStoreNames) {
            const store = db.transaction(sn, 'readonly').objectStore(sn);
            const keys = await new Promise((res, rej) => {
              const rq = store.getAllKeys();
              rq.onsuccess = () => res(rq.result);
              rq.onerror = () => rej(rq.error);
            });
            for (const key of keys) {
              const ks = String(key);
              const m = ks.match(/game(\d+)\/(game|depth\d+)\.dat\/?$/);
              if (!m) continue;
              const rec = await new Promise((res, rej) => {
                const rq = store.get(key);
                rq.onsuccess = () => res(rq.result);
                rq.onerror = () => rej(rq.error);
              });
              if (!rec || !rec.contents) { result.push({ key: ks, empty: true }); continue; }
              try {
                const json = JSON.parse(new TextDecoder().decode(rec.contents));
                if (m[2] === 'game') {
                  result.push({
                    slot: m[1], depth: json.depth,
                    heroPos: json.hero && json.hero.pos,
                    hp: json.hero && json.hero.HP,
                    gold: json.gold,
                  });
                } else {
                  const lvl = json.level || json;
                  const w = lvl.width;
                  const mobs = (lvl.mobs || []).map((mob) => ({
                    x: w != null ? mob.pos % w : null,
                    y: w != null ? Math.floor(mob.pos / w) : null,
                    state: mob.state,
                  }));
                  const entry = {
                    slot: m[1], file: m[2], w, h: lvl.height,
                    mobCount: mobs.length, mobs,
                  };
                  if (lvl.mobs && lvl.mobs[0]) entry.mobKeys = Object.keys(lvl.mobs[0]);
                  if (wantMap && w != null) {
                    entry.map = Array.from(lvl.map, (v) => String.fromCharCode(48 + v)).join('');
                    entry.visited = Array.from(lvl.visited, (v) => String.fromCharCode(48 + v)).join('');
                  }
                  result.push(entry);
                }
              } catch (e) { result.push({ key: ks, parseError: String(e) }); }
            }
          }
          db.close();
        } catch (e) { result.push({ dbError: String(e) }); }
        return result;
      }, withMap);
      const line = 'savepeek: ' + JSON.stringify(out).slice(0, 6000);
      console.log(line);
      liveOutputs.push(line);
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
}

async function fileExists(p) {
  try { await access(p); return true; } catch { return false; }
}

function report(cursor) {
  const newMsgs = allMsgs.slice(cursor);
  const fatal = newMsgs.filter((m) => /Fatal|Exception|Error|group/i.test(m));
  return {
    errors: errors.length,
    totalMsgs: allMsgs.length,
    newMsgs: newMsgs.slice(-30),
    newMsgCount: newMsgs.length,
    fatal,
  };
}

if (liveMode) {
  console.log('[live] setup done, entering live loop (poll ./live.cmd)');
  let cursor = allMsgs.length;
  for (;;) {
    if (!(await fileExists('live.cmd'))) { await page.waitForTimeout(300); continue; }
    let cmds, out;
    try {
      cmds = JSON.parse(await readFile('live.cmd', 'utf8'));
      await unlink('live.cmd');
      liveOutputs = [];
      const quit = cmds.some((c) => c[0] === 'quit');
      await runActions(cmds);
      out = { ok: true, quit, outputs: liveOutputs, ...report(cursor) };
      cursor = allMsgs.length;
      await writeFile('live.out', JSON.stringify(out, null, 1));
      if (quit) break;
    } catch (e) {
      out = { ok: false, error: String(e && e.stack || e), outputs: liveOutputs, ...report(cursor) };
      cursor = allMsgs.length;
      await writeFile('live.out', JSON.stringify(out, null, 1));
    }
  }
} else {
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
}
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
