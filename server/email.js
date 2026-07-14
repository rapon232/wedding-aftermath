// Invite emails via Resend (HTTP API — no SMTP, no extra dependency).
import { config } from './config.js';

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const emailConfigured = () => !!config.resendApiKey;

/**
 * The wedding-styled invite. Email clients strip JS and most <style>, so
 * everything is inline styles + web-safe fallbacks. The J♣ card sits on top,
 * the access code is big & bold, and the button is a magic link that logs the
 * guest straight in.
 */
export function inviteHtml({ name, code }) {
  const link = `${config.publicUrl}/?code=${encodeURIComponent(code)}`;
  const cardUrl = `${config.publicUrl}/card-email.png`;
  const cream = '#f7f3ee', card = '#ffffff', bordeaux = '#7b2d42', dark = '#4e1928', text = '#251a16', muted = '#7e6c63';
  const serif = "'DM Serif Display', Georgia, 'Times New Roman', serif";
  const sans = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const p = (html) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${text};font-family:${sans}">${html}</p>`;

  return `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff">
  <div style="display:none;max-height:0;overflow:hidden">Your #LovePortal access code: ${esc(code)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${card};border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(37,26,22,.12)">
        <tr><td align="center" style="padding:24px 24px 0">
          <img src="${cardUrl}" alt="" width="260" style="width:260px;max-width:70%;height:auto;border-radius:12px" />
        </td></tr>
        <tr><td style="padding:24px 32px 8px">
          <h1 style="margin:0 0 18px;font-family:${serif};font-weight:400;font-size:30px;line-height:1.15;color:${dark}">Dear favourite people,</h1>
          ${p('Thank you all for your incredible presence at our celebration.<br><br>Thank you for really being present, with us and for us. Thank you for breaking barriers, getting out of your comfort zone, becoming friends amongst each other and partying with your whole hearts. Thank you to the incredible support and readiness you showed us, for all the help in making everything happen, for all the smiles and the vibes.<br><br>It was so so cool that everyone participated into making everything happen &mdash; from the deco, to the sound setup through the ceremony and the pool party!')}
          ${p(`We write this filled with joy and love today, we invite you to our memory vault. Please upload any and all media you would like to share with us and everyone else, don&rsquo;t worry, it is hosted privately on our server, so that no AI is trained using everyone&rsquo;s beautiful faces!! Mitko spent the afternoon yesterday coding up this memory book and we&rsquo;re incredibly excited to roll it out and start sharing (he&rsquo;s freaking out, like he&rsquo;s doing a product release &#128514;) and I don&rsquo;t understand the black box &#129335;&#127995;&#8205;&#9792;&#65039;. You can use the <strong style="color:${bordeaux}">#LovePortal</strong> to upload photos and videos, to like, comment and download! &lt;3`)}
          ${p('For everyone that wanted to write us something, this is our guest book, so don&rsquo;t be shy and leave us a message from the button on the top. &#10084;&#65039;')}
        </td></tr>
        <tr><td align="center" style="padding:8px 32px 4px">
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:${muted};font-family:${sans}">Your access code</p>
          <div style="font-family:'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:.12em;color:${bordeaux};background:${cream};border:2px solid #f0d9df;border-radius:14px;padding:16px 20px;display:inline-block">${esc(code)}</div>
        </td></tr>
        <tr><td align="center" style="padding:20px 32px 8px">
          <a href="${link}" style="display:inline-block;background:${bordeaux};color:#ffffff;text-decoration:none;font-family:${sans};font-size:17px;font-weight:600;padding:15px 34px;border-radius:12px">Open my #LovePortal &rarr;</a>
          <p style="margin:12px 0 0;font-size:13px;color:${muted};font-family:${sans}">That button logs you straight in, no need to type the code.</p>
        </td></tr>
        <tr><td align="center" style="padding:24px 32px 32px">
          <p style="margin:0;font-family:${serif};font-style:italic;font-size:20px;color:${dark}">&#128131; With Love, Jenny and Mitko &#127796;</p>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

/** Send one invite via Resend. Throws with a clear message on misconfig/failure. */
export async function sendInvite({ to, name, code }) {
  if (!config.resendApiKey) throw new Error('email not configured (RESEND_API_KEY missing)');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: config.mailFrom,
      to: [to],
      subject: 'You’re invited to our #LovePortal ❤️',
      html: inviteHtml({ name, code }),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json().catch(() => ({}));
}
