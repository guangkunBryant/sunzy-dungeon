// probe: custom_tiles + props sprites 的尺寸与色相分布，用于决定每文件的目标色相
import { openCodec, assetPath, rgb2hsl } from './lib.mjs';
import fs from 'fs';
import path from 'path';

const codec = await openCodec();

function hueHist(img) {
	const bands = {};
	let opaque = 0, satN = 0, minL = 1, maxL = 0;
	for (let i = 0; i < img.data.length; i += 4) {
		if (img.data[i + 3] === 0) continue;
		opaque++;
		const [h, s, l] = rgb2hsl(img.data[i], img.data[i + 1], img.data[i + 2]);
		minL = Math.min(minL, l); maxL = Math.max(maxL, l);
		if (s < 0.10) continue;
		satN++;
		const b = Math.floor(h * 20) / 20;
		bands[b] = (bands[b] || 0) + 1;
	}
	const top = Object.entries(bands).sort((a, b) => b[1] - a[1]).slice(0, 4)
		.map(([b, n]) => `${(+b).toFixed(2)}:${((n / Math.max(1, satN)) * 100).toFixed(0)}%`).join(' ');
	return `opaque=${opaque} sat%=${((satN / Math.max(1, opaque)) * 100).toFixed(0)} L=[${minL.toFixed(2)},${maxL.toFixed(2)}] hue-bands: ${top || '-'}`;
}

const props = ['amulet', 'pet', 'spirit_hawk', 'wards', 'ninja_log', 'lotus', 'rot_heart', 'pylon', 'vault_mirror', 'vault_tokens_door'];
console.log('=== props ===');
for (const p of props) {
	const f = assetPath(`sprites/${p}.png`);
	const img = await codec.decode(f);
	console.log(`${p}.png ${img.width}x${img.height} ${hueHist(img)}`);
}

const tiles = fs.readdirSync(assetPath('environment/custom_tiles'));
console.log('\n=== custom_tiles ===');
for (const t of tiles) {
	const f = assetPath(`environment/custom_tiles/${t}`);
	const img = await codec.decode(f);
	console.log(`${t} ${img.width}x${img.height} ${hueHist(img)}`);
}

await codec.close();
