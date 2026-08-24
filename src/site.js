// Per-site config + strings. VITE_SITE is inlined at build time (see
// scripts/build-sites.mjs), so the unused language is eliminated from the
// bundle (verified: the BG chunk carries no English table and vice versa).
import en from './i18n/en.js';
import bg from './i18n/bg.js';

const SITE = import.meta.env.VITE_SITE === 'bg' ? bg : en;
export default SITE;
export const t = SITE.t;
