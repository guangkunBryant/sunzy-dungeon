// sunzy rebrand — 下水道区域地形重配（紫灰岩壁 + 幽绿辉光水）。
// 只做逐像素颜色变换：PNG 尺寸、alpha、16x16 tile 网格全部原样保留，无任何几何改动。
// 运行：cd tests && node rebrand/gen-env-sewers.mjs
// 可重跑：首次运行把原图快照到 rebrand/.backup-env-sewers/，之后永远从快照出发，
//         反复运行不会叠加色偏；调参后重跑即得到全新结果。

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
	openCodec, assetPath, rgb2hsl, hsl2rgb, mapPixels, quantize,
} from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKUP = path.join(HERE, '.backup-env-sewers');
const FILES = [
	'tiles_sewers.png',
	'water0.png', 'water1.png', 'water2.png', 'water3.png', 'water4.png',
	'terrain_features.png',
	'raised_terrain.png',
];

// ---------- 参数 ----------
// 砖石（tiles_sewers / raised_terrain）：灰岩注入紫调 + 冷色带（蓝/青）拉到紫，随后量化到紫灰冷调色阶
const STONE = {
	purpleHue: 0.745,        // 紫罗兰偏灰
	greySat: 0.16,           // 紫灰饱和度基准（低饱和 = “紫灰”而不是“紫”）
	coolBand: [0.45, 0.85],  // 蓝/青 → 紫
	satBoost: 1.15,
	greenTarget: 0.36,       // 图内苔藓/水藻 → 幽绿（与水面同一色相，呼应）
	greenBoost: 1.25,
	warmToPurple: false,     // tiles_sewers：暖色（木头/皮肤/金属高光）保持语义不动
};
// raised_terrain：同砖石色系，但暖色（原红橙岩块）也拉进冷紫，整体归入下水道色系
const STONE_RAISED = { ...STONE, warmToPurple: true };

// 水：色相自适应对齐到幽绿 0.345（原图有的偏蓝、有的偏红，各自算 delta），提饱和 + 微提亮度 = “辉光”
const WATER = { targetHue: 0.345, satBoost: 1.5, lumLift: 1.06, lumAdd: 0.02 };

// terrain_features：只动黄绿草叶带（0.13–0.34），翡翠绿 0.375 + 微提饱和；花/火/木/灰条不动
const GRASS = { bandLo: 0.13, bandHi: 0.34, targetHue: 0.375, satBoost: 1.22 };

// 冷调量化色阶（共享，保证逐帧/逐块一致）
const PURPLE_RAMP = [
	[14, 11, 24], [28, 23, 44], [44, 37, 66], [61, 53, 90],
	[81, 73, 115], [104, 96, 141], [131, 124, 168], [163, 158, 194],
];
const EMERALD_RAMP = [
	[5, 22, 14], [8, 40, 24], [12, 62, 34], [20, 88, 46],
	[34, 118, 60], [60, 152, 82], [102, 190, 118],
];

// ---------- 像素算子 ----------
// 砖石：灰 → 紫灰；冷带 → 紫；绿 → 幽绿；暖色按参数决定是否入紫
function stonePixel(o) {
	const px = (h, s, l, a) => { const [r, g, b] = hsl2rgb(h, s, l); return [r, g, b, a]; };
	return (r, g, b, a) => {
		if (a === 0) return null;
		const [h, s, l] = rgb2hsl(r, g, b);
		const warm = h < 0.12 || h > 0.90;
		if (warm) {
			if (!o.warmToPurple) return null; // 木头/皮肤/金色保持
			return px(0.76, Math.min(0.5, s * 0.55 + 0.06), l, a); // 红橙岩块 → 冷紫岩
		}
		if (s < 0.12) { // 灰岩注入紫调，两端亮度渐弱避免洗白/染黑
			const ns = Math.min(0.45, o.greySat * (0.5 + 2.2 * l * (1 - l)));
			return px(o.purpleHue, ns, l, a);
		}
		if (h >= o.coolBand[0] && h <= o.coolBand[1]) {
			return px(o.purpleHue, Math.min(1, s * o.satBoost + 0.04), l, a);
		}
		if (h > 0.13 && h < 0.45) { // 苔藓/水藻 → 幽绿
			return px(o.greenTarget, Math.min(1, s * o.greenBoost), l, a);
		}
		return null;
	};
}

// 水：deltaH 把整图色相中心对齐到 targetHue，提饱和 + 微提亮度（幽绿辉光）
function waterPixel(deltaH, o) {
	return (r, g, b, a) => {
		if (a === 0) return null;
		const [h, s, l] = rgb2hsl(r, g, b);
		if (s < 0.06) return null;
		const [nr, ng, nb] = hsl2rgb(
			(h + deltaH) % 1,
			Math.min(1, s * o.satBoost),
			Math.min(0.92, l * o.lumLift + o.lumAdd),
		);
		return [nr, ng, nb, a];
	};
}

