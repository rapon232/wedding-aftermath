// Login page: code entry → POST /api/login → gallery.
// Shared-code sites (SHARED_CODE set on the server) add a second step: the code
// answers { needProfile: true }, we ask for name + email, and /api/register
// creates-or-resumes the guest (matched by email) and starts the session.
import SITE, { t } from './site.js';
import { initLangSwitcher } from './lang.js';

initLangSwitcher(document.getElementById('langSwitch'));

const form = document.getElementById('loginForm');
const input = document.getElementById('codeInput');
const errorEl = document.getElementById('loginError');
const btn = document.getElementById('loginBtn');
const subEl = document.getElementById('loginSub');
const profileEl = document.getElementById('profileFields');
const nameInput = document.getElementById('nameInput');
const emailInput = document.getElementById('emailInput');

let profileMode = false;

// Magic link from the invite email: /?code=XXXX-XXXX auto-fills and submits.
const magicCode = new URLSearchParams(location.search).get('code');

// Already signed in? Straight to the gallery. Otherwise, if we arrived via a
// magic link, log in for them so they never have to type the code.
const REDIRECT_KEY = 'lw-post-auth-redirects';
fetch('/api/me').then((r) => {
  if (r.ok) {
    // Authed, but the server still served the login page: on iOS Safari a
    // freshly-set cookie reaches fetches before it reaches top-level navigations,
    // so the post-login navigation to "/" can bounce back here. Wait a beat (lets
    // the cookie commit) and retry, spaced and capped so it can never tight-loop
    // ("rattle") — by the second try the cookie is there and "/" serves the app.
    const n = +(sessionStorage.getItem(REDIRECT_KEY) || 0);
    if (n < 4) {
      sessionStorage.setItem(REDIRECT_KEY, String(n + 1));
      setTimeout(() => location.replace('/'), 400);
    }
    return;
  }
  sessionStorage.removeItem(REDIRECT_KEY);
  if (magicCode) {
    input.value = magicCode.toUpperCase();
    form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
  }
});

// Capitalize each word of the name as it's typed. The server does this too (it's
// the source of truth), but doing it live gives guests visible feedback — they
// can't rely on the field's own casing cues. Only the first letter of each word
// is touched, so length is preserved (cursor stays put) and intentional caps
// like "McArthur" survive.
const capitalizeWords = (s) => s.replace(/(^|[\s-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
nameInput.addEventListener('input', () => {
  const pos = nameInput.selectionStart;
  const capped = capitalizeWords(nameInput.value);
  if (capped !== nameInput.value) {
    nameInput.value = capped;
    nameInput.setSelectionRange(pos, pos);
  }
});

// Auto-format as XXXX-XXXX while typing.
input.addEventListener('input', () => {
  const raw = input.value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  input.value = raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
  errorEl.hidden = true;
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (profileMode) return register();
  const code = input.value.trim();
  if (!code) return showError(t.errEnterCode);
  btn.disabled = true;
  btn.textContent = t.checking;
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.needProfile) {
        enterProfileMode();
      } else {
        await celebrate();
        enterGallery(data);
      }
      return;
    }
    showError(res.status === 429 ? t.errTooMany : t.errNoMatch);
  } catch {
    showError(t.errConn);
  }
  btn.disabled = false;
  btn.textContent = t.enterGallery;
});

// Enter the gallery via the server's one-time URL: the session cookie is set on
// that top-level NAVIGATION response (then 302 → "/"), which lands it in the
// navigation cookie jar directly. Safari/in-app browsers sync fetch-set cookies
// into that jar lazily — navigating on the fetch cookie alone made the server
// re-serve the login page ("rattling" until a manual refresh).
function enterGallery(data) {
  location.replace(data?.enter || '/');
}

// The shared code checked out — ask who this is before opening the door.
function enterProfileMode() {
  profileMode = true;
  profileEl.hidden = false;
  input.readOnly = true;
  subEl.textContent = t.regSub;
  btn.disabled = false;
  btn.textContent = t.enterGallery;
  nameInput.focus();
}

async function register() {
  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  if (!name) return showError(t.errName);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showError(t.errEmail);
  btn.disabled = true;
  btn.textContent = t.checking;
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: input.value.trim(), name, email }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      await celebrate();
      enterGallery(data);
      return;
    }
    // Unmapped statuses (500, 404 mode-off, …) read as a connection problem —
    // never blame the guest's email for a server-side failure.
    showError(
      { 429: t.errTooMany, 403: t.errRevoked, 401: t.errNoMatch, 400: t.errEmail }[res.status] || t.errConn,
    );
  } catch {
    showError(t.errConn);
  }
  btn.disabled = false;
  btn.textContent = t.enterGallery;
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
  (profileMode ? nameInput : input).focus();
}

// A little suit burst on successful sign-in, then redirect.
function celebrate() {
  btn.textContent = t.welcomeBtn;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return new Promise((r) => setTimeout(r, 150));
  const layer = document.createElement('div');
  layer.className = 'burst';
  for (let i = 0; i < 16; i++) {
    const h = document.createElement('span');
    h.textContent = SITE.suit;
    const angle = (Math.PI * 2 * i) / 16 + Math.random();
    const dist = 90 + Math.random() * 120;
    h.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    h.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
    h.style.setProperty('--d', `${Math.random() * 120}ms`);
    h.style.fontSize = `${14 + Math.random() * 18}px`;
    layer.appendChild(h);
  }
  document.body.appendChild(layer);
  return new Promise((r) => setTimeout(r, 750));
}
