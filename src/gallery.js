// Gallery grid: cursor-paged listing, sort/filter toolbar synced to the URL,
// lazy thumbnails, infinite scroll, day grouping, favorites, "new since last
// visit", deep links, and lightbox hand-off.

import { openLightbox, initLightbox } from './lightbox.js';
import SITE, { t } from './site.js';

let me;
let state = { sort: 'taken-desc', type: '', uploader: '' };
const items = []; // stable array identity — the lightbox holds this same reference
let nextCursor = null;
let loading = false;
let loadGen = 0; // bumped on reload; in-flight loadPage bails if its generation is stale
let pinnedDirty = false; // a pin/unpin happened in the lightbox — reload the grid on close
let returnId = null; // item to re-center after the close-triggered reload settles
let fmt; // time formatter
let fmtDay; // day-header formatter
let lastDayLabel = null; // tracks day-group boundaries during append
let inEveryoneSection = false; // day headers only apply to the main (non-pinned) section
let totals = { photo: 0, video: 0 }; // library counts, kept live as items delete

const grid = () => document.getElementById('gallery');

export function initGallery(user) {
  me = user;
  const tz = me.eventTz || 'Europe/Rome';
  fmt = new Intl.DateTimeFormat(SITE.intl, {
    timeZone: tz,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  fmtDay = new Intl.DateTimeFormat(SITE.intl, {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  readStateFromUrl();
  bindToolbar();

  initLightbox({
    me,
    fmtDate: (iso) => fmt.format(new Date(iso)),
    onDeleted: removeItem,
    // Pinning no longer interrupts the lightbox — reload the grid on close.
    onPinned: () => (pinnedDirty = true),
    onFaved: updateFavUi,
    // Land the guest on the item they left off at, centered — they may have
    // swiped hundreds of photos past where they opened the lightbox.
    onClosed: (item) => {
      if (!item) return;
      if (pinnedDirty)
        returnId = item.id; // grid is about to reload — center after it settles
      else returnToTile(item.id);
    },
    // A rotation changed the pixels behind this id — swap every grid copy's thumb.
    onRotated: (item) => {
      for (const img of grid().querySelectorAll(`.cell[data-id="${item.id}"] img`)) {
        img.src = `/media/thumb/${item.id}?v=${item.rev}`;
      }
    },
    onNavigate: (item) => {
      setHash(item?.id);
      if (item) return markSeen(item);
      if (pinnedDirty) {
        pinnedDirty = false;
        const id = returnId;
        returnId = null;
        // Lightbox just closed — bring the pinned section up to date, then
        // page forward until the guest's item is back on screen.
        reload().then(() => returnAfterReload(id));
      }
    },
    onUploaderClick: (uploaderId) => {
      if (uploaderId == null) return;
      state.uploader = String(uploaderId);
      syncUrl();
      updateClearBtn();
      reload(); // reloads filtered + refreshes the uploader dropdown selection
    },
  });

  const sentinel = document.getElementById('sentinel');
  new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && nextCursor && !loading) loadPage();
    },
    { rootMargin: '600px' },
  ).observe(sentinel);

  window.addEventListener('hashchange', maybeOpenFromHash);
  initLive();
  reload();
}

// --- Live updates (Server-Sent Events): new uploads appear on their own ---
let liveNew = 0;
let liveTimer = null;

function initLive() {
  let es;
  const connect = () => {
    es = new EventSource('/api/events');
    es.onmessage = (e) => {
      let d;
      try {
        d = JSON.parse(e.data);
      } catch {
        return;
      }
      if (d.type === 'deleted') return removeItem(d.id); // someone deleted it → sync
      if (d.type === 'ready' && items.some((x) => x.id === d.id)) return; // already shown

      // New content is available. If the viewer is at the top and not busy, just
      // refresh so it appears; otherwise show a gentle pill so we don't yank scroll.
      const busy =
        document.body.classList.contains('lightbox-open') ||
        document.body.classList.contains('selecting') ||
        document.body.classList.contains('uploading'); // don't refetch mid-upload
      if (window.scrollY < 300 && !busy) {
        clearTimeout(liveTimer);
        liveTimer = setTimeout(reload, 1000); // debounce bursts of uploads
      } else {
        liveNew++;
        showLivePill();
      }
    };
    es.onerror = () => {}; // EventSource reconnects automatically
  };
  connect();
}

function showLivePill() {
  let el = document.getElementById('livePill');
  if (!el) {
    el = document.createElement('button');
    el.id = 'livePill';
    el.className = 'live-pill';
    el.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      pinnedCollapsed = true; // the guest came for the NEW photos — don't land them on pins
      reload();
    });
    document.body.appendChild(el);
  }
  el.textContent = t.livePill(liveNew);
}

