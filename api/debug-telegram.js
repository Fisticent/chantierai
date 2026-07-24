/**
 * POST /api/debug-telegram
 * Relays structured debug events to Telegram (server-side token).
 *
 * Env (Vercel → Environment Variables, Production):
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_CHAT_ID
 */
const MAX_LEN = 3900;

function truncate(str, max = MAX_LEN) {
  const s = String(str || '');
  return s.length <= max ? s : `${s.slice(0, max - 20)}\n…[tronqué]`;
}

function formatPayload(body) {
  const type = body?.type || 'debug';
  const at = body?.at || new Date().toISOString();
  const lines = [`🛠 ChantierExpress · ${type}`, `⏰ ${at}`];

  if (body?.summary) lines.push('', String(body.summary));

  if (body?.data != null) {
    let json;
    try {
      json = JSON.stringify(body.data, null, 2);
    } catch {
      json = String(body.data);
    }
    lines.push('', truncate(json, MAX_LEN - 200));
  }

  return truncate(lines.join('\n'));
}

export default async function handler(req, res) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
      res.status(503).json({
        error: 'Telegram debug not configured',
        hasToken: Boolean(token),
        hasChatId: Boolean(chatId),
      });
      return;
    }

    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = { type: 'raw', data: body };
      }
    }

    const text = formatPayload(body || {});
    const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    const result = await tg.json().catch(() => ({}));
    if (!tg.ok || result.ok === false) {
      res.status(502).json({ error: 'Telegram API error', detail: result });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'relay failed' });
  }
}
