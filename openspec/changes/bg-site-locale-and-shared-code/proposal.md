# Proposal: bg-site-locale-and-shared-code

## Why

The Sofia wedding (night party 2026-08-08, morning party 2026-08-09) needs its own gallery for Bulgarian guests at `bg.aftermath.mitio.tech` — same app, different language, branding, event dates, and a lighter onboarding: one shared 8-char code instead of per-guest codes and invite emails. One codebase must serve both sites so every future fix lands on both.

## What Changes

- **Two-site build**: Vite builds `dist/en` and `dist/bg` from one source; the server picks its dist by a `SITE` env var. One Docker image serves both deployments.
- **Localization layer**: all guest-facing UI strings move to per-site locale modules (`src/i18n/en.js`, `src/i18n/bg.js`); HTML text/meta goes through build-time placeholders. Bulgarian translations sized to fit the existing UI (similar word lengths).
- **Per-site event config**: title `#LoveWins. Споменник ♠` (spade replaces the heart motif), special-day labels for 2026-08-08/09, `bg-BG` date formatting, BG OG/link-preview meta + image, spade webapp icons/manifest.
- **Shared-code self-registration** (BG site): `SHARED_CODE=LOVEWINS` env enables it. Entering the shared code prompts for name + email; that creates (or, matched by email, resumes) a guest and starts a session. Guests appear in the admin panel automatically. Personal codes — including the admin's — keep working everywhere. No invite emails on the BG site.
- **New assets**: `branding/bg/` holds the BG og-image (copied from the user's photo), spade icons, and manifest; the build overlays them onto `dist/bg`.
- **Deployment**: second compose file (`docker-compose.bg.yml`) — own container, port 3001, own data volume and session secret, `Europe/Sofia`, plus one new cloudflared hostname.

## Capabilities

### New Capabilities

- `localization`: how one codebase produces per-site builds (language, branding, event dates, share metadata, icons).

### Modified Capabilities

- `guest-auth`: adds the shared-code self-registration mode alongside personal codes.
- `deployment`: one image, two site deployments with isolated data.

## Impact

- `vite.config.js`, new `scripts/build-sites.mjs`, `package.json` build script; `src/i18n/*`, `src/site.js`; string sweep across `src/*.js`, `index.html`, `login.html`.
- `server/config.js` (SITE, SHARED_CODE, per-site dist), `server/auth.js` (register flow, authMode in /api/me), `server/index.js` (dist path only).
- Italy site behavior unchanged: `SITE` defaults to `en`, no `SHARED_CODE` set → identical auth, identical UI.
