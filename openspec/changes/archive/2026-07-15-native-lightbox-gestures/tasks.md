# Tasks: native-lightbox-gestures

## 1. Prettier (standalone format commit — land before any feature work)

- [x] 1.1 Add `prettier@^3` as devDependency; create `.prettierrc` (`printWidth: 110`, `singleQuote: true`) and `.prettierignore` (`dist/`, `data/`, `node_modules/`, `package-lock.json`); add `"format"` and `"format:check"` npm scripts
- [x] 1.2 Run `npm run format` across the repo, verify `npm test` and `npm run build` still pass, and commit config + reformat as one commit
- [x] 1.3 Add `.git-blame-ignore-revs` containing the format commit's hash (separate tiny commit; note `git config blame.ignoreRevsFile .git-blame-ignore-revs` in the commit message)

## 2. Focal pinch-to-zoom (src/lightbox.js `setupZoom`)

- [x] 2.1 Rework pinch math: anchor scale changes at the live touch midpoint (`tx' = Mx − (s'/s)(Mx − tx)`, coordinates relative to the image center) and add the midpoint delta to `tx/ty` each move (two-finger pan), keeping the existing rAF batching and `smooth()` structure
- [x] 2.2 Make double-tap (and desktop double-click) zoom toward the tapped point at 2.5× using the same focal formula; second double-tap resets to fit
- [x] 2.3 Add pan clamping helpers (bounds `±max(0, (s·dim − viewport)/2)`) with rubber-band attenuation (~0.3×) past bounds during the gesture and animated snap-back on `touchend`
- [x] 2.4 Add elastic sub-1× pinch: allow scale down to 0.9 during the gesture, spring back to `scale 1, tx/ty 0` on release; max scale stays 4

## 3. Immersive mode + swipe-down-to-close

- [x] 3.1 Add `lb-immersive` overlay class + CSS: fade out `.lb-btn`, `.lb-caption`, `.lb-unmute` (opacity + `pointer-events: none`), pure-black backdrop; state persists across `step()`, resets in `openLightbox()`
- [x] 3.2 Replace overlay click-to-close with a single stage-level tap handler: clean single tap (≤10 px movement) waits 300 ms for a possible double-tap, then toggles immersive; double-tap within the window zooms; comments-open tap still closes the panel first; fold `setupZoom`'s `lastTap` logic into this handler
- [x] 3.3 Auto-hide chrome when a two-finger gesture starts; leave taps on `<video>` elements to the native controls (background taps still toggle)
- [x] 3.4 Implement swipe-down-to-close: single-finger vertical drag at `scale === 1` (vertical intent decided in the first ~10 px) translates the stage and fades the backdrop; release past ~25% of viewport height closes, otherwise springs back; disabled while zoomed or comments panel open; Esc and X unchanged

## 4. Verification

- [x] 4.1 Run `npm test`, `npm run build`, and `npm run format:check`; fix any fallout
- [x] 4.2 On-device manual checklist (iPhone Safari + Android Chrome): focal pinch on a corner detail stays under the fingers; two-finger pan tracks; double-tap zooms to the tapped spot; pan rubber-bands and snaps back at edges; sub-1× pinch springs back; tap toggles chrome and persists across swipes; pinch hides chrome; swipe-down closes past threshold and springs back before it; background tap no longer closes; video taps still control playback; comments panel tap-to-close, swipe-nav, Esc/X close all still work
