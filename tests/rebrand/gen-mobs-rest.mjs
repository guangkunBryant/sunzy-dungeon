// sunzy rebrand — 剩余怪物与 NPC 精灵重配（只改像素颜色 + 帧内描边，帧网格/帧数/落点不变）
// 用法: 在 tests/ 下运行  node rebrand/gen-mobs-rest.mjs
// 流程: 快照 .backup-mobs-rest/ -> 从快照处理(幂等) -> rehue(专属主色调,保明暗) -> outline(#12101F,按帧格尺寸) -> 数值断言 -> 写回
import {
	openCodec, assetPath, mapPixels, rgb2hsl, hsl2rgb, getPx, setPx,
	makeImage, cloneImage, outline, scanSpriteFilms,
} from './lib.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SNAP = path.join(path.dirname(fileURLToPath(import.meta.url)), '.backup-mobs-rest');
const INDIGO = [18, 16, 31]; // #12101F 1px 深靛蓝描边

// ---------- 每怪专属主色调 ----------
// rehue: 所有不透明像素统一重上色为 hue（%1 回绕，规避 lib rgb2hsl 纯红边界 bug 的下游影响），
//        保留原明暗结构；灰色像素(s<0.08)给 greySat 的淡同色调（近白像素 l 压到 0.95 以下，
//        否则纯白 l=1 无法上色——ghost 这类白模贴图也能换色相）；彩色像素饱和度乘 satBoost。
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
const lumBright = (f) => (f === undefined ? (l) => Math.min(1, l * 1.1 + 0.06) : (l) => Math.min(1, l * f + 0.06));

