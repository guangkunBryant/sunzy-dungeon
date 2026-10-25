// probe: 帧格余料透明性检查（film 帧格 vs PNG 尺寸）
import { openCodec, assetPath, getPx } from './lib.mjs';

const codec = await openCodec();
const cases = [
	['spirit_hawk', 15, 15], ['ninja_log', 11, 12], ['lotus', 19, 16],
	['pylon', 10, 20], ['rot_heart', 16, 16], ['vault_mirror', 16, 23],
	['vault_tokens_door', 16, 16], ['pet', 16, 16], ['wards', 16, 16],
	['amulet', 16, 16],
];
for (const [name, cw, ch] of cases) {
	const img = await codec.decode(assetPath(`sprites/${name}.png`));
	const cols = Math.floor(img.width / cw), rows = Math.floor(img.height / ch);
	let badX = 0, badY = 0;
	for (let y = 0; y < img.height; y++) for (let x = cols * cw; x < img.width; x++) if (getPx(img, x, y)[3] !== 0) badX++;
	for (let y = rows * ch; y < img.height; y++) for (let x = 0; x < cols * cw; x++) if (getPx(img, x, y)[3] !== 0) badY++;
	console.log(`${name} ${img.width}x${img.height} cell=${cw}x${ch} cols=${cols} rows=${rows} slackX_bad=${badX} slackY_bad=${badY}`);
}
await codec.close();
