// Login page: code entry → POST /api/login → gallery.
// Shared-code sites (SHARED_CODE set on the server) add a second step: the code
// answers { needProfile: true }, we ask for name + email, and /api/register
// creates-or-resumes the guest (matched by email) and starts the session.
import SITE, { t } from './site.js';

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
fetch('/api/me').then((r) => {
  if (r.ok) return location.replace('/');
  if (magicCode) {
    input.value = magicCode.toUpperCase();
    form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
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
        location.replace('/');
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
      await celebrate();
      location.replace('/');
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
