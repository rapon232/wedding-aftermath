// Build both site frontends: dist/en (aftermath.mitio.tech) and dist/bg
// (bg.aftermath.mitio.tech), then overlay branding/bg (spade icons, BG
// manifest, BG og-image) onto the Bulgarian dist. The server picks its dist
// via the SITE env var.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
process.chdir(ROOT);

fs.rmSync('dist', { recursive: true, force: true }); // no stale root-level dist from older single-site builds

for (const site of ['en', 'bg']) {
  execSync(`npx vite build --outDir dist/${site}`, {
    stdio: 'inherit',
    env: { ...process.env, VITE_SITE: site },
  });
}

const overlay = path.join(ROOT, 'branding', 'bg');
for (const f of fs.readdirSync(overlay)) {
  fs.copyFileSync(path.join(overlay, f), path.join(ROOT, 'dist', 'bg', f));
}
console.log(`\n✓ dist/en + dist/bg built (bg overlay: ${fs.readdirSync(overlay).join(', ')})`);
