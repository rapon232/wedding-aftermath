# Proposal: seen-pins-and-comment-overlay

## Why

Three engagement gaps surfaced from real use: NEW badges vanish on the next visit whether or not the guest actually looked at anything (they're time-based, not per-item), pinning a photo kicks the admin out of the lightbox and yanks the photo out of the chronological stream, and comments are invisible while swiping — guests only discover them by opening the panel on each photo.

## What Changes

- **Per-user persistent NEW badges**: a thumbnail keeps its NEW badge for each guest until that guest has actually opened the item in the lightbox. Backed by a new `media_seen` table (guest × media); the lightbox reports views as the guest swipes. Own uploads are never NEW. Existing guests are grandfathered (items from before their last visit start as seen) so nobody gets a wall of NEW on deploy. The header "N new" count follows the same per-item definition.
- **Pin stays in the flow**: pinning from the lightbox no longer closes it — the pin button animates to its pinned (mint) state and the admin keeps swiping. Pinned photos become **copies** in the pinned section: the original keeps its place in the chronological sorting (server stops excluding pinned items from the paged list). The gallery grid refreshes behind the lightbox (deferred to close; other clients via the existing SSE refresh).
- **Comment overlay on the photo**: the latest few comments show bottom-left over the photo in the lightbox — small, translucent, live-chat style. They ride along in the gallery listing (no per-swipe fetching, preserving the existing performance requirement), never intercept touch/zoom gestures, hide with the rest of the chrome on the immersive tap, and update instantly when a comment is posted in the panel.
- **Copy tweak**: empty comments panel placeholder becomes "No comments yet — say something sassy ✨".

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `gallery-browse`: NEW-badge requirement becomes per-item/per-guest; the pinning requirement changes (originals stay in the sorting, pinning doesn't leave the lightbox); the lightbox requirement gains the comment overlay; the comments-performance requirement gains the inline-listing rule that keeps "no fetch on every swipe" true.

## Impact

- **Server**: `server/db.js` (`media_seen` table + grandfather seeding), `server/gallery.js` (listing gains `seen` flag and inline latest-comments; pinned filter removed from the paged list), seen endpoint (`server/social.js` — it owns comments/reactions).
- **Client**: `src/gallery.js` (badge logic, deferred pin refresh), `src/lightbox.js` (seen reporting on navigate, pin flow, overlay render, panel copy), `src/style.css` (overlay, pin transition).
- **Tests**: seen endpoint + flag, pinned-in-stream ordering, inline comments in listing, grandfathering.
- **Data**: one new table; no changes to existing rows beyond seeding.
