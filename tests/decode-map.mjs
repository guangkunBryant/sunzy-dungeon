// Decode the savepeek 'map' output from live.out into a readable grid.
// Usage: node decode-map.mjs [live.out] [depthN]
import { readFile } from 'node:fs/promises';

const NAMES = {
  0: ' ', 1: '.', 2: ',', 3: '?3', 4: '#', 5: '+', 6: '/', 7: '>', 8: '<',
  9: 'e', 10: 'L', 11: 'P', 12: '=', 13: 'B', 14: '_', 15: '"', 16: 'S',
  17: '?17', 18: '^', 19: '?19', 20: '?20', 21: '?21', 22: '?22', 23: '?23',
  24: '?24', 25: '?25', 26: '?26', 27: '?27', 28: '?28', 29: '~', 30: '?30',
  31: 'O', 32: '?32', 33: 'R', 34: '?34', 35: '?35', 36: '?36', 37: '?37',
  38: '?38', 39: '?39', 40: '?40', 41: '?41', 42: '?42', 43: '?43', 44: '?44',
  45: '?45', 46: '?46', 47: '?47', 48: '?48',
};

const raw = await readFile(process.argv[2] ?? 'live.out', 'utf8');
const live = JSON.parse(raw);
const line = (live.outputs ?? []).find((o) => o.startsWith('savepeek:'));
if (!line) { console.log('no savepeek output found'); process.exit(1); }
let data;
try { data = JSON.parse(line.slice('savepeek:'.length)); } catch (e) { console.log('savepeek parse failed: ' + e.message); process.exit(1); }

let hero = null;
for (const e of data) if (e.depth !== undefined) hero = e;
const wantFile = process.argv[3] ?? 'depth1';
const lv = data.find((e) => e.file === wantFile);
if (!lv?.map) { console.log(`no ${wantFile} map in savepeek (rerun with "map" arg)`); process.exit(1); }

const { w, h, map, visited } = lv;
const heroPos = hero?.heroPos ?? -1;
const mobSet = new Map((lv.mobs ?? []).map((mo) => [mo.y * w + mo.x, mo.state[0]]));

for (let y = 0; y < h; y++) {
  let row = '';
  for (let x = 0; x < w; x++) {
    const p = y * w + x;
    const t = map.charCodeAt(p) - 48;
    let c = NAMES[t] ?? '?';
    if (c.length !== 1) c = c[0].toLowerCase(); // keep grid aligned
    if (p === heroPos) c = 'H';
    else if (mobSet.has(p)) c = 'm';
    row += c;
  }
  console.log(String(y).padStart(2) + ' ' + row);
}
console.log('legend: # wall  . floor  , grass  " high-grass  ~ water  + door  / open-door  > entrance  < exit  S secret-door  L locked  ^ trap  e embers  _ empty-sp  = wall-deco  P pedestal  B barricade  R region-deco(SOLID)  O crystal-door(SOLID)  m mob  H hero');
console.log(`hero: ${hero ? `pos=${hero.heroPos} (${hero.heroPos % w},${Math.floor(hero.heroPos / w)}) hp=${hero.hp} depth=${hero.depth}` : 'n/a'}`);
console.log('mobs: ' + JSON.stringify(lv.mobs));
