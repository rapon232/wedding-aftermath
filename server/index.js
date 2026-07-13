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

bootstrapAdmin();
requeueUnprocessed();

const app = express();
app.disable('x-powered-by');
// Behind the Cloudflare tunnel the app sees proxied requests; trust X-Forwarded-* for req.ip / secure cookies.
app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser(config.sessionSecret));
app.use(loadGuest);

app.get('/api/health', (_req, res) => {
  const media = db.prepare('SELECT COUNT(*) AS n FROM media').get().n;
  res.json({ ok: true, media });
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
