// Admin panel: generate guest codes, list/copy them, revoke/restore access.

let panel = null;

export function initAdmin(button) {
  button.hidden = false;
  button.addEventListener('click', open);
}

function open() {
  if (!panel) build();
  panel.hidden = false;
  document.body.classList.add('lightbox-open'); // reuse scroll lock
  refresh();
}

function close() {
  panel.hidden = true;
  document.body.classList.remove('lightbox-open');
}

function build() {
  panel = document.createElement('div');
  panel.className = 'admin-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="admin-card">
      <div class="admin-head">
        <h2>Guests &amp; codes</h2>
        <button class="lb-btn admin-close" aria-label="Close">✕</button>
      </div>
      <div class="admin-add">
        <textarea id="adminNames" rows="3" placeholder="One guest name per line…"></textarea>
        <button id="adminCreate" class="btn btn-bx">Create codes</button>
      </div>
      <div class="admin-actions-row">
        <button id="adminCopyAll" class="btn-tool">Copy all as “Name: CODE”</button>
        <span id="adminMsg" class="admin-msg"></span>
      </div>
      <div class="admin-list-wrap">
        <table class="admin-table">
          <thead><tr><th>Guest</th><th>Code</th><th>Uploads</th><th></th></tr></thead>
          <tbody id="adminRows"></tbody>
        </table>
      </div>
    </div>
  `;
  document.body.appendChild(panel);
  panel.querySelector('.admin-close').addEventListener('click', close);
  panel.addEventListener('click', (e) => {
    if (e.target === panel) close();
  });
  panel.querySelector('#adminCreate').addEventListener('click', createCodes);
  panel.querySelector('#adminCopyAll').addEventListener('click', copyAll);
}

let guests = [];

async function refresh() {
  const r = await fetch('/api/admin/guests');
  if (!r.ok) return;
  guests = await r.json();
  const tbody = panel.querySelector('#adminRows');
  tbody.innerHTML = '';
  for (const g of guests) {
    const tr = document.createElement('tr');
    if (g.revoked_at) tr.className = 'revoked';

    const name = document.createElement('td');
    name.textContent = g.name + (g.is_admin ? ' ★' : '');
    const code = document.createElement('td');
    code.className = 'code-cell';
    code.textContent = g.code;
    code.title = 'Click to copy';
    code.addEventListener('click', async () => {
      await navigator.clipboard.writeText(g.code);
      flash(`Copied ${g.code}`);
    });
    const count = document.createElement('td');
    count.textContent = g.media_count;
    const action = document.createElement('td');
    if (!g.is_admin) {
      const btn = document.createElement('button');
      btn.className = 'btn-tool';
      btn.textContent = g.revoked_at ? 'Restore' : 'Revoke';
      btn.addEventListener('click', async () => {
        await fetch(`/api/admin/guests/${g.id}/${g.revoked_at ? 'restore' : 'revoke'}`, { method: 'POST' });
        refresh();
      });
      action.appendChild(btn);
    }
    tr.append(name, code, count, action);
    tbody.appendChild(tr);
  }
}

async function createCodes() {
  const textarea = panel.querySelector('#adminNames');
  const names = textarea.value.split('\n').map((s) => s.trim()).filter(Boolean);
  if (!names.length) return flash('Enter at least one name');
  const r = await fetch('/api/admin/guests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ names }),
  });
  if (!r.ok) return flash('Could not create codes');
  const created = await r.json();
  textarea.value = '';
  flash(`Created ${created.length} code${created.length === 1 ? '' : 's'}`);
  refresh();
}

async function copyAll() {
  const lines = guests
    .filter((g) => !g.revoked_at)
    .map((g) => `${g.name}: ${g.code}`)
    .join('\n');
  await navigator.clipboard.writeText(lines);
  flash('Copied full list');
}

let flashTimer = null;
function flash(msg) {
  const el = panel.querySelector('#adminMsg');
  el.textContent = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (el.textContent = ''), 2500);
}
