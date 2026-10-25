// sunzy rebrand — 场景背景大图重配（splashes/*.jpg 11 张场景插画 + splashes/title/ 4 张标题背景层）。
// 策略：大色域重映射 —— 按亮度分带的 HSL 曲线：暗部压向深靛蓝 #1A2238、
//       中间调紫灰/蓝灰、高光琥珀金 #FFC84A、绿色功能色重定向到翡翠 #3DDC84，
//       火焰/暖光重定向到琥珀金；整体更暗（×0.93）更锐（对比 ×1.10）更冷，饱和度 ×1.2。
//       末段做 4 带带限量化的 sunzy 色阶吸附（每带 ≤8 级，避免 banding）。
// 只做逐像素颜色变换：尺寸、alpha、画面叙事内容（废墟/楼梯/大门）全部保持可读。
// 运行：cd tests && node rebrand/gen-splashes.mjs
// 可重跑：首次运行把原图快照到 rebrand/.backup-splashes/，之后永远从快照出发，
//         反复运行不会叠加色偏；调参后重跑即得到全新结果。

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openCodec, assetPath, rgb2hsl, hsl2rgb, mapPixels } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKUP = path.join(HERE, '.backup-splashes');

const SCENES = [
	'caves.jpg', 'city.jpg', 'cleric.jpg', 'duelist.jpg', 'halls.jpg', 'huntress.jpg',
	'mage.jpg', 'prison.jpg', 'rogue.jpg', 'sewers.jpg', 'warrior.jpg',
];
const TITLE = ['title/archs.png', 'title/back_clusters.png', 'title/front_small.png', 'title/mid_mixed.png'];

// ---------- 参数 ----------
const SAT_BOOST = 1.2;      // 饱和度整体提升（规格 1.1–1.3）
const CONTRAST = 1.10;      // 更锐
const DARKEN = 0.93;        // 更暗

// sunzy 锚点色相（rgb2hsl 实测值，断言钉死）
const INDIGO_H = 0.622;     // #1A2238 深靛蓝（暗部）
const STEEL_H = 0.70;       // 紫灰/蓝灰（中间调）
const AMBER_H = 0.116;      // #FFC84A 琥珀金（高光/火焰重定向）
const EMERALD_H = 0.408;    // #3DDC84 翡翠（绿色功能色重定向）

// ---------- 数值断言（自检：锚点色相在约定范围内） ----------
for (const [name, h, lo, hi] of [
	['INDIGO_H', INDIGO_H, 0.58, 0.66],
	['STEEL_H', STEEL_H, 0.66, 0.75],
	['AMBER_H', AMBER_H, 0.10, 0.14],
	['EMERALD_H', EMERALD_H, 0.38, 0.44],
]) {
	if (!(h >= lo && h <= hi)) throw new Error(`anchor ${name}=${h} out of [${lo},${hi}]`);
}
if (!(SAT_BOOST >= 1.1 && SAT_BOOST <= 1.3)) throw new Error('SAT_BOOST out of spec 1.1-1.3');

// ---------- 像素算子 ----------
const ss = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

// 按亮度分带的目标色相（smoothstep 平滑过渡，避免 banding；
// 0.70→琥珀走品红/红那一段（AMBER_H+1），避免插值穿过绿）
function bandHue(l) {
	if (l <= 0.30) return INDIGO_H;
	if (l < 0.58) { const t = ss((l - 0.30) / 0.28); return INDIGO_H + (STEEL_H - INDIGO_H) * t; }
	if (l < 0.85) { const t = ss((l - 0.58) / 0.27); return STEEL_H + (AMBER_H + 1 - STEEL_H) * t; }
	return AMBER_H;
}

// 按亮度分带的目标饱和度：暗部靛蓝较饱和、中间调紫灰低饱和、高光金色高饱和
function bandSat(l, s, boost) {
	let t;
	if (l <= 0.30) t = 0.34 + 0.10 * s;
	else if (l < 0.58) t = 0.10 + 0.25 * s;
	else if (l < 0.85) t = 0.55 + 0.35 * s;
	else t = 0.65 + 0.35 * s;
	return Math.min(1, t * boost);
}

// 更暗更锐：对比 ×CONTRAST 后整体 ×DARKEN
function lumCurve(l) {
	return Math.min(1, Math.max(0, ((l - 0.5) * CONTRAST + 0.5) * DARKEN));
}

