// iOS-safe body scroll lock, shared by every full-screen overlay (lightbox,
// notes, admin). `overflow: hidden` alone is ignored by iOS Safari, and stray
// visual-viewport offsets (left over after the keyboard, most visibly right
// after login) shift position:fixed overlays — the lightbox opened "scrolled
// down" with the photo half off-screen. Pinning the body with position:fixed
// (keeping the page visually in place via a negative top) removes the page's
// scrollability entirely, so there is nothing for iOS to offset. Unlock
// restores the exact scroll position (the gallery may then re-center on the
// viewed tile — that scroll happens after this restore and wins).
let savedY = 0;

export function lockScroll() {
  savedY = window.scrollY;
  document.body.style.top = `-${savedY}px`;
  document.body.classList.add('lightbox-open');
}

export function unlockScroll() {
  document.body.classList.remove('lightbox-open');
  document.body.style.top = '';
  window.scrollTo(0, savedY);
}
