// BFS path planner over the savepeek map dump.
// Usage: node plan-move.mjs <tx> <ty> [live.out]
// Prints a live.cmd JSON array of ["key","w|a|s|d"] steps to reach (tx,ty),
// including the final step INTO the target tile (attack if a mob stands there).
import { readFile, writeFile } from 'node:fs/promises';

const [, , txs, tys, file] = process.argv;
const tx = +txs, ty = +tys;

const raw = await readFile(file ?? 'live.out', 'utf8');
const live = JSON.parse(raw);
const line = (live.outputs ?? []).find((o) => o.startsWith('savepeek:'));
if (!line) { console.log('no savepeek output'); process.exit(1); }
const data = JSON.parse(line.slice('savepeek:'.length));
const hero = data.find((e) => e.depth !== undefined);
const lv = data.find((e) => e.file === `depth${hero.depth}`);
const { w, map } = lv;
const start = hero.heroPos;
const target = ty * w + tx;

// passable terrains (trap 18/secret-trap 17 and chasm 0 excluded; 20=EMPTY_DECO, 30=FURROWED_GRASS, 32=CUSTOM_DECO_EMPTY)
const PASS = new Set([1, 2, 5, 6, 7, 8, 9, 14, 15, 20, 29, 30, 32]);
const T = (p) => map.charCodeAt(p) - 48;

// BFS
const prev = new Map([[start, -1]]);
const q = [start];
while (q.length) {
  const p = q.shift();
  if (p === target) break;
  const x = p % w, y = Math.floor(p / w);
  for (const [dx, dy, key] of [[1,0,'d'],[-1,0,'a'],[0,1,'s'],[0,-1,'w']]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= lv.h) continue;
    const np = ny * w + nx;
    if (prev.has(np)) continue;
    if (np !== target && !PASS.has(T(np))) continue;
    if (np === target && !PASS.has(T(np)) && T(np) !== 1) {
      // allow stepping into non-passable target only if it's plain floor-adjacent mob
    }
    prev.set(np, p);
    q.push(np);
  }
}
if (!prev.has(target)) { console.log('NO PATH to', tx, ty); process.exit(1); }

const path = [];
for (let p = target; p !== start; p = prev.get(p)) path.push(p);
path.reverse();

const keys = [];
let cur = start;
for (const p of path) {
  const dx = (p % w) - (cur % w), dy = Math.floor(p / w) - Math.floor(cur / w);
  keys.push(dx === 1 ? 'd' : dx === -1 ? 'a' : dy === 1 ? 's' : 'w');
  cur = p;
}
const actions = [];
// focus the canvas by clicking a void area outside the level (no game action),
// otherwise synthesized key events are ignored by the Gdx TeaVM input layer
actions.push(['absClick', 690, 60]);
actions.push(['wait', 400]);
for (const k of keys) {
  actions.push(['key', k]);
  actions.push(['wait', 1000]);
}
actions.push(['wait', 1200]);
actions.push(['savepeek', 'map']);
actions.push(['shot', 'plan-arrive']);
const batch = JSON.stringify(actions, null, 1);
if (process.env.PLAN_SEND) {
  await writeFile('live.cmd', batch);
  console.log('sent ' + actions.length + ' actions to live.cmd');
} else {
  console.log(batch);
}
console.error(`path: ${path.length + 1} tiles, from (${start % w},${Math.floor(start / w)}) to (${tx},${ty})`);
