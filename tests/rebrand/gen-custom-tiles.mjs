// sunzy rebrand — 剩余变体地砖（environment/custom_tiles 11 张）重配。
// 只做逐像素颜色变换：PNG 尺寸、alpha、16x16 tile 网格全部原样保留，无任何几何改动。
// 运行：cd tests && node rebrand/gen-custom-tiles.mjs
// 可重跑：首次运行把原图快照到 rebrand/.backup-custom-tiles/，之后永远从快照出发，
//         反复运行不会叠加色偏；调参后重跑即得到全新结果。
//
// 带分区依据（probe-props.mjs 的原图色相分布）+ 与已完成色板一致：
//   carpet          城市Boss房间地毯（红毯0.95+青0.55+金0.10+绿0.35）→ 紫毯0.85+靛蓝0.65+铜绿0.42+金0.13
//   caves_boss      洞穴Boss房（青0.60+红0.95+暖0.05）→ 同 caves 基底：暖棕岩0.08+琥珀0.11
//   caves_quest     洞穴任务房（9%饱和，暖0.05+灰）→ 同 caves：暖棕岩0.08+琥珀0.11
//   city_boss       城市Boss房（暗红0.00+青0.60）→ 同 city：深红棕0.99+铜绿0.42
//   city_quest      城市任务房（暗红0.00+青0.60+红0.95）→ 同 city：深红棕0.99+铜绿0.42
//   halls_special   最终关/恶魔孵化房（暗红橙0.00+紫0.95）→ 同 halls：暗紫0.85+地狱火0.02
//   prison_exit     监狱出口（暖灰92%）→ 同 prison：冷蓝灰石0.62+铁锈0.05
//   prison_quest    监狱任务房（暖0.10+红0.95）→ 同 prison：铁锈0.05+冷蓝0.62
//   rat_king_room   鼠王密室（紫0.70+暖0.20）→ 同 sunzy 金系：金0.13
//   sewer_boss      下水道Boss房（暖灰98%）→ 同 水道：紫灰0.745+藓绿0.36
//   weak_floor      薄地面/裂隙房（暗暖灰）→ 同 prison：冷蓝灰石0.62
//
// 注意：lib.mjs 的 rgb2hsl 对纯红边界会返回 h≥1（未回绕），本脚本内一律 h % 1；
//      量化色阶全部用 hsl2rgb 按目标色相程序化生成。

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openCodec, assetPath, rgb2hsl, hsl2rgb, mapPixels } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKUP = path.join(HERE, '.backup-custom-tiles');
const GRID = 16;
const FILES = [
	'carpet.png', 'caves_boss.png', 'caves_quest.png', 'city_boss.png', 'city_quest.png',
	'halls_special.png', 'prison_exit.png', 'prison_quest.png', 'rat_king_room.png',
	'sewer_boss.png', 'weak_floor.png',
];

// ---------- 参数 ----------
const GREY_S_MIN = 0.12; // s 低于此视为灰岩，注入目标色相
const clamp1 = (x) => Math.max(0, Math.min(1, x));
const hueOf = (r, g, b) => rgb2hsl(r, g, b)[0] % 1; // 回绕纯红边界
// 灰岩注入饱和度：中亮度最强、两端渐弱，避免洗白/染黑
const greySatOf = (base, l) => Math.min(0.45, base * (0.5 + 2.2 * l * (1 - l)));
const px = (h, s, l, a) => { const [r, g, b] = hsl2rgb(h, clamp1(s), clamp1(l)); return [r, g, b, a]; };

