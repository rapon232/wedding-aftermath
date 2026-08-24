// Admin panel: import guests from CSV, generate codes, activation dots,
// grant/revoke admin, revoke access, and send each guest their invite email.

import { t } from './site.js';

let panel = null;
let guests = [];
let me = null;

export function initAdmin(button, user) {
  me = user;
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
        <h2>${t.adminTitleHtml}</h2>
        <button class="lb-btn admin-close" aria-label="${t.close}">✕</button>
      </div>
      <div class="admin-add">
        <textarea id="adminNames" rows="2" placeholder="${t.adminNamesPh}"></textarea>
        <div class="admin-add-btns">
          <button id="adminCreate" class="btn btn-bx">${t.createCodes}</button>
          <button id="adminImport" class="btn-tool">${t.importCsv}</button>
        </div>
      </div>
      <div class="admin-add-one">
        <input id="adminOneName" type="text" placeholder="${t.adminNamePh}" autocomplete="off" />
        <input id="adminOneEmail" type="email" placeholder="${t.adminEmailPh}" autocomplete="off" />
        <button id="adminAddOne" class="btn-tool">${t.addGuest}</button>
      </div>
      <div class="admin-actions-row">
        <button id="adminCopyAll" class="btn-tool">${t.copyAllBtn}</button>
        <span class="admin-legend"><span class="dot activated"></span>${t.legendIn} <span class="dot pending"></span>${t.legendNot}</span>
        <span id="adminMsg" class="admin-msg"></span>
      </div>
      <div class="admin-list-wrap">
        <table class="admin-table">
          <thead><tr><th></th><th>${t.thGuest}</th><th>${t.thEmail}</th><th>${t.thCode}</th><th>↑</th><th>${t.thActions}</th></tr></thead>
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
  dot.title = g.activated_at ? t.dotIn : t.dotNot;
  dotTd.appendChild(dot);

  const nameTd = document.createElement('td');
  nameTd.textContent = g.name + (g.is_admin ? ' ★' : '');

  const emailTd = document.createElement('td');
  emailTd.className = 'admin-email';
  emailTd.textContent = g.email || '—';

  const codeTd = document.createElement('td');
  codeTd.className = 'code-cell';
  codeTd.textContent = g.code;
  codeTd.title = t.clickToCopy;
  codeTd.addEventListener('click', async () => {
    await navigator.clipboard.writeText(g.code);
    flash(t.copiedCode(g.code));
  });

  const countTd = document.createElement('td');
  countTd.textContent = g.media_count;

  const actionsTd = document.createElement('td');
  actionsTd.className = 'admin-row-actions';

  // Make / demote admin
  const adminBtn = mkBtn(g.is_admin ? t.demote : t.makeAdmin, async () => {
    const r = await fetch(`/api/admin/guests/${g.id}/admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAdmin: !g.is_admin }),
    });
    if (!r.ok) flash((await r.json().catch(() => ({}))).error || t.actionFailed);
    refresh();
  });
  actionsTd.appendChild(adminBtn);

  // Send / resend invite (only if the guest has an email; hidden entirely on
  // shared-code sites — guests onboard themselves there, no invite emails).
  if (g.email && me?.authMode !== 'shared') {
    const invited = !!g.invited_at;
    const inviteBtn = mkBtn(invited ? t.resendInvite : t.sendInvite, async () => {
      inviteBtn.disabled = true;
      inviteBtn.textContent = t.sending;
      const r = await fetch(`/api/admin/guests/${g.id}/invite`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        flash(t.inviteSentTo(g.name));
        refresh();
      } else {
        flash(d.error || t.sendFailed);
        inviteBtn.disabled = false;
        inviteBtn.textContent = invited ? t.resendInvite : t.sendInvite;
      }
    });
    inviteBtn.classList.add(invited ? 'btn-invited' : 'btn-invite');
    actionsTd.appendChild(inviteBtn);
  }

  // Revoke / restore
  const revokeBtn = mkBtn(g.revoked_at ? t.restore : t.revoke, async () => {
    await fetch(`/api/admin/guests/${g.id}/${g.revoked_at ? 'restore' : 'revoke'}`, { method: 'POST' });
    refresh();
  });
  actionsTd.appendChild(revokeBtn);

  // Delete — only for accounts safe to remove: not you, not an admin, and with
  // no uploads (deleting someone with photos is what Revoke is for).
  if (g.id !== me.id && !g.is_admin && !g.media_count) {
    const delBtn = mkBtn(t.delete, async () => {
      if (!confirm(t.confirmDeleteGuest(g.name))) return;
      const r = await fetch(`/api/admin/guests/${g.id}`, { method: 'DELETE' });
      if (r.ok) flash(t.deletedGuest(g.name));
      else flash((await r.json().catch(() => ({}))).error || t.actionFailed);
      refresh();
    });
    delBtn.classList.add('btn-danger');
    actionsTd.appendChild(delBtn);
  }

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
  if (!names.length) return flash(t.enterOneName);
  const r = await fetch('/api/admin/guests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ names }),
  });
  if (!r.ok) return flash(t.couldNotCreate);
  const created = await r.json();
  const skipped = names.length - created.length;
  textarea.value = '';
  flash(t.createdCodes(created.length, skipped));
  refresh();
}

async function addOne() {
  const nameEl = panel.querySelector('#adminOneName');
  const emailEl = panel.querySelector('#adminOneEmail');
  const name = nameEl.value.trim();
  const email = emailEl.value.trim();
  if (!name) return flash(t.enterName);
  const r = await fetch('/api/admin/guests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(email ? { name, email } : { name }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return flash(d.error || t.couldNotAdd);
  if (!Array.isArray(d) || !d.length) return flash(t.skippedExisting);
  nameEl.value = '';
  emailEl.value = '';
  flash(t.addedGuest(d[0].name, !!d[0].email));
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
  if (!r.ok) return flash(d.error || t.importFailed);
  flash(t.importedGuests(d.createdCount, d.skipped));
  refresh();
}

async function copyAll() {
  const lines = guests
    .filter((g) => !g.revoked_at)
    .map((g) => `${g.name}: ${g.code}`)
    .join('\n');
  await navigator.clipboard.writeText(lines);
  flash(t.copiedList);
}

let flashTimer = null;
function flash(msg) {
  const el = panel.querySelector('#adminMsg');
  el.textContent = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (el.textContent = ''), 3000);
}
