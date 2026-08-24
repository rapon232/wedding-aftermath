# Design: bg-site-locale-and-shared-code

## Context

One repo currently produces one `dist/` and one Docker image for `aftermath.mitio.tech` (English, per-guest codes, Sicily dates). The Sofia site needs Bulgarian UI, different event identity, and shared-code onboarding — while the Italian site keeps shipping from the same image with zero behavior change.

## Goals / Non-Goals

**Goals:** one image → two sites; all guest-visible text localized; BG onboarding = shared code + name/email; Italy untouched by default envs; admin (personal code) can always log in on both.
**Non-Goals:** per-user language switching (a site has one language); converting the Italian site to shared-code; invite emails on BG (none sent); translating the invite email (EN-only feature stays).

## Decisions

1. **Build-time locale, not runtime**: `VITE_SITE=en|bg` selects a site module (`src/site.js` → `src/i18n/en.js` / `bg.js` holding strings **and** event config: title, special-day map, Intl locale, OG meta, public URL). `scripts/build-sites.mjs` runs `vite build` twice (`dist/en`, `dist/bg`) then overlays `branding/bg/` (og-image, spade icons, manifest) onto `dist/bg`. HTML text/meta uses `%%path%%` placeholders resolved by a tiny Vite `transformIndexHtml` plugin — works in dev too. Chosen over runtime string swapping: no FOUC, dead language is tree-shaken, HTML/OG meta genuinely differs per site (scrapers don't run JS).
2. **Server picks dist by `SITE`**: `config.distDir` defaults to `dist/<SITE>` (SITE defaults `en`). `DIST_DIR` env still overrides. Existing Italy compose (no SITE) → `dist/en` → unchanged.
3. **Shared-code auth is additive**: `SHARED_CODE` env (normalized like any code). Login order: personal-code lookup first (admin and any migrated guests always work), then — only if `SHARED_CODE` is set and matches — respond `{ needProfile: true }` with **no session**. New `POST /api/register { code, name, email }` (same throttle) re-validates the code, then matches guests by email (case-insensitive, oldest row wins): found & revoked → 403; found → resume that guest (same identity across devices, no duplicate "Maria"); not found → insert with a generated personal code (schema keeps `code UNIQUE NOT NULL`), `activated_at` stamped. Name is kept from first registration on resume (stable attribution). Email match is application-level (`lower(email)` lookup + non-unique index), NOT a unique index — the Italian DB may legitimately hold duplicate/absent emails.
4. **`/api/me` exposes `authMode`** (`'shared' | 'codes'`): the admin panel hides invite-email controls in shared mode; the login page uses it only implicitly (the needProfile response drives the form).
5. **Login page two-step, same card**: code field → on `needProfile`, reveal name+email fields (progressive disclosure, keeps the card design); second submit hits `/api/register`. Magic-link auto-login path is unaffected (personal codes only).
6. **Server-sent guest-facing messages** (~6: invalid code, throttle, gallery full, upload flood, unsupported type) come from a tiny per-SITE map on the server; default EN keeps every existing test green.
7. **Spade branding**: derive `branding/bg/` icons from the existing heart `favicon.svg` geometry style (same bordeaux palette) with a spade path; committed as files so builds don't regenerate. BG og-image is the user's photo (already converted to JPEG 1600×1200 at `branding/bg/og-image.jpg`).

## Risks / Trade-offs

Accepted properties of shared-code auth (reviewed, deliberate for a wedding-scale gallery — the remedy for all three is rotating `SHARED_CODE`):

- **Register is an email oracle**: with the code, distinct responses reveal whether an email belongs to an active (200 + name), revoked (403), or unknown (201) guest. Hiding this would break the resume-on-second-device UX.
- **Revocation is advisory**: a revoked guest can re-register under a different email — the shared code readmits anyone. Personal-code sites keep airtight revocation.
- **Names are not unique**: a self-registered guest can pick any display name (control/bidi characters are stripped; admin-session escalation via a known admin email is blocked — those return 401).

- [Same email registers on both sites] → separate DBs; no cross-site identity, which is correct.
- [Shared code leaks publicly] → anyone with it can register; mitigations: auto-block + login throttle already exist, admin can rotate `SHARED_CODE` (env change + restart) without affecting registered guests (they resume by email), and individual guests can be revoked.
- [Typo'd email on first login] → guest silently forks identity on next device; admin can revoke the stray row. Accepted for onboarding simplicity.
- [Two dists double frontend build time] → seconds; CI unaffected materially.
- [BG translations too long for buttons] → translation task explicitly constrains lengths; puppeteer smoke on the BG build checks the toolbar doesn't wrap.

## Migration Plan

No schema migration (only a non-unique email index via `CREATE INDEX IF NOT EXISTS`). Italy deploy: next image works with existing compose unchanged. BG deploy: new compose project + one cloudflared hostname (documented in the final recap). Rollback: BG container is independent; Italy unaffected.

## Open Questions (defaults chosen, review in the morning)

- Day labels: `' · 💍 Сватбата'` (08.08) and `' · 🥂 Утринното парти'` (09.08).
- OG/share text: title `#LoveWins. Споменник ♠`, description `Надникни ;)`.
- Login-card welcome copy: mechanical translation of the EN card; the personal touch is yours to rewrite.