// ---------- 量化色阶（同族阶梯；按目标色相程序化生成，只吸附同族像素）----------
const ramp = (hue, steps) => steps.map(([l, s]) => { const [r, g, b] = hsl2rgb(hue, s, l); return [r, g, b]; });
const PURPLE_CARPET_RAMP = ramp(0.85, [[0.08, 0.45], [0.14, 0.46], [0.20, 0.46], [0.27, 0.44], [0.34, 0.42], [0.42, 0.38], [0.50, 0.34]]); // carpet 紫毯
const INDIGO_RAMP  = ramp(0.65, [[0.10, 0.42], [0.16, 0.44], [0.22, 0.44], [0.29, 0.42], [0.36, 0.38], [0.44, 0.33]]);   // carpet 靛蓝滚边
const PATINA_RAMP  = ramp(0.42, [[0.09, 0.45], [0.14, 0.45], [0.19, 0.44], [0.25, 0.42], [0.31, 0.38], [0.38, 0.34], [0.45, 0.28]]); // 铜绿
const GOLD_RAMP    = ramp(0.13, [[0.18, 0.55], [0.24, 0.55], [0.30, 0.52], [0.37, 0.48], [0.44, 0.44], [0.52, 0.38]]);   // 金（rat_king_room）
const BROWN_RAMP   = ramp(0.08, [[0.08, 0.40], [0.13, 0.42], [0.18, 0.42], [0.24, 0.40], [0.31, 0.36], [0.38, 0.32], [0.45, 0.28], [0.53, 0.24]]); // caves 暖棕岩
const AMBER_RAMP   = ramp(0.11, [[0.18, 0.55], [0.24, 0.55], [0.30, 0.52], [0.37, 0.48], [0.44, 0.44], [0.52, 0.38]]);   // caves 琥珀矿脉（亮部）
const DARK_RED_RAMP = ramp(0.99, [[0.08, 0.35], [0.13, 0.36], [0.19, 0.36], [0.25, 0.35], [0.32, 0.32], [0.39, 0.28], [0.46, 0.25], [0.54, 0.21]]); // city 暗红棕石
const DARK_PURPLE_RAMP = ramp(0.85, [[0.06, 0.50], [0.10, 0.45], [0.15, 0.40], [0.20, 0.35], [0.26, 0.32], [0.32, 0.30], [0.40, 0.28], [0.50, 0.25]]); // halls 暗紫黑
const FIRE_RAMP    = ramp(0.02, [[0.12, 0.80], [0.18, 0.75], [0.25, 0.70], [0.32, 0.70], [0.40, 0.65], [0.48, 0.60], [0.56, 0.55]]);  // halls 地狱火橙红
const BLUE_STONE_RAMP = ramp(0.62, [[0.07, 0.30], [0.11, 0.32], [0.16, 0.33], [0.21, 0.33], [0.27, 0.31], [0.33, 0.28], [0.40, 0.24], [0.48, 0.19]]); // prison 冷蓝灰石
const RUST_RAMP    = ramp(0.05, [[0.10, 0.45], [0.16, 0.42], [0.22, 0.40], [0.29, 0.36], [0.36, 0.32]]);                 // prison 铁锈
const SEWER_PURPLE_RAMP = ramp(0.745, [[0.08, 0.35], [0.14, 0.36], [0.20, 0.36], [0.27, 0.34], [0.34, 0.32], [0.42, 0.28], [0.50, 0.24]]); // 水道 紫灰石
const MOSS_RAMP    = ramp(0.36, [[0.10, 0.45], [0.16, 0.44], [0.22, 0.42], [0.28, 0.38], [0.35, 0.34]]);                 // 水道 藓绿

// ---------- 像素算子 ----------
function carpetPixel(r, g, b, a) {
	if (a === 0) return null;
	const [h0, s, l] = rgb2hsl(r, g, b);
	const h = h0 % 1;
	if (s < GREY_S_MIN) return px(0.85, greySatOf(0.14, l), l * 0.95, a);      // 灰→紫毯底
	if (h < 0.15 || h > 0.90) return px(0.85, s * 1.0 + 0.04, l * 0.95, a);    // 红毯→紫毯
	if (h >= 0.45 && h <= 0.80) return px(0.65, s * 1.05 + 0.04, l * 0.95, a); // 青→靛蓝滚边
	if (h > 0.20 && h < 0.45) return px(0.42, s * 1.0 + 0.04, l, a);           // 绿→铜绿点缀
	return px(0.13, s * 0.9 + 0.05, l, a);                                     // 金饰→金
}

function cavesPixel(r, g, b, a) {
	if (a === 0) return null;
	const [h0, s, l] = rgb2hsl(r, g, b);
	const h = h0 % 1;
	if (s < GREY_S_MIN) return px(0.08, greySatOf(0.20, l), l, a);             // 灰→暖棕岩
	if (h < 0.15 || h > 0.90) {
		if (l > 0.45) return px(0.11, s * 1.2 + 0.05, l * 1.02, a);            // 亮暖部→琥珀矿脉
		return px(0.08, s * 0.9 + 0.05, l, a);                                 // 暗暖部→棕岩
	}
	if (h > 0.30 && h < 0.50) return px(0.11, s * 1.1 + 0.04, l, a);           // 绿苔→琥珀呼应
	if (h >= 0.45 && h <= 0.80) return px(0.11, s * 1.05 + 0.05, l, a);        // 青→琥珀
	return px(0.08, s * 0.9 + 0.05, l, a);                                     // 红紫残留→棕岩
}

function cityPixel(r, g, b, a) {
	if (a === 0) return null;
	const [h0, s, l] = rgb2hsl(r, g, b);
	const h = h0 % 1;
	if (s < GREY_S_MIN) return px(0.99, greySatOf(0.16, l), l * 0.92, a);      // 灰石→暗红棕石
	if (h < 0.15 || h > 0.90) return px(0.99, s * 0.85 + 0.04, l * 0.9, a);    // 暗红/红棕→深红棕（压暗）
	if (h >= 0.45 && h <= 0.80) return px(0.42, s * 1.15 + 0.04, l, a);        // 青带→铜绿点缀
	return px(0.99, s * 0.9 + 0.05, l * 0.9, a);                               // 其余暖残留→深红棕
}

