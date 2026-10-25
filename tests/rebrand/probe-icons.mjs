// sunzy rebrand — numeric probe of icon sprites (no visual read, numbers only).
import { openCodec } from './lib.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = (f) => path.join(HERE, 'orig-ui-backup', f);

const FILES = [
	'buffs.png', 'large_buffs.png', 'hero_icons.png', 'item_icons.png',
	'icons.png', 'badges.png', 'locked_badge.png', 'change_icons.png',
];

function rgb2hsl(r, g, b) {
	r /= 255; g /= 255; b /= 255;
	const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
	if (mx === mn) return [0, 0, l];
	const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
	let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
	return [h / 6, s, l];
}

const codec = await openCodec();
for (const f of FILES) {
	const img = await codec.decode(SRC(f));
	const data = img.data;
	const total = img.width * img.height;
	let transparent = 0;
	const unique = new Map();
	let satCount = 0, hueSin = 0, hueCos = 0;
	// bucket hues into 12 bins for saturated pixels, and count sat/grey/white/dark
	let grey = 0, dark = 0, light = 0;
	const hueBins = new Array(12).fill(0);
	for (let i = 0; i < data.length; i += 4) {
		const a = data[i + 3];
		if (a === 0) { transparent++; continue; }
		const key = (data[i] << 24 | data[i + 1] << 16 | data[i + 2] << 8 | a) >>> 0;
		unique.set(key, (unique.get(key) || 0) + 1);
		const [h, s, l] = rgb2hsl(data[i], data[i + 1], data[i + 2]);
		if (s < 0.08) {
			grey++;
			if (l < 0.15) dark++;
			if (l > 0.85) light++;
		} else {
			satCount++;
			hueSin += Math.sin(h * 2 * Math.PI);
			hueCos += Math.cos(h * 2 * Math.PI);
			hueBins[Math.min(11, Math.floor(h * 12))]++;
		}
	}
	let avgHue = ((Math.atan2(hueSin, hueCos) / (2 * Math.PI)) + 1) % 1;
	// top hues bins
	const bins = hueBins.map((n, i) => `${(i / 12).toFixed(2)}:${n}`).filter(x => !x.endsWith(':0')).join(' ');
	console.log(`${f}  ${img.width}x${img.height}  px=${total}`);
	console.log(`  transparent=${transparent}  opaqueUniqueColors=${unique.size}`);
	console.log(`  greyPx=${grey} (dark<0.15: ${dark}, light>0.85: ${light})  satPx=${satCount}  avgHue=${avgHue.toFixed(3)}`);
	console.log(`  hueBins ${bins}`);
}
await codec.close();
