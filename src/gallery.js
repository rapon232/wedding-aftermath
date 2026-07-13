// Gallery grid: cursor-paged listing, sort/filter toolbar synced to the URL,
// lazy thumbnails, infinite scroll, lightbox hand-off.

import { openLightbox, initLightbox } from './lightbox.js';

let me;
let state = { sort: 'taken-desc', type: '', uploader: '' };
let items = [];
let nextCursor = null;
let loading = false;
let fmt;
let selectMode = false;
const selected = new Set();

const grid = () => document.getElementById('gallery');

export function initGallery(user) {
  me = user;
  fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: me.eventTz || 'Europe/Rome',
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  readStateFromUrl();
  bindToolbar();
  loadUploaders();

  initLightbox({
    me,
    fmtDate: (iso) => fmt.format(new Date(iso)),
    onDeleted: removeItem,
    onPinned: reload, // pin/unpin reshuffles ordering — simplest correct refresh
  });

  const sentinel = document.getElementById('sentinel');
  new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && nextCursor && !loading) loadPage();
    },
    { rootMargin: '600px' }
  ).observe(sentinel);

  reload();
}

/** Full refresh (initial load, filter change, new upload finished). */
export function reload() {
  items = [];
  nextCursor = null;
  grid().innerHTML = '';
  setEmpty('Loading…');
  loadPage(true);
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
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

function bindToolbar() {
  const seg = document.getElementById('typeSeg');
  for (const btn of seg.querySelectorAll('button')) {
    btn.classList.toggle('active', btn.dataset.type === state.type);
    btn.addEventListener('click', () => {
      state.type = btn.dataset.type;
      for (const b of seg.querySelectorAll('button')) b.classList.toggle('active', b === btn);
      syncUrl();
      reload();
    });
  }
  const sortSel = document.getElementById('sortSel');
  sortSel.value = state.sort;
  sortSel.addEventListener('change', () => {
    state.sort = sortSel.value;
    syncUrl();
    reload();
  });
  const upSel = document.getElementById('uploaderSel');
  upSel.addEventListener('change', () => {
    state.uploader = upSel.value;
    syncUrl();
    reload();
  });

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
}

function setSelectMode(on) {
  selectMode = on;
  if (!on) selected.clear();
  document.body.classList.toggle('selecting', on);
  document.getElementById('selectBar').hidden = !on;
  updateSelectionUi();
}

function updateSelectionUi() {
  document.getElementById('selCount').textContent = `${selected.size} selected`;
  document.getElementById('selDownloadBtn').disabled = !selected.size;
  for (const el of grid().querySelectorAll('.cell')) {
    el.classList.toggle('selected', selected.has(el.dataset.id));
  }
}

/** Plain form POST so the browser streams the zip straight to disk (no JS buffering). */
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
}

async function loadUploaders() {
  const r = await fetch('/api/uploaders');
  if (!r.ok) return;
  const uploaders = await r.json();
  const sel = document.getElementById('uploaderSel');
  sel.innerHTML = '<option value="">Everyone</option>';
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
  const [sort, dir] = state.sort.split('-');
  const q = new URLSearchParams({ sort, dir });
  if (state.type) q.set('type', state.type);
  if (state.uploader) q.set('uploader', state.uploader);
  if (nextCursor) q.set('cursor', nextCursor);

  try {
    const r = await fetch(`/api/media?${q}`);
    if (r.status === 401) return location.replace('/login.html');
    const data = await r.json();
    nextCursor = data.nextCursor;
    if (first && data.totals) {
      const parts = [];
      if (data.totals.photo) parts.push(`${data.totals.photo} photo${data.totals.photo === 1 ? '' : 's'}`);
      if (data.totals.video) parts.push(`${data.totals.video} video${data.totals.video === 1 ? '' : 's'}`);
      document.getElementById('countLabel').textContent = parts.join(' · ');
    }
    if (first && data.pinned?.length) {
      addSectionHeader('✦ Pinned');
      appendItems(data.pinned);
      addSectionHeader('Everyone’s photos & videos');
    }
    appendItems(data.items);
    const anything = (first ? data.pinned?.length : 0) || items.length;
    if (first && !anything) {
      setEmpty('No memories here yet — be the first to share the day ♥');
    } else {
      setEmpty(null);
    }
  } catch {
    if (first) setEmpty('Could not load the gallery — check your connection and refresh.');
  } finally {
    loading = false;
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

function addSectionHeader(text) {
  const h = document.createElement('h2');
  h.className = 'grid-header';
  h.textContent = text;
  grid().appendChild(h);
}

function appendItems(newItems) {
  const frag = document.createDocumentFragment();
  for (const item of newItems) {
    const index = items.length;
    items.push(item);
    frag.appendChild(cell(item, index));
  }
  grid().appendChild(frag);
}

function cell(item, index) {
  const btn = document.createElement('button');
  btn.className = 'cell';
  btn.dataset.id = item.id;
  btn.dataset.index = index;
  btn.setAttribute('aria-label', `${item.type} by ${item.uploader_name}`);
  if (item.pinned_at) {
    btn.classList.add('pinned');
    const badge = document.createElement('span');
    badge.className = 'cell-pin';
    badge.textContent = '✦';
    btn.appendChild(badge);
  }

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.decoding = 'async';
  img.src = `/media/thumb/${item.id}`;
  img.alt = '';
  btn.appendChild(img);

  if (item.type === 'video') {
    const play = document.createElement('span');
    play.className = 'cell-play';
    play.textContent = '▶';
    btn.appendChild(play);
    if (item.duration_s) {
      const chip = document.createElement('span');
      chip.className = 'cell-duration';
      chip.textContent = fmtDuration(item.duration_s);
      btn.appendChild(chip);
    }
  }

  btn.addEventListener('click', () => {
    if (selectMode) {
      if (selected.has(item.id)) selected.delete(item.id);
      else selected.add(item.id);
      updateSelectionUi();
      return;
    }
    openLightbox(items, Number(btn.dataset.index), {
      loadMore: () => (nextCursor && !loading ? loadPage() : null),
    });
  });
  return btn;
}

function fmtDuration(s) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function removeItem(id) {
  const i = items.findIndex((x) => x.id === id);
  if (i !== -1) items.splice(i, 1);
  grid().querySelector(`[data-id="${id}"]`)?.remove();
  // Reindex remaining cells so lightbox navigation stays correct
  grid().querySelectorAll('.cell').forEach((el, idx) => (el.dataset.index = idx));
  if (!items.length) setEmpty('No memories here yet — be the first to share the day ♥');
}
