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

// Immersive view: chrome hidden, pure-black backdrop. Persists across
// prev/next navigation; reset whenever the lightbox is (re)opened.
let immersive = false;
function setImmersive(on) {
  immersive = on;
  overlay.classList.toggle('lb-immersive', on);
}

// Pending single-tap (chrome toggle), cancelled when the tap turns out to be
// the first half of a double-tap zoom.
let tapTimer = 0;
function cancelTap() {
  clearTimeout(tapTimer);
  tapTimer = 0;
}
let suppressClicksUntil = 0; // set on mouse-drag release — that click is not a tap

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
  setImmersive(false); // reopen always starts with chrome visible
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
        <button class="lb-fav btn-lb" aria-label="Favorite"><svg class="lb-fav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span class="lb-fav-n"></span></button>
        <button class="lb-comment btn-lb" aria-label="Comments"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg><span class="lb-comment-n"></span></button>
        <button class="lb-pin btn-lb" aria-label="Pin" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/></svg></button>
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
  // On touch devices, "Save" opens the native share sheet with the original
  // file — iOS/Android offer "Save Image/Video" straight into the photo
  // library there, instead of a Files download. Falls back to the plain
  // download link when share isn't available (or the fetch/share fails).
  const dl = overlay.querySelector('.lb-download');
  // While the original streams down (minutes for a big video), the button
  // shows a little pie that fills with the download so the wait reads as
  // progress, not a hang. No Content-Length → indeterminate spinning wedge.
  const showPie = (determinate) => {
    dl.innerHTML = `<span class="lb-save-pie"${determinate ? '' : ' data-spin'}></span><span class="lb-save-pct">${determinate ? '0%' : 'Saving…'}</span>`;
  };
  const setPie = (p) => {
    dl.querySelector('.lb-save-pie').style.setProperty('--p', p);
    dl.querySelector('.lb-save-pct').textContent = `${Math.round(p * 100)}%`;
  };
  dl.addEventListener('click', async (e) => {
    const item = list[idx];
    if (!item || !('ontouchstart' in window) || !navigator.canShare) return; // plain download
    e.preventDefault();
    if (dl.dataset.busy) return; // one save at a time
    dl.dataset.busy = '1';
    const label = dl.textContent;
    try {
      const r = await fetch(`/media/file/${item.id}`);
      if (!r.ok) throw new Error();
      const total = +r.headers.get('Content-Length') || 0;
      let blob;
      if (r.body && total) {
        showPie(true);
        const reader = r.body.getReader();
        const chunks = [];
        let got = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          got += value.length;
          setPie(Math.min(1, got / total));
        }
        blob = new Blob(chunks, { type: r.headers.get('Content-Type') || '' });
      } else {
        showPie(false);
        blob = await r.blob();
      }
      const file = new File([blob], item.filename, { type: blob.type });
      if (!navigator.canShare({ files: [file] })) throw new Error();
      await navigator.share({ files: [file] });
    } catch (err) {
      // Cancelling the sheet is fine; anything else falls back to download.
      if (err?.name !== 'AbortError') location.href = `/media/file/${item.id}?download=1`;
    } finally {
      dl.textContent = label;
      delete dl.dataset.busy;
    }
  });
  overlay.querySelector('.lb-comment').addEventListener('click', toggleComments);
  overlay.querySelector('.lb-comments-close').addEventListener('click', () => setComments(false));
  overlay.querySelector('.lb-comment-form').addEventListener('submit', submitComment);
  // Single tap (photo or background) toggles the chrome — iOS gallery model.
  // Closing is via the X, Escape, or swipe-down; tap-to-close is gone.
  overlay.addEventListener('click', (e) => {
    if (Date.now() < suppressClicksUntil) return; // tail end of a mouse drag-pan
    if (e.target.closest('button, a, input, .lb-caption, .lb-comments')) return; // controls keep working
    if (e.target.tagName === 'VIDEO') return; // native player owns video taps
    if (commentsOpen) return setComments(false); // first tap closes the panel
    // Wait out the double-tap window: a second tap means zoom, not toggle.
    if (tapTimer) return cancelTap();
    tapTimer = setTimeout(() => {
      tapTimer = 0;
      setImmersive(!immersive);
    }, 300);
  });

  // Trackpad pinch over the background must not zoom the page itself.
  overlay.addEventListener('wheel', (e) => e.ctrlKey && e.preventDefault(), { passive: false });

  document.addEventListener('keydown', (e) => {
    if (overlay.hidden) return;
    if (e.key === 'Escape') return commentsOpen ? setComments(false) : close();
    // Don't hijack arrows while typing a comment.
    if (e.target.matches('input, textarea')) return;
    if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });

  // Stage touch gestures — disabled while an image is pinch/double-tap zoomed
  // or the comments panel is open. The axis locks after ~10px of movement:
  // horizontal swipes navigate, a vertical drag pulls the photo down to
  // dismiss (past 25% of the viewport) or springs back on release.
  const stageEl = overlay.querySelector('.lb-stage');
  let touch = null; // { x, y, axis: null|'h'|'v', dy }
  const resetDrag = (animate) => {
    stageEl.style.transition = animate ? 'transform .18s ease' : '';
    stageEl.style.transform = '';
    overlay.style.transition = '';
    overlay.style.background = '';
  };
  overlay.addEventListener(
    'touchstart',
    (e) => {
      touch =
        e.touches.length === 1
          ? { x: e.touches[0].clientX, y: e.touches[0].clientY, axis: null, dy: 0 }
          : null;
    },
    { passive: true },
  );
  overlay.addEventListener(
    'touchmove',
    (e) => {
      if (!touch || e.touches.length !== 1 || zoomed || commentsOpen) return;
      const dx = e.touches[0].clientX - touch.x;
      const dy = e.touches[0].clientY - touch.y;
      if (!touch.axis) {
        if (Math.hypot(dx, dy) < 10) return;
        touch.axis = Math.abs(dy) > Math.abs(dx) ? 'v' : 'h';
        if (touch.axis === 'v') {
          stageEl.style.transition = 'none';
          overlay.style.transition = 'none'; // backdrop fade tracks the finger directly
        }
      }
      if (touch.axis !== 'v') return;
      e.preventDefault(); // we own the drag — no page scroll behind
      touch.dy = Math.max(0, dy);
      stageEl.style.transform = `translateY(${touch.dy}px)`;
      const k = Math.min(1, touch.dy / (window.innerHeight * 0.25));
      overlay.style.background = `rgba(0, 0, 0, ${1 - 0.55 * k})`;
    },
    { passive: false },
  );
  overlay.addEventListener('touchend', (e) => {
    if (!touch) return;
    const t = touch;
    touch = null;
    if (t.axis === 'v') {
      if (t.dy > window.innerHeight * 0.25) {
        resetDrag(false);
        close();
      } else {
        resetDrag(true); // spring back
      }
      return;
    }
    if (zoomed || commentsOpen) return;
    const dx = e.changedTouches[0].clientX - t.x;
    if (t.axis === 'h' && Math.abs(dx) > 48) step(dx > 0 ? -1 : 1);
  });
}

