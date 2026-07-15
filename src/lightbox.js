// Lightbox: full-screen viewer with keyboard/swipe navigation, video playback,
// caption, download and (own/admin) delete.

let me;
let fmtDate = (x) => x;
let onDeleted = () => {};
let onPinned = () => {};
let onFaved = () => {};
let onNavigate = () => {};
let onUploaderClick = () => {};
let list = [];
let idx = 0;
let opts = {};
let overlay = null;
let soundOn = false; // once a guest taps for sound, later videos try to start unmuted

export function initLightbox(config) {
  me = config.me;
  fmtDate = config.fmtDate;
  onDeleted = config.onDeleted;
  onPinned = config.onPinned || (() => {});
  onFaved = config.onFaved || (() => {});
  onNavigate = config.onNavigate || (() => {});
  onUploaderClick = config.onUploaderClick || (() => {});
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
    <button class="lb-btn lb-close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    <button class="lb-btn lb-prev" aria-label="Previous"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>
    <button class="lb-btn lb-next" aria-label="Next"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button>
    <div class="lb-caption">
      <div class="lb-meta">
        <span class="lb-by"></span>
        <span class="lb-date"></span>
      </div>
      <div class="lb-actions">
        <button class="lb-fav btn-lb" aria-label="Favorite"><span class="lb-fav-icon">♥</span><span class="lb-fav-n"></span></button>
        <button class="lb-comment btn-lb" aria-label="Comments"><span>💬</span><span class="lb-comment-n"></span></button>
        <button class="lb-pin btn-lb" aria-label="Pin" hidden>📌</button>
        <a class="lb-download btn-lb" download>Save</a>
        <button class="lb-delete btn-lb" hidden>Delete</button>
      </div>
    </div>
    <div class="lb-comments" aria-label="Comments">
      <div class="lb-comments-head">
        <strong>Comments</strong>
        <button class="lb-comments-close" aria-label="Close comments">✕</button>
      </div>
      <ul class="lb-comments-list"></ul>
      <form class="lb-comment-form">
        <input class="lb-comment-input" type="text" maxlength="1000" placeholder="Add a comment…" />
        <button type="submit" class="btn btn-bx lb-comment-send">Send</button>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('.lb-close').addEventListener('click', close);
  overlay.querySelector('.lb-prev').addEventListener('click', () => step(-1));
  overlay.querySelector('.lb-next').addEventListener('click', () => step(1));
  overlay.querySelector('.lb-delete').addEventListener('click', del);
  overlay.querySelector('.lb-pin').addEventListener('click', togglePin);
  overlay.querySelector('.lb-fav').addEventListener('click', toggleFav);
  overlay.querySelector('.lb-by').addEventListener('click', () => {
    const it = list[idx];
    if (!it) return;
    close();
    onUploaderClick(it.uploader_id); // gallery filters to this uploader + reloads
  });
  overlay.querySelector('.lb-comment').addEventListener('click', toggleComments);
  overlay.querySelector('.lb-comments-close').addEventListener('click', () => setComments(false));
  overlay.querySelector('.lb-comment-form').addEventListener('submit', submitComment);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.classList.contains('lb-stage')) {
      if (commentsOpen) return setComments(false); // first tap closes the panel
      close();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (overlay.hidden) return;
    if (e.key === 'Escape') return commentsOpen ? setComments(false) : close();
    // Don't hijack arrows while typing a comment.
    if (e.target.matches('input, textarea')) return;
    if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });

  // Swipe navigation (touch) — disabled while an image is pinch/double-tap zoomed.
  let touchX = null;
  overlay.addEventListener('touchstart', (e) => (touchX = e.touches.length === 1 ? e.touches[0].clientX : null), {
    passive: true,
  });
  overlay.addEventListener('touchend', (e) => {
    if (touchX === null || zoomed || commentsOpen) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 48) step(dx > 0 ? -1 : 1);
  });
}

// --- Pinch / double-tap zoom for photos (11.8) ---
let zoomed = false;
const touchDist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

