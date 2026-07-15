// Gallery entry point. Auth gate here covers dev (Vite serves pages directly);
// in production the server also redirects unauthenticated page loads.

import { initUploader } from './upload.js';
import { initGallery, reload, maybeOpenFromHash } from './gallery.js';
import { initAdmin } from './admin.js';
import { initNotes } from './notes.js';

const getMe = () =>
  fetch('/api/me')
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

async function init() {
  // Right after login the session cookie can lag the first navigation on some
  // mobile browsers → /api/me 401s and we'd bounce back to login (needing a manual
  // refresh). Retry once before giving up so login "just works".
  let me = await getMe();
  if (!me) {
    await new Promise((r) => setTimeout(r, 500));
    me = await getMe();
  }
  if (!me) {
    location.replace('/login.html');
    return;
  }

  // PWA: register the service worker so the site is installable to the home screen.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  document.getElementById('welcome').textContent =
    `Hi ${me.name}, share your photos & videos from our wedding. We want to experience the party from your point of view 🔥`;

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    location.replace('/login.html');
  });

  initGallery(me);
  if (me.isAdmin) initAdmin(document.getElementById('adminBtn'));

  const noteFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: me.eventTz || 'Europe/Rome',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  initNotes(document.getElementById('noteBtn'), me, (iso) => noteFmt.format(new Date(iso)));

  // Deep link: /#photo=<id> opens straight into that item once the gallery is ready.
  if (location.hash.includes('photo=')) setTimeout(maybeOpenFromHash, 400);

  // One-time upload tips (iPhone HEIC / big-video-on-Wi-Fi nudge).
  const hint = document.getElementById('uploadHint');
  if (hint && !localStorage.getItem('lw-hint-seen')) {
    hint.hidden = false;
    document.getElementById('hintDismiss').addEventListener('click', () => {
      hint.hidden = true;
      localStorage.setItem('lw-hint-seen', '1');
    });
  }

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
