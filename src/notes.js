// Guestbook: a shared wall of notes to the newlyweds, visible to everyone.

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
  document.body.classList.add('lightbox-open');
  refresh();
  setTimeout(() => panel.querySelector('.note-input').focus(), 50);
}

function close() {
  panel.hidden = true;
  document.body.classList.remove('lightbox-open');
}

function build() {
  panel = document.createElement('div');
  panel.className = 'notes-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="notes-card">
      <div class="notes-head">
        <h2>Notes for the <em>newlyweds</em> <span class="heart">♥</span></h2>
        <button class="lb-btn notes-close" aria-label="Close">✕</button>
      </div>
      <form class="note-form">
        <textarea class="note-input" rows="3" maxlength="1000" placeholder="Leave a message for the couple…"></textarea>
        <button type="submit" class="btn btn-bx">Sign the guestbook</button>
      </form>
      <ul class="notes-list"></ul>
    </div>
  `;
  document.body.appendChild(panel);
  panel.querySelector('.notes-close').addEventListener('click', close);
  panel.addEventListener('click', (e) => {
    if (e.target === panel) close();
  });
  panel.querySelector('.note-form').addEventListener('submit', submit);
}

async function refresh() {
  try {
    const r = await fetch('/api/notes');
    if (!r.ok) return;
    notes = await r.json();
    render();
  } catch {
    /* offline */
  }
}

function render() {
  const ul = panel.querySelector('.notes-list');
  ul.innerHTML = '';
  if (!notes.length) {
    const li = document.createElement('li');
    li.className = 'note-empty';
    li.textContent = 'Be the first to leave a note ♥';
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
    if (me.isAdmin || n.guest_id === me.id) {
      const del = document.createElement('button');
      del.className = 'note-del';
      del.textContent = '✕';
      del.setAttribute('aria-label', 'Delete note');
      del.addEventListener('click', () => remove(n.id));
      li.appendChild(del);
    }
    ul.appendChild(li);
  }
}

async function submit(e) {
  e.preventDefault();
  const input = panel.querySelector('.note-input');
  const body = input.value.trim();
  if (!body) return;
  input.value = '';
  try {
    const r = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    if (!r.ok) throw new Error();
    notes.unshift(await r.json());
    render();
  } catch {
    input.value = body;
    alert('Could not save your note — try again.');
  }
}

async function remove(id) {
  const r = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
  if (!r.ok) return;
  notes = notes.filter((n) => n.id !== id);
  render();
}