// name -> { cell:[w,h] (Sprite.java 手工对账), hue, opts, rows? (非均匀网格时手写行带) }
const MOBS = {
	// ---- 普通怪 ----
	bee:              { cell: [16, 16], hue: 0.16, opts: { satBoost: 1.15, greySat: 0.22, lum: lumDark(0.92) } },  // 蜜金
	brute:            { cell: [12, 16], hue: 0.11, opts: { satBoost: 1.20, greySat: 0.22, lum: lumDark(0.90) } },  // 锈橙（gnoll 族· brute）
	dm100:            { cell: [16, 14], hue: 0.55, opts: { satBoost: 1.10, greySat: 0.20, lum: lumDark(0.88) } },  // 电青
	elemental:        { cell: [12, 14], hue: 0.95, opts: { satBoost: 1.20, greySat: 0.20, lum: lumDark(0.92) } },  // 绯红（elemental+newborn 共图）
	eye:              { cell: [16, 18], hue: 0.83, opts: { satBoost: 1.20, greySat: 0.20, lum: lumDark(0.85) } },  // 紫红魔眼
	ghoul:            { cell: [12, 14], hue: 0.30, opts: { satBoost: 0.90, greySat: 0.18, lum: lumDark(0.80) } },  // 橄榄绿·暗
	golem:            { cell: [17, 19], hue: 0.36, opts: { satBoost: 1.00, greySat: 0.20, lum: lumDark(0.88) } },  // 暗金绿
	guardian:         { cell: [12, 15], hue: 0.65, opts: { satBoost: 0.90, greySat: 0.20, lum: lumDark(0.88) } },  // 青蓝法卫
	larva:            { cell: [12, 8],  hue: 0.90, opts: { satBoost: 0.90, greySat: 0.18, lum: lumDark(0.85) } },  // 淡紫粉幼虫
	mimic:            { cell: [16, 16], hue: 0.14, opts: { satBoost: 1.10, greySat: 0.20, lum: lumDark(0.88) } },  // 暗金宝箱怪
	monk:             { cell: [15, 14], hue: 0.97, opts: { satBoost: 1.00, greySat: 0.20, lum: lumDark(0.85) } },  // 深洋红（monk+senior 共图）
	necromancer:      { cell: [16, 16], hue: 0.28, opts: { satBoost: 0.95, greySat: 0.18, lum: lumDark(0.80) } },  // 死灵绿（necro+spectral 共图）
	piranha:          { cell: [12, 16], hue: 0.99, opts: { satBoost: 1.15, greySat: 0.20, lum: lumDark(0.85) } },  // 血红
	ripper:           { cell: [15, 14], hue: 0.97, opts: { satBoost: 1.15, greySat: 0.20, lum: lumDark(0.82) } },  // 暗血紫红
	rot_lasher:       { cell: [12, 16], hue: 0.24, opts: { satBoost: 1.00, greySat: 0.18, lum: lumDark(0.85) } },  // 腐绿藤怪
	scorpio:          { cell: [17, 17], hue: 0.87, opts: { satBoost: 1.10, greySat: 0.20, lum: lumDark(0.85) } },  // 紫蝎（scorpio+acidic 共图）
	shaman:           { cell: [12, 15], hue: 0.70, opts: { satBoost: 1.10, greySat: 0.20, lum: lumDark(0.85) } },  // 紫蓝电沙满
	sheep:            { cell: [16, 15], hue: 0.85, opts: { satBoost: 0.50, greySat: 0.12, lum: lumBright(0.98) } }, // 淡粉紫·柔
	slime:            { cell: [14, 12], hue: 0.41, opts: { satBoost: 1.05, greySat: 0.18, lum: lumDark(0.88) } },  // 酸绿（slime+caustic 共图）
	statue:           { cell: [12, 15], hue: 0.63, opts: { satBoost: 0.85, greySat: 0.18, lum: lumDark(0.88) } },  // 石青蓝
	succubus:         { cell: [12, 15], hue: 0.91, opts: { satBoost: 1.15, greySat: 0.20, lum: lumDark(0.85) } },  // 妖紫
	undead:           { cell: [12, 16], hue: 0.33, opts: { satBoost: 0.85, greySat: 0.18, lum: lumDark(0.82) } },  // 灰绿行尸
	warlock:          { cell: [12, 15], hue: 0.79, opts: { satBoost: 1.00, greySat: 0.18, lum: lumDark(0.80) } },  // 紫黑妖术师
	spawner:          { cell: [16, 16], hue: 0.21, opts: { satBoost: 1.00, greySat: 0.18, lum: lumDark(0.85) } },  // 腐黄绿孵化体
	spinner:          { cell: [16, 16], hue: 0.31, opts: { satBoost: 0.90, greySat: 0.18, lum: lumDark(0.85) } },  // 蛛灰绿
	// ---- Boss（亮度/饱和拉开档次）----
	dm200:            { cell: [21, 18], hue: 0.62, opts: { satBoost: 1.25, greySat: 0.24, lum: lumBright(1.02) } }, // 铁蓝·小 Boss
	dm300:            { cell: [25, 22], hue: 0.72, opts: { satBoost: 1.30, greySat: 0.25, lum: lumBright(1.00) } }, // 暗紫电·Boss
	goo:              { cell: [20, 14], hue: 0.47, opts: { satBoost: 1.30, greySat: 0.24, lum: lumBright(1.02) } }, // 酸绿·Boss
	tengu:            { cell: [14, 16], hue: 0.01, opts: { satBoost: 1.25, greySat: 0.22, lum: lumDark(0.82) } },   // 暗绯红·Boss
	king:             { cell: [16, 16], hue: 0.75, opts: { satBoost: 1.30, greySat: 0.25, lum: lumBright(1.02) } }, // 帝王紫·Boss
	fungal_core:      { cell: [27, 27], hue: 0.23, opts: { satBoost: 1.25, greySat: 0.24, lum: lumBright(1.00) } }, // 荧孢绿·Boss
	fungal_sentry:    { cell: [18, 18], hue: 0.20, opts: { satBoost: 1.05, greySat: 0.20, lum: lumDark(0.90) } },   // 孢蓝绿
	fungal_spinner:   { cell: [16, 16], hue: 0.18, opts: { satBoost: 1.00, greySat: 0.20, lum: lumDark(0.88) } },   // 荧黄绿
	vault_boss_elemental: { cell: [31, 30], hue: 0.48, opts: { satBoost: 1.30, greySat: 0.24, lum: lumBright(1.00) } }, // 秘蓝·Boss
	yog:              { cell: [20, 19], hue: 0.84, opts: { satBoost: 1.35, greySat: 0.26, lum: lumBright(1.00) } }, // 末世紫红·终 Boss
	yog_fists:        { cell: [24, 17], hue: 0.89, opts: { satBoost: 1.25, greySat: 0.24, lum: lumBright(0.98) } }, // 暗洋红拳
	// ---- 水晶族（冰蓝同族可辨）----
	crystal_guardian: { cell: [12, 15], hue: 0.57, opts: { satBoost: 1.00, greySat: 0.20, lum: lumDark(0.90) } },   // 冰蓝守卫
	crystal_wisp:     { cell: [12, 14], hue: 0.53, opts: { satBoost: 1.05, greySat: 0.18, lum: lumBright(1.02) } }, // 冰蓝灵
	crystal_spire:    { cell: [29, 40], hue: 0.54, opts: { satBoost: 1.00, greySat: 0.20, lum: lumDark(0.92) } },   // 冰蓝尖塔
	// ---- NPC（配色柔和但换色相）----
	blacksmith:       { cell: [13, 16], hue: 0.29, opts: { satBoost: 0.80, greySat: 0.15, lum: lumDark(0.92) } },   // 苔绿 troll
	ghost:            { cell: [14, 15], hue: 0.80, opts: { satBoost: 0.55, greySat: 0.35, lum: lumBright(1.05) } }, // 柔淡紫（纯白贴图，直接在贴图上淡紫调）
	shopkeeper:       { cell: [14, 14], hue: 0.10, opts: { satBoost: 0.75, greySat: 0.15, lum: lumBright(0.98) } }, // 柔暖褐
	imp:              { cell: [12, 14], hue: 0.04, opts: { satBoost: 0.90, greySat: 0.16, lum: lumBright(0.96) } }, // 柔红
	wandmaker:        { cell: [12, 14], hue: 0.44, opts: { satBoost: 0.80, greySat: 0.15, lum: lumDark(0.92) } },   // 柔青
	sentry:           { cell: [8, 15],  hue: 0.17, opts: { satBoost: 0.90, greySat: 0.16, lum: lumBright(0.98) } }, // 琥珀（red/vaultscan/vaultlaser 共图）
	// ---- 特殊布局 ----
	ratking:          { cell: [16, 16], hue: 0.13, opts: { satBoost: 1.15, greySat: 0.22, lum: lumBright(0.98) },   // 金·鼠王
		rows: [{ y: 0, h: 16 }, { y: 16, h: 16 }, { y: 34, h: 17 }, { y: 51, h: 17 }] }, // 节日变体用 17 高帧格，偏移 34/51（RatKingSprite.java）
};

