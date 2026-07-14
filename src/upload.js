// Upload module: file picker + drag-and-drop → queued uploads with per-file
// progress, retry, dedupe awareness, and processing status polling.
//
// Mobile reliability notes:
// - Progress updates paint in place (we never rebuild the tray DOM on every
//   progress tick — that pegged the main thread and made Safari abort uploads,
//   surfacing server-side as busboy "Unexpected end of form").
// - Memory is bounded: at most one big (chunked) file uploads at a time.
// - Requests time out and chunks retry, so a flaky connection self-heals.

const CHUNK_THRESHOLD = 90 * 1024 * 1024; // above this → chunked path (Cloudflare body limit)
const PARALLEL = 2; // simultaneous file uploads
const MAX_BIG = 1; // of those, at most this many big/chunked files (caps mobile memory)
const CHUNK_PARALLEL = 3; // simultaneous chunks within one big file
const REQ_TIMEOUT = 120000; // per-request timeout (ms)
const CHUNK_RETRIES = 2; // per-chunk retry attempts on transient failure
const AUTO_RETRIES = 1; // auto re-attempt a failed file this many times before showing Retry

let items = [];
let activeCount = 0;
let activeBig = 0;
let trayEl = null;
let onMediaReady = () => {};

export function initUploader({ button, tray, onReady }) {
  trayEl = tray;
  if (onReady) onMediaReady = onReady;

  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = 'image/*,video/*,.heic,.heif,.mov,.mp4';
  input.hidden = true;
  document.body.appendChild(input);

  button.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    addFiles(input.files);
    input.value = '';
  });

  // Whole-page drag-and-drop (desktop)
  let dragDepth = 0;
  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (++dragDepth === 1) document.body.classList.add('dragging');
  });
  document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    if (--dragDepth === 0) document.body.classList.remove('dragging');
  });
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('dragging');
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  });
}

const isBig = (item) => item.file.size > CHUNK_THRESHOLD;

function addFiles(fileList) {
  for (const file of fileList) {
    const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    items.push({ file, status: 'queued', progress: 0, error: null, id: null, preview, attempts: 0 });
  }
  render();
  pump();
}

function pump() {
  while (activeCount < PARALLEL) {
    // Start the next queued file — but hold big files back to MAX_BIG at a time.
    const item = items.find((i) => i.status === 'queued' && (!isBig(i) || activeBig < MAX_BIG));
    if (!item) break;
    const big = isBig(item);
    activeCount++;
    if (big) activeBig++;
    uploadItem(item).finally(() => {
      activeCount--;
      if (big) activeBig--;
      pump();
    });
  }
}

async function uploadItem(item) {
  item.status = 'uploading';
  item.progress = 0;
  item.error = null;
  render();
  try {
    const result = isBig(item) ? await uploadChunked(item) : await uploadSimple(item);
    item.id = result.id;
    if (result.duplicate) item.status = 'duplicate';
    else if (result.status === 'ready') {
      item.status = 'done';
      onMediaReady(result.id);
    } else {
      item.status = 'processing';
      pollStatus(item);
    }
  } catch (err) {
    // Transient failure? Quietly re-queue a couple times before bothering the user.
    if (item.attempts < AUTO_RETRIES) {
      item.attempts++;
      item.status = 'queued';
      item.error = null;
      setTimeout(pump, 800 * item.attempts);
    } else {
      item.status = 'failed';
      item.error = err.message || 'upload failed';
    }
  }
  if (item.preview && ['done', 'duplicate', 'processing'].includes(item.status)) {
    URL.revokeObjectURL(item.preview);
    item.preview = null;
  }
  render();
}

function uploadSimple(item) {
  const form = new FormData();
  form.append('file', item.file);
  return xhr('POST', '/api/upload', form, (frac) => {
    item.progress = frac;
    paintProgress();
  });
}

async function uploadChunked(item) {
  const init = await jsonFetch('/api/upload/init', { name: item.file.name, size: item.file.size });
  const { uploadId, chunkSize } = init;
  const total = item.file.size;
  const nChunks = Math.ceil(total / chunkSize);
  const sentBytes = new Array(nChunks).fill(0);
  const paint = () => {
    item.progress = sentBytes.reduce((a, b) => a + b, 0) / total;
    paintProgress();
  };

  let next = 0;
  async function worker() {
    while (next < nChunks) {
      const index = next++;
      const start = index * chunkSize;
      const blob = item.file.slice(start, Math.min(start + chunkSize, total));
      await sendChunk(uploadId, index, blob, (frac) => {
        sentBytes[index] = frac * blob.size;
        paint();
      });
      sentBytes[index] = blob.size;
      paint();
    }
  }
  await Promise.all(Array.from({ length: Math.min(CHUNK_PARALLEL, nChunks) }, worker));
  return jsonFetch(`/api/upload/${uploadId}/finish`, {});
}

// One chunk, with a couple of retries — server writes are idempotent per index.
async function sendChunk(uploadId, index, blob, onProgress) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await xhr('POST', `/api/upload/${uploadId}/chunk?index=${index}`, blob, onProgress);
    } catch (err) {
      if (attempt >= CHUNK_RETRIES) throw err;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
}

