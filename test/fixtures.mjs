// Generate real image bytes for upload tests (no fixture files on disk).
import sharp from 'sharp';

export function jpeg(seed = 0) {
  const r = (seed * 53) % 256;
  const g = (seed * 97) % 256;
  const b = (seed * 29) % 256;
  return sharp({ create: { width: 400 + seed, height: 300, channels: 3, background: { r, g, b } } })
    .jpeg()
    .toBuffer();
}

export function png(seed = 0) {
  return sharp({ create: { width: 200, height: 200, channels: 4, background: { r: seed % 256, g: 10, b: 10, alpha: 1 } } })
    .png()
    .toBuffer();
}
