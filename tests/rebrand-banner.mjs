// Rebrand banners.png v2:
//  - base text regions  -> pixel-art "SUNZY" (gold gradient + outline)
//  - glow text regions  -> remove old aligned text pixels, draw matching green SUNZY glow
//  - everything else (streaks, boss slain, game over) untouched
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'banners-orig-backup.png';
const OUT = '../core/src/main/assets/interfaces/banners.png';

const FONT = {
  S: ['.XXX.', 'X....', 'X....', '.XX..', '...X.', '...X.', 'XXX..'],
  U: ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
  N: ['X...X', 'XX..X', 'X.X.X', 'X.X.X', 'X..XX', 'X...X', 'X...X'],
  Z: ['XXXXX', '....X', '...X.', '..X..', '.X...', 'X....', 'XXXXX'],
  Y: ['X...X', 'X...X', '.X.X.', '..X..', '..X..', '..X..', '..X..'],
};
const GRAD = ['#f6e48a', '#eed15e', '#e0b83a', '#c99c22', '#b08416', '#96690e', '#7d540a'];
const OUTLINE = '#0d1006';

const browser = await chromium.launch();
const page = await browser.newPage();
const b64 = readFileSync(SRC).toString('base64');
const outB64 = await page.evaluate(async ({ b64, FONT, GRAD, OUTLINE }) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await new Promise((r) => { img.onload = r; });
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0);

  // base text regions and their glow counterparts (glow = same size, offset in x)
  const regions = [
    { x: 0, y: 0, w: 139, h: 100, scale: 4, glowX: 139 },    // TITLE_PORT / GLOW_PORT
    { x: 0, y: 100, w: 240, h: 57, scale: 4, glowX: 240 },   // TITLE_LAND / GLOW_LAND
  ];

  // step 1: in glow regions, clear pixels that align with old base text pixels
  for (const r of regions) {
    const base = ctx.getImageData(r.x, r.y, r.w, r.h);
    const glow = ctx.getImageData(r.glowX, r.y, r.w, r.h);
    for (let i = 0; i < base.data.length; i += 4) {
      if (base.data[i + 3] > 0 && glow.data[i + 3] > 0) {
        glow.data[i + 3] = 0; // glow pixel aligned with old text -> remove
      }
    }
    ctx.putImageData(glow, r.glowX, r.y);
  }

  // step 2: clear base text, draw SUNZY (base + glow)
  const word = 'SUNZY';
  const lw = 5, lh = 7, gap = 1;
  for (const r of regions) {
    ctx.clearRect(r.x, r.y, r.w, r.h);
    const textW = (word.length * lw + (word.length - 1) * gap) * r.scale;
    const ox = r.x + Math.floor((r.w - textW) / 2);
    const oy = r.y + Math.floor((r.h - lh * r.scale) / 2);
    const filled = new Set();
    for (let li = 0; li < word.length; li++) {
      const glyph = FONT[word[li]];
      for (let gy = 0; gy < lh; gy++) for (let gx = 0; gx < lw; gx++) {
        if (glyph[gy][gx] !== 'X') continue;
        for (let sy = 0; sy < r.scale; sy++) for (let sx = 0; sx < r.scale; sx++) {
          filled.add((ox + (li * (lw + gap) + gx) * r.scale + sx) + ',' + (oy + gy * r.scale + sy));
        }
      }
    }
    // glow copy first (under nothing, separate region; horizontal-line pattern for shimmer)
    ctx.fillStyle = '#1d6e1d';
    for (const key of filled) {
      const [px, py] = key.split(',').map(Number);
      if ((py % 3) === 2) continue; // line gaps = shimmer texture
      ctx.fillRect(r.glowX + px, py, 1, 1);
    }
    // outline
    ctx.fillStyle = OUTLINE;
    for (const key of filled) {
      const [px, py] = key.split(',').map(Number);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        ctx.fillRect(px + dx, py + dy, 1, 1);
      }
    }
    // gold gradient fill
    for (const key of filled) {
      const [px, py] = key.split(',').map(Number);
      const row = Math.min(GRAD.length - 1, Math.floor((py - oy) / r.scale));
      ctx.fillStyle = GRAD[row];
      ctx.fillRect(px, py, 1, 1);
    }
  }
  return cv.toDataURL('image/png').split(',')[1];
}, { b64, FONT, GRAD, OUTLINE });

writeFileSync(OUT, Buffer.from(outB64, 'base64'));
console.log('banners.png v2 written');
await browser.close();
