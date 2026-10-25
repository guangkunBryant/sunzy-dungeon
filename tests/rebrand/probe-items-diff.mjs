// temp probe: compare original backup vs written atlas pixel-for-pixel, then verify idempotency
import { openCodec } from './lib.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const codec = await openCodec();
const a = await codec.decode(path.join(HERE, '.backup-items/items.png'));
const z = await codec.decode(path.join(HERE, '../../core/src/main/assets/sprites/items.png'));
let diff = 0, opaqueDiff = 0, semiDiff = 0;
for (let i = 0; i < a.data.length; i += 4) {
	if (a.data[i] !== z.data[i] || a.data[i + 1] !== z.data[i + 1] || a.data[i + 2] !== z.data[i + 2] || a.data[i + 3] !== z.data[i + 3]) {
		diff++;
		if (z.data[i + 3] === 255) opaqueDiff++; else semiDiff++;
	}
}
console.log('orig-vs-final total diff px:', diff, ' fully-opaque diff px:', opaqueDiff, ' semi-alpha diff px:', semiDiff);
await codec.close();
