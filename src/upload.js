// Upload module: file picker + drag-and-drop → queued XHR uploads with
// per-file progress, retry, dedupe awareness, and processing status polling.

const CHUNK_THRESHOLD = 90 * 1024 * 1024; // above this, use the chunked path (Cloudflare body limit)
const PARALLEL = 3; // simultaneous file uploads — fills the pipe without overwhelming mobile
const CHUNK_PARALLEL = 3; // simultaneous chunks per big file (keeps the uplink busy)

let items = [];
let activeCount = 0;
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

function addFiles(fileList) {
  for (const file of fileList) {
    // Local preview thumbnail so the guest instantly sees what they're sending (optimistic UI).
    const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    items.push({ file, status: 'queued', progress: 0, error: null, id: null, preview });
  }
  render();
  pump();
}

function pump() {
  while (activeCount < PARALLEL) {
    const item = items.find((i) => i.status === 'queued');
    if (!item) break;
    activeCount++;
    uploadItem(item).finally(() => {
      activeCount--;
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
    const result =
      item.file.size > CHUNK_THRESHOLD ? await uploadChunked(item) : await uploadSimple(item);
    item.id = result.id;
    if (result.duplicate) {
      item.status = 'duplicate';
    } else if (result.status === 'ready') {
      item.status = 'done';
      onMediaReady(result.id);
    } else {
      item.status = 'processing';
      pollStatus(item);
    }
  } catch (err) {
    item.status = 'failed';
    item.error = err.message || 'upload failed';
  }
  // Free the local preview blob once the bytes are safely uploaded (not on failure —
  // the file may be retried). Prevents object-URL memory piling up over a big batch.
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
    render();
  });
}

async function uploadChunked(item) {
  const init = await jsonFetch('/api/upload/init', { name: item.file.name, size: item.file.size });
  const { uploadId, chunkSize } = init;
  const total = item.file.size;
  const nChunks = Math.ceil(total / chunkSize);
  const sentBytes = new Array(nChunks).fill(0); // per-chunk progress
  const updateProgress = () => {
    item.progress = sentBytes.reduce((a, b) => a + b, 0) / total;
    render();
  };

  // Upload several chunks at once so the uplink stays saturated on a
  // high-latency link (server writes each at its byte offset, any order).
  let next = 0;
  async function worker() {
    while (next < nChunks) {
      const index = next++;
      const start = index * chunkSize;
      const blob = item.file.slice(start, Math.min(start + chunkSize, total));
      await xhr('POST', `/api/upload/${uploadId}/chunk?index=${index}`, blob, (frac) => {
        sentBytes[index] = frac * blob.size;
        updateProgress();
      });
      sentBytes[index] = blob.size;
      updateProgress();
    }
  }
  await Promise.all(Array.from({ length: Math.min(CHUNK_PARALLEL, nChunks) }, worker));

  return jsonFetch(`/api/upload/${uploadId}/finish`, {});
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

function render() {
  if (!trayEl) return;
  const visible = items.length > 0;
  trayEl.hidden = !visible;
  if (!visible) return;

  const doneCount = items.filter((i) => ['done', 'duplicate'].includes(i.status)).length;
  trayEl.innerHTML = `
    <div class="tray-head">
      <strong>Uploads</strong>
      <span>${doneCount}/${items.length}</span>
      <button class="tray-clear" ${items.some((i) => ['queued', 'uploading', 'processing'].includes(i.status)) ? 'disabled' : ''}>Clear</button>
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
      // Lazy + async decode: with a big multi-select, only the handful of visible
      // tray thumbnails decode (HEIC decode is expensive) — no jank on "OK".
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
    if (item.status === 'failed') {
      const retry = document.createElement('button');
      retry.className = 'tray-retry';
      retry.textContent = 'Retry';
      retry.addEventListener('click', () => {
        item.status = 'queued';
        render();
        pump();
      });
      li.appendChild(retry);
    }
    if (item.status === 'uploading') {
      const bar = document.createElement('div');
      bar.className = 'tray-bar';
      bar.innerHTML = `<div class="tray-bar-fill" style="width:${Math.round(item.progress * 100)}%"></div>`;
      li.appendChild(bar);
    }
    list.appendChild(li);
  }
}
