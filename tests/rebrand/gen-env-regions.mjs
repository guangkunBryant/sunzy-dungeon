// sunzy rebrand — 其余区域地形重配（prison/caves/caves_crystal/caves_gnoll/city/halls）。
// 只做逐像素颜色变换：PNG 尺寸、alpha、16x16 tile 网格全部原样保留，无任何几何改动。
// 运行：cd tests && node rebrand/gen-env-regions.mjs
// 可重跑：首次运行把原图快照到 rebrand/.backup-env-regions/，之后永远从快照出发，
//         反复运行不会叠加色偏；调参后重跑即得到全新结果。
//
// 带分区依据（probe-env-regions.mjs 的原图色相分布）：
//   prison  灰石55%(多偏暖灰) + 暖带0-0.15(41%,含avgL0.54亮金) → 冷蓝灰石0.62 + 铁锈0.05（压暗）
//   caves   灰75% + 暖带0-0.15(18%) + 绿0.30-0.50(2%) → 暖棕岩0.08 + 亮部琥珀矿脉0.11
//   crystal 同caves基底 + 亮青晶0.55-0.65 → 全图入紫水晶0.78（高饱和+提亮，与水道0.745/低饱和区分）
//   gnoll   同caves基底 → 全图入土黄绿0.16（荒草绿+泥黄）
//   city    灰31% + 暗红棕0-0.10(47%) + 暗青0.55-0.75(14%) → 深红棕0.99 + 青带→铜绿0.42
//   halls   灰26% + 暗红0-0.05(39%,avgL0.21) + 亮橙0.05-0.15(29%,avgL0.41)
//           → 按亮度拆分：暗部→极暗紫0.85（再压暗），亮部→地狱火0.02（保持醒目）
//
// 注意：lib.mjs 的 rgb2hsl 对纯红边界会返回 h≥1（未回绕），本脚本内一律 h % 1；
//      量化色阶全部用 hsl2rgb 按目标色相程序化生成，避免手工配色相漂移。

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openCodec, assetPath, rgb2hsl, hsl2rgb, mapPixels } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKUP = path.join(HERE, '.backup-env-regions');
const GRID = 16;
const FILES = [
	'tiles_prison.png', 'tiles_caves.png', 'tiles_caves_crystal.png',
	'tiles_caves_gnoll.png', 'tiles_city.png', 'tiles_halls.png',
];

// ---------- 参数 ----------
const GREY_S_MIN = 0.12; // s 低于此视为灰岩，注入目标色相
const clamp1 = (x) => Math.max(0, Math.min(1, x));
const hueOf = (r, g, b) => rgb2hsl(r, g, b)[0] % 1; // 回绕纯红边界
// 灰岩注入饱和度：中亮度最强、两端渐弱，避免洗白/染黑
const greySatOf = (base, l) => Math.min(0.45, base * (0.5 + 2.2 * l * (1 - l)));
const px = (h, s, l, a) => { const [r, g, b] = hsl2rgb(h, clamp1(s), clamp1(l)); return [r, g, b, a]; };

