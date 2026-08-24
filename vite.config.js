import { defineConfig } from 'vite';
import { resolve } from 'path';

// One source tree, one build per site (see scripts/build-sites.mjs). VITE_SITE
// picks the language/branding; HTML text and meta go through %%path%%
// placeholders resolved from the site's i18n module — build fails loudly on a
// typo'd key instead of shipping a placeholder to guests.
const SITE = process.env.VITE_SITE === 'bg' ? 'bg' : 'en';

export default defineConfig(async () => {
  const { default: site } = await import(`./src/i18n/${SITE}.js`);
  const lookup = (path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), site);
  return {
    plugins: [
      {
        name: 'site-html-placeholders',
        transformIndexHtml(html) {
          return html.replace(/%%([\w.]+)%%/g, (_, p) => {
            const v = lookup(p);
            if (typeof v !== 'string') throw new Error(`Unknown i18n placeholder %%${p}%% (site: ${SITE})`);
            return v;
          });
        },
      },
    ],
    build: {
      rollupOptions: {
        input: {
          main: resolve(import.meta.dirname, 'index.html'),
          login: resolve(import.meta.dirname, 'login.html'),
        },
      },
    },
    server: {
      proxy: {
        '/api': 'http://localhost:3000',
        '/media': 'http://localhost:3000',
      },
    },
  };
});