function hallsPixel(r, g, b, a) {
	if (a === 0) return null;
	const [h0, s, l] = rgb2hsl(r, g, b);
	const h = h0 % 1;
	if (s < GREY_S_MIN) return px(0.85, greySatOf(0.18, l), l * 0.75, a);      // 灰石→暗紫黑
	if (h > 0.68 && h < 0.95) return px(0.85, s * 0.8 + 0.04, l * 0.75, a);    // 紫带→暗紫（再压暗）
	if (h < 0.15 || h > 0.90) {
		if (l >= 0.30) return px(0.02, s * 1.05 + 0.06, Math.min(0.85, l * 1.05), a); // 亮暖部→地狱火（醒目）
		return px(0.85, s * 0.5 + 0.05, l * 0.72, a);                          // 暗红底→极暗紫
	}
	return px(0.85, s * 0.6 + 0.05, l * 0.75, a);
}

function prisonPixel(r, g, b, a) {
	if (a === 0) return null;
	const [h0, s, l] = rgb2hsl(r, g, b);
	const h = h0 % 1;
	if (s < GREY_S_MIN) return px(0.62, greySatOf(0.15, l), l * 0.95, a);      // 暖灰石→冷蓝灰
	if (h < 0.15 || h > 0.90) return px(0.05, s * 0.85 + 0.04, l * 0.82, a);   // 暖带/红→铁锈（压暗）
	return px(0.62, s * 1.1 + 0.04, l * 0.95, a);                              // 其余→蓝灰
}

function ratKingPixel(r, g, b, a) {
	if (a === 0) return null;
	const [h0, s, l] = rgb2hsl(r, g, b);
	const h = h0 % 1;
	if (s < GREY_S_MIN) return px(0.13, greySatOf(0.16, l), l, a);             // 灰→淡金
	return px(0.13, s * 1.0 + 0.05, l, a);                                     // 紫/暖→金（鼠王金系）
}

