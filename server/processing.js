import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';
import exifr from 'exifr';
import { db } from './db.js';
import { config, dirs } from './config.js';
import { broadcast } from './events.js';

const execFileP = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

const THUMB_W = 480;    // grid thumbnails
const PREVIEW_MAX = 1600; // lightbox previews
const CONCURRENCY = 2;  // NAS-friendly: never more than 2 heavy jobs at once

const queue = [];
let active = 0;

export function enqueue(mediaId) {
  queue.push(mediaId);
  pump();
}

/** Re-enqueue anything left mid-processing by a crash/restart. */
export function requeueUnprocessed() {
  const rows = db.prepare("SELECT id FROM media WHERE status = 'processing'").all();
  for (const r of rows) enqueue(r.id);
  if (rows.length) console.log(`Re-queued ${rows.length} unprocessed media item(s).`);
}

function pump() {
  while (active < CONCURRENCY && queue.length) {
    const id = queue.shift();
    active++;
    processMedia(id)
      .catch((err) => console.error(`processing ${id}:`, err))
      .finally(() => {
        active--;
        pump();
      });
  }
}

async function processMedia(id) {
  const m = db.prepare('SELECT * FROM media WHERE id = ?').get(id);
  if (!m || m.status === 'ready') return;
  const original = path.join(dirs.originals, `${id}.${m.ext}`);
  try {
    const info = m.type === 'photo' ? await processPhoto(m, original) : await processVideo(m, original);
    db.prepare(
      `UPDATE media SET status = 'ready', width = ?, height = ?, duration_s = ?,
       taken_at = COALESCE(?, taken_at) WHERE id = ?`
    ).run(info.width ?? null, info.height ?? null, info.duration ?? null, info.takenAt ?? null, id);
    broadcast({ type: 'ready', id }); // push to open galleries so it appears live
  } catch (err) {
    console.error(`processing failed for ${id} (${m.filename}):`, err.message);
    db.prepare("UPDATE media SET status = 'failed' WHERE id = ?").run(id);
  }
}

