// Generate the home-screen / PWA shortcut icons (icon-192, icon-512) for both
// sites from the committed source SVGs. icon-512 is declared "any maskable", so
// the artwork sits at ~82% of the canvas on a cream field — that safe-zone
// padding keeps Android's maskable crop from clipping it. Rerun after changing
// a source SVG:  node scripts/make-icons.mjs
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CREAM = { r: 247, g: 243, b: 238, alpha: 1 }; // matches manifest background_color

// EN icons live in public/ (the shared base); BG overrides via branding/bg/.
const TARGETS = [
  { svg: 'branding/it-wedding-icon.svg', outDir: 'public' },
  { svg: 'branding/bg-wedding-icon.svg', outDir: 'branding/bg' },
];

for (const { svg, outDir } of TARGETS) {
  for (const size of [192, 512]) {
    const inner = Math.round(size * 0.82);
    const pad = Math.round((size - inner) / 2);
    const art = await sharp(path.join(ROOT, svg), { density: 384 })
      .resize(inner, inner, { fit: 'contain', background: CREAM })
      .toBuffer();
    await sharp({ create: { width: size, height: size, channels: 4, background: CREAM } })
      .composite([{ input: art, top: pad, left: pad }])
      .png()
      .toFile(path.join(ROOT, outDir, `icon-${size}.png`));
    console.log(`✓ ${outDir}/icon-${size}.png`);
  }
}
