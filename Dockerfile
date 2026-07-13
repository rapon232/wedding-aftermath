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

# ffmpeg/ffprobe for video posters + duration probing.
# (sharp bundles its own libvips; HEIC decode falls back to the pure-JS heic-convert.)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

# App: pruned node_modules + built frontend + server + static pages
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/package.json ./package.json

# Media + SQLite live here; mount a NAS volume at this path.
VOLUME /data
EXPOSE 3000

# Run as the built-in non-root node user
RUN mkdir -p /data && chown -R node:node /data
USER node

CMD ["node", "server/index.js"]
