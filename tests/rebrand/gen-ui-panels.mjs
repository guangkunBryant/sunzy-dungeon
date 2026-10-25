// sunzy rebrand — UI panel chrome: brown-wood/grey-green → deep indigo + gold trim.
// Reads originals from orig-ui-backup/ so the script is safely re-runnable.
// Strategy: luminance-ramp remap per color family (alpha untouched → 9-slice corners safe).
import { openCodec, mapPixels, rgb2hsl } from './lib.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKUP = (f) => path.join(HERE, 'orig-ui-backup', f);
const OUT = (f) => path.resolve(HERE, '../../core/src/main/assets/interfaces', f);

// brand ramps, darkest → brightest
const INDIGO = [[12, 17, 32], [26, 34, 56], [37, 47, 78], [58, 74, 120], [90, 108, 160], [143, 160, 204], [201, 212, 238]];
const GOLD = [[94, 68, 12], [138, 102, 18], [184, 137, 28], [217, 166, 42], [255, 200, 74], [255, 225, 140]];

function ramp(palette, l) {
	let i = Math.floor(l * palette.length);
	if (i >= palette.length) i = palette.length - 1;
	return palette[i];
}

// grey-green / neutral family → indigo ramp; wood-tan family → gold ramp;
// saturated functional colors (HP red, buff blue, green) preserved.
function panelRecolor(img) {
	return mapPixels(img, (r, g, b, a) => {
		if (a === 0) return null;
		const [h, s, l] = rgb2hsl(r, g, b);
		if (s < 0.08 || (h >= 0.18 && h <= 0.80 && s < 0.18)) return [...ramp(INDIGO, l), a];
		if (s >= 0.08 && s < 0.40 && h >= 0.02 && h < 0.20) return [...ramp(GOLD, l), a];
		return null;
	});
}

const FILES = [
	'chrome.png', 'status_pane.png', 'toolbar.png', 'menu_button.png',
	'menu_pane.png', 'boss_hp.png', 'talent_button.png', 'radial_menu.png',
];

const codec = await openCodec();
for (const f of FILES) {
	const img = await codec.decode(BACKUP(f));
	await codec.encode(panelRecolor(img), OUT(f));
	console.log('panelRecolor →', f, `(${img.width}x${img.height})`);
}
await codec.close();
