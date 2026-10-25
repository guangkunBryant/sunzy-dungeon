// sunzy rebrand — shared pixel-art processing library.
// Uses playwright's chromium canvas as the PNG codec (sharp unavailable in this repo).
// All transforms run in Node over raw RGBA buffers; PNG dims are ALWAYS preserved.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../core/src/main/assets');

// ---------- browser codec ----------
export async function openCodec() {
	const browser = await chromium.launch();
	const page = await browser.newPage();
	await page.setContent('<canvas id="c"></canvas>');
	async function decode(file) {
		const dataUrl = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
		return await page.evaluate(async (src) => {
			const img = new Image();
			await new Promise((ok, err) => { img.onload = ok; img.onerror = err; img.src = src; });
			const c = document.createElement('canvas');
			c.width = img.width; c.height = img.height;
			const ctx = c.getContext('2d', { willReadFrequently: true });
			ctx.drawImage(img, 0, 0);
			const d = ctx.getImageData(0, 0, img.width, img.height);
			return { width: d.width, height: d.height, data: Array.from(d.data) };
		}, dataUrl);
	}
	async function encode(img, file) {
		const dataUrl = await page.evaluate((d) => {
			const c = document.createElement('canvas');
			c.width = d.width; c.height = d.height;
			const ctx = c.getContext('2d');
			ctx.putImageData(new ImageData(new Uint8ClampedArray(d.data), d.width, d.height), 0, 0);
			return c.toDataURL('image/png');
		}, img);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
	}
	return { browser, page, decode, encode, close: () => browser.close() };
}

// ---------- image model ----------
export function makeImage(w, h) { return { width: w, height: h, data: new Array(w * h * 4).fill(0) }; }

export function cloneImage(img) { return { width: img.width, height: img.height, data: img.data.slice() }; }

export function getPx(img, x, y) {
	const i = (y * img.width + x) * 4;
	return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

export function setPx(img, x, y, [r, g, b, a]) {
	const i = (y * img.width + x) * 4;
	img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a;
}

export function mapPixels(img, fn) {
	for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
		const p = getPx(img, x, y), q = fn(p[0], p[1], p[2], p[3], x, y);
		if (q) setPx(img, x, y, q);
	}
	return img;
}

// ---------- frames (uniform grid films, per TextureFilm(texture, w, h)) ----------
export function cells(img, cw, ch) {
	const cols = Math.floor(img.width / cw), rows = Math.floor(img.height / ch);
	const out = [];
	for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
		const cell = makeImage(cw, ch);
		for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
			if (c * cw + x < img.width && r * ch + y < img.height) setPx(cell, x, y, getPx(img, c * cw + x, r * ch + y));
		}
		out.push(cell);
	}
	return out;
}

export function compose(cellsArr, cw, ch, cols) {
	const rows = Math.ceil(cellsArr.length / cols);
	const img = makeImage(cols * cw, rows * ch);
	cellsArr.forEach((cell, k) => {
		const cx = (k % cols) * cw, cy = Math.floor(k / cols) * ch;
		for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) setPx(img, cx + x, cy + y, getPx(cell, x, y));
	});
	return img;
}

// ---------- color ops ----------
export const rgb2hsl = (r, g, b) => {
	r /= 255; g /= 255; b /= 255;
	const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
	if (mx === mn) return [0, 0, l];
	const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
	let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
	return [h / 6, s, l];
};

export const hsl2rgb = (h, s, l) => {
	const f = (n) => {
		const k = (n + h * 12) % 12;
		const a = s * Math.min(l, 1 - l);
		return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
	};
	return [f(0), f(8), f(4)];
};

// Shift hue of saturated pixels (keeps greyscale/alpha), deg in [0,1)
export function hueShift(img, shift, satBoost = 1, lumCurve = null) {
	return mapPixels(img, (r, g, b, a) => {
		if (a === 0) return null;
		const [h, s, l] = rgb2hsl(r, g, b);
		if (s < 0.08) return null; // greys stay
		const [nr, ng, nb] = hsl2rgb((h + shift) % 1, Math.min(1, s * satBoost), lumCurve ? lumCurve(l) : l);
		return [nr, ng, nb, a];
	});
}

// Map every opaque pixel to nearest color of a palette (preserves alpha, dithers nothing)
export function quantize(img, palette) {
	return mapPixels(img, (r, g, b, a) => {
		if (a === 0) return null;
		let best = palette[0], bd = 1e9;
		for (const p of palette) {
			const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
			if (d < bd) { bd = d; best = p; }
		}
		return [best[0], best[1], best[2], a];
	});
}

// Add 1px dark outline INSIDE each cell (never bleeds across the film grid)
export function outline(img, cw, ch, [or_, og, ob] = [12, 10, 24], alphaAt = 255) {
	const src = cloneImage(img);
	const cols = Math.floor(img.width / cw);
	for (let cy = 0; cy * ch < img.height; cy++) for (let cx = 0; cx < cols; cx++) {
		for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
			const gx = cx * cw + x, gy = cy * ch + y;
			const [r, g, b, a] = getPx(src, gx, gy);
			if (a !== 0) continue;
			let touch = false;
			for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const nx = x + dx, ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
				if (getPx(src, cx * cw + nx, cy * ch + ny)[3] !== 0) { touch = true; break; }
			}
			if (touch) setPx(img, gx, gy, [or_, og, ob, alphaAt]);
		}
	}
	return img;
}

// Two-tone shade: brighten top half of each cell's opaque pixels, darken bottom (sunzy "lit from above" look)
export function shadeTopBottom(img, cw, ch, upF = 1.12, dnF = 0.82) {
	return mapPixels(img, (r, g, b, a, x, y) => {
		if (a === 0) return null;
		const ly = (y % ch) / ch;
		const f = ly < 0.5 ? upF * (1 - ly) + ly : 1 * (ly) + dnF * (1 - ly);
		return [Math.min(255, r * f) | 0, Math.min(255, g * f) | 0, Math.min(255, b * f) | 0, a];
	});
}

// ---------- manifest ----------
// Scan *Sprite.java for TextureFilm cell dims, keyed by the Assets.Sprites constant.
export function scanSpriteFilms() {
	const dir = path.join(ASSETS, '..', 'java/com/shatteredpixel/shatteredpixeldungeon/sprites');
	const out = {};
	for (const f of fs.readdirSync(dir)) {
		if (!f.endsWith('Sprite.java')) continue;
		const t = fs.readFileSync(path.join(dir, f), 'utf8');
		const asset = t.match(/Assets\.Sprites\.([A-Z_0-9]+)/);
		const film = t.match(/TextureFilm\(\s*(?:frames|texture)\s*,\s*(\d+)\s*,\s*(\d+)/);
		if (asset) {
			out[f] = { asset: asset[1], cell: film ? [+film[1], +film[2]] : null };
		}
	}
	return out;
}

export const assetPath = (rel) => path.join(ASSETS, rel);
