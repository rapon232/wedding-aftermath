import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PROD = process.env.NODE_ENV === 'production';

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET === 'change-me') {
  if (PROD) {
    console.error('SESSION_SECRET must be set to a real secret in production.');
    process.exit(1);
  }
  console.warn('⚠ SESSION_SECRET not set — using insecure dev secret.');
}

export const config = {
  prod: PROD,
  port: Number(process.env.PORT) || 3000,
  sessionSecret: SESSION_SECRET && SESSION_SECRET !== 'change-me' ? SESSION_SECRET : 'dev-secret-do-not-use',
  dataDir: path.resolve(ROOT, process.env.DATA_DIR || './data'),
  distDir: path.join(ROOT, 'dist'),
  adminName: process.env.ADMIN_NAME || 'Admin',
  // Where the wedding happened. Photo EXIF timestamps are timezone-naive wall-clock
  // times; we interpret them in this zone (server may be elsewhere, e.g. Sofia).
  // Also used to display all times in event-local time.
  eventTz: process.env.EVENT_TZ || 'Europe/Rome',
  // Session cookie lifetime: 180 days
  sessionMaxAgeMs: 180 * 24 * 60 * 60 * 1000,
  // Per-file upload cap: 2 GB
  maxFileBytes: 2 * 1024 * 1024 * 1024,
};

export const dirs = {
  originals: path.join(config.dataDir, 'originals'),
  thumbs: path.join(config.dataDir, 'thumbs'),
  previews: path.join(config.dataDir, 'previews'),
  posters: path.join(config.dataDir, 'posters'),
  tmp: path.join(config.dataDir, 'tmp'),
};