// Sprite.java 文件名与蛇形命名不一致的手工对账
const JAVA_NAME = {
	dm100: 'DM100Sprite', dm200: 'DM200Sprite', dm300: 'DM300Sprite', yog_fists: 'FistSprite',
	// sentry(纹理坐标矩形取景)、ratking(多行高帧格) 已手工核对，跳过脚本对账
	sentry: null, ratking: null,
};

const javaNameOf = (name) => {
	if (name in JAVA_NAME) return JAVA_NAME[name] && JAVA_NAME[name] + '.java';
	return name.split('_').map((s) => s[0].toUpperCase() + s.slice(1)).join('') + 'Sprite.java';
};

// 校验：帧格没覆盖到的边角余料必须全透明，否则 outline 的行为可能越界
function checkSlack(img, cw, ch, label) {
	const cols = Math.floor(img.width / cw);
	const fullRows = Math.floor(img.height / ch);
	const msgs = [];
	const slackX = img.width - cols * cw;
	const slackY = img.height - fullRows * ch;
	if (slackX > 0) {
		for (let y = 0; y < img.height; y++) for (let x = cols * cw; x < img.width; x++) {
			if (getPx(img, x, y)[3] !== 0) msgs.push(`${label}: 右侧余料 (${x},${y}) 非透明`);
		}
	}
	if (slackY > 0) {
		for (let y = fullRows * ch; y < img.height; y++) for (let x = 0; x < cols * cw; x++) {
			if (getPx(img, x, y)[3] !== 0) msgs.push(`${label}: 底部余料 (${x},${y}) 非透明`);
		}
	}
	return msgs;
}