function setupZoom(img) {
  let scale = 1, tx = 0, ty = 0, startDist = 0, startScale = 1, lastTap = 0;
  let panning = false, panX = 0, panY = 0, raf = 0;
  // Batch transform writes to one per animation frame — writing on every
  // touchmove is what made pinch/pan jitter on phones.
  const paint = () => {
    raf = 0;
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  };
  const apply = () => {
    zoomed = scale > 1;
    img.style.cursor = scale > 1 ? 'grab' : '';
    img.style.willChange = scale > 1 ? 'transform' : 'auto';
    if (!raf) raf = requestAnimationFrame(paint);
  };
  const smooth = (on) => (img.style.transition = on ? 'transform .18s ease' : 'none');
  const reset = () => {
    smooth(true); // animate the snap-back
    scale = 1;
    tx = ty = 0;
    apply();
  };
  const zoomIn = () => {
    smooth(true); // animate the discrete jump
    scale = 2.5;
    apply();
  };
  img.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      smooth(false); // no transition mid-gesture
      startDist = touchDist(e.touches);
      startScale = scale;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTap < 300) {
        scale > 1 ? reset() : zoomIn();
        e.preventDefault();
      }
      lastTap = now;
      if (scale > 1) {
        smooth(false);
        panning = true;
        panX = e.touches[0].clientX - tx;
        panY = e.touches[0].clientY - ty;
      }
    }
  }, { passive: false });
  img.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      scale = Math.min(4, Math.max(1, startScale * (touchDist(e.touches) / startDist)));
      if (scale === 1) tx = ty = 0;
      apply();
    } else if (panning && scale > 1) {
      e.preventDefault();
      tx = e.touches[0].clientX - panX;
      ty = e.touches[0].clientY - panY;
      apply();
    }
  }, { passive: false });
  img.addEventListener('touchend', () => {
    panning = false;
    if (scale <= 1) reset();
  });
  img.addEventListener('dblclick', () => (scale > 1 ? reset() : zoomIn()));
}

