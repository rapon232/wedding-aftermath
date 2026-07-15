# Post-launch polish (aftermath.mitio.tech)

## Why

The site is **live** with real guests who have already logged in and uploaded photos and videos. Using it surfaced a set of viewer/gallery/comments bugs and a couple of missing conveniences. These are refinements on a working, in-production system — so the guiding constraint is **data safety**: additive-only DB changes, non-destructive backfills, and never touching original media files.

## What Changes

- **Lightbox navigation respects the loaded set.** The "next" arrow currently shows even on the last item (it keys on the mere existence of a `loadMore` callback), so it appears as a dead control at the end of a filtered view. Arrows SHALL reflect whether there is truly a previous/next item or another page to fetch.
- **Lightbox controls are properly centered.** The prev/next/close controls SHALL be optically centered (glyph and vertical position), fixing the "slightly off" look.
- **Smooth pinch/pan zoom.** Photo zoom SHALL feel smooth on mobile by batching transform updates to animation frames instead of writing on every touch event.
- **Uploader name is a link to their media.** In the lightbox, tapping the uploader's name SHALL filter the gallery to that uploader's uploads.
- **Comments panel is smoother.** Comments SHALL load only when the panel is opened (not re-fetched on every swipe), and the panel's close button SHALL be round to match the design.
- **Videos are visibly videos, with correct duration.** The thumbnail SHALL show a duration badge, and the underlying video metadata (duration + capture date) SHALL be extracted robustly from the container **and** stream.
- **Videos show their true capture date.** Video `taken_at` SHALL be read from the video's creation metadata (with timezone handling), instead of silently falling back to upload time. Videos already uploaded SHALL be corrected by a one-time, non-destructive backfill.
- **Add a guest by name *and* email by hand.** The admin guest panel SHALL allow entering an email alongside a name when creating a single guest, so the owner can grant access and send an invite without going through CSV import.

Explicitly **out of scope**: the favorite-heart color semantics. The heart is intentionally personal (pink = you favorited) and stays as-is.

## Capabilities

### Modified Capabilities

- `gallery-browse`: lightbox navigation bounds, control centering, smooth zoom, uploader-name filter link, comments panel loading/close-button, thumbnail video-duration badge.
- `media-upload`: robust video metadata extraction (duration + capture date from format and stream, timezone-aware) and a non-destructive backfill of `taken_at` for existing videos.
- `guest-invites`: create a single guest with name + email by hand.

### New Capabilities

_None._

## Impact

- **Frontend**: `src/lightbox.js`, `src/gallery.js`, `src/admin.js`, `src/style.css`.
- **Server**: `server/processing.js` (video probe), `server/auth.js` (create-guest with email); a new one-off backfill script.
- **Data safety**: no schema changes required (columns already exist). The video backfill only **reads** originals (via `ffprobe`, read-only) and **updates the `media.taken_at` column**; it backs up `db.sqlite` first, runs dry-run before applying, only overwrites when a valid capture date is found, and never moves, renames, re-encodes, or deletes any file. Sorting corrects itself because the gallery already orders by `taken_at`.
- **Deploy**: same GHCR pull → Container Manager recreate. The backfill is run once, manually, after the parser fix is deployed.
