// sunzy rebrand — 特效图重配（effects/*.png 6 张：烟雾/光芒/火球/粒子/图标）。
// 策略：hueShift 向 sunzy 冷调系 —— 逐图统计饱和像素的环形平均色相，把整图色相
//       中心对齐到 0.55–0.75 冷带中心 0.63，微提饱和 ×1.15，亮度不动。
//       ⚠️ alpha 通道必须逐字节不变（像素算子显式返回 4 分量 [r,g,b,a]，断言拦截）。
// 运行：cd tests && node rebrand/gen-effects.mjs
// 可重跑：首次运行把原图快照到 rebrand/.backup-splashes/effects/，之后永远从快照出发，
//         反复运行不会叠加色偏；调参后重跑即得到全新结果。

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openCodec, assetPath, rgb2hsl, hsl2rgb, mapPixels } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKUP = path.join(HERE, '.backup-splashes'); // 与 splashes 共享同一快照根

const FILES = [
	'effects/effects.png',
	'effects/fireball-short.png',
	'effects/fireball-tall.png',
	'effects/specks.png',
	'effects/spell_icons.png',
	'effects/text_icons.png',
];

// ---------- 参数 ----------
const TARGET_H = 0.63;  // sunzy 冷带中心（规格 0.55–0.75）
const SAT_BOOST = 1.15; // 微提饱和

// ---------- 数值断言（自检） ----------
if (!(TARGET_H >= 0.55 && TARGET_H <= 0.75)) throw new Error('TARGET_H out of spec 0.55-0.75');
if (!(SAT_BOOST >= 1.0 && SAT_BOOST <= 1.3)) throw new Error('SAT_BOOST out of spec');

// ---------- 像素算子 ----------
// 灰/白光（s<0.08）不动；其余整体 shift 到冷带；显式 4 分量返回，alpha 原样
function effectPixel(shift, boost) {
	return (r, g, b, a) => {
		if (a === 0) return null;
		const [h, s, l] = rgb2hsl(r, g, b);
		if (s < 0.08) return null;
		const [nr, ng, nb] = hsl2rgb(((h + shift) % 1 + 1) % 1, Math.min(1, s * boost), l);
		return [nr, ng, nb, a];
	};
}

// 饱和像素的（环形）平均色相
function meanHue(img) {
	let hx = 0, hy = 0, n = 0;
	for (let i = 0; i < img.data.length; i += 4) {
		if (img.data[i + 3] === 0) continue;
		const [h, s] = rgb2hsl(img.data[i], img.data[i + 1], img.data[i + 2]);
		if (s < 0.08) continue;
		hx += Math.cos(h * 2 * Math.PI); hy += Math.sin(h * 2 * Math.PI); n++;
	}
	if (!n) return null;
	return (Math.atan2(hy, hx) / (2 * Math.PI) + 1) % 1;
}

// ---------- 主流程 ----------
const codec = await openCodec();
const report = [];

for (const rel of FILES) {
	const dst = assetPath(rel);
	fs.mkdirSync(path.join(BACKUP, 'effects'), { recursive: true });
	const bak = path.join(BACKUP, rel);
	if (!fs.existsSync(bak)) fs.copyFileSync(dst, bak); // 首跑快照原图，保证可重跑不叠加

	const orig = await codec.decode(bak);
	const img = { width: orig.width, height: orig.height, data: orig.data.slice() };

	const mh = meanHue(orig);
	const shift = mh === null ? 0 : (TARGET_H - mh + 1) % 1;

	mapPixels(img, effectPixel(shift, SAT_BOOST));

	// 安全断言 1：尺寸不变
	if (img.width !== orig.width || img.height !== orig.height) throw new Error('size changed: ' + rel);
	// 安全断言 2：alpha 逐字节不变（半透明烟雾/光芒的透明度语义必须原样）
	for (let i = 3; i < orig.data.length; i += 4) {
		if (img.data[i] !== orig.data[i]) throw new Error('alpha changed: ' + rel);
	}
	// 数值自检 3：处理后平均色相收敛进 0.55–0.75 冷带
	if (mh !== null) {
		const mh2 = meanHue(img);
		if (mh2 === null || !(mh2 >= 0.55 && mh2 <= 0.75)) {
			throw new Error(`mean hue ${mh2 === null ? 'null' : mh2.toFixed(3)} not in cool band [0.55,0.75]: ` + rel);
		}
		report.push(`${rel} ${orig.width}x${orig.height} · 均相 ${mh.toFixed(3)}→${mh2.toFixed(3)} (delta=+${shift.toFixed(3)}) · s×${SAT_BOOST} · 灰白光不动 · alpha 逐字节不变 ✓`);
	} else {
		report.push(`${rel} ${orig.width}x${orig.height} · 无饱和像素，原样保留（delta=0）· alpha 逐字节不变 ✓`);
	}

	await codec.encode(img, dst);
}

await codec.close();
console.log(report.join('\n'));
console.log('OK — originals snapshotted in tests/rebrand/.backup-splashes/effects/');
