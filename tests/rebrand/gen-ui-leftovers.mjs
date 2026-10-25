// sunzy rebrand — leftovers in interfaces/: talent_icons.png + surface.png
// talent_icons: grey->indigo / brown->gold ramps, saturated identity colors preserved.
// surface: light splash-style band curve (dark indigo / mid cool-blue / bright amber).
// Idempotent: snapshots to .backup-ui-leftovers/ on first run.
import fs from 'fs';
import path from 'path';
import { openCodec, assetPath, rgb2hsl, hsl2rgb, mapPixels } from './lib.mjs';

const files = [
	{ rel: 'interfaces/talent_icons.png', mode: 'ramp' },
	{ rel: 'interfaces/surface.png', mode: 'band' },
];
const backupDir = assetPath('../../../tests/rebrand/.backup-ui-leftovers');

const codec = await openCodec();

for (const f of files) {
	const src = assetPath(f.rel);
	const bak = path.join(backupDir, path.basename(f.rel));
	if (!fs.existsSync(bak)) {
		fs.mkdirSync(backupDir, { recursive: true });
		fs.copyFileSync(src, bak);
	}
	const img = await codec.decode(bak);
	const before = { w: img.width, h: img.height, transparent: img.data.filter((_, i) => i % 4 === 3 && img.data[i] === 0).length };

	if (f.mode === 'ramp') {
		mapPixels(img, (r, g, b, a) => {
			if (a === 0) return null;
			const [h, s, l] = rgb2hsl(r, g, b);
			if (s < 0.08) { // grey -> indigo ramp (7 steps)
				const t = Math.round(l * 6);
				const ramp = [[12, 17, 32], [26, 34, 58], [42, 54, 88], [64, 80, 122], [96, 114, 160], [140, 156, 200], [201, 212, 238]];
				const c = ramp[Math.min(6, t)];
				return [c[0], c[1], c[2], a];
			}
			if (s < 0.40 && h >= 0.02 && h < 0.20) { // brown/wood -> gold ramp (6 steps)
				const t = Math.round(l * 5);
				const ramp = [[94, 68, 12], [130, 96, 22], [168, 126, 34], [206, 158, 52], [234, 192, 90], [255, 225, 140]];
				const c = ramp[Math.min(5, t)];
				return [c[0], c[1], c[2], a];
			}
			return null; // saturated identity colors untouched
		});
	} else { // band curve for surface.png
		mapPixels(img, (r, g, b, a) => {
			if (a === 0) return null;
			const [h, s, l] = rgb2hsl(r, g, b);
			let nh, ns, nl;
			if (l < 0.35) { nh = 0.70; ns = Math.min(1, s * 1.2 + 0.18); nl = l * 0.92; }
			else if (l < 0.72) { const t = (l - 0.35) / 0.37; nh = 0.66 - t * 0.04; ns = Math.min(1, s * 1.15 + 0.10); nl = l; }
			else { nh = 0.11; ns = Math.min(1, s * 1.1 + 0.14); nl = Math.min(1, l * 1.02); }
			const [nr, ng, nb] = hsl2rgb(nh, ns, nl);
			return [nr, ng, nb, a];
		});
	}

	const after = { transparent: img.data.filter((_, i) => i % 4 === 3 && img.data[i] === 0).length };
	if (img.width !== before.w || img.height !== before.h) throw new Error('DIMS CHANGED ' + f.rel);
	if (after.transparent !== before.transparent) throw new Error('ALPHA CHANGED ' + f.rel + ' ' + before.transparent + '->' + after.transparent);
	await codec.encode(img, src);
	console.log('OK', f.rel, before.w + 'x' + before.h, 'transparent', before.transparent, '->', after.transparent);
}

await codec.close();
