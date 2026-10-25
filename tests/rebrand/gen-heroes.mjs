// sunzy rebrand — 6 英雄职业精灵 + 开局头像图集重配（只改像素颜色 + 帧内描边，帧网格/帧数/落点不变）
// 用法: 在 tests/ 下运行  node rebrand/gen-heroes.mjs
// 流程: 首次快照原图到 .backup-heroes/ -> 之后永远从快照出发（幂等）
//       -> decode -> rehue(专属主色调, 保明暗) -> outline(#12101F, 按帧格尺寸) -> 数值自检 -> encode
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
	openCodec, assetPath, mapPixels, rgb2hsl, hsl2rgb, getPx, setPx,
	makeImage, cloneImage, outline,
} from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKUP = path.join(HERE, '.backup-heroes');
const INDIGO = [18, 16, 31]; // #12101F 1px 深靛蓝描边

// ---------- rehue（同 gen-mobs-sewers：彩色上主色调，灰色给 greySat 淡同色调，保明暗结构）----------
function rehue(img, hue, { satBoost = 1, greySat = 0.2, lum = (l) => l } = {}) {
	return mapPixels(img, (r, g, b, a) => {
		if (a === 0) return null;
		const [, s, l] = rgb2hsl(r, g, b);
		const ns = s < 0.08 ? greySat : Math.min(1, s * satBoost);
		const [nr, ng, nb] = hsl2rgb(hue, ns, Math.min(1, Math.max(0, lum(l))));
		return [nr, ng, nb, a];
	});
}

const lumDark = (f) => (l) => l * f;
const lumBright = (f) => (l) => Math.min(1, l * f + 0.04);

// ---------- 每职业专属主色调（暗调锐利；greySat 低 → 金属/灰保持近灰，布料/金属区分度保留）----------
const HEROES = {
	warrior:  { hue: 0.10, opts: { satBoost: 1.15, greySat: 0.18, lum: lumDark(0.92) } },   // 琥珀金褐
	mage:     { hue: 0.76, opts: { satBoost: 1.10, greySat: 0.18, lum: lumDark(0.88) } },   // 深紫罗兰
	rogue:    { hue: 0.62, opts: { satBoost: 1.05, greySat: 0.16, lum: lumDark(0.82) } },   // 暗夜蓝
	huntress: { hue: 0.34, opts: { satBoost: 1.05, greySat: 0.18, lum: lumDark(0.86) } },   // 森绿
	duelist:  { hue: 0.98, opts: { satBoost: 1.15, greySat: 0.10, lum: lumDark(0.90) } },   // 绯红银（灰近纯银）
	cleric:   { hue: 0.12, opts: { satBoost: 0.95, greySat: 0.12, lum: lumBright(1.05) } }, // 圣白金（提亮偏白）
};
const CLASS_ORDER = ['warrior', 'mage', 'rogue', 'huntress', 'duelist', 'cleric']; // HeroClass.ordinal() 顺序

// ---------- 工具 ----------
function crop(img, x0, y0, w, h) {
	const out = makeImage(w, h);
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setPx(out, x, y, getPx(img, x0 + x, y0 + y));
	return out;
}
function paste(img, sub, x0, y0) {
	for (let y = 0; y < sub.height; y++) for (let x = 0; x < sub.width; x++) setPx(img, x0 + x, y0 + y, getPx(sub, x, y));
}

// 余料透明校验（网格外的 padding 必须全透明，否则 outline/网格假设不成立）
function checkSlack(img, cw, ch, label) {
	const cols = Math.floor(img.width / cw), rows = Math.floor(img.height / ch);
	const msgs = [];
	for (let y = 0; y < img.height; y++) for (let x = cols * cw; x < img.width; x++) {
		if (getPx(img, x, y)[3] !== 0) msgs.push(`${label}: 右侧余料 (${x},${y}) 非透明`);
	}
	for (let y = rows * ch; y < img.height; y++) for (let x = 0; x < cols * cw; x++) {
		if (getPx(img, x, y)[3] !== 0) msgs.push(`${label}: 底部余料 (${x},${y}) 非透明`);
	}
	return msgs;
}

// alpha 规则：原有像素 alpha 逐字节不变；描边只允许 0 -> 255
function checkAlpha(orig, out, label) {
	const msgs = [];
	for (let i = 3; i < orig.data.length; i += 4) {
		const a0 = orig.data[i], a1 = out.data[i];
		if (a0 > 0 && a1 !== a0) { msgs.push(`${label}: 像素 ${i / 4} alpha ${a0} -> ${a1}`); break; }
		if (a0 === 0 && a1 !== 0 && a1 !== 255) { msgs.push(`${label}: 像素 ${i / 4} alpha 0 -> ${a1}`); break; }
	}
	return msgs;
}

// 色相统计：饱和像素 (s>=0.15) 的圆周均值 hue 应接近目标色相（排除纯描边像素，避免污染统计）
const isIndigo = (r, g, b) => r === INDIGO[0] && g === INDIGO[1] && b === INDIGO[2];
function meanHue(img) {
	let sx = 0, sy = 0, n = 0;
	for (let i = 0; i < img.data.length; i += 4) {
		if (img.data[i + 3] === 0) continue;
		if (isIndigo(img.data[i], img.data[i + 1], img.data[i + 2])) continue;
		const [h, s] = rgb2hsl(img.data[i], img.data[i + 1], img.data[i + 2]);
		if (s < 0.15) continue;
		sx += Math.cos(h * 2 * Math.PI); sy += Math.sin(h * 2 * Math.PI); n++;
	}
	if (n === 0) return null;
	return (Math.atan2(sy, sx) / (2 * Math.PI) + 1) % 1;
}
function hueDist(a, b) { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); }

