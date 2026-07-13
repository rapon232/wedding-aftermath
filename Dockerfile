# --- Stage 1: build frontend + install/compile native deps ---
FROM node:22-bookworm AS builder
WORKDIR /app

# Install deps (includes native better-sqlite3 + sharp, compiled for this platform)
COPY package.json package-lock.json ./
RUN npm ci

# Build the Vite frontend into dist/
COPY . .
RUN npm run build

# Drop dev-only deps (vite, puppeteer-core, concurrently) but keep compiled native prod deps
RUN npm prune --omit=dev

# --- Stage 2: slim runtime ---
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data

# ffmpeg/ffprobe for video posters + duration probing; gosu to drop privileges
# in the entrypoint after fixing volume ownership.
# (sharp bundles its own libvips; HEIC decode falls back to the pure-JS heic-convert.)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg gosu \
  && rm -rf /var/lib/apt/lists/*

# App: pruned node_modules + built frontend + server + static pages + maintenance scripts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package.json ./package.json
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3000

# Start as root so the entrypoint can chown the bind-mounted /data (Synology owns
# it as a host user), then it drops to the unprivileged `node` user via gosu.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
