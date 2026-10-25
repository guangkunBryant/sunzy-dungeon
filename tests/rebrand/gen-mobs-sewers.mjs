// sunzy rebrand — 下水道区域怪物精灵重配（只改像素颜色 + 帧内描边，帧网格/帧数/落点不变）
// 用法: 在 tests/ 下运行  node rebrand/gen-mobs-sewers.mjs
// 流程: decode -> rehue(专属主色调, 保明暗) -> outline(#12101F, 按帧格尺寸) -> encode
import {
	openCodec, assetPath, mapPixels, rgb2hsl, hsl2rgb, getPx, setPx,
	makeImage, cloneImage, outline, scanSpriteFilms,
} from './lib.mjs';

const INDIGO = [18, 16, 31]; // #12101F 1px 深靛蓝描边

// ---------- 每怪专属主色调 ----------
// rehue: 所有不透明像素统一重上色为 hue（保留原明暗结构），灰色像素给 greySat 的淡同色调，
//        彩色像素饱和度乘 satBoost，lum 可压暗/提亮（暗调锐利）。
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

// name -> { cell:[w,h] (来自 XxxSprite.java 的 TextureFilm), hue, opts }
const MOBS = {
	rat:            { cell: [16, 15], hue: 0.75, opts: { satBoost: 0.85, greySat: 0.18, lum: lumDark(0.94) } },  // 紫灰（rat+albino 共图，取双方都成立的苍白紫）
	gnoll:          { cell: [12, 15], hue: 0.03, opts: { satBoost: 1.10, greySat: 0.22, lum: lumDark(0.90) } },  // 锈红
	gnoll_guard:    { cell: [12, 16], hue: 0.06, opts: { satBoost: 1.25, greySat: 0.25, lum: lumBright(0.95) } }, // 锈橙·亮
	gnoll_sapper:   { cell: [12, 15], hue: 0.09, opts: { satBoost: 0.95, greySat: 0.20, lum: lumDark(0.80) } },  // 赭褐·暗
	gnoll_geomancer:{ cell: [12, 16], hue: 0.88, opts: { satBoost: 1.10, greySat: 0.22, lum: lumDark(0.86) } },  // 暗紫红
	crab:           { cell: [16, 16], hue: 0.52, opts: { satBoost: 1.15, greySat: 0.20, lum: lumDark(0.90) } },  // 青蓝
	skeleton:       { cell: [12, 15], hue: 0.58, opts: { satBoost: 0.70, greySat: 0.14, lum: lumBright(1.05) } }, // 冷蓝白
	snake:          { cell: [12, 11], hue: 0.38, opts: { satBoost: 1.05, greySat: 0.20, lum: lumDark(0.75) } },  // 墨绿
	thief:          { cell: [12, 13], hue: 0.93, opts: { satBoost: 1.00, greySat: 0.20, lum: lumDark(0.80) } },  // 暗紫红
	bat:            { cell: [15, 15], hue: 0.78, opts: { satBoost: 0.90, greySat: 0.15, lum: lumDark(0.65) } },  // 紫黑
	guard:          { cell: [12, 16], hue: 0.60, opts: { satBoost: 0.90, greySat: 0.22, lum: lumDark(0.85) } },  // 铁蓝
	wraith:         { cell: [14, 15], hue: 0.50, opts: { satBoost: 0.80, greySat: 0.18, lum: lumBright(1.05) } }, // 苍青
	swarm:          { cell: [16, 16], hue: 0.12, opts: { satBoost: 1.00, greySat: 0.20, lum: lumDark(0.80) } },  // 暗金褐
};

// skeleton.png 特例：SkeletonSprite 用 12x15（帧 0..20，第 0 行 y0..14），
// Vault 子类用 12x16（帧偏移 21，第 1 行 y16..31）。两行帧高不同，需分区描边。
function skeletonFilmRows() { return [{ y: 0, h: 15 }, { y: 16, h: 16 }]; }

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

// 从 img 拷出区域 -> 独立小图（用于 skeleton 双行分区处理）
function crop(img, x0, y0, w, h) {
	const out = makeImage(w, h);
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setPx(out, x, y, getPx(img, x0 + x, y0 + y));
	return out;
}
function paste(img, sub, x0, y0) {
	for (let y = 0; y < sub.height; y++) for (let x = 0; x < sub.width; x++) setPx(img, x0 + x, y0 + y, getPx(sub, x, y));
}

// ---------- main ----------
const films = scanSpriteFilms();
const codec = await openCodec();
const failures = [];

for (const [name, cfg] of Object.entries(MOBS)) {
	const file = assetPath(`sprites/${name}.png`);
	const orig = await codec.decode(file);

	// 1) 帧格尺寸与 Sprite.java 对账（skeleton 除外，它需要手写两行）
	if (name !== 'skeleton') {
		const javaName = name.split('_').map((s) => s[0].toUpperCase() + s.slice(1)).join('') + 'Sprite.java';
		const java = films[javaName];
		if (java && java.cell && (java.cell[0] !== cfg.cell[0] || java.cell[1] !== cfg.cell[1])) {
			failures.push(`${name}: 脚本帧格 ${cfg.cell} != Sprite.java ${java.cell}`);
		}
	}

	// 2) 余料透明校验
	const slack = name === 'skeleton'
		? [...checkSlack(crop(orig, 0, 0, orig.width, 15), cfg.cell[0], 15, name + '#row0'),
		   ...checkSlack(crop(orig, 0, 16, orig.width, 16), cfg.cell[0], 16, name + '#row1')]
		: checkSlack(orig, cfg.cell[0], cfg.cell[1], name);
	if (slack.length) failures.push(...slack);

	// 3) rehue（专属主色调，保明暗）
	const img = cloneImage(orig);
	rehue(img, cfg.hue, cfg.opts);

	// 4) 帧内 1px 描边（按各怪帧格尺寸）
	if (name === 'skeleton') {
		for (const row of skeletonFilmRows()) {
			const sub = crop(img, 0, row.y, img.width, row.h);
			outline(sub, 12, row.h, INDIGO);
			paste(img, sub, 0, row.y);
		}
	} else {
		outline(img, cfg.cell[0], cfg.cell[1], INDIGO);
	}

	// 5) 尺寸不变写回
	if (img.width !== orig.width || img.height !== orig.height) {
		failures.push(`${name}: 尺寸变化! ${orig.width}x${orig.height} -> ${img.width}x${img.height}`);
	}
	await codec.encode(img, file);
	console.log(`✓ ${name}.png ${orig.width}x${orig.height} cell=${cfg.cell[0]}x${cfg.cell[1]} hue=${cfg.hue}`);
}

await codec.close();
if (failures.length) {
	console.error('\n校验失败:');
	failures.forEach((f) => console.error('  ✗ ' + f));
	process.exit(1);
}
console.log('\n全部完成，帧格/尺寸校验通过。');