// ---------- 快照（首跑落盘，之后永远从快照出发 → 幂等，重跑不叠加）----------
const codec = await openCodec();
fs.mkdirSync(BACKUP, { recursive: true });
const FILES = [...CLASS_ORDER.map((n) => `sprites/${n}.png`), 'sprites/avatars.png'];
for (const rel of FILES) {
	const bak = path.join(BACKUP, path.basename(rel));
	if (!fs.existsSync(bak)) {
		await codec.encode(await codec.decode(assetPath(rel)), bak);
		console.log(`📷 快照 ${rel} -> .backup-heroes/${path.basename(rel)}`);
	}
}

// ---------- main ----------
const failures = [];
const report = [];

async function processHero(name) {
	const cfg = HEROES[name];
	const orig = await codec.decode(path.join(BACKUP, name + '.png'));
	const label = name + '.png';

	// 1) 余料透明校验（256x128: 21 列 12px + 右 4px；8 行 15px + 底 8px）
	failures.push(...checkSlack(orig, 12, 15, label + '#orig'));

	// 2) rehue 专属主色调
	const img = cloneImage(orig);
	rehue(img, cfg.hue, cfg.opts);

	// 3) 帧内 1px 描边（整图均匀 12x15 网格；余料区域裁掉后再贴回，防 outline 越界读）
	const gw = Math.floor(orig.width / 12) * 12, gh = Math.floor(orig.height / 15) * 15;
	const grid = crop(img, 0, 0, gw, gh);
	outline(grid, 12, 15, INDIGO);
	paste(img, grid, 0, 0);

	// 4) 数值自检
	if (img.width !== orig.width || img.height !== orig.height) failures.push(`${label}: 尺寸变化!`);
	failures.push(...checkAlpha(orig, img, label));
	failures.push(...checkSlack(img, 12, 15, label + '#out'));
	let indigo = 0;
	for (let i = 0; i < img.data.length; i += 4) {
		if (img.data[i] === INDIGO[0] && img.data[i + 1] === INDIGO[1] && img.data[i + 2] === INDIGO[2] && img.data[i + 3] === 255) indigo++;
	}
	if (indigo === 0) failures.push(`${label}: 无描边像素`);
	const mh = meanHue(img);
	if (mh === null || hueDist(mh, cfg.hue) > 0.06) failures.push(`${label}: 主色相 ${mh} 偏离目标 ${cfg.hue}`);

	await codec.encode(img, assetPath(`sprites/${name}.png`));
	report.push(`✓ ${label} ${orig.width}x${orig.height} cell=12x15 hue=${cfg.hue} indigoPx=${indigo} meanHue=${mh?.toFixed(3)}`);
}

async function processAvatars() {
	const orig = await codec.decode(path.join(BACKUP, 'avatars.png'));
	const label = 'avatars.png';
	const CW = 24, CH = 32;

	// 1) 余料透明校验（256x32: 10 格 + 右 16px；只用前 6 格）
	failures.push(...checkSlack(orig, CW, CH, label + '#orig'));

	// 2) 每格跟随对应职业色相（ordinal: WARRIOR..CLERIC）
	const img = cloneImage(orig);
	const nCols = Math.floor(orig.width / CW);
	for (let c = 0; c < nCols; c++) {
		const cell = crop(img, c * CW, 0, CW, CH);
		if (c < CLASS_ORDER.length) {
			const cfg = HEROES[CLASS_ORDER[c]];
			rehue(cell, cfg.hue, cfg.opts);
		}
		outline(cell, CW, CH, INDIGO);
		paste(img, cell, c * CW, 0);
	}

	// 3) 数值自检（只统计前 6 格）
	if (img.width !== orig.width || img.height !== orig.height) failures.push(`${label}: 尺寸变化!`);
	failures.push(...checkAlpha(orig, img, label));
	failures.push(...checkSlack(img, CW, CH, label + '#out'));
	for (let c = 0; c < CLASS_ORDER.length; c++) {
		const cell = crop(img, c * CW, 0, CW, CH);
		const mh = meanHue(cell);
		const target = HEROES[CLASS_ORDER[c]].hue;
		if (mh === null || hueDist(mh, target) > 0.06) failures.push(`${label}#cell${c}: 主色相 ${mh} 偏离 ${target}`);
	}
	let indigo = 0;
	for (let i = 0; i < img.data.length; i += 4) {
		if (img.data[i] === INDIGO[0] && img.data[i + 1] === INDIGO[1] && img.data[i + 2] === INDIGO[2] && img.data[i + 3] === 255) indigo++;
	}
	if (indigo === 0) failures.push(`${label}: 无描边像素`);

	await codec.encode(img, assetPath('sprites/avatars.png'));
	report.push(`✓ ${label} ${orig.width}x${orig.height} cell=24x32 x6 hue=per-class indigoPx=${indigo}`);
}

for (const name of CLASS_ORDER) await processHero(name);
await processAvatars();

await codec.close();
report.forEach((r) => console.log(r));
if (failures.length) {
	console.error('\n校验失败:');
	failures.forEach((f) => console.error('  ✗ ' + f));
	process.exit(1);
}
console.log('\n全部完成，尺寸/alpha/余料/色相/描边数值自检通过。');
