# Proposal: lightbox-polish-follow-ups

Retrospective record: this work was implemented and shipped as direct follow-up fixes after archiving `native-lightbox-gestures` (commits `0eae4ba..8eafda8`, 2026-07-15). Main specs were updated in place as each fix landed.

## Why

On-device use of the new lightbox gestures surfaced a round of gaps: Mac trackpads had no pinch handling at all (browser page zoom kicked in and the photo appeared to jump), the double-tap zoom-in tween was being cancelled before it painted, iOS Safari showed a 1px see-through hairline at a compositing seam, the Save button downloaded to Files instead of offering the photo library, the action row mixed platform emoji with an off-palette yellow pin highlight, and the mobile header crushed its four buttons into the screen edge.

## What Changes

- **Desktop zoom**: trackpad pinch zooms focally at the cursor (ctrl+wheel for Chrome/Firefox, `gesture*` events for Safari, desktop-only to avoid iOS double-apply); page zoom suppressed while the lightbox is open; plain scroll and mouse drag pan while zoomed (drag suppresses its trailing click).
- **Chrome restore on return-to-fit**: double-tap, double-click, or zooming back out brings the controls back; plain taps keep toggling immersive.
- **Double-tap zoom-in bounce**: springy easeOutBack overshoot; two bugs fixed where pan-arming and the tap's own touchend killed the tween before paint.
- **iOS hairline**: while the lightbox is open the gallery wrapper is `visibility: hidden` and the body matches the lightbox colour, so any compositing seam renders dark-on-dark.
- **Save to photo library**: on touch devices with Web Share support, Save opens the native share sheet with the original file ("Save Image/Video" → Photos), falling back to plain download.
- **Action-row design pass**: the five caption actions became frosted-glass pills with 2px line SVG icons (emoji removed); faved fills the heart blush over bordeaux glass; pinned highlights in mint instead of yellow; the unmute pill got the same treatment and proper vertical centring.
- **Mobile header**: the four header buttons form a full-width two-column grid on phones instead of overflowing one flex row.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `gallery-browse`: lightbox requirement gains desktop focal zoom/pan and the return-to-fit-restores-chrome rule (synced to main spec in place).
- `media-download`: single-file download requirement gains the share-sheet Save path on touch devices (synced to main spec in place).

## Impact

- **Code**: `src/lightbox.js` (desktop zoom/pan, tween fixes, share-save, SVG action icons), `src/style.css` (hairline fix, action pills, mint pin state, unmute pill, header grid), `index.html` untouched.
- **Dependencies**: none added.
- **Verification**: two puppeteer smoke harnesses (emulated-touch mobile + desktop) covering all gesture flows, plus screenshot review of the design pass; 61 unit tests, build, and format checks green throughout.
