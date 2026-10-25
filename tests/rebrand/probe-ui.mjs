// Probe: decode UI assets, print dims + top colors per file.
import { openCodec, assetPath } from './lib.mjs';

const FILES = [
  'interfaces/chrome.png', 'interfaces/status_pane.png', 'interfaces/toolbar.png',
  'interfaces/menu_button.png', 'interfaces/menu_pane.png', 'interfaces/boss_hp.png',
  'interfaces/buffs.png', 'interfaces/large_buffs.png', 'interfaces/radial_menu.png',
  'interfaces/talent_button.png', 'interfaces/hero_icons.png', 'interfaces/icons.png',
];

const codec = await openCodec();
for (const f of FILES) {
  const img = await codec.decode(assetPath(f));
  const counts = new Map();
  let opaque = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue;
    opaque++;
    const key = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([k, n]) => '#' + k.toString(16).padStart(6, '0') + ':' + (100 * n / opaque).toFixed(1) + '%');
  console.log(`${f}  ${img.width}x${img.height}  opaque=${opaque}`);
  console.log('   ' + top.join(' '));
}
await codec.close();