function clearLivePill() {
  liveNew = 0;
  document.getElementById('livePill')?.remove();
}

/** Full refresh (initial load, filter change, new upload finished). */
export function reload() {
  loadGen++; // invalidate any in-flight loadPage so its response is discarded
  clearLivePill();
  items.length = 0; // mutate in place — keep the array identity the lightbox references
  nextCursor = null;
  lastDayLabel = null;
  inEveryoneSection = false;
  loading = false;
  grid().innerHTML = '';
  setEmpty(t.loading);
  loadUploaders(); // new uploaders (incl. you) show up in the filter without a refresh
  return loadPage(true);
}

// Center the grid tile for `id` in the viewport and pulse it so the eye lands
// there. Pinned items render twice (featured copy first, in-place copy later in
// the chronological flow) — the last match is the one matching browsing order.
function returnToTile(id) {
  const cells = grid().querySelectorAll(`.cell[data-id="${id}"]`);
  const el = cells[cells.length - 1];
  if (!el) return false; // deleted item or single-item deep-link view — nothing to return to
  el.scrollIntoView({ block: 'center' }); // instant: the jump lands before the gallery repaints
  el.classList.add('cell-return');
  el.addEventListener('animationend', () => el.classList.remove('cell-return'), { once: true });
  return true;
}

// After a close-triggered reload the target may be pages deep — keep loading
// until its tile exists, bounded so a miss can't fetch the whole gallery.
async function returnAfterReload(id) {
  if (!id) return;
  const gen = loadGen; // a user-initiated reload mid-hunt abandons the scroll
  for (let i = 0; i < 10; i++) {
    if (gen !== loadGen) return;
    if (returnToTile(id)) return;
    if (!nextCursor) return; // exhausted: stay at the top, same as before this feature
    await loadPage();
  }
}

function readStateFromUrl() {
  const q = new URLSearchParams(location.search);
  if (q.get('sort')) state.sort = q.get('sort');
  state.type = q.get('type') || '';
  state.uploader = q.get('uploader') || '';
}

function syncUrl() {
  const q = new URLSearchParams();
  if (state.sort !== 'taken-desc') q.set('sort', state.sort);
  if (state.type) q.set('type', state.type);
  if (state.uploader) q.set('uploader', state.uploader);
  const qs = q.toString();
  const hash = location.hash || '';
  history.replaceState(null, '', (qs ? `?${qs}` : location.pathname) + hash);
}

// Show "Clear filters" only when something is actually filtered/re-sorted.
let viewWasFiltered = false;
function updateClearBtn() {
  const active = state.sort !== 'taken-desc' || !!state.type || !!state.uploader;
  // Edge-triggered auto-fold: ENTERING a filtered/sorted view folds the pins
  // (the guest is on a mission; curated pins are in the way), RETURNING to the
  // default view unfolds them. Only the transition acts, so a manual toggle
  // holds for as long as the view kind doesn't change.
  if (active !== viewWasFiltered) setPinnedCollapsed(active);
  viewWasFiltered = active;
  const btn = document.getElementById('clearFilters');
  if (btn) btn.hidden = !active;
}

function clearFilters() {
  collapsedDays.clear(); // back to the default view: everything unfolds
  state.sort = 'taken-desc';
  state.type = '';
  state.uploader = '';
  document.getElementById('sortSel').value = 'taken-desc';
  document.getElementById('uploaderSel').value = '';
  for (const b of document.getElementById('typeSeg').querySelectorAll('button')) {
    b.classList.toggle('active', b.dataset.type === '');
  }
  syncUrl();
  updateClearBtn();
  reload();
}

