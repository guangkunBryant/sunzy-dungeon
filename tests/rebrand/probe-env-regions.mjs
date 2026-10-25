// 探针：统计 6 张区域地形原图的色相分布（每 0.05 一个桶，s>=0.1 且 a>0 的像素），
// 用于在写 gen-env-regions.mjs 前确定各图的带限区间。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openCodec, assetPath, rgb2hsl } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKUP = path.join(HERE, '.backup-env-regions');
const FILES = [
	'tiles_prison.png', 'tiles_caves.png', 'tiles_caves_crystal.png',
	'tiles_caves_gnoll.png', 'tiles_city.png', 'tiles_halls.png',
];

const codec = await openCodec();
for (const f of FILES) {
	const dst = assetPath('environment/' + f);
	fs.mkdirSync(BACKUP, { recursive: true });
	const src = path.join(BACKUP, f);
	if (!fs.existsSync(src)) fs.copyFileSync(dst, src); // 首跑快照原图
	const img = await codec.decode(src);

	const buckets = new Array(20).fill(0);
	let grey = 0, opaque = 0, transp = 0, lumSum = 0, lumN = 0;
	const lumByHue = new Array(20).fill(0);
	for (let i = 0; i < img.data.length; i += 4) {
		const a = img.data[i + 3];
		if (a === 0) { transp++; continue; }
		opaque++;
		const [h, s, l] = rgb2hsl(img.data[i], img.data[i + 1], img.data[i + 2]);
		lumSum += l; lumN++;
		if (s < 0.1) { grey++; continue; }
		const b = Math.min(19, Math.floor(h * 20));
		buckets[b]++;
		lumByHue[b] += l;
	}
	const pct = (n) => (100 * n / Math.max(1, opaque)).toFixed(1) + '%';
	const lines = [];
	for (let b = 0; b < 20; b++) {
		if (!buckets[b]) continue;
		const lo = (b * 0.05).toFixed(2), hi = ((b + 1) * 0.05).toFixed(2);
		lines.push(`  h ${lo}-${hi}: ${pct(buckets[b])} (avgL ${(lumByHue[b] / buckets[b]).toFixed(2)})`);
	}
	console.log(`\n${f} (${img.width}x${img.height}) opaque=${opaque} transp=${transp} grey(s<0.1)=${pct(grey)} avgL=${(lumSum / Math.max(1, lumN)).toFixed(2)}`);
	console.log(lines.join('\n'));
}
await codec.close();
console.log('\nprobe OK — originals snapshotted in tests/rebrand/.backup-env-regions/');