function pollStatus(item, delay = 2000) {
  setTimeout(async () => {
    try {
      const r = await fetch(`/api/media/${item.id}`);
      if (!r.ok) throw new Error();
      const m = await r.json();
      if (m.status === 'ready') {
        item.status = 'done';
        onMediaReady(item.id);
      } else if (m.status === 'failed') {
        item.status = 'failed';
        item.error = 'processing failed';
      } else {
        pollStatus(item, Math.min(delay * 1.5, 10000));
        return;
      }
    } catch {
      pollStatus(item, Math.min(delay * 1.5, 10000));
      return;
    }
    render();
  }, delay);
}

/** XHR wrapper — fetch still has no upload progress events. */
function xhr(method, url, body, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open(method, url);
    x.timeout = REQ_TIMEOUT;
    x.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    });
    x.addEventListener('load', () => {
      let data = null;
      try {
        data = JSON.parse(x.responseText);
      } catch {
        /* non-JSON error body */
      }
      if (x.status >= 200 && x.status < 300) resolve(data);
      else reject(new Error(data?.error || `upload failed (${x.status})`));
    });
    x.addEventListener('error', () => reject(new Error('connection lost')));
    x.addEventListener('timeout', () => reject(new Error('timed out')));
    x.addEventListener('abort', () => reject(new Error('aborted')));
    x.send(body);
  });
}

async function jsonFetch(url, payload) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.error || `request failed (${r.status})`);
  return data;
}

// --- Tray rendering ---

const STATUS_LABEL = {
  queued: 'Waiting…',
  uploading: 'Uploading',
  processing: 'Processing…',
  done: 'Done ✓',
  duplicate: 'Already in the gallery',
  failed: 'Failed',
};

// Lightweight in-place progress paint (coalesced to one per frame). Never rebuilds
// the DOM — just nudges the % text and bar width of files that are uploading.
let paintScheduled = false;
function paintProgress() {
  if (paintScheduled) return;
  paintScheduled = true;
  requestAnimationFrame(() => {
    paintScheduled = false;
    for (const item of items) {
      if (item.status !== 'uploading' || !item._statusEl) continue;
      const pct = Math.round(item.progress * 100);
      item._statusEl.textContent = `${pct}%`;
      if (item._barFill) item._barFill.style.width = `${pct}%`;
    }
  });
}

// Full rebuild — only on structural changes (add/remove, status transitions).
function render() {
  if (!trayEl) return;
  document.body.classList.toggle(
    'uploading',
    items.some((i) => ['queued', 'uploading', 'processing'].includes(i.status))
  );
  const visible = items.length > 0;
  trayEl.hidden = !visible;
  if (!visible) return;

  const doneCount = items.filter((i) => ['done', 'duplicate'].includes(i.status)).length;
  const busy = items.some((i) => ['queued', 'uploading', 'processing'].includes(i.status));
  trayEl.innerHTML = `
    <div class="tray-head">
      <strong>Uploads</strong>
      <span>${doneCount}/${items.length}</span>
      <button class="tray-clear" ${busy ? 'disabled' : ''}>Clear</button>
    </div>
    <ul class="tray-list"></ul>
  `;
  trayEl.querySelector('.tray-clear').addEventListener('click', () => {
    for (const it of items) if (it.preview) URL.revokeObjectURL(it.preview);
    items = [];
    render();
  });
  const list = trayEl.querySelector('.tray-list');
  for (const item of items) {
    const li = document.createElement('li');
    li.className = `tray-item is-${item.status}`;
    if (item.preview) {
      const thumb = document.createElement('img');
      thumb.className = 'tray-thumb';
      thumb.loading = 'lazy';
      thumb.decoding = 'async';
      thumb.src = item.preview;
      thumb.alt = '';
      li.appendChild(thumb);
    }
    const name = document.createElement('span');
    name.className = 'tray-name';
    name.textContent = item.file.name;
    const status = document.createElement('span');
    status.className = 'tray-status';
    status.textContent =
      item.status === 'uploading'
        ? `${Math.round(item.progress * 100)}%`
        : item.error || STATUS_LABEL[item.status];
    li.append(name, status);
    item._statusEl = status; // ref for in-place progress paints
    item._barFill = null;

    if (item.status === 'failed') {
      const retry = document.createElement('button');
      retry.className = 'tray-retry';
      retry.textContent = 'Retry';
      retry.addEventListener('click', () => {
        item.attempts = 0;
        item.status = 'queued';
        item.error = null;
        render();
        pump();
      });
      li.appendChild(retry);
    }
    if (item.status === 'uploading') {
      const bar = document.createElement('div');
      bar.className = 'tray-bar';
      const fill = document.createElement('div');
      fill.className = 'tray-bar-fill';
      fill.style.width = `${Math.round(item.progress * 100)}%`;
      bar.appendChild(fill);
      li.appendChild(bar);
      item._barFill = fill; // ref for in-place progress paints
    }
    list.appendChild(li);
  }
}
