// sunzy rebrand — 剩余道具/机关/召唤物精灵重配（只改像素颜色 + 帧内描边，帧网格/帧数/落点不变）
// 用法: 在 tests/ 下运行  node rebrand/gen-props.mjs
// 流程: 快照 .backup-props/ -> 从快照处理(幂等) -> rehue(专属主色调,保明暗) -> outline(#12101F,按帧格尺寸) -> 数值断言 -> 写回
// 帧格对账（手工核对 Sprite.java / 使用点）:
//   amulet   16x16  — AmuletScene 单图无 TextureFilm（32x32 保守 16x16 网格，余料透明已验证）
//   pet      16x16  — 代码仅 Assets.Sprites.PET 常量、无引用（PNG 高度 16 推断 16x16 网格）
//   spirit_hawk 15x15 — SpiritHawk.java HawkSprite: TextureFilm(texture, 15, 15)
//   ninja_log  11x12 — SmokeBomb.java NinjaLogSprite: TextureFilm(texture, 11, 12)
//   lotus      19x16 — LotusSprite.java: TextureFilm(texture, 19, 16)（仅帧 0 使用）
//   wards      16x16 — WardSprite.java 用 uvRect 各阶不规格（保守 16x16 网格，余料透明已验证）
//   rot_heart  16x16 — RotHeartSprite.java: TextureFilm(texture, 16, 16)
//   pylon      10x20 — PylonSprite.java: TextureFilm(texture, 10, 20)
//   vault_mirror   16x23 — VaultMirrorSprite.java: TextureFilm(texture, 16, 23)
//   vault_tokens_door 16x16 — VaultTokenDoorSprite.java: TextureFilm(texture, 16, 16)
import {
	openCodec, assetPath, mapPixels, rgb2hsl, hsl2rgb, getPx, setPx,
	cloneImage, outline, scanSpriteFilms,
} from './lib.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SNAP = path.join(path.dirname(fileURLToPath(import.meta.url)), '.backup-props');
const INDIGO = [18, 16, 31]; // #12101F 1px 深靛蓝描边

// rehue: 同 gen-mobs-rest — 所有不透明像素统一重上色为 hue（%1 回绕），保留明暗结构；
//        灰色像素(s<0.08)给 greySat 的淡同色调（近白像素 l 压到 0.95 以下）；
//        彩色像素饱和度乘 satBoost。
function rehue(img, hue, { satBoost = 1, greySat = 0.2, lum = (l) => l } = {}) {
	hue = ((hue % 1) + 1) % 1;
	return mapPixels(img, (r, g, b, a) => {
		if (a === 0) return null;
		const [, s, l] = rgb2hsl(r, g, b);
		const ns = s < 0.08 ? greySat : Math.min(1, s * satBoost);
		const nl = s < 0.08 ? Math.min(0.95, lum(l)) : Math.min(1, Math.max(0, lum(l)));
		const [nr, ng, nb] = hsl2rgb(hue, ns, nl);
		return [nr, ng, nb, a];
	});
}

const lumDark = (f) => (l) => l * f;

// name -> { cell:[w,h] (手工对账见文件头), hue, opts }
const PROPS = {
	// ---- 道具 ----
	amulet:     { cell: [16, 16], hue: 0.13, opts: { satBoost: 1.10, greySat: 0.16, lum: (l) => l } },          // 金·护符
	pet:        { cell: [16, 16], hue: 0.62, opts: { satBoost: 1.10, greySat: 0.20, lum: (l) => l } },          // 靛蓝·灵宠
	spirit_hawk:{ cell: [15, 15], hue: 0.40, opts: { satBoost: 1.10, greySat: 0.18, lum: (l) => l } },          // 翡翠·灵鹰
	wards:      { cell: [16, 16], hue: 0.13, opts: { satBoost: 1.05, greySat: 0.20, lum: (l) => l } },          // 金靛·警戒守卫（靛蓝描边呼应）
	ninja_log:  { cell: [11, 12], hue: 0.62, opts: { satBoost: 1.00, greySat: 0.20, lum: lumDark(0.85) } },     // 暗靛·忍木
	// ---- 机关 / 召唤物 ----
	lotus:      { cell: [19, 16], hue: 0.42, opts: { satBoost: 1.00, greySat: 0.18, lum: lumDark(0.80) } },     // 翡翠深·莲台
	rot_heart:  { cell: [16, 16], hue: 0.24, opts: { satBoost: 1.00, greySat: 0.18, lum: (l) => l } },          // 病绿·腐心
	pylon:      { cell: [10, 20], hue: 0.75, opts: { satBoost: 1.00, greySat: 0.22, lum: lumDark(0.85) } },     // 暗紫电·能量塔（主体灰色注入紫）
	// ---- vault 系（保持形状表意，只换色）----
	vault_mirror:      { cell: [16, 23], hue: 0.11, opts: { satBoost: 1.00, greySat: 0.22, lum: (l) => l } },   // 琥珀金·秘库魔镜
	vault_tokens_door: { cell: [16, 16], hue: 0.11, opts: { satBoost: 1.00, greySat: 0.22, lum: (l) => l } },   // 琥珀金·秘库符门
};

// Sprite.java 文件名与蛇形命名不一致 / 帧格定义不在 sprites/ 目录的手工对账
// （HawkSprite/NinjaLogSprite 是内嵌类，amulet/pet 无精灵类——均由上方手工核对，跳过脚本对账）
const JAVA_NAME = { amulet: null, pet: null, spirit_hawk: null, ninja_log: null, wards: null };
const javaNameOf = (name) => {
	if (name in JAVA_NAME) return null;
	return name.split('_').map((s) => s[0].toUpperCase() + s.slice(1)).join('') + 'Sprite.java';
};