/** Shared photo pipeline: input may be a file path or a decoded buffer (HEIC fallback). */
async function photoRenditions(input, id) {
  const base = sharp(input, { failOn: 'none' }).rotate(); // rotate() bakes in EXIF orientation
  const meta = await base.metadata();
  await base
    .clone()
    .resize({ width: THUMB_W, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(path.join(dirs.thumbs, `${id}.webp`));
  await base
    .clone()
    .resize({ width: PREVIEW_MAX, height: PREVIEW_MAX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(path.join(dirs.previews, `${id}.webp`));
  // metadata() reports pre-rotation dimensions; swap for sideways EXIF orientations
  const sideways = (meta.orientation || 1) >= 5;
  return { width: sideways ? meta.height : meta.width, height: sideways ? meta.width : meta.height };
}

async function processPhoto(m, original) {
  let dims;
  try {
    dims = await photoRenditions(original, m.id);
  } catch (err) {
    if (!/^hei[cf]$/.test(m.ext)) throw err;
    // sharp's prebuilt libvips lacks the patented HEVC decoder — fall back to a
    // pure-JS/WASM decode. That reads the whole file into memory and decodes it
    // in-process, so cap the eligible size: real phone HEICs are a few MB, and an
    // oversized/crafted one could OOM-kill the container (SIGKILL is uncatchable).
    const HEIC_FALLBACK_MAX = Number(process.env.HEIC_FALLBACK_MAX_BYTES) || 48 * 1024 * 1024;
    const { size } = fs.statSync(original);
    if (size > HEIC_FALLBACK_MAX) {
      throw new Error(`HEIC too large for fallback decode (${size} bytes > ${HEIC_FALLBACK_MAX})`);
    }
    const { default: heicConvert } = await import('heic-convert');
    const jpeg = await heicConvert({ buffer: fs.readFileSync(original), format: 'JPEG', quality: 0.9 });
    dims = await photoRenditions(Buffer.from(jpeg), m.id);
  }

  let takenAt = null;
  try {
    // reviveValues:false keeps EXIF datetimes as raw strings ("2026:06:20 15:30:00")
    // instead of Dates parsed in the *server's* timezone (server: Sofia; wedding: Sicily).
    const exif = await exifr.parse(original, {
      pick: ['DateTimeOriginal', 'CreateDate', 'OffsetTimeOriginal', 'OffsetTime'],
      reviveValues: false,
    });
    const raw = exif?.DateTimeOriginal || exif?.CreateDate;
    const offset = exif?.OffsetTimeOriginal || exif?.OffsetTime; // e.g. "+02:00" (modern iPhones)
    if (raw) takenAt = exifToUtc(String(raw), offset);
  } catch {
    /* no/unreadable EXIF — keep upload time */
  }
  return { ...dims, takenAt };
}

/**
 * Convert an EXIF wall-clock datetime to true UTC.
 * Uses the camera-recorded UTC offset when present; otherwise assumes the
 * event timezone (config.eventTz), DST-correct via Intl.
 */
export function exifToUtc(raw, offset) {
  const m = String(raw).match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  // Accept "Z", "+02:00", or colon-less "+0200" — all seen in the wild for OffsetTimeOriginal.
  const off = String(offset || '').trim();
  if (off === 'Z' || off === 'z') {
    return new Date(Date.UTC(y, mo - 1, d, h, mi, s)).toISOString();
  }
  const om2 = off.match(/^([+-])(\d{2}):?(\d{2})$/);
  if (om2) {
    const sign = om2[1] === '-' ? -1 : 1;
    const mins = Number(om2[2]) * 60 + Number(om2[3]);
    return new Date(Date.UTC(y, mo - 1, d, h, mi, s) - sign * mins * 60000).toISOString();
  }
  return wallClockToUtc(y, mo, d, h, mi, s, config.eventTz);
}

function wallClockToUtc(y, mo, d, h, mi, s, tz) {
  // Find the UTC instant that renders as this wall-clock time in tz.
  // Two iterations converge across DST boundaries.
  let utc = Date.UTC(y, mo - 1, d, h, mi, s);
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
        .formatToParts(new Date(utc))
        .map((p) => [p.type, p.value])
    );
    const rendered = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    utc -= rendered - Date.UTC(y, mo - 1, d, h, mi, s);
  }
  return new Date(utc).toISOString();
}

/**
 * Parse a video creation timestamp to UTC. Handles the tz-aware QuickTime form
 * ("2026-07-11T21:01:14+0200"), the UTC creation_time form ("…Z"), and a naive
 * timestamp (interpreted in config.eventTz). Reuses exifToUtc's offset logic.
 */
function parseVideoDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  const om = str.match(/(Z|[+-]\d{2}:?\d{2})$/i); // trailing offset, if any
  return exifToUtc(str, om ? om[1] : '');
}

async function processVideo(m, original) {
  const poster = path.join(dirs.posters, `${m.id}.jpg`);

  // Probe duration + creation time (ffmpeg autorotates frames, so dimensions come from the poster)
  let duration = null;
  let takenAt = null;
  try {
    // Read BOTH container (format) and video-stream metadata: some phones put
    // duration/creation only on the stream, others only on the container.
    const { stdout } = await execFileP(FFPROBE, [
      '-v', 'error',
      '-show_entries', 'format=duration:format_tags:stream=duration:stream_tags',
      '-of', 'json', original,
    ]);
    const probe = JSON.parse(stdout);
    const fmt = probe?.format || {};
    const streams = Array.isArray(probe?.streams) ? probe.streams : [];

    // Duration: container first, else the first stream that reports one.
    let dur = Number(fmt.duration);
    if (!(Number.isFinite(dur) && dur > 0)) {
      for (const st of streams) {
        const sd = Number(st?.duration);
        if (Number.isFinite(sd) && sd > 0) { dur = sd; break; }
      }
    }
    if (Number.isFinite(dur) && dur > 0) duration = dur;

    // Capture date: prefer the timezone-aware QuickTime tag, then plain
    // creation_time (UTC), searching container tags then each stream's tags.
    const tagSources = [fmt.tags || {}, ...streams.map((s) => s?.tags || {})];
    const pick = (key) => tagSources.map((t) => t[key]).find(Boolean);
    const rawDate = pick('com.apple.quicktime.creationdate') || pick('creation_time');
    if (rawDate) takenAt = parseVideoDate(rawDate);

    if (!duration || !takenAt) {
      console.warn(`video probe incomplete for ${m.id} (${m.filename}): duration=${duration} takenAt=${takenAt}`);
    }
  } catch (err) {
    console.warn(`ffprobe failed for ${m.id} (${m.filename}): ${err.message}`);
  }

  // Poster frame at 1s in; very short clips fall back to the first frame
  const grab = (seek) =>
    execFileP(FFMPEG, [
      '-y', '-ss', String(seek), '-i', original,
      '-frames:v', '1', '-vf', "scale='min(1280,iw)':-2", poster,
    ]);
  try {
    await grab(1);
    if (!fs.existsSync(poster) || !fs.statSync(poster).size) throw new Error('empty poster');
  } catch {
    await grab(0);
  }

  await sharp(poster)
    .resize({ width: THUMB_W, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(path.join(dirs.thumbs, `${m.id}.webp`));

  const posterMeta = await sharp(poster).metadata();
  return { width: posterMeta.width, height: posterMeta.height, duration, takenAt };
}
