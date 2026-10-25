// sunzy rebrand — UI icon sets & buff/hero sprites: brown-wood/pure-white → indigo-gold system.
// Reads originals from orig-ui-backup/ so the script is safely re-runnable.
// Pixel transforms only (alpha untouched): luminance-ramp remap + gentle hueShift.
// PNG dims and film-grid layout NEVER change (code reads frames by uniform grid cell).
//
// Functional identity colors are PRESERVED:
//  - buffs/large_buffs: each buff's baked-in hue identifies the buff in-game
//  - hero_icons: class-colored avatar backgrounds identify the hero class
// Greys/outlines go to the deep-indigo ramp, whites land near silver-blue #B8C4E0.
import { openCodec, mapPixels, hueShift, rgb2hsl, cloneImage } from './lib.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKUP = (f) => path.join(HERE, 'orig-ui-backup', f);
const INTERFACES = (f) => path.resolve(HERE, '../../core/src/main/assets/interfaces', f);
const SPRITES = (f) => path.resolve(HERE, '../../core/src/main/assets/sprites', f);

// brand ramps, darkest → brightest (identical to gen-ui-panels.mjs)
const INDIGO = [[12, 17, 32], [26, 34, 56], [37, 47, 78], [58, 74, 120], [90, 108, 160], [143, 160, 204], [201, 212, 238]];
const GOLD = [[94, 68, 12], [138, 102, 18], [184, 137, 28], [217, 166, 42], [255, 200, 74], [255, 225, 140]];

function ramp(palette, l) {
	let i = Math.floor(l * palette.length);
	if (i >= palette.length) i = palette.length - 1;
	return palette[i];
}

// greys & pure whites → indigo/silver-blue ramp by luminance; saturated pixels pass through.
function silverize(img) {
	return mapPixels(img, (r, g, b, a) => {
		if (a === 0) return null;
		const [h, s, l] = rgb2hsl(r, g, b);
		if (s >= 0.08) return null;
		return [...ramp(INDIGO, l), a];
	});
}

// functional icon sets (trash, letters, skulls…): grey→indigo ramp, wood-tan→gold ramp,
// strong saturated accents preserved (shape carries meaning, tone carries brand).
function iconRecolor(img) {
	return mapPixels(img, (r, g, b, a) => {
		if (a === 0) return null;
		const [h, s, l] = rgb2hsl(r, g, b);
		if (s < 0.08) return [...ramp(INDIGO, l), a];
		if (s < 0.40 && h >= 0.02 && h < 0.20) return [...ramp(GOLD, l), a];
		return null;
	});
}

// hueShift first, silverize second — so the shift only touches original saturated pixels
// (ramp output itself has non-trivial HSL saturation and must not be rotated).
const shiftThenSilver = (shift, boost = 1) => (img) => silverize(hueShift(img, shift, boost));

// ---------- per-file config ----------
// item_icons.png lives in sprites/ (not interfaces/) — the rest are interface atlases.
const FILES = [
	{ f: 'buffs.png', out: INTERFACES, op: silverize, note: 'buff hue identity preserved' },
	{ f: 'large_buffs.png', out: INTERFACES, op: silverize, note: 'buff hue identity preserved' },
	{ f: 'hero_icons.png', out: INTERFACES, op: silverize, note: 'class-color identity preserved' },
	{ f: 'item_icons.png', out: SPRITES, op: shiftThenSilver(-0.04), note: 'warm tones nudged to gold' },
	{ f: 'icons.png', out: INTERFACES, op: iconRecolor, note: 'brown→gold, grey→indigo' },
	{ f: 'badges.png', out: INTERFACES, op: shiftThenSilver(-0.02, 1.05), note: 'mild gold harmonize' },
	{ f: 'locked_badge.png', out: INTERFACES, op: silverize, note: 'fully greyscale → indigo ramp' },
	{ f: 'change_icons.png', out: INTERFACES, op: shiftThenSilver(-0.03, 1.05), note: 'full-image hueShift' },
];

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
	let n = 0, sinD = 0, cosD = 0, absSum = 0, changed = 0, alphaDiff = 0;
	for (let i = 0; i < before.data.length; i += 4) {
		if (before.data[i + 3] !== after.data[i + 3]) alphaDiff++;
		if (before.data[i + 3] === 0) continue;
		if (before.data[i] !== after.data[i] || before.data[i + 1] !== after.data[i + 1] || before.data[i + 2] !== after.data[i + 2]) changed++;
		const [h, s] = rgb2hslStats(before.data[i], before.data[i + 1], before.data[i + 2]);
		if (s < 0.08) continue;
		const [h2] = rgb2hslStats(after.data[i], after.data[i + 1], after.data[i + 2]);
		let d = h2 - h;
		if (d > 0.5) d -= 1; if (d < -0.5) d += 1;
		n++; absSum += Math.abs(d);
		sinD += Math.sin(d * 2 * Math.PI); cosD += Math.cos(d * 2 * Math.PI);
	}
	const meanD = n ? ((Math.atan2(sinD, cosD) / (2 * Math.PI)) + 1) % 1 : 0;
	// signed mean via circular mean of delta (wrap-correct)
	return { satPx: n, meanHueDelta: meanD === 0 ? 0 : (meanD > 0.5 ? meanD - 1 : meanD), meanAbsHueDelta: n ? absSum / n : 0, changedPx: changed, alphaDiff };
}

const codec = await openCodec();
for (const { f, out, op, note } of FILES) {
	const src = await codec.decode(BACKUP(f));
	const pristine = cloneImage(src); // mapPixels mutates in place — snapshot the baseline first
	const before = stats(pristine);
	const processed = op(src);
	const after = stats(processed);
	const d = deltas(pristine, processed);
	const ok = after.w === before.w && after.h === before.h && after.transparent === before.transparent && d.alphaDiff === 0;
	await codec.encode(processed, out(f));
	// post-encode roundtrip check: the written file must decode back with identical dims/alpha
	const round = await codec.decode(out(f));
	let roundAlphaDiff = 0, roundTransparent = 0;
	for (let i = 0; i < round.data.length; i += 4) {
		if (round.data[i + 3] === 0) roundTransparent++;
		if (round.data[i + 3] !== processed.data[i + 3]) roundAlphaDiff++;
	}
	const roundOk = round.width === processed.width && round.height === processed.height
		&& roundTransparent === after.transparent && roundAlphaDiff === 0;
	console.log(`${f}  [${note}]  → ${path.relative(path.resolve(HERE, '../..'), out(f))}`);
	console.log(`  dims ${before.w}x${before.h} → ${after.w}x${after.h}  transparent ${before.transparent} → ${after.transparent}  alphaDiff=${d.alphaDiff}  ${ok ? 'OK' : 'FAIL'}`);
	console.log(`  uniqueColors ${before.uniqueColors} → ${after.uniqueColors}  changedPx=${d.changedPx}`);
	console.log(`  satPx ${before.satCount} → ${after.satCount}  avgHue ${before.avgHue.toFixed(3)} → ${after.avgHue.toFixed(3)}  satHueDelta(mean=${d.meanHueDelta.toFixed(3)}, abs=${d.meanAbsHueDelta.toFixed(3)})`);
	console.log(`  roundtrip: dims ${round.width}x${round.height}  transparent ${roundTransparent}  alphaDiff=${roundAlphaDiff}  ${roundOk ? 'OK' : 'FAIL'}`);
}
await codec.close();