// 校验：帧格没覆盖到的边角余料必须全透明，否则 outline 的行为可能越界
function checkSlack(img, cw, ch, label) {
	const cols = Math.floor(img.width / cw);
	const fullRows = Math.floor(img.height / ch);
	const msgs = [];
	for (let y = 0; y < img.height; y++) for (let x = cols * cw; x < img.width; x++) {
		if (getPx(img, x, y)[3] !== 0) msgs.push(`${label}: 右侧余料 (${x},${y}) 非透明`);
	}
	for (let y = fullRows * ch; y < img.height; y++) for (let x = 0; x < cols * cw; x++) {
		if (getPx(img, x, y)[3] !== 0) msgs.push(`${label}: 底部余料 (${x},${y}) 非透明`);
	}
	return msgs;
}

// ---------- main ----------
fs.mkdirSync(SNAP, { recursive: true });

const films = scanSpriteFilms();
const codec = await openCodec();
const failures = [];
const report = [];

for (const [name, cfg] of Object.entries(PROPS)) {
	const file = assetPath(`sprites/${name}.png`);
	const snapFile = path.join(SNAP, `${name}.png`);
	if (!fs.existsSync(snapFile)) fs.copyFileSync(file, snapFile);

	const orig = await codec.decode(snapFile); // 幂等：永远从原始快照处理
	const [cw, ch] = cfg.cell;

	// 断言1: 帧格尺寸与 Sprite.java 对账（手工核对过的除外）
	const jf = javaNameOf(name);
	if (jf && films[jf] && films[jf].cell &&
		(films[jf].cell[0] !== cw || films[jf].cell[1] !== ch)) {
		failures.push(`${name}: 脚本帧格 ${cfg.cell} != Sprite.java ${films[jf].cell}`);
	}

	// 断言2: 余料透明校验
	const slack = checkSlack(orig, cw, ch, name);
	if (slack.length) failures.push(...slack);

	// 是否存在透明像素：全不透明贴图（如整块符门地砖）无帧内描边空间，跳过 outline
	let hasTrans = false;
	for (let i = 3; i < orig.data.length; i += 4) {
		if (orig.data[i] === 0) { hasTrans = true; break; }
	}

	// rehue（专属主色调，保明暗）
	const img = cloneImage(orig);
	rehue(img, cfg.hue, cfg.opts);

	// 帧内 1px 描边（全不透明贴图跳过）
	if (hasTrans) outline(img, cw, ch, INDIGO);

	// 断言3: 尺寸不变
	if (img.width !== orig.width || img.height !== orig.height) {
		failures.push(`${name}: 尺寸变化! ${orig.width}x${orig.height} -> ${img.width}x${img.height}`);
	}
	// 断言4: alpha 只允许在描边像素处 0->255（形状不变，不丢失任何可见像素）
	let alphaDiff = 0;
	for (let i = 0; i < orig.data.length; i += 4) {
		if (orig.data[i + 3] === img.data[i + 3]) continue;
		const isOutlineAdded = orig.data[i + 3] === 0 && img.data[i + 3] === 255 &&
			img.data[i] === INDIGO[0] && img.data[i + 1] === INDIGO[1] && img.data[i + 2] === INDIGO[2];
		if (!isOutlineAdded) alphaDiff++;
	}
	if (alphaDiff > 0) failures.push(`${name}: alpha 异常变化 ${alphaDiff} 像素（非描边位置）`);
	// 断言5: 换色生效（可见像素——非纯黑——中颜色被改写的占比）
	let visible = 0, changed = 0;
	for (let i = 0; i < orig.data.length; i += 4) {
		if (orig.data[i + 3] === 0) continue;
		if (Math.max(orig.data[i], orig.data[i + 1], orig.data[i + 2]) <= 20) continue;
		visible++;
		if (orig.data[i] !== img.data[i] || orig.data[i + 1] !== img.data[i + 1] || orig.data[i + 2] !== img.data[i + 2]) changed++;
	}
	const ratio = changed / visible;
	if (ratio < 0.6) failures.push(`${name}: 换色覆盖不足 ${(ratio * 100).toFixed(1)}%`);
	// 断言6: 描边色存在
	let outlined = 0;
	for (let i = 0; i < img.data.length; i += 4) {
		if (img.data[i + 3] === 255 && img.data[i] === INDIGO[0] && img.data[i + 1] === INDIGO[1] && img.data[i + 2] === INDIGO[2]) outlined++;
	}
	if (hasTrans && outlined === 0) failures.push(`${name}: 未检出描边色 #12101F`);

	await codec.encode(img, file);
	report.push({ name, dim: `${img.width}x${img.height}`, cell: `${cw}x${ch}`, hue: cfg.hue.toFixed(2), changed: (ratio * 100).toFixed(1) + '%', outline: hasTrans ? outlined : 'n/a' });
	console.log(`✓ ${name}.png ${img.width}x${img.height} cell=${cw}x${ch} hue=${cfg.hue.toFixed(2)} changed=${(ratio * 100).toFixed(1)}% outline_px=${hasTrans ? outlined : 'n/a(全不透明)'}`);
}

await codec.close();
if (failures.length) {
	console.error('\n校验失败:');
	failures.forEach((f) => console.error('  ✗ ' + f));
	process.exit(1);
}
console.log(`\n全部完成（${report.length} 个文件），帧格/尺寸/alpha/换色/描边断言通过。快照: ${SNAP}`);