// 大色域重映射像素算子
function splashPixel(boost) {
	return (r, g, b, a) => {
		if (a === 0) return null;
		const [h, s, l] = rgb2hsl(r, g, b);
		const l2 = lumCurve(l);
		const px = (hh, s2, ll) => { const [nr, ng, nb] = hsl2rgb(((hh % 1) + 1) % 1, s2, ll); return [nr, ng, nb, a]; };
		// 功能色 1：火焰/暖光（橙红）→ 琥珀金（保持火焰可读，色相归入 sunzy 系）
		if (s > 0.30 && (h < 0.10 || h > 0.92)) {
			return px(AMBER_H, Math.min(1, (0.55 + 0.35 * s) * boost), l2);
		}
		// 功能色 2：苔藓/翡翠（绿）→ sunzy 翡翠
		if (s > 0.18 && h > 0.22 && h < 0.48) {
			return px(EMERALD_H, Math.min(1, (s * 1.25 + 0.05) * boost), l2);
		}
		// 其余全部：按亮度分带（暗→靛蓝 / 中→紫灰 / 高→金）
		return px(bandHue(l), bandSat(l, s, boost), l2);
	};
}

// ---------- sunzy 色阶（4 带，每带 ≤8 级） ----------
const INDIGO_RAMP = [
	[10, 14, 26], [15, 20, 34], [20, 27, 45], [26, 34, 56],
	[34, 44, 72], [44, 57, 90], [57, 72, 110], [72, 88, 130],
];
const STEEL_RAMP = [
	[52, 56, 78], [64, 69, 96], [78, 80, 114], [93, 95, 131],
	[110, 113, 148], [128, 132, 164], [148, 153, 180], [170, 174, 196],
];
const AMBER_RAMP = [
	[96, 68, 30], [128, 92, 38], [160, 118, 46], [192, 144, 56],
	[222, 168, 64], [255, 200, 74], [255, 216, 116], [255, 232, 158],
];
const EMERALD_RAMP = [
	[8, 34, 20], [12, 54, 30], [18, 76, 42], [26, 102, 56],
	[38, 132, 74], [56, 164, 94], [84, 192, 118], [120, 214, 146],
];
for (const ramp of [INDIGO_RAMP, STEEL_RAMP, AMBER_RAMP, EMERALD_RAMP]) {
	if (ramp.length > 8) throw new Error('ramp exceeds 8 levels per band (banding guard)');
}

// 带限量化：功能色优先（火→琥珀 / 绿→翡翠），其余按亮度吸附到 4 带色阶
function quantizeSunzy(img) {
	return mapPixels(img, (r, g, b, a) => {
		if (a === 0) return null;
		const [h, s, l] = rgb2hsl(r, g, b);
		let pal;
		if (s > 0.35 && (h > 0.95 || h < 0.18)) pal = AMBER_RAMP;
		else if (s > 0.22 && h > 0.30 && h < 0.50) pal = EMERALD_RAMP;
		else if (l < 0.34) pal = INDIGO_RAMP;
		else if (l < 0.62) pal = STEEL_RAMP;
		else pal = AMBER_RAMP;
		let best = pal[0], bd = 1e9;
		for (const p of pal) {
			const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
			if (d < bd) { bd = d; best = p; }
		}
		return [best[0], best[1], best[2], a];
	});
}

// ---------- 统计 ----------
function hueStats(img) {
	let hx = 0, hy = 0, n = 0, warm = 0, green = 0, dark = 0, hi = 0, tot = 0;
	for (let i = 0; i < img.data.length; i += 4) {
		if (img.data[i + 3] === 0) continue;
		tot++;
		const [h, s, l] = rgb2hsl(img.data[i], img.data[i + 1], img.data[i + 2]);
		if (l < 0.34) dark++;
		if (l >= 0.62) hi++;
		if (s < 0.10) continue;
		n++;
		hx += Math.cos(h * 2 * Math.PI); hy += Math.sin(h * 2 * Math.PI);
		if (h < 0.10 || h > 0.92) warm++;
		if (h > 0.22 && h < 0.48) green++;
	}
	const mh = n ? (Math.atan2(hy, hx) / (2 * Math.PI) + 1) % 1 : null;
	return { mh, n, tot, warm: warm / tot, green: green / tot, dark: dark / tot, hi: hi / tot };
}

