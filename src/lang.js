// Language switcher. Both site builds ship in every image; picking a language
// sets a `lang` cookie and reloads — the server then serves that build. The
// current language is whichever build we're viewing (SITE.site).
import SITE from './site.js';

const LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'bg', label: 'БГ' },
];

const GLOBE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;

export function initLangSwitcher(mount) {
  if (!mount) return;
  const cur = SITE.site;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'lang-btn';
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = `${GLOBE}<span>${cur.toUpperCase()}</span>`;

  const menu = document.createElement('div');
  menu.className = 'lang-menu';
  menu.hidden = true;
  for (const l of LANGS) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'lang-item' + (l.code === cur ? ' active' : '');
    item.textContent = l.label;
    item.addEventListener('click', () => {
      if (l.code === cur) return close();
      // 1-year preference, sent on every request so the server picks this build.
      document.cookie = `lang=${l.code};path=/;max-age=31536000;samesite=lax`;
      location.reload();
    });
    menu.appendChild(item);
  }

  const close = () => {
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', (e) => {
    if (!mount.contains(e.target)) close();
  });

  mount.classList.add('lang-switch');
  mount.append(btn, menu);
}
