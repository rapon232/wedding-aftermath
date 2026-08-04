# Design: admin-rotate-photo

## Context

Originals live at `originals/<id>.<ext>`; thumb/preview renditions are derived by `photoRenditions()` in `server/processing.js` (which bakes EXIF orientation via `sharp().rotate()`). All media URLs are served with `Cache-Control: private, max-age=31536000, immutable`, so a rotated image at the same URL would stay stale in every browser that saw it.

## Goals / Non-Goals

**Goals:** one-tap permanent 90° clockwise rotation; correct everywhere (grid, lightbox, downloads) immediately for the admin and on next fetch for everyone else.
**Non-Goals:** counter-clockwise/arbitrary angles (tap 3× instead), rotating videos, HEIC/GIF originals, live-refresh of other viewers' open sessions.

## Decisions

1. **Two-pass sharp rewrite of the original**: pass 1 `sharp(file).rotate().withMetadata()` bakes any EXIF orientation into pixels; pass 2 `.rotate(90).withMetadata()` applies the quarter-turn. Unambiguous vs. relying on how one `rotate(angle)` call composes with EXIF. Re-encode at quality 92 (mozjpeg for JPEG, lossless PNG); metadata (EXIF dates, ICC) is preserved, orientation tag is dropped by sharp on explicit rotate. Written to a temp file then renamed over the original.
2. **`rev INTEGER NOT NULL DEFAULT 0`** on media, bumped per rotation; clients append `?v=<rev>` to thumb/preview/file URLs (only when `rev > 0`, so existing URLs and CF cache entries stay untouched for never-rotated media). Chosen over changing filenames (churn in originals dir, backup diffs) and over un-immutable caching (would slow every gallery visit for a rare event).
3. **Renditions regenerate via the existing `photoRenditions()`** (exported), returning the new width/height which are swapped in the DB row. `sha256` is intentionally left as the upload-time hash so re-uploading the same source file still dedupes instead of resurrecting the unrotated copy.
4. **Eligibility**: `type = 'photo'`, `status = 'ready'`, ext in jpg/jpeg/png/webp/heic/heif. The button hides otherwise; the endpoint enforces the same rules (400). GIF stays out (rotation would flatten animation).
   - **HEIC converts to JPEG on rotate** (added 2026-08-04 for film scans): sharp has no HEVC encoder, so the rotated result is written as `<id>.jpg` (quality 92), the `.heic` original is deleted, and `ext`/`filename` update so downloads are correctly named. Decode uses sharp when its libvips can, else the same `heic-convert` fallback and size cap as the processing pipeline. A deliberate permanent format change — visually lossless in practice and more compatible for guests; the alternative (a display-only rotation flag) would have left downloaded originals sideways.
5. **Lightbox re-render**: on success the item's `width/height/rev` mutate in place and the current stage re-renders (`show()`), pulling the busted preview URL; an `onRotated` callback lets the gallery refresh that item's grid thumbnails (both pinned copies).

## Risks / Trade-offs

- [Repeated rotations re-encode repeatedly (JPEG generation loss)] → quality 92 and a realistic tap count (≤3) keep it invisible; correctness of orientation outweighs it.
- [Rotate while another admin rotates the same photo] → last write wins on a single-row UPDATE; single-admin household in practice.
- [Crash between original rewrite and rendition regen] → renditions would be stale one orientation behind; re-tapping rotate heals (it regenerates renditions from the current original).

## Migration Plan

`ensureColumn` migration adds `rev` on boot; no backfill needed (default 0 keeps URLs unchanged). Normal deploy; rollback-safe (extra column is inert).

## Open Questions

None.