function sewerPixel(r, g, b, a) {
	if (a === 0) return null;
	const [h0, s, l] = rgb2hsl(r, g, b);
	const h = h0 % 1;
	if (s < 0.12) return px(0.745, greySatOf(0.16, l), l, a);                  // 暖灰→紫灰石（同水道）
	if (h < 0.15 || h > 0.90) return px(0.36, s * 0.9 + 0.05, l, a);           // 暖带→藓绿
	return px(0.745, Math.min(0.5, s * 0.55 + 0.06), l, a);                    // 其余→紫灰
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
	'carpet.png': {
		fn: carpetPixel,
		quant: [
			[PURPLE_CARPET_RAMP, (h, s) => (h < 0.12 || h > 0.90) && s < 0.85],
			[INDIGO_RAMP, (h, s) => h >= 0.45 && h <= 0.80 && s < 0.90],
		],
		checks: [
			['紫毯带[0.75,0.95]≥30%', (img) => bandFrac(img, (h) => h >= 0.75 && h <= 0.95), 0.30],
			['靛蓝带[0.55,0.75]≥15%', (img) => bandFrac(img, (h) => h >= 0.55 && h <= 0.75), 0.15],
		],
	},
	'caves_boss.png': {
		fn: cavesPixel,
		quant: [
			[AMBER_RAMP, (h, s, l) => h >= 0.05 && h <= 0.20 && l > 0.45 && s > 0.20],
			[BROWN_RAMP, (h, s, l) => (h < 0.16 || h > 0.90) && l <= 0.45 && s < 0.80],
		],
		checks: [
			['暖棕+琥珀带(h<0.20|>0.90)≥70%', (img) => bandFrac(img, (h) => h < 0.20 || h > 0.90), 0.70],
		],
	},
	'caves_quest.png': {
		fn: cavesPixel,
		quant: [
			[AMBER_RAMP, (h, s, l) => h >= 0.05 && h <= 0.20 && l > 0.45 && s > 0.20],
			[BROWN_RAMP, (h, s, l) => (h < 0.16 || h > 0.90) && l <= 0.45 && s < 0.80],
		],
		checks: [
			['暖棕+琥珀带(h<0.20|>0.90)≥70%', (img) => bandFrac(img, (h) => h < 0.20 || h > 0.90), 0.70],
		],
	},
	'city_boss.png': {
		fn: cityPixel,
		quant: [
			[DARK_RED_RAMP, (h, s) => (h < 0.12 || h > 0.90) && s < 0.85],
			[PATINA_RAMP, (h, s) => h >= 0.33 && h <= 0.55 && s < 0.90],
		],
		checks: [
			['深红棕带(h<0.12|>0.92)≥55%', (img) => bandFrac(img, (h) => h < 0.12 || h > 0.92), 0.55],
		],
	},
	'city_quest.png': {
		fn: cityPixel,
		quant: [
			[DARK_RED_RAMP, (h, s) => (h < 0.12 || h > 0.90) && s < 0.85],
			[PATINA_RAMP, (h, s) => h >= 0.33 && h <= 0.55 && s < 0.90],
		],
		checks: [
			['深红棕带(h<0.12|>0.92)≥55%', (img) => bandFrac(img, (h) => h < 0.12 || h > 0.92), 0.55],
		],
	},
	'halls_special.png': {
		fn: hallsPixel,
		quant: [
			[DARK_PURPLE_RAMP, (h, s) => h >= 0.68 && s < 0.75],
			[FIRE_RAMP, (h, s) => h < 0.10 && s >= 0.25],
		],
		checks: [
			['暗紫带[0.75,0.95]≥35%', (img) => bandFrac(img, (h) => h >= 0.75 && h <= 0.95), 0.35],
			['地狱火带(h<0.08)≥10%', (img) => bandFrac(img, (h) => h < 0.08), 0.10],
		],
	},
	'prison_exit.png': {
		fn: prisonPixel,
		quant: [
			[BLUE_STONE_RAMP, (h, s) => s < 0.40 && h >= 0.42 && h <= 0.80],
			[RUST_RAMP, (h, s) => (h < 0.12 || h > 0.92) && s < 0.80],
		],
		checks: [
			['冷蓝石带[0.48,0.78]≥40%', (img) => bandFrac(img, (h) => h >= 0.48 && h <= 0.78), 0.40],
		],
	},
	'prison_quest.png': {
		fn: prisonPixel,
		quant: [
			[BLUE_STONE_RAMP, (h, s) => s < 0.40 && h >= 0.42 && h <= 0.80],
			[RUST_RAMP, (h, s) => (h < 0.12 || h > 0.92) && s < 0.80],
		],
		checks: [
			['冷蓝+铁锈带(h<0.12|[0.48,0.78])≥70%', (img) => bandFrac(img, (h) => h < 0.12 || (h >= 0.48 && h <= 0.78)), 0.70],
		],
	},
	'rat_king_room.png': {
		fn: ratKingPixel,
		quant: [
			[GOLD_RAMP, (h, s) => (h <= 0.30 || h >= 0.85) && s < 0.85],
		],
		checks: [
			['金带[0.04,0.24]≥85%', (img) => bandFrac(img, (h) => h >= 0.04 && h <= 0.24), 0.85],
		],
	},
	'sewer_boss.png': {
		fn: sewerPixel,
		quant: [
			[SEWER_PURPLE_RAMP, (h, s) => h >= 0.60 && h <= 0.92 && s < 0.60],
			[MOSS_RAMP, (h, s) => (h <= 0.20 || h >= 0.92) && s < 0.85],
		],
		checks: [
			['紫灰带[0.65,0.85]≥35%', (img) => bandFrac(img, (h) => h >= 0.65 && h <= 0.85), 0.35],
		],
	},
	'weak_floor.png': {
		fn: prisonPixel,
		quant: [
			[BLUE_STONE_RAMP, (h, s) => s < 0.40 && h >= 0.42 && h <= 0.80],
		],
		checks: [
			['冷蓝石带[0.48,0.78]≥25%', (img) => bandFrac(img, (h) => h >= 0.48 && h <= 0.78), 0.25],
		],
	},
};

// ---------- 主流程 ----------
const codec = await openCodec();
const report = [];

for (const f of FILES) {
	const t = TRANSFORMS[f];
	if (!t) throw new Error('unexpected file ' + f);
	const dst = assetPath('environment/custom_tiles/' + f);
	fs.mkdirSync(BACKUP, { recursive: true });
	const src = path.join(BACKUP, f);
	if (!fs.existsSync(src)) fs.copyFileSync(dst, src); // 首跑快照原图，保证可重跑不叠加

	const orig = await codec.decode(src);
	const img = { width: orig.width, height: orig.height, data: orig.data.slice() };

	// 安全前置断言：16x16 网格完整（等分网格，逐像素变换，网格语义安全）
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
	console.log(`✓ ${f} ${orig.width}x${orig.height} meanHue=${mh === null ? '-' : mh.toFixed(3)}`);
}

await codec.close();
console.log('\n' + report.join('\n'));
console.log('OK — originals snapshotted in tests/rebrand/.backup-custom-tiles/');
