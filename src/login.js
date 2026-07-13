// Login page: code entry → POST /api/login → gallery.

const form = document.getElementById('loginForm');
const input = document.getElementById('codeInput');
const errorEl = document.getElementById('loginError');
const btn = document.getElementById('loginBtn');

// Already signed in? Straight to the gallery.
fetch('/api/me').then((r) => {
  if (r.ok) location.replace('/');
});

// Auto-format as XXXX-XXXX while typing.
input.addEventListener('input', () => {
  const raw = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  input.value = raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
  errorEl.hidden = true;
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = input.value.trim();
  if (!code) return showError('Please enter your code.');
  btn.disabled = true;
  btn.textContent = 'Checking…';
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (res.ok) {
      await celebrate();
      location.replace('/');
      return;
    }
    showError(
      res.status === 429
        ? 'Too many attempts — wait a minute and try again.'
        : 'That code doesn’t match. Double-check and try again.'
    );
  } catch {
    showError('Connection problem — please try again.');
  }
  btn.disabled = false;
  btn.textContent = 'Enter the gallery';
});

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
  input.focus();
}

// A little ♥ burst on successful sign-in, then redirect.
function celebrate() {
  btn.textContent = 'Welcome ♥';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return new Promise((r) => setTimeout(r, 150));
  const layer = document.createElement('div');
  layer.className = 'burst';
  for (let i = 0; i < 16; i++) {
    const h = document.createElement('span');
    h.textContent = '♥';
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
