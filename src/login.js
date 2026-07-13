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
