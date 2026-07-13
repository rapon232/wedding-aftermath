# Build Photo Sharing Site (aftermath.mitio.tech)

## Why

After the wedding (~65 guests), everyone has photos and videos scattered across their phones. There is no easy, private way to pool them: commercial services either compress media, require accounts, expire, or aren't private. A small self-hosted gallery on the existing NAS + Cloudflare tunnel setup (already proven with wedding.mitio.tech) lets guests upload originals and browse/download everything in one pretty place — and the couple keeps full ownership of the media.

## What Changes

- New web app served at `aftermath.mitio.tech`, deployed as a Docker container on the Synology NAS behind the existing Cloudflare tunnel (same pattern as wedding.mitio.tech).
- Per-guest credentials: the couple generates a personal access code per guest (~65); guests log in once per device, no self-registration.
- Guests can upload photos and videos (multi-file, drag-and-drop on desktop, camera-roll picker on mobile), with originals stored on the NAS filesystem.
- Everyone can browse a shared gallery: responsive masonry grid, lightbox viewer with swipe, video playback with posters.
- Sort/filter: by capture/upload date, by uploader, by media type (photo/video).
- Download: single-file original download and bulk "download selected / all" as zip.
- Wedding-themed UI reusing the visual language of the seating site (cream/mint/bordeaux palette, DM Serif Display + DM Sans).
- Admin ability (owner) to generate/revoke guest codes and delete any media.

## Capabilities

### New Capabilities

- `guest-auth`: Per-guest access codes, login, session persistence, admin code management (generate, list, revoke).
- `media-upload`: Multi-file photo/video upload from mobile and desktop, original preserved on NAS storage, thumbnail/preview generation (incl. HEIC and video posters), upload progress and resilience.
- `gallery-browse`: Responsive gallery grid, lightbox photo viewing, video playback, sorting and filtering by date, uploader, and media type.
- `media-download`: Original-quality single-file download and bulk zip download of selected items or the whole gallery.
- `deployment`: Single Docker container on Synology NAS, media persisted on a NAS volume mount, served through Cloudflare tunnel at aftermath.mitio.tech.

### Modified Capabilities

_None — greenfield project, no existing specs._

## Impact

- **New codebase** in this repo: Node.js server + web frontend + Dockerfile/compose.
- **NAS**: new Docker container + a media directory on a NAS volume (expect tens of GB for 65 guests with videos); nightly NAS backup should cover it.
- **Cloudflare**: one new tunnel hostname `aftermath.mitio.tech` → container port.
- **Dependencies**: Node runtime, image/video processing (sharp + ffmpeg) inside the container; no external services, no cloud storage, no third-party auth.
- **Ops**: same operational model as wedding.mitio.tech (docker compose up on the NAS); no database server — metadata in a single SQLite file alongside the media.