// ---------- 量化色阶（同族阶梯；按目标色相程序化生成，只吸附同族像素）----------
// ramp(hue, [亮度, 饱和度] 阶梯，暗→亮)
const ramp = (hue, steps) => steps.map(([l, s]) => { const [r, g, b] = hsl2rgb(hue, s, l); return [r, g, b]; });
const BLUE_STONE_RAMP = ramp(0.62, [[0.07, 0.30], [0.11, 0.32], [0.16, 0.33], [0.21, 0.33], [0.27, 0.31], [0.33, 0.28], [0.40, 0.24], [0.48, 0.19]]); // prison 冷蓝灰石
const RUST_RAMP = ramp(0.05, [[0.10, 0.45], [0.16, 0.42], [0.22, 0.40], [0.29, 0.36], [0.36, 0.32]]);          // prison 铁锈
const BROWN_RAMP = ramp(0.08, [[0.08, 0.40], [0.13, 0.42], [0.18, 0.42], [0.24, 0.40], [0.31, 0.36], [0.38, 0.32], [0.45, 0.28], [0.53, 0.24]]);              // caves 暖棕岩
const AMBER_RAMP = ramp(0.11, [[0.18, 0.55], [0.24, 0.55], [0.30, 0.52], [0.37, 0.48], [0.44, 0.44], [0.52, 0.38]]); // caves 琥珀矿脉（亮部）
const AMETHYST_RAMP = ramp(0.78, [[0.10, 0.50], [0.15, 0.50], [0.20, 0.50], [0.26, 0.48], [0.33, 0.45], [0.40, 0.42], [0.48, 0.38], [0.57, 0.33], [0.66, 0.28]]); // crystal 紫水晶（比水道紫更亮更饱和）
const OLIVE_RAMP = ramp(0.16, [[0.09, 0.45], [0.14, 0.45], [0.19, 0.44], [0.25, 0.42], [0.31, 0.38], [0.38, 0.34], [0.45, 0.30], [0.53, 0.26]]);              // gnoll 土黄绿
const DARK_RED_RAMP = ramp(0.99, [[0.08, 0.35], [0.13, 0.36], [0.19, 0.36], [0.25, 0.35], [0.32, 0.32], [0.39, 0.28], [0.46, 0.25], [0.54, 0.21]]);           // city 暗红棕石
const PATINA_RAMP = ramp(0.42, [[0.09, 0.45], [0.14, 0.45], [0.19, 0.44], [0.25, 0.42], [0.31, 0.38], [0.38, 0.34], [0.45, 0.28]]); // city 铜绿
const DARK_PURPLE_RAMP = ramp(0.85, [[0.06, 0.50], [0.10, 0.45], [0.15, 0.40], [0.20, 0.35], [0.26, 0.32], [0.32, 0.30], [0.40, 0.28], [0.50, 0.25]]);        // halls 暗紫黑
const FIRE_RAMP = ramp(0.02, [[0.12, 0.80], [0.18, 0.75], [0.25, 0.70], [0.32, 0.70], [0.40, 0.65], [0.48, 0.60], [0.56, 0.55]]);                             // halls 地狱火橙红

// ---------- 像素算子 ----------
function prisonPixel(r, g, b, a) {
	if (a === 0) return null;
	const [h0, s, l] = rgb2hsl(r, g, b);
	const h = h0 % 1;
	if (s < GREY_S_MIN) return px(0.62, greySatOf(0.15, l), l * 0.95, a);     // 灰石（含棕灰）→冷蓝灰
	if (h < 0.15 || h > 0.90) return px(0.05, s * 0.85 + 0.04, l * 0.82, a); // 暖带→铁锈（压暗，压抑感）
	if (h >= 0.45 && h <= 0.80) return px(0.62, s * 1.1 + 0.04, l * 0.95, a); // 冷带→蓝灰
	return null;
}

function cavesPixel(r, g, b, a) {
	if (a === 0) return null;
	const [h0, s, l] = rgb2hsl(r, g, b);
	const h = h0 % 1;
	if (s < GREY_S_MIN) return px(0.08, greySatOf(0.20, l), l, a);            // 灰→暖棕岩
	if (h < 0.15 || h > 0.90) {
		if (l > 0.45) return px(0.11, s * 1.2 + 0.05, l * 1.02, a);           // 亮暖部→琥珀矿脉
		return px(0.08, s * 0.9 + 0.05, l, a);                                // 暗暖部→棕岩
	}
	if (h > 0.30 && h < 0.50) return px(0.11, s * 1.1 + 0.04, l, a);          // 绿苔→琥珀呼应
	return null;
}

function crystalPixel(r, g, b, a) {
	if (a === 0) return null;
	const [h0, s, l] = rgb2hsl(r, g, b);
	void (h0 % 1);
	if (s < GREY_S_MIN) return px(0.78, greySatOf(0.22, l), l * 1.12 + 0.02, a);          // 灰→亮紫（饱和高于水道0.16）
	return px(0.78, s * 1.5 + 0.06, Math.min(0.93, l * 1.15 + 0.03), a);                  // 全图入紫水晶，高饱和提亮
}

function gnollPixel(r, g, b, a) {
	if (a === 0) return null;
	const [h0, s, l] = rgb2hsl(r, g, b);
	const h = h0 % 1;
	if (s < GREY_S_MIN) return px(0.16, greySatOf(0.20, l), l, a);            // 灰→土黄绿基岩
	if (h < 0.20 || h > 0.90) return px(0.16, s * 0.9 + 0.05, l, a);          // 暖带→泥黄
	if (h >= 0.20 && h <= 0.55) return px(0.16, s * 1.1 + 0.04, l, a);        // 绿带→荒草绿
	return null;
}