// 草叶：只shift黄绿带
function grassPixel(o) {
	return (r, g, b, a) => {
		if (a === 0) return null;
		const [h, s, l] = rgb2hsl(r, g, b);
		if (s < 0.15) return null;
		if (h >= o.bandLo && h <= o.bandHi) {
			const [nr, ng, nb] = hsl2rgb(o.targetHue, Math.min(1, s * o.satBoost), l);
			return [nr, ng, nb, a];
		}
		return null;
	};
}

// 带限量化：只有满足条件的像素吸附到最近调色板色（保留其余像素的细节）
function quantizeBand(img, palette, test) {
	return mapPixels(img, (r, g, b, a) => {
		if (a === 0) return null;
		const [h, s] = rgb2hsl(r, g, b);
		if (!test(h, s)) return null;
		let best = palette[0], bd = 1e9;
		for (const p of palette) {
			const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
			if (d < bd) { bd = d; best = p; }
		}
		return [best[0], best[1], best[2], a];
	});
}

// 饱和像素的（环形）平均色相
function meanHue(img) {
	let hx = 0, hy = 0, n = 0;
	for (let i = 0; i < img.data.length; i += 4) {
		if (img.data[i + 3] === 0) continue;
		const [h, s] = rgb2hsl(img.data[i], img.data[i + 1], img.data[i + 2]);
		if (s < 0.1) continue;
		hx += Math.cos(h * 2 * Math.PI); hy += Math.sin(h * 2 * Math.PI); n++;
	}
	if (!n) return null;
	return (Math.atan2(hy, hx) / (2 * Math.PI) + 1) % 1;
}

// ---------- 主流程 ----------
const codec = await openCodec();
const isPurpleFamily = (h, s) => s < 0.32 && h >= 0.60 && h <= 0.92;
const report = [];

for (const f of FILES) {
	const dst = assetPath('environment/' + f);
	fs.mkdirSync(BACKUP, { recursive: true });
	const src = path.join(BACKUP, f);
	if (!fs.existsSync(src)) fs.copyFileSync(dst, src); // 首跑快照原图，保证可重跑不叠加

	const orig = await codec.decode(src);
	const img = { width: orig.width, height: orig.height, data: orig.data.slice() };
	let note = `${f} (${orig.width}x${orig.height})`;

	if (f === 'tiles_sewers.png') {
		mapPixels(img, stonePixel(STONE));
		const q = quantizeBand(img, PURPLE_RAMP, isPurpleFamily);
		note += ' · 紫灰岩壁: hue→0.745 灰注s≈0.16 冷带→紫 苔藓→0.36 · 紫灰8阶量化';
		void q;
	} else if (f.startsWith('water')) {
		const mh = meanHue(orig);
		const delta = mh === null ? 0 : (WATER.targetHue - mh + 1) % 1;
		mapPixels(img, waterPixel(delta, WATER));
		quantize(img, EMERALD_RAMP); // 5 帧共享同一色阶 → 动画帧间一致
		note += ` · 幽绿辉光水: 原均相${mh === null ? '-' : mh.toFixed(3)} delta=${delta.toFixed(3)}→${WATER.targetHue} s×${WATER.satBoost} l+辉光 · 翡翠7阶量化`;
	} else if (f === 'terrain_features.png') {
		mapPixels(img, grassPixel(GRASS));
		note += ` · 草叶带[${GRASS.bandLo},${GRASS.bandHi}]→翡翠${GRASS.targetHue} s×${GRASS.satBoost}（花/火/木/灰条不动）`;
	} else if (f === 'raised_terrain.png') {
		mapPixels(img, stonePixel(STONE_RAISED));
		quantizeBand(img, PURPLE_RAMP, isPurpleFamily);
		note += ' · 随砖石同调: 灰/冷/暖全入紫 苔藓→幽绿 · 紫灰8阶量化';
	} else {
		throw new Error('unexpected file ' + f);
	}

	// 安全断言：尺寸与 alpha 逐字节不变 → 网格/透明度语义安全
	if (img.width !== orig.width || img.height !== orig.height) throw new Error('size changed: ' + f);
	for (let i = 3; i < orig.data.length; i += 4) {
		if (img.data[i] !== orig.data[i]) throw new Error('alpha changed: ' + f);
	}

	await codec.encode(img, dst);
	report.push(note);
}

await codec.close();
console.log(report.join('\n'));
console.log('OK — originals snapshotted in tests/rebrand/.backup-env-sewers/');
