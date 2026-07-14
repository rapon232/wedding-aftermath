// Live updates via Server-Sent Events. Browsers hold an open /api/events stream;
// the server pushes a small JSON line when media becomes ready / is deleted /
// pinning changes, so open galleries refresh themselves. One-directional, no deps,
// works through the Cloudflare tunnel with a heartbeat, authed by the session cookie.

const clients = new Set();

export function sseHandler(req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // don't let any proxy buffer the stream
  });
  res.flushHeaders?.();
  res.write('retry: 5000\n\n'); // tell EventSource to reconnect after 5s if dropped

  clients.add(res);
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