function bindToolbar() {
  const seg = document.getElementById('typeSeg');
  for (const btn of seg.querySelectorAll('button')) {
    btn.classList.toggle('active', btn.dataset.type === state.type);
    btn.addEventListener('click', () => {
      state.type = btn.dataset.type;
      for (const b of seg.querySelectorAll('button')) b.classList.toggle('active', b === btn);
      syncUrl();
      updateClearBtn();
      reload();
    });
  }
  const sortSel = document.getElementById('sortSel');
  sortSel.value = state.sort;
  sortSel.addEventListener('change', () => {
    state.sort = sortSel.value;
    syncUrl();
    updateClearBtn();
    reload();
  });
  const upSel = document.getElementById('uploaderSel');
  upSel.addEventListener('change', () => {
    state.uploader = upSel.value;
    syncUrl();
    updateClearBtn();
    reload();
  });
  document.getElementById('clearFilters').addEventListener('click', clearFilters);
  updateClearBtn();

  // --- Selection + bulk download ---
  document.getElementById('selectBtn').addEventListener('click', () => setSelectMode(true));
  document.getElementById('selCancelBtn').addEventListener('click', () => setSelectMode(false));
  document.getElementById('selAllBtn').addEventListener('click', () => {
    for (const item of items) selected.add(item.id);
    updateSelectionUi();
  });
  document.getElementById('selDownloadBtn').addEventListener('click', () => {
    if (selected.size) postDownload({ ids: [...selected].join(',') });
  });
  document.getElementById('downloadAllBtn').addEventListener('click', () => {
    const fields = { all: '1' };
    if (state.type) fields.type = state.type;
    if (state.uploader) fields.uploader = state.uploader;
    postDownload(fields);
  });

  // Admin-only bulk delete of the current selection.
  const delBtn = document.getElementById('selDeleteBtn');
  if (me.isAdmin) {
    delBtn.hidden = false;
    delBtn.addEventListener('click', deleteSelected);
  }
}

