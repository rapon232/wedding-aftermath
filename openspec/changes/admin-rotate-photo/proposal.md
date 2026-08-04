# Proposal: admin-rotate-photo

## Why

Some uploaded photos display sideways (wrong or missing EXIF orientation, screenshots, scans). Guests can't fix them, and the admin's only recourse is deleting and re-uploading. A one-tap permanent fix in the lightbox keeps the gallery tidy.

## What Changes

- A single rotate button in the lightbox, visible to admins only, on photos only: each tap rotates the image 90° clockwise, permanently — the original file is rewritten and the thumbnail/preview renditions regenerate.
- New admin endpoint `POST /api/admin/media/:id/rotate`.
- A `rev` counter on media rows busts the immutable browser cache on thumb/preview/file URLs after a rotation.
- JPEG/PNG/WebP originals are rewritten in place. HEIC originals (no HEVC encoder available) are converted to a quality-92 JPEG as part of the rotation — permanent format change, flagged in design. GIF stays excluded (rotation would flatten the animation).

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `gallery-browse`: adds a requirement — admin can permanently rotate a photo from the lightbox (sits alongside the existing "Admin can pin media" requirement).

## Impact

- `server/db.js`: `rev` column migration; `server/media.js`: rotate route; `server/processing.js`: export `photoRenditions`; `server/gallery.js`: include `m.rev` in listings.
- `src/lightbox.js`: button + handler + re-render; `src/gallery.js`: cache-busted thumb URLs and an `onRotated` refresh hook.
- Originals are re-encoded on rotate (quality 92) — a deliberate trade: the point of rotating is to fix the canonical image everyone downloads.
