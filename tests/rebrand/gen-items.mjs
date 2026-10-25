// sunzy rebrand — items sprite atlas (sprites/items.png): greys/brown-wood → indigo-gold system.
// Reads the original from .backup-items/ so the script is safely re-runnable (idempotent).
// Pixel transforms only (alpha untouched): iconRecolor — grey→indigo ramp, wood-tan→gold ramp.
// PNG dims and film-grid layout NEVER change (code reads frames by uniform 16×16 cell,
// ItemSpriteSheet.SIZE = 16, ItemSprite.pick uses tx.width/SIZE).
//
// Functional identity colors are PRESERVED:
//  - potion liquid colors are gameplay identity (red=heal, blue=mana, green=poison…):
//    every pixel with saturation ≥ 0.40 passes through UNCHANGED — hue never rotated.
import { openCodec, mapPixels, rgb2hsl, cloneImage } from './lib.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.join(HERE, '.backup-items');
const SPRITES = (f) => path.resolve(HERE, '../../core/src/main/assets/sprites', f);

// ---------- idempotent snapshot: capture the pristine atlas once ----------
const FILES = ['items.png'];
for (const f of FILES) {
	const dst = path.join(BACKUP_DIR, f);
	if (!fs.existsSync(dst)) {
		fs.mkdirSync(BACKUP_DIR, { recursive: true });
		fs.copyFileSync(SPRITES(f), dst);
	}
}

// brand ramps, darkest → brightest (identical to gen-ui-icons.mjs / gen-ui-panels.mjs)
const INDIGO = [[12, 17, 32], [26, 34, 56], [37, 47, 78], [58, 74, 120], [90, 108, 160], [143, 160, 204], [201, 212, 238]];
const GOLD = [[94, 68, 12], [138, 102, 18], [184, 137, 28], [217, 166, 42], [255, 200, 74], [255, 225, 140]];

function ramp(palette, l) {
	let i = Math.floor(l * palette.length);
	if (i >= palette.length) i = palette.length - 1;
	return palette[i];
}

// items iconRecolor (identical policy to gen-ui-icons.mjs iconRecolor):
//  - greys/outlines (s < 0.08) → indigo ramp by luminance
//  - brown-wood/neutral tan (s < 0.40, hue 0.02–0.20) → gold ramp by luminance
//  - strong saturated pixels (potions, gems, runes…) pass through untouched
function iconRecolor(img) {
	return mapPixels(img, (r, g, b, a) => {
		if (a === 0) return null;
		const [h, s, l] = rgb2hsl(r, g, b);
		if (s < 0.08) return [...ramp(INDIGO, l), a];
		if (s < 0.40 && h >= 0.02 && h < 0.20) return [...ramp(GOLD, l), a];
		return null;
	});
}

// ---------- numeric self-check (no visual reads) ----------
function rgb2hslStats(r, g, b) {
	r /= 255; g /= 255; b /= 255;
	const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
	if (mx === mn) return [0, 0, l];
	const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
	let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
	return [h / 6, s, l];
}

function stats(img) {
	let transparent = 0, satCount = 0, hueSin = 0, hueCos = 0;
	const unique = new Map();
	for (let i = 0; i < img.data.length; i += 4) {
		if (img.data[i + 3] === 0) { transparent++; continue; }
		const key = (img.data[i] << 24 | img.data[i + 1] << 16 | img.data[i + 2] << 8 | img.data[i + 3]) >>> 0;
		unique.set(key, (unique.get(key) || 0) + 1);
		const [h, s] = rgb2hslStats(img.data[i], img.data[i + 1], img.data[i + 2]);
		if (s >= 0.08) { satCount++; hueSin += Math.sin(h * 2 * Math.PI); hueCos += Math.cos(h * 2 * Math.PI); }
	}
	const avgHue = ((Math.atan2(hueSin, hueCos) / (2 * Math.PI)) + 1) % 1;
	return { w: img.width, h: img.height, transparent, uniqueColors: unique.size, satCount, avgHue };
}