async function deleteSelected() {
  if (!selected.size) return;
  const ids = [...selected];
  if (!confirm(t.confirmDeleteMany(ids.length))) return;
  // Delete with light concurrency; remove each from the grid as it goes.
  let i = 0;
  async function worker() {
    while (i < ids.length) {
      const id = ids[i++];
      try {
        const r = await fetch(`/api/media/${id}`, { method: 'DELETE' });
        if (r.ok) removeItem(id);
      } catch {
        /* skip; live SSE 'deleted' will reconcile others */
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  setSelectMode(false);
  toast(t.deletedToast);
}

// --- Selection mode ---
let selectMode = false;
const selected = new Set();

function setSelectMode(on) {
  selectMode = on;
  if (!on) selected.clear();
  document.body.classList.toggle('selecting', on);
  document.getElementById('selectBar').hidden = !on;
  updateSelectionUi();
}

function updateSelectionUi() {
  document.getElementById('selCount').textContent = t.nSelected(selected.size);
  document.getElementById('selDownloadBtn').disabled = !selected.size;
  for (const el of grid().querySelectorAll('.cell')) {
    el.classList.toggle('selected', selected.has(el.dataset.id));
  }
}

/** Plain form POST so the browser streams the zip straight to disk. Shows a brief prep toast. */
function postDownload(fields) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = '/api/download';
  for (const [k, v] of Object.entries(fields)) {
    const inp = document.createElement('input');
    inp.type = 'hidden';
    inp.name = k;
    inp.value = v;
    form.appendChild(inp);
  }
  document.body.appendChild(form);
  form.submit();
  form.remove();
  toast(t.zipToast);
}

async function loadUploaders() {
  const r = await fetch('/api/uploaders');
  if (!r.ok) return;
  const uploaders = await r.json();
  const sel = document.getElementById('uploaderSel');
  sel.innerHTML = `<option value="">${t.everyone}</option>`;
  for (const u of uploaders) {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = `${u.name} (${u.count})`;
    sel.appendChild(opt);
  }
  sel.value = state.uploader;
}

async function loadPage(first = false) {
  loading = true;
  const gen = loadGen; // capture; if reload() bumps loadGen mid-flight, discard this response
  const [sort, dir] = state.sort.split('-');
  const q = new URLSearchParams({ sort, dir: dir || 'desc' });
  if (state.type) q.set('type', state.type);
  if (state.uploader) q.set('uploader', state.uploader);
  if (nextCursor) q.set('cursor', nextCursor);

  try {
    const r = await fetch(`/api/media?${q}`);
    if (gen !== loadGen) return; // a reload happened while we awaited — drop stale data
    if (r.status === 401) return location.replace('/login.html');
    const data = await r.json();
    if (gen !== loadGen) return;
    nextCursor = data.nextCursor;

    if (first && data.totals) {
      totals = { photo: data.totals.photo || 0, video: data.totals.video || 0 };
      renderCount();
    }
    if (first && data.newCount) showNewBanner(data.newCount);

    const grouped = state.sort.startsWith('taken');
    if (first && data.pinned?.length) {
      addSectionHeader(t.pinnedHeader, PIN_SVG, true);
      appendItems(data.pinned, false);
      addSectionHeader(t.everyoneHeader);
      applyPinnedCollapsed(); // re-apply a fold that survived the reload
    }
    inEveryoneSection = true;
    appendItems(data.items, grouped);

    const anything = (first ? data.pinned?.length : 0) || items.length;
    if (first && !anything) {
      setEmpty(state.sort === 'loved' ? t.emptyLoved : t.emptyGallery);
    } else {
      setEmpty(null);
    }
    // After the first successful load, stamp "seen" so the next visit compares against now.
    if (first) fetch('/api/seen', { method: 'POST' }).catch(() => {});
  } catch {
    if (gen === loadGen && first) setEmpty(t.loadError);
  } finally {
    if (gen === loadGen) loading = false; // don't clear a newer load's guard
  }
}

function setEmpty(text) {
  let el = document.getElementById('galleryEmpty');
  if (!text) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('p');
    el.id = 'galleryEmpty';
    el.className = 'gallery-empty';
    grid().appendChild(el);
  }
  el.textContent = text;
}

// The event's special dates live in the site config (per-site dates + labels);
// any other day is just a regular day.
function eventLabel(iso) {
  // en-CA formats as YYYY-MM-DD; event tz keeps late-night photos on their local day.
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: me.eventTz || 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
  return SITE.days[day] || '';
}

let pinnedCollapsed = false; // survives grid reloads this session; "new photos" banners auto-fold
const collapsedDays = new Set(); // folded day sub-sections (by label); cleared by "Clear filters"

// Monochrome pushpin (inherits the header colour) for the pinned section.
const PIN_SVG =
  '<svg class="grid-header-icon" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path fill="currentColor" d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/></svg>';

const CHEVRON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

function addSectionHeader(text, iconHtml = '', foldable = false) {
  const h = document.createElement('h2');
  h.className = 'grid-header';
  if (iconHtml) {
    h.innerHTML = iconHtml; // static, trusted markup
    h.appendChild(document.createTextNode(' ' + text));
  } else {
    h.textContent = text;
  }
  if (foldable) {
    h.dataset.section = 'pinned';
    const btn = document.createElement('button');
    btn.className = 'sec-toggle';
    btn.innerHTML = CHEVRON_SVG;
    btn.setAttribute('aria-label', text);
    btn.addEventListener('click', () => setPinnedCollapsed(!pinnedCollapsed));
    h.appendChild(btn);
  }
  grid().appendChild(h);
}

// Fold/unfold the pinned section: hide everything between its header and the
// next section header. State lives in pinnedCollapsed so it survives reloads.
function applyPinnedCollapsed() {
  const h = grid().querySelector('.grid-header[data-section="pinned"]');
  if (!h) return;
  h.classList.toggle('collapsed', pinnedCollapsed);
  h.querySelector('.sec-toggle')?.setAttribute('aria-expanded', String(!pinnedCollapsed));
  for (
    let el = h.nextElementSibling;
    el && !el.classList.contains('grid-header');
    el = el.nextElementSibling
  ) {
    el.hidden = pinnedCollapsed;
  }
}
function setPinnedCollapsed(on) {
  pinnedCollapsed = on;
  applyPinnedCollapsed();
}

// Fold/unfold one day group: hide its cells up to the next day/section header.
function setDayCollapsed(label, on) {
  if (on) collapsedDays.add(label);
  else collapsedDays.delete(label);
  for (const h of grid().querySelectorAll('.day-header')) {
    if (h.dataset.day !== label) continue;
    h.classList.toggle('collapsed', on);
    h.querySelector('.sec-toggle')?.setAttribute('aria-expanded', String(!on));
    for (
      let el = h.nextElementSibling;
      el && !el.classList.contains('day-header') && !el.classList.contains('grid-header');
      el = el.nextElementSibling
    ) {
      el.hidden = on;
    }
  }
}

function appendItems(newItems, grouped) {
  const frag = document.createDocumentFragment();
  for (const item of newItems) {
    if (grouped && inEveryoneSection && item.taken_at) {
      const label = fmtDay.format(new Date(item.taken_at));
      if (label !== lastDayLabel) {
        lastDayLabel = label;
        const h = document.createElement('h3');
        h.className = 'day-header';
        h.dataset.day = label;
        const txt = document.createElement('span');
        txt.textContent = label + eventLabel(item.taken_at);
        const btn = document.createElement('button');
        btn.className = 'sec-toggle';
        btn.innerHTML = CHEVRON_SVG;
        btn.setAttribute('aria-label', label);
        btn.setAttribute('aria-expanded', String(!collapsedDays.has(label)));
        btn.addEventListener('click', () => setDayCollapsed(label, !collapsedDays.has(label)));
        h.append(txt, btn);
        if (collapsedDays.has(label)) h.classList.add('collapsed');
        frag.appendChild(h);
      }
    }
    const index = items.length;
    items.push(item);
    const c = cell(item, index);
    // Infinite scroll can append into a day the guest folded — keep it folded.
    if (grouped && inEveryoneSection && collapsedDays.has(lastDayLabel)) c.hidden = true;
    frag.appendChild(c);
  }
  grid().appendChild(frag);
}

function isNew(item) {
  return !item.seen && item.uploader_id !== me.id;
}

// The lightbox showed this item — record it (idempotent per session) and clear
// the NEW badge everywhere this id appears (pinned copy + original).
const seenPosted = new Set();
function markSeen(item) {
  if (!item || item.uploader_id === me.id || seenPosted.has(item.id)) return;
  seenPosted.add(item.id);
  if (!item.seen) {
    fetch(`/api/media/${item.id}/seen`, { method: 'POST' }).catch(() => {});
  }
  for (const it of items) if (it.id === item.id) it.seen = 1;
  item.seen = 1;
  for (const badge of grid().querySelectorAll(`.cell[data-id="${item.id}"] .cell-new`)) badge.remove();
}

function cell(item, index) {
  const btn = document.createElement('button');
  btn.className = 'cell';
  btn.dataset.id = item.id;
  btn.dataset.index = index;
  btn.setAttribute('aria-label', t.mediaBy(item.type, item.uploader_name));
  // Pinned items live in their own "✦ Pinned" section, so no per-cell corner
  // icon is needed. (Keep the class for the subtle ring.)
  if (item.pinned_at) btn.classList.add('pinned');
  if (isNew(item)) {
    const nb = document.createElement('span');
    nb.className = 'cell-new';
    nb.textContent = t.newBadge;
    btn.appendChild(nb);
  }

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = '';
  // Skeleton shimmer until the thumbnail decodes, then fade it in (12.3/12.5).
  img.addEventListener('load', () => btn.classList.add('loaded'), { once: true });
  img.addEventListener('error', () => btn.classList.add('loaded'), { once: true });
  img.src = `/media/thumb/${item.id}${item.rev ? `?v=${item.rev}` : ''}`;
  btn.appendChild(img);

  if (item.type === 'video' && item.duration_s) {
    const chip = document.createElement('span');
    chip.className = 'cell-duration';
    chip.textContent = fmtDuration(item.duration_s);
    btn.appendChild(chip);
  }

  // Favorite heart (bottom-left). Tapping it toggles without opening the lightbox.
  // No count → render as a centered round circle (no-count); with a count → pill.
  const fav = document.createElement('span');
  fav.className = 'cell-fav' + (item.faved ? ' faved' : '') + (item.fav_count ? '' : ' no-count');
  fav.innerHTML = `<span class="cell-fav-icon">♥</span><span class="cell-fav-n">${item.fav_count || ''}</span>`;
  fav.addEventListener('click', (e) => {
    e.stopPropagation();
    if (selectMode) return;
    toggleFavorite(item, fav);
  });
  btn.appendChild(fav);

  btn.addEventListener('click', () => {
    if (selectMode) {
      if (selected.has(item.id)) selected.delete(item.id);
      else selected.add(item.id);
      updateSelectionUi();
      return;
    }
    openLightbox(items, Number(btn.dataset.index), {
      loadMore: () => (nextCursor && !loading ? loadPage() : null),
      hasMore: () => !!nextCursor,
    });
  });
  return btn;
}

async function toggleFavorite(item, favEl) {
  const faved = !item.faved;
  const prevCount = item.fav_count || 0; // capture BEFORE the optimistic mutation
  applyFav(item, faved, prevCount + (faved ? 1 : -1));
  favEl?.classList.toggle('faved', faved);
  try {
    const r = await fetch(`/api/media/${item.id}/favorite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faved }),
    });
    if (!r.ok) throw new Error();
    const d = await r.json();
    applyFav(item, d.faved, d.count);
  } catch {
    applyFav(item, !faved, prevCount); // revert to the true pre-toggle count
    favEl?.classList.toggle('faved', !faved);
  }
}

/** Keep the item model + its grid cell heart in sync (used by cell + lightbox callbacks). */
function applyFav(item, faved, count) {
  // A pinned item appears twice (copy + original) — sync every twin and cell.
  for (const it of items) {
    if (it.id !== item.id) continue;
    it.faved = faved ? 1 : 0;
    it.fav_count = Math.max(0, count || 0);
  }
  item.faved = faved ? 1 : 0;
  item.fav_count = Math.max(0, count || 0);
  for (const cellEl of grid().querySelectorAll(`.cell[data-id="${item.id}"] .cell-fav`)) {
    cellEl.classList.toggle('faved', !!faved);
    cellEl.classList.toggle('no-count', !item.fav_count);
    cellEl.querySelector('.cell-fav-n').textContent = item.fav_count || '';
  }
}
function updateFavUi(item) {
  applyFav(item, item.faved, item.fav_count);
}

function fmtDuration(s) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function removeItem(id) {
  // May appear twice (pinned copy + original) — drop every occurrence.
  let removed = null;
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].id === id) removed = items.splice(i, 1)[0];
  }
  for (const el of grid().querySelectorAll(`[data-id="${id}"]`)) el.remove();
  // Keep the live count honest.
  if (removed && totals[removed.type] != null) {
    totals[removed.type] = Math.max(0, totals[removed.type] - 1);
    renderCount();
  }
  if (!items.length) {
    // Nothing left — clear day/section headers too so they don't linger.
    grid().innerHTML = '';
    lastDayLabel = null;
    setEmpty(t.emptyGallery);
  } else {
    pruneHeaders(); // drop any day/section header whose items are all gone
    grid()
      .querySelectorAll('.cell')
      .forEach((el, idx) => (el.dataset.index = idx));
  }
  scheduleUploaderRefresh(); // an uploader who lost their last item leaves the filter
}

// Remove any day/section header not followed by at least one cell before the
// next header — so deleting the last item of a day drops that day's date, and
// emptying a whole section drops its heading, all without a page refresh.
function pruneHeaders() {
  const isHeader = (n) => n.classList?.contains('day-header') || n.classList?.contains('grid-header');
  let lastHeader = null;
  let sawCell = false;
  for (const node of [...grid().children]) {
    if (isHeader(node)) {
      if (lastHeader && !sawCell) lastHeader.remove();
      lastHeader = node;
      sawCell = false;
    } else if (node.classList?.contains('cell')) {
      sawCell = true;
    }
  }
  if (lastHeader && !sawCell) lastHeader.remove();
}

let uploaderRefreshTimer = null;
function scheduleUploaderRefresh() {
  clearTimeout(uploaderRefreshTimer); // coalesce a burst of deletes into one fetch
  uploaderRefreshTimer = setTimeout(loadUploaders, 500);
}

function renderCount() {
  const parts = [];
  if (totals.photo) parts.push(t.nPhotos(totals.photo));
  if (totals.video) parts.push(t.nVideos(totals.video));
  document.getElementById('countLabel').textContent = parts.join(' · ');
}

// --- "New since your last visit" banner ---
function showNewBanner(n) {
  const bar = document.getElementById('newBanner');
  if (!bar) return;
  bar.textContent = t.newBanner(n);
  bar.hidden = false;
  // Tapping jumps to the "Recently uploaded" view, where the new stuff is on top.
  bar.addEventListener(
    'click',
    () => {
      bar.hidden = true;
      state.sort = 'uploaded-desc';
      document.getElementById('sortSel').value = 'uploaded-desc';
      pinnedCollapsed = true; // the guest came for the NEW photos — fold the pins out of the way
      syncUrl();
      updateClearBtn();
      reload();
    },
    { once: true },
  );
}

// --- Deep links: /#photo=<id> opens straight into the lightbox ---
export function maybeOpenFromHash() {
  const m = location.hash.match(/photo=([0-9a-f-]{36})/);
  if (!m) return;
  const id = m[1];
  const idx = items.findIndex((x) => x.id === id);
  if (idx !== -1) {
    openLightbox(items, idx, {
      loadMore: () => (nextCursor && !loading ? loadPage() : null),
      hasMore: () => !!nextCursor,
    });
  } else {
    // Not loaded yet (deep link to a specific item): fetch it and open a one-item view.
    fetch(`/api/media/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((item) => {
        if (item && item.status === 'ready') openLightbox([item], 0, {});
      })
      .catch(() => {});
  }
}
function setHash(id) {
  const base = location.pathname + location.search;
  history.replaceState(null, '', id ? `${base}#photo=${id}` : base);
}

// --- Toast ---
let toastTimer = null;
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}