function cityPixel(r, g, b, a) {
	if (a === 0) return null;
	const [h0, s, l] = rgb2hsl(r, g, b);
	const h = h0 % 1;
	if (s < GREY_S_MIN) return px(0.99, greySatOf(0.16, l), l * 0.92, a);     // 灰石（含棕灰）→暗红棕石
	if (h < 0.15 || h > 0.90) return px(0.99, s * 0.85 + 0.04, l * 0.9, a);   // 暖带→深红棕（压暗）
	if (h >= 0.52 && h <= 0.80) return px(0.42, s * 1.15 + 0.04, l, a);       // 暗青带→铜绿点缀
	return null;
}

function hallsPixel(r, g, b, a) {
	if (a === 0) return null;
	const [h0, s, l] = rgb2hsl(r, g, b);
	const h = h0 % 1;
	if (s < GREY_S_MIN) return px(0.85, greySatOf(0.18, l), l * 0.75, a);     // 灰石（含暖灰）→暗紫黑
	if (h > 0.68 && h < 0.95) return px(0.85, s * 0.8 + 0.04, l * 0.75, a);   // 紫带→暗紫（再压暗）
	if (h < 0.15 || h > 0.90) {
		if (l >= 0.30) return px(0.02, s * 1.05 + 0.06, Math.min(0.85, l * 1.05), a); // 亮暖部→地狱火（醒目）
		return px(0.85, s * 0.5 + 0.05, l * 0.72, a);                         // 暗红底→极暗紫
	}
	return null;
}

// ---------- 带限量化：只吸附同族像素 ----------
function quantizeBand(img, palette, test) {
	return mapPixels(img, (r, g, b, a) => {
		if (a === 0) return null;
		const [h0, s, l] = rgb2hsl(r, g, b);
		if (!test(h0 % 1, s, l)) return null;
		let best = palette[0], bd = 1e9;
		for (const p of palette) {
			const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
			if (d < bd) { bd = d; best = p; }
		}
		return [best[0], best[1], best[2], a];
	});
}

// ---------- 统计 ----------
// 饱和像素（s>=0.06）的（环形）平均色相
function meanHue(img) {
	let hx = 0, hy = 0, n = 0;
	for (let i = 0; i < img.data.length; i += 4) {
		if (img.data[i + 3] === 0) continue;
		const [h, s] = rgb2hsl(img.data[i], img.data[i + 1], img.data[i + 2]);
		if (s < 0.06) continue;
		hx += Math.cos(h * 2 * Math.PI); hy += Math.sin(h * 2 * Math.PI); n++;
	}
	if (!n) return null;
	return (Math.atan2(hy, hx) / (2 * Math.PI) + 1) % 1;
}

// 落在测试带内的不透明像素占比（数值自检用）
function bandFrac(img, test) {
	let inBand = 0, opaque = 0;
	for (let i = 0; i < img.data.length; i += 4) {
		if (img.data[i + 3] === 0) continue;
		opaque++;
		const [h, s] = rgb2hsl(img.data[i], img.data[i + 1], img.data[i + 2]);
		if (s < 0.06) continue;
		if (test(h % 1)) inBand++;
	}
	return inBand / Math.max(1, opaque);
}