// --- Focal pinch / double-tap zoom for photos (iPhone-style) ---
// Transform model: translate(tx,ty) scale(s) about the image centre. Gesture
// points are taken relative to the untransformed centre, so the anchor step
// t' = m − (s'/s)·(m − t) keeps the image point under the fingers fixed while
// the scale changes, and midpoint movement pans the photo with the fingers.
let zoomed = false;
const MAX_SCALE = 4;
const TAP_ZOOM_SCALE = 2.5;
const RUBBER = 0.3; // attenuation past the pan bounds / beyond the max scale
const touchDist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
const touchMid = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function setupZoom(img) {
  // tx/ty/scale hold the raw gesture state; paint() renders the rubber-banded
  // view so overscroll stays elastic without corrupting the anchor math.
  let scale = 1,
    tx = 0,
    ty = 0,
    raf = 0;
  let base = null; // untransformed centre + layout size (offset* metrics ignore transforms)
  let pinch = null; // { dist, mid } at the previous pinch event
  let panning = false,
    panX = 0,
    panY = 0,
    lastTap = 0,
    tapZoomed = false; // a double-tap zoom just ran — its touchend must not settle()

  const measure = () => {
    const s = img.parentElement.getBoundingClientRect();
    base = {
      cx: s.left + img.offsetLeft + img.offsetWidth / 2,
      cy: s.top + img.offsetTop + img.offsetHeight / 2,
      w: img.offsetWidth,
      h: img.offsetHeight,
    };
  };
  // How far the photo may translate before its edge leaves the viewport edge.
  const bounds = (s) => ({
    x: Math.max(0, (s * base.w - window.innerWidth) / 2),
    y: Math.max(0, (s * base.h - window.innerHeight) / 2),
  });
  const rubber = (v, b) => (Math.abs(v) <= b ? v : Math.sign(v) * (b + (Math.abs(v) - b) * RUBBER));

  // Batch transform writes to one per animation frame — writing on every
  // touchmove is what made pinch/pan jitter on phones.
  const paint = () => {
    raf = 0;
    let ps = scale,
      px = tx,
      py = ty;
    if (base) {
      if (ps > MAX_SCALE) ps = MAX_SCALE + (ps - MAX_SCALE) * RUBBER;
      if (ps < 1) ps = Math.max(0.9, 1 - (1 - ps) * 0.35); // elastic under-pinch
      const b = bounds(ps);
      px = rubber(tx, b.x);
      py = rubber(ty, b.y);
    }
    img.style.transform = `translate(${px}px, ${py}px) scale(${ps})`;
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
  // Fingers lifted: spring the raw state back inside the legal range.
  const settle = () => {
    if (scale <= 1) {
      // A real gesture ending at/under fit restores the chrome; a plain tap
      // (nothing to reset) must not fight the tap-toggle.
      if (scale < 1) setImmersive(false);
      return reset();
    }
    smooth(true);
    scale = Math.min(MAX_SCALE, scale);
    const b = bounds(scale);
    tx = clamp(tx, -b.x, b.x);
    ty = clamp(ty, -b.y, b.y);
    apply();
  };
  // Discrete focal jump to the tapped point (hard-clamped, no rubber).
  const zoomTo = (x, y) => {
    // Overshooting ease (easeOutBack): the zoom-in bounces slightly past
    // 2.5× and settles — same rubber feel as the pinch release.
    img.style.transition = 'transform .32s cubic-bezier(.34, 1.56, .64, 1)';
    measure();
    const m = { x: x - base.cx, y: y - base.cy };
    const f = TAP_ZOOM_SCALE / scale;
    scale = TAP_ZOOM_SCALE;
    const b = bounds(scale);
    tx = clamp(m.x - f * (m.x - tx), -b.x, b.x);
    ty = clamp(m.y - f * (m.y - ty), -b.y, b.y);
    apply();
  };

  img.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length === 2) {
        smooth(false); // no transition mid-gesture
        measure();
        pinch = { dist: touchDist(e.touches), mid: touchMid(e.touches) };
        panning = false;
        setImmersive(true); // zooming in means looking at the photo — drop the chrome
      } else if (e.touches.length === 1) {
        const now = Date.now();
        if (now - lastTap < 300) {
          const t = e.touches[0];
          if (scale > 1) {
            reset();
            setImmersive(false); // back to the overview — controls return
          } else {
            zoomTo(t.clientX, t.clientY);
          }
          e.preventDefault();
          cancelTap(); // it was a double-tap, not a chrome toggle
          lastTap = 0; // a third tap starts fresh
          tapZoomed = true;
          // Don't fall through to pan-arming: its smooth(false) would kill
          // the zoom tween before it ever painted.
          return;
        }
        lastTap = now;
        if (scale > 1) {
          smooth(false);
          panning = true;
          panX = e.touches[0].clientX - tx;
          panY = e.touches[0].clientY - ty;
        }
      }
    },
    { passive: false },
  );
  img.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length === 2 && pinch) {
        e.preventDefault();
        const dist = touchDist(e.touches);
        const mid = touchMid(e.touches);
        // Raw scale may drift past the limits; paint() renders it elastically.
        const next = clamp(scale * (dist / pinch.dist), 0.5, MAX_SCALE * 1.5);
        const f = next / scale;
        // Anchor: the image point that was under the previous midpoint lands
        // under the current one — focal zoom and two-finger pan in one step.
        tx = mid.x - base.cx - f * (pinch.mid.x - base.cx - tx);
        ty = mid.y - base.cy - f * (pinch.mid.y - base.cy - ty);
        scale = next;
        pinch = { dist, mid };
        apply();
      } else if (panning && e.touches.length === 1 && scale > 1) {
        e.preventDefault();
        tx = e.touches[0].clientX - panX;
        ty = e.touches[0].clientY - panY;
        apply();
      }
    },
    { passive: false },
  );
  const endGesture = (e) => {
    if (tapZoomed) {
      // The lift after a double-tap zoom: settle()'s smooth(true) would
      // replace the springy tween mid-flight — leave the animation alone.
      tapZoomed = false;
      panning = false;
      return;
    }
    if (e.touches.length === 1 && pinch) {
      // Pinch → one-finger pan handoff without a jump.
      pinch = null;
      if (scale > 1) {
        panning = true;
        panX = e.touches[0].clientX - tx;
        panY = e.touches[0].clientY - ty;
      }
      return;
    }
    if (e.touches.length > 0) return;
    panning = false;
    pinch = null;
    settle();
  };
  img.addEventListener('touchend', endGesture);
  img.addEventListener('touchcancel', endGesture);
  img.addEventListener('dblclick', (e) => {
    if (scale > 1) {
      reset();
      setImmersive(false); // back to the overview — controls return
    } else {
      zoomTo(e.clientX, e.clientY);
    }
  });

  // --- Desktop: trackpad pinch / scroll-pan / drag-pan ---
  // Continuous focal zoom at the cursor, hard-clamped (no rubber — there is no
  // release moment to spring back on). Fit ↔ zoomed also drives the chrome.
  const desktopZoom = (x, y, factor) => {
    measure();
    smooth(false);
    const next = clamp(scale * factor, 1, MAX_SCALE);
    if (next === scale) return;
    const f = next / scale;
    const m = { x: x - base.cx, y: y - base.cy };
    scale = next;
    const b = bounds(scale);
    tx = clamp(m.x - f * (m.x - tx), -b.x, b.x);
    ty = clamp(m.y - f * (m.y - ty), -b.y, b.y);
    setImmersive(scale > 1); // zoomed = immersive, back to fit = controls
    apply();
  };
  // Chrome/Firefox report trackpad pinch as ctrl+wheel; a plain wheel while
  // zoomed pans (two-finger scroll around the photo).
  img.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) {
        e.preventDefault(); // ours — not browser page zoom
        desktopZoom(e.clientX, e.clientY, Math.exp(-e.deltaY / 100));
      } else if (scale > 1) {
        e.preventDefault();
        measure();
        const b = bounds(scale);
        tx = clamp(tx - e.deltaX, -b.x, b.x);
        ty = clamp(ty - e.deltaY, -b.y, b.y);
        apply();
      }
    },
    { passive: false },
  );
  // Safari (macOS) reports trackpad pinch as gesture* events instead. Only
  // wire them where there is no touchscreen — iOS fires them alongside touch
  // events and the pinch would apply twice.
  if (!('ontouchstart' in window)) {
    let gestureScale = 1;
    img.addEventListener('gesturestart', (e) => {
      e.preventDefault();
      gestureScale = e.scale;
    });
    img.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      desktopZoom(e.clientX, e.clientY, e.scale / gestureScale);
      gestureScale = e.scale;
    });
    img.addEventListener('gestureend', (e) => e.preventDefault());
  }
  // Mouse drag pans when zoomed; rubber-band + settle work as on touch.
  img.addEventListener('mousedown', (e) => {
    if (scale <= 1 || e.button !== 0) return;
    e.preventDefault(); // no native image drag / text selection
    smooth(false);
    const sx = e.clientX - tx;
    const sy = e.clientY - ty;
    let moved = false;
    img.style.cursor = 'grabbing';
    const move = (ev) => {
      moved = true;
      tx = ev.clientX - sx;
      ty = ev.clientY - sy;
      apply();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      img.style.cursor = 'grab';
      // The click that follows a drag is not a tap — keep it from toggling chrome.
      if (moved) suppressClicksUntil = Date.now() + 50;
      settle();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
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
    unmute.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg><span>Tap for sound</span>';
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
