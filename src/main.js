// Gallery entry point. Auth gate here covers dev (Vite serves pages directly);
// in production the server also redirects unauthenticated page loads.

import { initUploader } from './upload.js';
import { initGallery, reload } from './gallery.js';
import { initAdmin } from './admin.js';

async function init() {
  const me = await fetch('/api/me').then((r) => (r.ok ? r.json() : null));
  if (!me) {
    location.replace('/login.html');
    return;
  }

  document.getElementById('welcome').textContent =
    `Hi ${me.name} — share your photos & videos from our wedding. We want to experience the party from your point of view 🔥`;

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    location.replace('/login.html');
  });

  initGallery(me);
  if (me.isAdmin) initAdmin(document.getElementById('adminBtn'));

  // Refresh the grid shortly after uploads finish processing (debounced across a batch)
  let reloadTimer = null;
  initUploader({
    button: document.getElementById('uploadBtn'),
    tray: document.getElementById('uploadTray'),
    onReady: () => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(reload, 800);
    },
  });
}

init();
