import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PROD = process.env.NODE_ENV === 'production';

// Which site this instance serves: 'en' (aftermath.mitio.tech, per-guest codes)
// or 'bg' (bg.aftermath.mitio.tech, shared code + self-registration). Picks the
// built frontend (dist/<site>) and the language of server-sent guest messages.
const SITE = process.env.SITE === 'bg' ? 'bg' : 'en';

// Guest-facing messages the server itself produces (upload guard etc.). Auth
// errors aren't here — the login page maps those to its own strings by status.
// NB: every OTHER guest string lives in src/i18n/{en,bg}.js; these two live here
// because the runtime image ships without src/. Keep wording in sync manually.
const MESSAGES = {
  en: {
    galleryFull: 'The gallery is full right now — please tell the couple.',
    uploadFlood: 'Whoa — that’s a lot at once. Give it a minute and keep going.',
  },
  bg: {
    galleryFull: 'Галерията е пълна в момента — кажи на младоженците.',
    uploadFlood: 'Уау — това е много наведнъж. Изчакай минута и продължи.',
  },
};

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET === 'change-me') {
  if (PROD) {
    console.error('SESSION_SECRET must be set to a real secret in production.');
    process.exit(1);
  }
  console.warn('⚠ SESSION_SECRET not set — using insecure dev secret.');
}

// Shared access code, normalized the way login input is (mirrors normalizeCode
// in auth.js — can't import it here without a config↔auth cycle; keep in sync).
// The login field accepts exactly 8 characters, so any other length is a code
// no guest could ever type — refuse to ship that misconfiguration.
const SHARED_CODE = String(process.env.SHARED_CODE || '')
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, '');
if (SHARED_CODE && SHARED_CODE.length !== 8) {
  console.error(
    `SHARED_CODE must normalize to exactly 8 characters — got "${SHARED_CODE}" (${SHARED_CODE.length}). Guests can only type 8.`,
  );
  if (PROD) process.exit(1);
}

export const config = {
  prod: PROD,
  port: Number(process.env.PORT) || 3000,
  sessionSecret: SESSION_SECRET && SESSION_SECRET !== 'change-me' ? SESSION_SECRET : 'dev-secret-do-not-use',
  dataDir: path.resolve(ROOT, process.env.DATA_DIR || './data'),
  site: SITE,
  msg: MESSAGES[SITE],
  distDir: path.resolve(ROOT, process.env.DIST_DIR || path.join('dist', SITE)),
  // Shared access code (normalized like any code). When set, entering it on the
  // login page asks for name+email and self-registers the guest; personal codes
  // keep working. Unset (the default) → classic per-guest codes only.
  sharedCode: SHARED_CODE,
  adminName: process.env.ADMIN_NAME || 'Admin',
  // Where the wedding happened. Photo EXIF timestamps are timezone-naive wall-clock
  // times; we interpret them in this zone (server may be elsewhere, e.g. Sofia).
  // Also used to display all times in event-local time.
  eventTz: process.env.EVENT_TZ || 'Europe/Rome',
  // Session cookie lifetime: 180 days
  sessionMaxAgeMs: 180 * 24 * 60 * 60 * 1000,
  // Per-file upload cap: 2 GB
  maxFileBytes: 2 * 1024 * 1024 * 1024,
  // Refuse uploads when the data volume has less than this free (default 1 GB).
  minFreeBytes: Number(process.env.MIN_FREE_BYTES) || 1024 * 1024 * 1024,
  // Per-guest upload throttle: max files started per rolling window.
  uploadRateMax: Number(process.env.UPLOAD_RATE_MAX) || 400,
  uploadRateWindowMs: (Number(process.env.UPLOAD_RATE_WINDOW_MIN) || 10) * 60 * 1000,
  // Quieter request logging in tests.
  logRequests: process.env.NODE_ENV !== 'test',
  // Public origin used in invite emails (magic links + the card image).
  publicUrl: (process.env.PUBLIC_URL || 'https://aftermath.mitio.tech').replace(/\/$/, ''),
  // Email (Resend) — invites are sent from here. Empty key → sending disabled.
  resendApiKey: process.env.RESEND_API_KEY || '',
  mailFrom: process.env.MAIL_FROM || 'Mitio Tech <mitio@mitio.tech>',
};

export const dirs = {
  originals: path.join(config.dataDir, 'originals'),
  thumbs: path.join(config.dataDir, 'thumbs'),
  previews: path.join(config.dataDir, 'previews'),
  posters: path.join(config.dataDir, 'posters'),
  tmp: path.join(config.dataDir, 'tmp'),
  // Orphan originals are moved here rather than deleted — recoverable, never lost.
  trash: path.join(config.dataDir, 'trash'),
};
