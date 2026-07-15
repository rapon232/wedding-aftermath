// Admin panel: import guests from CSV, generate codes, activation dots,
// grant/revoke admin, revoke access, and send each guest their invite email.

let panel = null;
let guests = [];

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
        <h2>Guests &amp; invites</h2>
        <button class="lb-btn admin-close" aria-label="Close">✕</button>
      </div>
      <div class="admin-add">
        <textarea id="adminNames" rows="2" placeholder="One guest name per line…"></textarea>
        <div class="admin-add-btns">
          <button id="adminCreate" class="btn btn-bx">Create codes</button>
          <button id="adminImport" class="btn-tool">⬆ Import CSV</button>
        </div>
      </div>
      <div class="admin-add-one">
        <input id="adminOneName" type="text" placeholder="Name" autocomplete="off" />
        <input id="adminOneEmail" type="email" placeholder="email@example.com (optional)" autocomplete="off" />
        <button id="adminAddOne" class="btn-tool">Add guest</button>
      </div>
      <div class="admin-actions-row">
        <button id="adminCopyAll" class="btn-tool">Copy all “Name: CODE”</button>
        <span class="admin-legend"><span class="dot activated"></span>logged in <span class="dot pending"></span>not yet</span>
        <span id="adminMsg" class="admin-msg"></span>
      </div>
      <div class="admin-list-wrap">
        <table class="admin-table">
          <thead><tr><th></th><th>Guest</th><th>Email</th><th>Code</th><th>↑</th><th>Actions</th></tr></thead>
          <tbody id="adminRows"></tbody>
        </table>
      </div>
      <input id="adminCsvFile" type="file" accept=".csv,text/csv" hidden />
    </div>
  `;
  document.body.appendChild(panel);
  panel.querySelector('.admin-close').addEventListener('click', close);
  panel.addEventListener('click', (e) => {
    if (e.target === panel) close();
  });
  panel.querySelector('#adminCreate').addEventListener('click', createCodes);
  panel.querySelector('#adminAddOne').addEventListener('click', addOne);
  panel.querySelector('#adminCopyAll').addEventListener('click', copyAll);
  const fileInput = panel.querySelector('#adminCsvFile');
  panel.querySelector('#adminImport').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => importCsv(fileInput));
}

async function refresh() {
  const r = await fetch('/api/admin/guests');
  if (!r.ok) return;
  guests = await r.json();
  const tbody = panel.querySelector('#adminRows');
  tbody.innerHTML = '';
  for (const g of guests) tbody.appendChild(row(g));
}

function row(g) {
  const tr = document.createElement('tr');
  if (g.revoked_at) tr.className = 'revoked';

  // Activation dot
  const dotTd = document.createElement('td');
  const dot = document.createElement('span');
  dot.className = 'dot ' + (g.activated_at ? 'activated' : 'pending');
  dot.title = g.activated_at ? 'Logged in' : 'Not activated yet';
  dotTd.appendChild(dot);

  const nameTd = document.createElement('td');
  nameTd.textContent = g.name + (g.is_admin ? ' ★' : '');

  const emailTd = document.createElement('td');
  emailTd.className = 'admin-email';
  emailTd.textContent = g.email || '—';

  const codeTd = document.createElement('td');
  codeTd.className = 'code-cell';
  codeTd.textContent = g.code;
  codeTd.title = 'Click to copy';
  codeTd.addEventListener('click', async () => {
    await navigator.clipboard.writeText(g.code);
    flash(`Copied ${g.code}`);
  });

  const countTd = document.createElement('td');
  countTd.textContent = g.media_count;

  const actionsTd = document.createElement('td');
  actionsTd.className = 'admin-row-actions';

  // Make / demote admin
  const adminBtn = mkBtn(g.is_admin ? 'Demote' : 'Make admin', async () => {
    const r = await fetch(`/api/admin/guests/${g.id}/admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAdmin: !g.is_admin }),
    });
    if (!r.ok) flash((await r.json().catch(() => ({}))).error || 'Failed');
    refresh();
  });
  actionsTd.appendChild(adminBtn);

  // Send / resend invite (only if the guest has an email)
  if (g.email) {
    const invited = !!g.invited_at;
    const inviteBtn = mkBtn(invited ? 'Resend ✓' : 'Send invite', async () => {
      inviteBtn.disabled = true;
      inviteBtn.textContent = 'Sending…';
      const r = await fetch(`/api/admin/guests/${g.id}/invite`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        flash(`Invite sent to ${g.name}`);
        refresh();
      } else {
        flash(d.error || 'Send failed');
        inviteBtn.disabled = false;
        inviteBtn.textContent = invited ? 'Resend ✓' : 'Send invite';
      }
    });
    inviteBtn.classList.add(invited ? 'btn-invited' : 'btn-invite');
    actionsTd.appendChild(inviteBtn);
  }

  // Revoke / restore
  const revokeBtn = mkBtn(g.revoked_at ? 'Restore' : 'Revoke', async () => {
    await fetch(`/api/admin/guests/${g.id}/${g.revoked_at ? 'restore' : 'revoke'}`, { method: 'POST' });
    refresh();
  });
  actionsTd.appendChild(revokeBtn);

  tr.append(dotTd, nameTd, emailTd, codeTd, countTd, actionsTd);
  return tr;
}

function mkBtn(label, onClick) {
  const b = document.createElement('button');
  b.className = 'btn-tool';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

async function createCodes() {
  const textarea = panel.querySelector('#adminNames');
  const names = textarea.value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!names.length) return flash('Enter at least one name');
  const r = await fetch('/api/admin/guests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ names }),
  });
  if (!r.ok) return flash('Could not create codes');
  const created = await r.json();
  const skipped = names.length - created.length;
  textarea.value = '';
  flash(
    `Created ${created.length} code${created.length === 1 ? '' : 's'}${skipped > 0 ? `, skipped ${skipped} (existing name)` : ''}`,
  );
  refresh();
}

async function addOne() {
  const nameEl = panel.querySelector('#adminOneName');
  const emailEl = panel.querySelector('#adminOneEmail');
  const name = nameEl.value.trim();
  const email = emailEl.value.trim();
  if (!name) return flash('Enter a name');
  const r = await fetch('/api/admin/guests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(email ? { name, email } : { name }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return flash(d.error || 'Could not add guest');
  if (!Array.isArray(d) || !d.length) return flash('Skipped — name or email already exists');
  nameEl.value = '';
  emailEl.value = '';
  flash(`Added ${d[0].name}${d[0].email ? ` — you can send their invite now` : ''}`);
  refresh();
}

async function importCsv(fileInput) {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  const csv = await file.text();
  const r = await fetch('/api/admin/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return flash(d.error || 'Import failed');
  flash(
    `Imported ${d.createdCount} guest${d.createdCount === 1 ? '' : 's'}${d.skipped ? `, skipped ${d.skipped}` : ''}`,
  );
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
  flashTimer = setTimeout(() => (el.textContent = ''), 3000);
}
