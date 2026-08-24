// One-off generator for the BG site's spade icon set (branding/bg/). Outputs are
// committed; rerun only if the design changes: node scripts/make-bg-icons.mjs
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'branding', 'bg');
fs.mkdirSync(OUT, { recursive: true });

// Matches the EN icons' palette (manifest theme/background colors): cream tile,
// bordeaux spade, rounded corners like a home-screen icon.
const tile = (
  size,
) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
  <rect width="64" height="64" rx="14" fill="#f7f3ee"/>
  <path fill="#7b2d42" d="M32 8 C 27 17, 13 22.5, 13 33 c 0 6 4.6 10.3 10.3 10.3 2.9 0 5.4-1 7.2-2.7 C 29.6 45.8 28 50 24.5 53.5 h 15 C 36 50, 34.4 45.8, 33.5 40.6 c 1.8 1.7 4.3 2.7 7.2 2.7 C 46.4 43.3, 51 39, 51 33 C 51 22.5, 37 17, 32 8 Z"/>
</svg>`;

for (const [file, size] of [
  ['favicon-32.png', 32],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
]) {
  await sharp(Buffer.from(tile(size)))
    .png()
    .toFile(path.join(OUT, file));
  console.log('✓', file);
}

// The EN favicon.svg is just an emoji in SVG — mirror that with the spade.
fs.writeFileSync(
  path.join(OUT, 'favicon.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text x="32" y="50" font-size="52" text-anchor="middle">♠️</text></svg>\n',
);
console.log('✓ favicon.svg');
