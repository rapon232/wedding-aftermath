# Tasks: lightbox-polish-follow-ups

Retrospective — all work shipped in commits `0eae4ba..8eafda8` (2026-07-15).

## 1. Desktop zoom & chrome rules

- [x] 1.1 Focal trackpad pinch via ctrl+wheel (Chrome/Firefox) and gesture events (Safari, non-touch only); page zoom suppressed while the lightbox is open (`0eae4ba`)
- [x] 1.2 Plain-wheel pan and mouse drag-pan while zoomed, with drag-click suppression (`0eae4ba`)
- [x] 1.3 Return-to-fit (double-tap/double-click/zoom-out) restores the chrome; plain taps keep toggling immersive (`0eae4ba`, refined in `c74d434`)

## 2. Tween & rendering fixes

- [x] 2.1 Springy easeOutBack overshoot on double-tap zoom-in (`f0a7717`)
- [x] 2.2 Fix the tween being killed by touchstart pan-arming and by the tap's own touchend settle; smoke asserts the transition survives to paint (`2627250`, `c74d434`)
- [x] 2.3 iOS 1px see-through hairline: hide the gallery wrapper and match the body colour while the lightbox is open (`66b9c00`)

## 3. Save to photo library

- [x] 3.1 Save opens the native share sheet with the original file on touch devices (Web Share), with download fallback and "Saving…" state (`0e020f6`)

## 4. Design pass & mobile header

- [x] 4.1 Action row → frosted-glass pills with 2px line SVG icons; faved = blush-filled heart on bordeaux glass; pinned = mint (replacing yellow) (`56c3815`)
- [x] 4.2 Mobile header actions → full-width two-column grid, nothing glued to the screen edge (`56c3815`)
- [x] 4.3 Unmute pill: flex-centred content, line speaker icon replacing the emoji (`8eafda8`)

## 5. Verification

- [x] 5.1 Desktop puppeteer smoke (ctrl+wheel focal zoom, wheel-pan, drag-pan, reset-with-controls) and extended mobile smoke (chrome-restore rules, tween survival) both green; 61 unit tests, build, and format checks green; screenshots reviewed for the design pass; confirmed on device by the user
