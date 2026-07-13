// Lightbox: full-screen viewer with keyboard/swipe navigation, video playback,
// caption, download and (own/admin) delete.

let me;
let fmtDate = (x) => x;
let onDeleted = () => {};
let onPinned = () => {};
let list = [];
let idx = 0;
let opts = {};
let overlay = null;

export function initLightbox(config) {
  me = config.me;
  fmtDate = config.fmtDate;
  onDeleted = config.onDeleted;
  onPinned = config.onPinned || (() => {});
}

export function openLightbox(items, index, o = {}) {
  list = items;
  idx = index;
  opts = o;
  if (!overlay) build();
  overlay.hidden = false;
  document.body.classList.add('lightbox-open');
  show();
}

function build() {
  overlay = document.createElement('div');
  overlay.className = 'lightbox';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="lb-stage"></div>
    <button class="lb-btn lb-close" aria-label="Close">✕</button>
    <button class="lb-btn lb-prev" aria-label="Previous">‹</button>
    <button class="lb-btn lb-next" aria-label="Next">›</button>
    <div class="lb-caption">
      <div class="lb-meta">
        <span class="lb-by"></span>
        <span class="lb-date"></span>
      </div>
      <div class="lb-actions">
        <button class="lb-pin btn-lb" hidden></button>
        <a class="lb-download btn-lb" download>Download</a>
        <button class="lb-delete btn-lb" hidden>Delete</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('.lb-close').addEventListener('click', close);
  overlay.querySelector('.lb-prev').addEventListener('click', () => step(-1));
  overlay.querySelector('.lb-next').addEventListener('click', () => step(1));
  overlay.querySelector('.lb-delete').addEventListener('click', del);
  overlay.querySelector('.lb-pin').addEventListener('click', togglePin);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.classList.contains('lb-stage')) close();
  });

  document.addEventListener('keydown', (e) => {
    if (overlay.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });

  // Swipe navigation (touch)
  let touchX = null;
  overlay.addEventListener('touchstart', (e) => (touchX = e.touches[0].clientX), { passive: true });
  overlay.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 48) step(dx > 0 ? -1 : 1);
  });
}

function show() {
  const item = list[idx];
  if (!item) return close();
  const stage = overlay.querySelector('.lb-stage');
  stage.innerHTML = '';

  if (item.type === 'video') {
    const video = document.createElement('video');
    video.controls = true;
    video.autoplay = true;
    video.muted = true; // Android/Chrome only autoplay muted; user can unmute
    video.playsInline = true;
    video.preload = 'metadata';
    video.poster = `/media/poster/${item.id}`;
    video.src = `/media/file/${item.id}`;
    // Some phone videos (e.g. iPhone HEVC) won't decode in every browser.
    // Fall back to the poster + a download prompt instead of a black box.
    video.addEventListener('error', () => showVideoFallback(stage, item), { once: true });
    stage.appendChild(video);
  } else {
    const img = document.createElement('img');
    // Animated GIFs lose animation in the static preview — show the original
    img.src = item.ext === 'gif' ? `/media/file/${item.id}` : `/media/preview/${item.id}`;
    img.alt = item.filename;
    stage.appendChild(img);
  }

  overlay.querySelector('.lb-by').textContent = `by ${item.uploader_name}`;
  overlay.querySelector('.lb-date').textContent = item.taken_at ? fmtDate(item.taken_at) : '';
  overlay.querySelector('.lb-download').href = `/media/file/${item.id}?download=1`;
  overlay.querySelector('.lb-delete').hidden = !(me.isAdmin || item.uploader_id === me.id);
  const pinBtn = overlay.querySelector('.lb-pin');
  pinBtn.hidden = !me.isAdmin;
  pinBtn.textContent = item.pinned_at ? '✦ Unpin' : '✦ Pin';
  overlay.querySelector('.lb-prev').style.visibility = idx > 0 ? 'visible' : 'hidden';
  overlay.querySelector('.lb-next').style.visibility =
    idx < list.length - 1 || opts.loadMore ? 'visible' : 'hidden';

  // Preload neighbouring photo previews for instant navigation
  for (const n of [idx - 1, idx + 1]) {
    const nb = list[n];
    if (nb && nb.type === 'photo') new Image().src = `/media/preview/${nb.id}`;
  }
  // Nearing the end of loaded items: pull the next page in
  if (idx >= list.length - 5) opts.loadMore?.();
}

function step(delta) {
  const next = idx + delta;
  if (next < 0 || next >= list.length) return;
  idx = next;
  show();
}

async function del() {
  const item = list[idx];
  if (!confirm(`Delete this ${item.type}? This removes it for everyone.`)) return;
  const r = await fetch(`/api/media/${item.id}`, { method: 'DELETE' });
  if (!r.ok) {
    alert('Could not delete — try again.');
    return;
  }
  onDeleted(item.id); // gallery updates `list` in place (same array)
  if (idx >= list.length) idx = list.length - 1;
  if (idx < 0) close();
  else show();
}

function showVideoFallback(stage, item) {
  stage.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'lb-video-fallback';
  box.style.backgroundImage = `url(/media/poster/${item.id})`;
  box.innerHTML = `
    <div class="lb-fallback-inner">
      <p>This video can’t play in your browser — but you can still save it.</p>
      <a class="btn-lb" href="/media/file/${item.id}?download=1" download>Download video</a>
    </div>`;
  stage.appendChild(box);
}

async function togglePin() {
  const item = list[idx];
  const pinned = !item.pinned_at;
  const r = await fetch(`/api/admin/media/${item.id}/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pinned }),
  });
  if (!r.ok) {
    alert('Could not update pin — try again.');
    return;
  }
  close();
  onPinned(); // gallery reloads with the new ordering
}

function close() {
  overlay.hidden = true;
  overlay.querySelector('.lb-stage').innerHTML = ''; // stops video playback
  document.body.classList.remove('lightbox-open');
}