function show() {
  const item = list[idx];
  if (!item) return close();
  zoomed = false;
  const stage = overlay.querySelector('.lb-stage');
  stage.innerHTML = '';

  if (item.type === 'video') {
    const video = document.createElement('video');
    video.controls = true;
    video.autoplay = true;
    video.muted = true; // browsers only autoplay muted
    video.playsInline = true;
    video.preload = 'metadata';
    video.poster = `/media/poster/${item.id}`;
    video.src = `/media/file/${item.id}`;
    // Some phone videos (e.g. iPhone HEVC) won't decode in every browser.
    // Fall back to the poster + a download prompt instead of a black box.
    video.addEventListener('error', () => showVideoFallback(stage, item), { once: true });
    stage.appendChild(video);

    // Muted-autoplay needs a tap for sound. Show an unmute pill until the user
    // enables audio (via this button or the native volume control); remember the
    // choice so later videos start with sound where the browser allows it.
    const unmute = document.createElement('button');
    unmute.className = 'lb-unmute';
    unmute.innerHTML = '🔇 Tap for sound';
    const enableSound = () => {
      video.muted = false;
      video.volume = 1;
      soundOn = true;
    };
    unmute.addEventListener('click', (e) => {
      e.stopPropagation();
      enableSound();
    });
    video.addEventListener('volumechange', () => {
      unmute.style.display = video.muted ? '' : 'none';
    });
    stage.appendChild(unmute);
    if (soundOn) {
      // A prior tap this session usually lets us start unmuted.
      video.addEventListener('canplay', enableSound, { once: true });
    }
  } else {
    const img = document.createElement('img');
    // Animated GIFs lose animation in the static preview — show the original
    img.src = item.ext === 'gif' ? `/media/file/${item.id}` : `/media/preview/${item.id}`;
    img.alt = item.filename;
    stage.appendChild(img);
    setupZoom(img);
  }

  overlay.querySelector('.lb-by').textContent = `by ${item.uploader_name}`;
  overlay.querySelector('.lb-date').textContent = item.taken_at ? fmtDate(item.taken_at) : '';
  overlay.querySelector('.lb-download').href = `/media/file/${item.id}?download=1`;
  overlay.querySelector('.lb-delete').hidden = !(me.isAdmin || item.uploader_id === me.id);
  const pinBtn = overlay.querySelector('.lb-pin');
  pinBtn.hidden = !me.isAdmin;
  pinBtn.classList.toggle('active', !!item.pinned_at);
  pinBtn.setAttribute('aria-label', item.pinned_at ? 'Unpin' : 'Pin');
  updateFavBtn(item);
  setComments(false); // collapse panel on every item change
  // Lazy comments: show the count from the listing, but don't fetch the thread
  // until the panel is actually opened (fetching on every swipe janked mobile).
  comments = [];
  commentsLoadedFor = null;
  overlay.querySelector('.lb-comment-n').textContent = item.comment_count || '';
  overlay.querySelector('.lb-prev').style.visibility = idx > 0 ? 'visible' : 'hidden';
  // Show "next" only if there's really a next item or another page still to fetch.
  // (opts.loadMore is always a function, so check hasMore() — not its existence.)
  const more = idx < list.length - 1 || (opts.hasMore ? opts.hasMore() : false);
  overlay.querySelector('.lb-next').style.visibility = more ? 'visible' : 'hidden';
  onNavigate(item);

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

// --- Comments ---
let commentsOpen = false;
let comments = [];
let commentsLoadedFor = null; // media id whose thread is currently loaded

function setComments(open) {
  commentsOpen = open;
  overlay.querySelector('.lb-comments').classList.toggle('open', open);
  if (open) {
    const id = list[idx]?.id;
    if (id && commentsLoadedFor !== id) loadComments(id); // fetch only on first open
    setTimeout(() => overlay.querySelector('.lb-comment-input').focus(), 50);
  }
}

function toggleComments() {
  setComments(!commentsOpen);
}

async function loadComments(mediaId) {
  try {
    const r = await fetch(`/api/media/${mediaId}/comments`);
    if (!r.ok) return;
    const data = await r.json();
    if (list[idx]?.id !== mediaId) return; // navigated away while loading
    comments = data;
    commentsLoadedFor = mediaId;
    renderComments();
  } catch {
    /* offline — leave panel empty */
  }
}

function renderComments() {
  overlay.querySelector('.lb-comment-n').textContent = comments.length || '';
  if (list[idx]) list[idx].comment_count = comments.length; // keep badge/count honest

  const ul = overlay.querySelector('.lb-comments-list');
  ul.innerHTML = '';
  if (!comments.length) {
    const li = document.createElement('li');
    li.className = 'lb-comment-empty';
    li.textContent = 'No comments yet — say something sweet ♥';
    ul.appendChild(li);
    return;
  }
  for (const c of comments) {
    const li = document.createElement('li');
    li.className = 'lb-comment-item';
    const who = document.createElement('span');
    who.className = 'lb-comment-who';
    who.textContent = c.guest_name;
    const body = document.createElement('span');
    body.className = 'lb-comment-body';
    body.textContent = c.body; // textContent → XSS-safe
    li.append(who, body);
    if (me.isAdmin || c.guest_id === me.id) {
      const del = document.createElement('button');
      del.className = 'lb-comment-del';
      del.textContent = '✕';
      del.setAttribute('aria-label', 'Delete comment');
      del.addEventListener('click', () => deleteComment(c.id));
      li.appendChild(del);
    }
    ul.appendChild(li);
  }
  ul.scrollTop = ul.scrollHeight;
}

async function submitComment(e) {
  e.preventDefault();
  const input = overlay.querySelector('.lb-comment-input');
  const body = input.value.trim();
  if (!body) return;
  const mediaId = list[idx].id;
  input.value = '';
  try {
    const r = await fetch(`/api/media/${mediaId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    if (!r.ok) throw new Error();
    const c = await r.json();
    if (list[idx]?.id === mediaId) {
      comments.push(c);
      renderComments();
    }
  } catch {
    input.value = body; // restore so the guest can retry
    alert('Could not post your comment — try again.');
  }
}

async function deleteComment(id) {
  const r = await fetch(`/api/comments/${id}`, { method: 'DELETE' });
  if (!r.ok) return;
  comments = comments.filter((c) => c.id !== id);
  renderComments();
}

function updateFavBtn(item) {
  const btn = overlay.querySelector('.lb-fav');
  btn.classList.toggle('faved', !!item.faved);
  btn.querySelector('.lb-fav-n').textContent = item.fav_count || '';
}

async function toggleFav() {
  const item = list[idx];
  const faved = !item.faved;
  // optimistic
  item.faved = faved ? 1 : 0;
  item.fav_count = Math.max(0, (item.fav_count || 0) + (faved ? 1 : -1));
  updateFavBtn(item);
  onFaved(item);
  try {
    const r = await fetch(`/api/media/${item.id}/favorite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faved }),
    });
    if (!r.ok) throw new Error();
    const d = await r.json();
    item.faved = d.faved ? 1 : 0;
    item.fav_count = d.count;
  } catch {
    item.faved = faved ? 0 : 1; // revert
    item.fav_count = Math.max(0, item.fav_count + (faved ? -1 : 1));
  }
  updateFavBtn(item);
  onFaved(item);
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
  setComments(false);
  onNavigate(null); // clear the #photo deep-link
}
