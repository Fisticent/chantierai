/**
 * POST /api/debug-telegram
 * Relays structured debug events to Telegram as a downloadable JSON document
 * (avoids the 4096-char sendMessage limit).
 *
 * Env (Vercel → Environment Variables, Production):
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_CHAT_ID
 */
const CAPTION_MAX = 1024;

function truncate(str, max) {
  const s = String(str || '');
  return s.length <= max ? s : `${s.slice(0, max - 12)}…[tronqué]`;
}

function buildCaption(body) {
  const type = body?.type || 'debug';
  const at = body?.at || new Date().toISOString();
  const summary = body?.summary ? String(body.summary) : '';
  return truncate(`🛠 ChantierExpress · ${type}\n⏰ ${at}${summary ? `\n\n${summary}` : ''}\n\n📎 JSON complet en pièce jointe`, CAPTION_MAX);
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return JSON.stringify({ error: 'unserializable', raw: String(value) });
  }
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
    body = body || {};

    const type = String(body.type || 'debug').replace(/[^\w.-]+/g, '_').slice(0, 40);
    const stamp = String(body.at || new Date().toISOString()).replace(/[:.]/g, '-');
    const filename = `chantier-${type}-${stamp}.json`;
    const json = safeJson({
      type: body.type || 'debug',
      at: body.at || new Date().toISOString(),
      summary: body.summary || '',
      ua: body.ua || '',
      data: body.data ?? null,
    });

    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('caption', buildCaption(body));
    form.append('disable_content_type_detection', 'true');
    form.append('document', new Blob([json], { type: 'application/json' }), filename);

    const tg = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: form,
    });
    const result = await tg.json().catch(() => ({}));
    if (!tg.ok || result.ok === false) {
      res.status(502).json({ error: 'Telegram API error', detail: result });
      return;
    }
    res.status(200).json({ ok: true, message_id: result.result?.message_id });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'relay failed' });
  }
}