// 数值自检：重映射后每个饱和像素的色相必须落在 sunzy 色相簇内
//（靛蓝/紫灰 0.55–0.75、琥珀 0.08–0.16（含环绕 0.95–1.0）、翡翠 0.36–0.45）。
// 注意不能用环形平均色相：暗部合法地同时含深琥珀与深靛蓝（双峰），环形均值无意义。
function checkConverged(img, rel) {
	const clusters = [
		[0.55, 0.75],              // 靛蓝/紫灰/蓝灰
		[0.08, 0.16],              // 琥珀金
		[0.95, 1.001],             // 琥珀环绕段
		[0.0, 0.001],              // 琥珀环绕段
		[0.36, 0.45],              // 翡翠
	];
	let n = 0, bad = 0;
	for (let i = 0; i < img.data.length; i += 4) {
		if (img.data[i + 3] === 0) continue;
		const [h, s] = rgb2hsl(img.data[i], img.data[i + 1], img.data[i + 2]);
		if (s < 0.10) continue;
		n++;
		const inCluster = clusters.some(([lo, hi]) => h >= lo && h <= hi);
		if (!inCluster) bad++;
	}
	if (bad / n > 0.005) throw new Error(`${((bad / n) * 100).toFixed(2)}% saturated pixels outside sunzy hue clusters: ${rel}`);
}

// JPEG 重编码（场景图为 .jpg；画布无 alpha 语义，源图本就是不透明的）
async function encodeJpeg(codec, img, file, quality = 0.92) {
	const dataUrl = await codec.page.evaluate(({ d, q }) => {
		const c = document.createElement('canvas');
		c.width = d.width; c.height = d.height;
		const ctx = c.getContext('2d');
		ctx.putImageData(new ImageData(new Uint8ClampedArray(d.data), d.width, d.height), 0, 0);
		return c.toDataURL('image/jpeg', q);
	}, { d: img, q: quality });
	fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

// ---------- 主流程 ----------
const codec = await openCodec();
const report = [];

for (const rel of [...SCENES.map((f) => 'splashes/' + f), ...TITLE.map((f) => 'splashes/' + f)]) {
	const dst = assetPath(rel);
	fs.mkdirSync(BACKUP, { recursive: true });
	const bak = path.join(BACKUP, rel);
	fs.mkdirSync(path.dirname(bak), { recursive: true });
	if (!fs.existsSync(bak)) fs.copyFileSync(dst, bak); // 首跑快照原图，保证可重跑不叠加

	const orig = await codec.decode(bak);
	const img = { width: orig.width, height: orig.height, data: orig.data.slice() };
	const before = hueStats(orig);

	mapPixels(img, splashPixel(SAT_BOOST));
	quantizeSunzy(img);

	const after = hueStats(img);

	// 安全断言：尺寸不变 + alpha 逐字节不变（title 层是半透明叠加，alpha 语义必须原样）
	if (img.width !== orig.width || img.height !== orig.height) throw new Error('size changed: ' + rel);
	for (let i = 3; i < orig.data.length; i += 4) {
		if (img.data[i] !== orig.data[i]) throw new Error('alpha changed: ' + rel);
	}
	checkConverged(img, rel); // 数值自检：所有饱和像素落在 sunzy 色相簇内

	if (rel.endsWith('.jpg')) await encodeJpeg(codec, img, dst);
	else await codec.encode(img, dst);

	report.push(
		`${rel} ${orig.width}x${orig.height}` +
		` · 均相 ${before.mh === null ? '-' : before.mh.toFixed(3)}→${after.mh === null ? '-' : after.mh.toFixed(3)}` +
		` · 暗部${(after.dark * 100).toFixed(0)}%/高光${(after.hi * 100).toFixed(0)}%` +
		` · 功能色 火${(before.warm * 100).toFixed(1)}%→琥珀 绿${(before.green * 100).toFixed(1)}%→翡翠` +
		` · bandHue[靛蓝→紫灰→金] s×${SAT_BOOST} 对比×${CONTRAST} 暗化×${DARKEN}` +
		` · 4带≤8阶量化 · alpha/dims OK`,
	);
}

await codec.close();
console.log(report.join('\n'));
console.log('OK — originals snapshotted in tests/rebrand/.backup-splashes/');
