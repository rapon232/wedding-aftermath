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
import { socialRouter } from './social.js';
import { sseHandler } from './events.js';
import { requeueUnprocessed } from './processing.js';
import { integritySweep, diskInfo } from './maintenance.js';
import { emailConfigured } from './email.js';

bootstrapAdmin();
requeueUnprocessed();
// Repair desyncs left by any crash mid-upload. Safe by design: never deletes
// originals (quarantines to trash/), and refuses if the DB looks lost/mismounted.
{
  const sweep = integritySweep({ fix: true });
  if (sweep.refused) {
    console.warn(
      `⚠ Integrity sweep REFUSED: DB has 0 media rows but ${sweep.orphanOriginals.length} original file(s) exist. ` +
        `The database may be missing or the data volume mismounted — NOT touching any files. ` +
        `Check DATA_DIR and restore db.sqlite from backup.`
    );
  } else if (sweep.missingOriginals.length || sweep.orphanOriginals.length) {
    console.log(
      `Integrity sweep: ${sweep.missingOriginals.length} row(s) missing originals (flagged failed), ` +
        `${sweep.orphanOriginals.length} orphan original(s) quarantined to trash/.`
    );
  }
}

const app = express();
app.disable('x-powered-by');
// Behind the Cloudflare tunnel there is exactly one proxy hop (cloudflared).
// Trust only that hop so req.ip is the real client IP and not a client-spoofable
// X-Forwarded-For value (which would defeat the login throttle).
app.set('trust proxy', 1);

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

app.get('/api/health', (req, res) => {
  // Public probe stays a bare liveness check — no operational details leaked.
  if (!req.guest?.is_admin) return res.json({ ok: true });
  // Admins (signed in, in-browser) get the full diagnostic, incl. the email flag.
  const media = db.prepare('SELECT COUNT(*) AS n FROM media').get().n;
  const disk = diskInfo();
  res.json({
    ok: true,
    media,
    uptimeSec: Math.round(process.uptime()),
    diskFreeGb: disk ? +(disk.freeBytes / 1e9).toFixed(1) : null,
    email: emailConfigured(), // quick check that the invite key reached the container
  });
});

app.get('/api/events', loadGuest, (req, res) => {
  if (!req.guest) return res.status(401).end();
  sseHandler(req, res);
});

app.use(authRouter);
app.use(mediaRouter);
app.use(galleryRouter);
app.use(downloadRouter);
app.use(socialRouter);

// Production: serve the built frontend. In dev, Vite serves pages and proxies /api here.
if (fs.existsSync(config.distDir)) {
  // Root serves the gallery when signed in, otherwise the login page — as a 200,
  // NOT a redirect, so link-preview scrapers (which often don't follow 302s) still
  // read the Open Graph tags on login.html.
  app.get(['/', '/index.html'], (req, res) => {
    res.sendFile(path.join(config.distDir, req.guest ? 'index.html' : 'login.html'));
  });
  // Bare /favicon.ico (requested by browsers regardless of <link>) — serve the icon,
  // don't let it fall through to the auth gate and return HTML.
  app.get('/favicon.ico', (_req, res) => res.sendFile(path.join(config.distDir, 'favicon-32.png')));
  app.use(express.static(config.distDir));
  const gate = (req, res, next) => (req.guest ? next() : res.redirect('/login.html'));
  app.get(/^\/(?!api\/|media\/).*/, gate, (_req, res) => {
    res.sendFile(path.join(config.distDir, 'index.html'));
  });
}

app.listen(config.port, () => {
  console.log(`#LoveWins. The Aftermath — listening on :${config.port} (data: ${config.dataDir})`);
});