// hue delta over pixels saturated in the ORIGINAL (matched by position), plus changed-pixel count
function deltas(before, after) {
	let n = 0, sinD = 0, cosD = 0, absSum = 0, changed = 0, alphaDiff = 0, strongPreserved = 0, strongTouched = 0;
	for (let i = 0; i < before.data.length; i += 4) {
		if (before.data[i + 3] !== after.data[i + 3]) alphaDiff++;
		if (before.data[i + 3] === 0) continue;
		const [h, s] = rgb2hslStats(before.data[i], before.data[i + 1], before.data[i + 2]);
		const same = before.data[i] === after.data[i] && before.data[i + 1] === after.data[i + 1] && before.data[i + 2] === after.data[i + 2];
		if (!same) changed++;
		if (s >= 0.40) { // strong-saturation pixels (potion identity colors) must be untouched
			if (same) strongPreserved++; else strongTouched++;
		}
		if (s < 0.08) continue;
		const [h2] = rgb2hslStats(after.data[i], after.data[i + 1], after.data[i + 2]);
		let d = h2 - h;
		if (d > 0.5) d -= 1; if (d < -0.5) d += 1;
		n++; absSum += Math.abs(d);
		sinD += Math.sin(d * 2 * Math.PI); cosD += Math.cos(d * 2 * Math.PI);
	}
	const meanD = n ? ((Math.atan2(sinD, cosD) / (2 * Math.PI)) + 1) % 1 : 0;
	return { satPx: n, meanHueDelta: meanD === 0 ? 0 : (meanD > 0.5 ? meanD - 1 : meanD), meanAbsHueDelta: n ? absSum / n : 0, changedPx: changed, alphaDiff, strongPreserved, strongTouched };
}

const codec = await openCodec();
for (const f of FILES) {
	const src = await codec.decode(path.join(BACKUP_DIR, f));
	const pristine = cloneImage(src); // mapPixels mutates in place — snapshot the baseline first
	const before = stats(pristine);
	const processed = iconRecolor(src);
	const after = stats(processed);
	const d = deltas(pristine, processed);
	const ok = after.w === before.w && after.h === before.h && after.transparent === before.transparent
		&& d.alphaDiff === 0 && d.strongTouched === 0;
	await codec.encode(processed, SPRITES(f));
	// post-encode roundtrip check: the written file must decode back with identical dims/alpha
	const round = await codec.decode(SPRITES(f));
	let roundAlphaDiff = 0, roundTransparent = 0, roundColorDiff = 0;
	for (let i = 0; i < round.data.length; i += 4) {
		if (round.data[i + 3] === 0) roundTransparent++;
		if (round.data[i + 3] !== processed.data[i + 3]) roundAlphaDiff++;
		if (round.data[i] !== processed.data[i] || round.data[i + 1] !== processed.data[i + 1]
			|| round.data[i + 2] !== processed.data[i + 2]) roundColorDiff++;
	}
	const roundOk = round.width === processed.width && round.height === processed.height
		&& roundTransparent === after.transparent && roundAlphaDiff === 0;
	console.log(`${f}  [grey→indigo, wood-tan→gold, strong-sat preserved]  → core/src/main/assets/sprites/${f}`);
	console.log(`  frame grid: ItemSpriteSheet.SIZE=16 → ${before.w / 16}x${before.h / 16} cells (uniform, untouched)`);
	console.log(`  dims ${before.w}x${before.h} → ${after.w}x${after.h}  transparent ${before.transparent} → ${after.transparent}  alphaDiff=${d.alphaDiff}  ${ok ? 'OK' : 'FAIL'}`);
	console.log(`  uniqueColors ${before.uniqueColors} → ${after.uniqueColors}  changedPx=${d.changedPx}`);
	console.log(`  satPx ${before.satCount} → ${after.satCount}  avgHue ${before.avgHue.toFixed(3)} → ${after.avgHue.toFixed(3)}  satHueDelta(mean=${d.meanHueDelta.toFixed(3)}, abs=${d.meanAbsHueDelta.toFixed(3)})`);
	console.log(`  strong-sat (s≥0.40) preserved=${d.strongPreserved} touched=${d.strongTouched}  ${d.strongTouched === 0 ? 'OK' : 'FAIL'}`);
	console.log(`  roundtrip: dims ${round.width}x${round.height}  transparent ${roundTransparent}  alphaDiff=${roundAlphaDiff}  colorDiff=${roundColorDiff}  ${roundOk ? 'OK' : 'FAIL'}`);
}
await codec.close();
