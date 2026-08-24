// Private notes to the newlyweds: anyone can leave one, only the couple (admin)
// can read them. Leaving a note plays a little ♥ burst, like signing in.

import SITE, { t } from './site.js';
import { lockScroll, unlockScroll } from './scroll-lock.js';

let me;
let fmtDate = (x) => x;
let panel = null;
let notes = [];

export function initNotes(button, user, dateFmt) {
  me = user;
  fmtDate = dateFmt;
  button.addEventListener('click', open);
}

function open() {
  if (!panel) build();
  panel.hidden = false;
  lockScroll();
  resetComposer();
  if (me.isAdmin) refresh(); // only the couple reads the wall
  setTimeout(() => panel.querySelector('.note-input')?.focus(), 50);
}

function close() {
  panel.hidden = true;
  unlockScroll();
}

function build() {
  panel = document.createElement('div');
  panel.className = 'notes-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="notes-card">
      <div class="notes-head">
        <h2>${t.notesTitleHtml} <span class="heart">${SITE.suit}</span></h2>
        <button class="lb-btn notes-close" aria-label="${t.close}">✕</button>
      </div>
      <div class="note-compose">
        ${me.isAdmin ? '' : `<p class="note-hint">${t.noteHint}</p>`}
        <form class="note-form">
          <textarea class="note-input" rows="3" maxlength="1000" placeholder="${t.notePlaceholder}"></textarea>
          <button type="submit" class="btn btn-bx">${t.noteSend}</button>
        </form>
      </div>
      <div class="note-thanks" hidden>
        <p class="note-thanks-title">${t.noteThanks} <span class="heart">${SITE.suit}</span></p>
        <p class="note-thanks-sub">${t.noteThanksSub}</p>
        <button class="btn btn-ghost note-again">${t.noteAgain}</button>
      </div>
      ${me.isAdmin ? '<ul class="notes-list"></ul>' : ''}
    </div>
  `;
  document.body.appendChild(panel);
  panel.querySelector('.notes-close').addEventListener('click', close);
  panel.addEventListener('click', (e) => {
    if (e.target === panel) close();
  });
  panel.querySelector('.note-form').addEventListener('submit', submit);
  panel.querySelector('.note-again')?.addEventListener('click', resetComposer);
}

function resetComposer() {
  panel.querySelector('.note-compose').hidden = false;
  panel.querySelector('.note-thanks').hidden = true;
  panel.querySelector('.note-input').value = '';
}

async function refresh() {
  try {
    const r = await fetch('/api/notes');
    if (!r.ok) return; // non-admins get 403 — they never see the list
    notes = await r.json();
    render();
  } catch {
    /* offline */
  }
}

function render() {
  const ul = panel.querySelector('.notes-list');
  if (!ul) return;
  ul.innerHTML = '';
  if (!notes.length) {
    const li = document.createElement('li');
    li.className = 'note-empty';
    li.textContent = t.noNotes;
    ul.appendChild(li);
    return;
  }
  for (const n of notes) {
    const li = document.createElement('li');
    li.className = 'note-item';
    const body = document.createElement('p');
    body.className = 'note-body';
    body.textContent = n.body; // XSS-safe
    const meta = document.createElement('div');
    meta.className = 'note-meta';
    const who = document.createElement('span');
    who.textContent = `— ${n.guest_name}`;
    const when = document.createElement('span');
    when.className = 'note-when';
    when.textContent = fmtDate(n.created_at);
    meta.append(who, when);
    li.append(body, meta);
    const del = document.createElement('button');
    del.className = 'note-del';
    del.textContent = '✕';
    del.setAttribute('aria-label', t.deleteNote);
    del.addEventListener('click', () => remove(n.id));
    li.appendChild(del);
    ul.appendChild(li);
  }
}

async function submit(e) {
  e.preventDefault();
  const input = panel.querySelector('.note-input');
  const body = input.value.trim();
  if (!body) return;
  const btn = panel.querySelector('.note-form button');
  btn.disabled = true;
  try {
    const r = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    if (!r.ok) throw new Error();
    burst();
    if (me.isAdmin) {
      notes.unshift(await r.json());
      render();
      input.value = '';
    } else {
      // Guests don't see the wall — thank them instead.
      panel.querySelector('.note-compose').hidden = true;
      panel.querySelector('.note-thanks').hidden = false;
    }
  } catch {
    alert(t.errNote);
  }
  btn.disabled = false;
}

async function remove(id) {
  const r = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
  if (!r.ok) return;
  notes = notes.filter((n) => n.id !== id);
  render();
}

// A little ♥ burst over the card when a note is sent (mirrors the login moment).
function burst() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.className = 'burst burst-center';
  for (let i = 0; i < 16; i++) {
    const h = document.createElement('span');
    h.textContent = SITE.suit;
    const angle = (Math.PI * 2 * i) / 16 + Math.random();
    const dist = 80 + Math.random() * 110;
    h.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    h.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
    h.style.setProperty('--d', `${Math.random() * 120}ms`);
    h.style.fontSize = `${13 + Math.random() * 16}px`;
    layer.appendChild(h);
  }
  panel.querySelector('.notes-card').appendChild(layer);
  setTimeout(() => layer.remove(), 900);
}
