// Navigate hero to a target tile by iterative click-and-verify with settling.
// Camera model (settled): hero sprite at screen (360,640), T=16px/tile.
// Anti-lag: a position is trusted only when two savepeeks >=3s apart agree.
// Usage: node nav-to.mjs <tx> <ty> [maxRounds]
import { readFileSync, writeFileSync, existsSync, rmSync, statSync } from 'node:fs';

const [tx, ty, maxRoundsArg] = process.argv.slice(2).map(Number);
if (tx === undefined || ty === undefined) { console.log('usage: node nav-to.mjs <tx> <ty> [maxRounds]'); process.exit(1); }
const MAX_ROUNDS = maxRoundsArg ?? 10;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseLive() {
  if (!existsSync('live.out')) return null;
  const d = JSON.parse(readFileSync('live.out', 'utf8'));
  for (let i = d.outputs.length - 1; i >= 0; i--) {
    const o = d.outputs[i];
    if (o.startsWith('savepeek:')) {
      try {
        const a = JSON.parse(o.slice(9));
        const g = a.find((e) => e.depth !== undefined);
        const lv = a.find((e) => e.file === `depth${g.depth}`);
        return { g, lv };
      } catch { /* torn */ }
    }
  }
  return null;
}

function writeBatch(actions) { writeFileSync('live.cmd', JSON.stringify(actions)); }
function waitConsumed() {
  return new Promise((res) => {
    const iv = setInterval(() => { if (!existsSync('live.cmd')) { clearInterval(iv); res(); } }, 250);
  });
}
async function runBatch(actions, timeoutMs = 90000) {
  rmSync('live.out', { force: true });
  writeBatch(actions);
  await waitConsumed();
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    await sleep(500);
    if (existsSync('live.out') && parseLive()) return;
  }
  throw new Error('batch timeout');
}

// read settled hero pos: hero must be idle long enough for the 3s autosave
// to flush (saves only happen when hero.ready). Long waits avoid stale reads.
async function settledPos(widthRef) {
  await runBatch([['wait', 10000], ['savepeek'], ['wait', 5000], ['savepeek']]);
  for (let k = 0; k < 3; k++) {
    const p = parseLive();
    if (p) {
      const w = (p.lv ?? {}).w ?? widthRef.w;
      widthRef.w = w;
      const g = p.g;
      return { x: g.heroPos % w, y: Math.floor(g.heroPos / w), hp: g.hp };
    }
    await runBatch([['savepeek']]);
  }
  throw new Error('no savepeek');
}

const widthRef = { w: 40 };
let rounds = 0;
while (rounds < MAX_ROUNDS) {
  rounds++;
  const pos = await settledPos(widthRef);
  console.log(`round ${rounds}: hero (${pos.x},${pos.y}) hp=${pos.hp}`);
  if (pos.x === tx && pos.y === ty) { console.log('ARRIVED'); process.exit(0); }

  // try sprite-anchor click, then perturbed variants until hero moves
  const variants = [
    [358 + (tx - pos.x) * 16, 609 + (ty - pos.y) * 16], // settled camera puts hero sprite at (358,609)
    [360, 640], // legacy center model
  ].filter((v, i, a) => a.findIndex((u) => u[0] === v[0] && u[1] === v[1]) === i);

  let moved = false;
  for (const [cx, cy] of variants) {
    const scx = Math.max(5, Math.min(715, Math.round(cx)));
    const scy = Math.max(5, Math.min(1275, Math.round(cy)));
    console.log(`  click (${scx},${scy})`);
    await runBatch([['absClick', scx, scy], ['wait', 15000], ['savepeek']]);
    const p2 = parseLive();
    const w = (p2.lv ?? {}).w ?? widthRef.w;
    const x2 = p2.g.heroPos % w, y2 = Math.floor(p2.g.heroPos / w);
    console.log(`  after: (${x2},${y2})`);
    if (x2 !== pos.x || y2 !== pos.y) {
      moved = true;
      if (x2 === tx && y2 === ty) { console.log('ARRIVED'); process.exit(0); }
      break;
    }
  }
  if (!moved) console.log('  no movement this round');
}
console.log('MAX ROUNDS reached');
process.exit(2);
