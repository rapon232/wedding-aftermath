// Live updates via Server-Sent Events. Browsers hold an open /api/events stream;
// the server pushes a small JSON line when media becomes ready / is deleted /
// pinning changes, so open galleries refresh themselves. One-directional, no deps,
// works through the Cloudflare tunnel with a heartbeat, authed by the session cookie.

const clients = new Set();
const perGuest = new Map(); // guest.id -> Set<res>, to bound fan-out per person
const MAX_PER_GUEST = 5; // a browser opens 1 per tab; anything past this is abuse
const MAX_TOTAL = 400; // hard ceiling so a scripted client can't exhaust NAS sockets/fds

export function sseHandler(req, res) {
  const gid = req.guest.id;
  // Global backstop: refuse new streams if we're already saturated.
  if (clients.size >= MAX_TOTAL) return res.status(503).end();
  // Per-guest cap: evict this guest's oldest stream to make room (avoids an
  // EventSource reconnect loop that a 4xx would trigger).
  let mine = perGuest.get(gid);
  if (mine && mine.size >= MAX_PER_GUEST) {
    const oldest = mine.values().next().value;
    try {
      oldest.end();
    } catch {
      /* already gone; its close handler will clean up */
    }
    clients.delete(oldest);
    mine.delete(oldest);
  }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // don't let any proxy buffer the stream
  });
  res.flushHeaders?.();
  res.write('retry: 5000\n\n'); // tell EventSource to reconnect after 5s if dropped

  clients.add(res);
  if (!mine) perGuest.set(gid, (mine = new Set()));
  mine.add(res);
  // Heartbeat comment keeps the connection under Cloudflare's ~100s idle timeout.
  const heartbeat = setInterval(() => {
    try {
      res.write(': hb\n\n');
    } catch {
      /* will be cleaned up on close */
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
    const s = perGuest.get(gid);
    if (s) {
      s.delete(res);
      if (!s.size) perGuest.delete(gid);
    }
  });
}

export function broadcast(obj) {
  const line = `data: ${JSON.stringify(obj)}\n\n`;
  for (const res of clients) {
    try {
      res.write(line);
    } catch {
      clients.delete(res);
    }
  }
}