// ---------- 变换表 ----------
const TRANSFORMS = {
	'tiles_prison.png': {
		fn: prisonPixel,
		quant: [
			[BLUE_STONE_RAMP, (h, s) => s < 0.40 && h >= 0.42 && h <= 0.80],
			[RUST_RAMP, (h, s) => (h < 0.12 || h > 0.92) && s < 0.80],
		],
		checks: [
			['蓝灰石带[0.48,0.78]≥40%', (img) => bandFrac(img, (h) => h >= 0.48 && h <= 0.78), 0.40],
			['铁锈带(h<0.12|>0.92)≥30%', (img) => bandFrac(img, (h) => h < 0.12 || h > 0.92), 0.30],
		],
	},
	'tiles_caves.png': {
		fn: cavesPixel,
		quant: [
			[AMBER_RAMP, (h, s, l) => h >= 0.05 && h <= 0.20 && l > 0.45 && s > 0.20],
			[BROWN_RAMP, (h, s, l) => (h < 0.16 || h > 0.90) && l <= 0.45 && s < 0.80],
		],
		checks: [
			['暖棕+琥珀带(h<0.20|>0.90)≥80%', (img) => bandFrac(img, (h) => h < 0.20 || h > 0.90), 0.80],
		],
	},
	'tiles_caves_crystal.png': {
		fn: crystalPixel,
		quant: [
			[AMETHYST_RAMP, (h, s) => h >= 0.55 && s < 0.85],
		],
		checks: [
			['紫水晶带[0.65,0.92]≥90%', (img) => bandFrac(img, (h) => h >= 0.65 && h <= 0.92), 0.90],
		],
	},
	'tiles_caves_gnoll.png': {
		fn: gnollPixel,
		quant: [
			[OLIVE_RAMP, (h, s) => (h <= 0.30 || h >= 0.85) && s < 0.85],
		],
		checks: [
			['土黄绿带[0.06,0.28]≥90%', (img) => bandFrac(img, (h) => h >= 0.06 && h <= 0.28), 0.90],
		],
	},
	'tiles_city.png': {
		fn: cityPixel,
		quant: [
			[DARK_RED_RAMP, (h, s) => (h < 0.12 || h > 0.90) && s < 0.85],
			[PATINA_RAMP, (h, s) => h >= 0.33 && h <= 0.55 && s < 0.90],
		],
		checks: [
			['深红棕带(h<0.12|>0.92)≥65%', (img) => bandFrac(img, (h) => h < 0.12 || h > 0.92), 0.65],
			['铜绿带[0.35,0.50]≥10%', (img) => bandFrac(img, (h) => h >= 0.35 && h <= 0.50), 0.10],
		],
	},
	'tiles_halls.png': {
		fn: hallsPixel,
		quant: [
			[DARK_PURPLE_RAMP, (h, s) => h >= 0.68 && s < 0.75],
			[FIRE_RAMP, (h, s) => h < 0.10 && s >= 0.25],
		],
		checks: [
			['暗紫带[0.75,0.95]≥40%', (img) => bandFrac(img, (h) => h >= 0.75 && h <= 0.95), 0.40],
			['地狱火带(h<0.08)≥15%', (img) => bandFrac(img, (h) => h < 0.08), 0.15],
		],
	},
};

// ---------- 主流程 ----------
const codec = await openCodec();
const report = [];

for (const f of FILES) {
	const t = TRANSFORMS[f];
	if (!t) throw new Error('unexpected file ' + f);
	const dst = assetPath('environment/' + f);
	fs.mkdirSync(BACKUP, { recursive: true });
	const src = path.join(BACKUP, f);
	if (!fs.existsSync(src)) fs.copyFileSync(dst, src); // 首跑快照原图，保证可重跑不叠加

	const orig = await codec.decode(src);
	const img = { width: orig.width, height: orig.height, data: orig.data.slice() };

	// 安全前置断言：16x16 网格完整
	if (orig.width % GRID !== 0 || orig.height % GRID !== 0) throw new Error('grid mismatch: ' + f);

	mapPixels(img, t.fn);
	for (const [r, test] of t.quant) quantizeBand(img, r, test);

	// 安全断言：尺寸不变 + alpha 逐字节不变 → 网格/透明度语义安全
	if (img.width !== orig.width || img.height !== orig.height) throw new Error('size changed: ' + f);
	for (let i = 3; i < orig.data.length; i += 4) {
		if (img.data[i] !== orig.data[i]) throw new Error('alpha changed: ' + f);
	}

	// 数值自检：目标色相带覆盖率必须达标
	for (const [name, fn, min] of t.checks) {
		const frac = fn(img);
		if (frac < min) throw new Error(`self-check failed: ${f} ${name} got ${(frac * 100).toFixed(1)}%`);
	}

	await codec.encode(img, dst);

	const mh = meanHue(img);
	report.push(`${f} (${orig.width}x${orig.height}) · meanHue→${mh === null ? '-' : mh.toFixed(3)} · ${t.checks.map(([name]) => name).join(' / ')} · 量化${t.quant.length}阶组`);
}

await codec.close();
console.log(report.join('\n'));
console.log('OK — originals snapshotted in tests/rebrand/.backup-env-regions/');
