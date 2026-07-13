import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { db, bootstrapAdmin } from './db.js';
import { loadGuest, authRouter } from './auth.js';
import { mediaRouter } from './media.js';
import { galleryRouter } from './gallery.js';
import { downloadRouter } from './download.js';
import { requeueUnprocessed } from './processing.js';
import { integritySweep, diskInfo } from './maintenance.js';

bootstrapAdmin();
requeueUnprocessed();
// Repair desyncs left by any crash mid-upload (missing originals → failed, drop orphans).
{
  const sweep = integritySweep({ fix: true });
  if (sweep.missingOriginals.length || sweep.orphanOriginals.length) {
    console.log(
      `Integrity sweep: ${sweep.missingOriginals.length} rows missing originals (flagged failed), ` +
        `${sweep.orphanOriginals.length} orphan file(s) removed.`
    );
  }
}

const app = express();
app.disable('x-powered-by');
// Behind the Cloudflare tunnel the app sees proxied requests; trust X-Forwarded-* for req.ip / secure cookies.
app.set('trust proxy', true);

// Structured one-line request log (method, path, status, ms, guest) — skips media/static noise.
if (config.logRequests) {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      if (req.path.startsWith('/media/') || req.path.startsWith('/assets/')) return;
      const who = req.guest ? `g${req.guest.id}` : '-';
      console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms ${who}`);
    });
    next();
  });
}

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser(config.sessionSecret));
app.use(loadGuest);

app.get('/api/health', (_req, res) => {
  const media = db.prepare('SELECT COUNT(*) AS n FROM media').get().n;
  const disk = diskInfo();
  res.json({
    ok: true,
    media,
    uptimeSec: Math.round(process.uptime()),
    diskFreeGb: disk ? +(disk.freeBytes / 1e9).toFixed(1) : null,
  });
});

app.use(authRouter);
app.use(mediaRouter);
app.use(galleryRouter);
app.use(downloadRouter);

// Production: serve the built frontend. In dev, Vite serves pages and proxies /api here.
if (fs.existsSync(config.distDir)) {
  // Gallery requires a session; login page is public.
  const gate = (req, res, next) => (req.guest ? next() : res.redirect('/login.html'));
  app.get(['/', '/index.html'], gate, (_req, res) => {
    res.sendFile(path.join(config.distDir, 'index.html'));
  });
  app.use(express.static(config.distDir));
  app.get(/^\/(?!api\/|media\/).*/, gate, (_req, res) => {
    res.sendFile(path.join(config.distDir, 'index.html'));
  });
}

app.listen(config.port, () => {
  console.log(`#LoveWins. The Aftermath — listening on :${config.port} (data: ${config.dataDir})`);
});
