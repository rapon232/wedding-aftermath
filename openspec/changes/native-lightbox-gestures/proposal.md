# Proposal: native-lightbox-gestures

## Why

The lightbox's touch gestures feel web-page-ish rather than native: pinch zoom grows the photo from its center instead of from the fingers, double-tap zooms to the center instead of the tapped spot, a zoomed photo can be panned fully off-screen, and the chrome (arrows, caption, buttons) can never be dismissed for a clean full-bleed view. Guests coming from the iPhone Photos app notice all of this. Separately, the repo has no code formatter, so style consistency depends on discipline; adding Prettier now (before the gesture rework) keeps that feature diff readable.

## What Changes

- **Prettier tooling** (lands first, as a standalone format commit): `prettier` v3 devDependency, `.prettierrc` (printWidth 110, singleQuote), `.prettierignore`, `format`/`format:check` npm scripts, one-time repo-wide reformat, `.git-blame-ignore-revs` pointing at the format commit.
- **Focal pinch-to-zoom**: zoom anchors at the pinch midpoint and tracks midpoint movement (two-finger pan), double-tap zooms toward the tap point, pan is clamped to the viewport with rubber-band overscroll and animated snap-back, sub-1× pinch is elastic (dips to ~0.9, springs back to 1).
- **Immersive mode (iOS tap model)**: single tap anywhere in the stage toggles all chrome (arrows, close, caption/actions bar, unmute pill) with a pure-black backdrop; starting a pinch auto-hides chrome; immersive state persists across prev/next until toggled or the lightbox reopens; videos keep native controls.
- **BREAKING (behavior)**: tap on the lightbox background no longer closes the lightbox — it toggles chrome like any other tap. Closing is via the X button, Esc, or the new **swipe-down-to-close** gesture (drag down, dismiss past a threshold, spring back otherwise). Tap with the comments panel open still closes the panel first.

## Capabilities

### New Capabilities

(none — Prettier is dev tooling with no runtime/spec surface; it is covered in design and tasks only)

### Modified Capabilities

- `gallery-browse`: the "Lightbox viewing and video playback" requirement changes — focal (finger-anchored) pinch zoom with clamped/rubber-banded pan, focal double-tap zoom, tap-toggled immersive chrome replacing tap-on-background-to-close, and swipe-down-to-close.

## Impact

- **Code**: `src/lightbox.js` (gesture math in `setupZoom`, tap/immersive/swipe-down handling in `build`/`show`), `src/style.css` (immersive-mode chrome hiding, black backdrop, transition styles). Every tracked source file is touched once by the Prettier reformat commit.
- **Dependencies**: `prettier` (devDependency only).
- **Systems/APIs**: none — client-only behavior; no server or schema changes.
- **Docs**: none required; `README.md` gets reformatted only.