// 从 img 拷出区域 -> 独立小图（用于多行带分区处理）
function crop(img, x0, y0, w, h) {
	const out = makeImage(w, h);
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setPx(out, x, y, getPx(img, x0 + x, y0 + y));
	return out;
}
function paste(img, sub, x0, y0) {
	for (let y = 0; y < sub.height; y++) for (let x = 0; x < sub.width; x++) setPx(img, x0 + x, y0 + y, getPx(sub, x, y));
}

// ---------- main ----------
// 1) 快照（首次运行时备份原始图，之后幂等地从快照处理）
fs.mkdirSync(SNAP, { recursive: true });

const films = scanSpriteFilms();
const codec = await openCodec();
const failures = [];
const report = [];

for (const [name, cfg] of Object.entries(MOBS)) {
	const file = assetPath(`sprites/${name}.png`);
	const snapFile = path.join(SNAP, `${name}.png`);
	if (!fs.existsSync(snapFile)) fs.copyFileSync(file, snapFile);

	const orig = await codec.decode(snapFile); // 幂等：永远从原始快照处理
	const cw = cfg.cell[0], ch = cfg.rows ? cfg.rows[0].h : cfg.cell[1];

	// 断言1: 帧格尺寸与 Sprite.java 对账（手工核对过的除外）
	const jf = javaNameOf(name);
	if (jf && films[jf] && films[jf].cell &&
		(films[jf].cell[0] !== cfg.cell[0] || films[jf].cell[1] !== cfg.cell[1])) {
		failures.push(`${name}: 脚本帧格 ${cfg.cell} != Sprite.java ${films[jf].cell}`);
	}

	// 断言2: 余料透明校验（多行带时逐带裁剪校验）
	if (cfg.rows) {
		for (const row of cfg.rows) {
			const slack = checkSlack(crop(orig, 0, row.y, orig.width, row.h), cw, row.h, `${name}#y${row.y}`);
			if (slack.length) failures.push(...slack);
		}
	} else {
		const slack = checkSlack(orig, cw, ch, name);
		if (slack.length) failures.push(...slack);
	}

	// rehue（专属主色调，保明暗）
	const img = cloneImage(orig);
	rehue(img, cfg.hue, cfg.opts);

	// 帧内 1px 描边（按各怪帧格尺寸；多行带分区描边）
	if (cfg.rows) {
		for (const row of cfg.rows) {
			const sub = crop(img, 0, row.y, img.width, row.h);
			outline(sub, cw, row.h, INDIGO);
			paste(img, sub, 0, row.y);
		}
	} else {
		outline(img, cw, ch, INDIGO);
	}

	// 断言3: 尺寸不变
	if (img.width !== orig.width || img.height !== orig.height) {
		failures.push(`${name}: 尺寸变化! ${orig.width}x${orig.height} -> ${img.width}x${img.height}`);
	}
	// 断言4: alpha 只允许在描边像素处 0->255（落脚点/形状不变，不丢失任何可见像素）
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
		if (Math.max(orig.data[i], orig.data[i + 1], orig.data[i + 2]) <= 20) continue; // 纯黑/近黑像素不计
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
	if (outlined === 0) failures.push(`${name}: 未检出描边色 #12101F`);

	await codec.encode(img, file);
	report.push({ name, dim: `${img.width}x${img.height}`, cell: `${cw}x${ch}`, hue: cfg.hue.toFixed(2), changed: (ratio * 100).toFixed(1) + '%', outline: outlined });
	console.log(`✓ ${name}.png ${img.width}x${img.height} cell=${cw}x${ch} hue=${cfg.hue.toFixed(2)} changed=${(ratio * 100).toFixed(1)}% outline_px=${outlined}`);
}

await codec.close();
if (failures.length) {
	console.error('\n校验失败:');
	failures.forEach((f) => console.error('  ✗ ' + f));
	process.exit(1);
}
console.log(`\n全部完成（${report.length} 个文件），帧格/尺寸/alpha/换色/描边断言通过。快照: ${SNAP}`);
