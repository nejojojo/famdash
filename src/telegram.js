// src/telegram.js

export function getTelegramConfig(env = process.env) {
  return { token: env.TELEGRAM_BOT_TOKEN || '', chatId: env.TELEGRAM_CHAT_ID || '' };
}

const ICON = { all_clear: '🟢', worth_noting: '🟡', no_data: '⚪️' };

// Render one changed_signal in PLAIN LANGUAGE for the family (never raw "rhr +2.4σ").
// Accepts the structured object { metric, z, phrase }; falls back gracefully for older shapes.
function signalPhrase(sig) {
  if (sig && typeof sig === 'object' && sig.phrase) return sig.phrase;
  return typeof sig === 'string' ? sig : '';
}

// Plain-text rendering of the report. NO Markdown — sent with no parse_mode, so stray
// _ * [ ] ` characters in LLM free text are delivered verbatim and never cause an HTTP 400.
// The synthetic-data disclosure is the FIRST line; the value headline leads the body.
export function formatReport(report) {
  const lines = [];
  lines.push('Synthetic demo data — not real health measurements; no action needed.');
  lines.push('');
  lines.push(report.headline);
  lines.push(`Daily Health Report — ${report.date}`);
  lines.push('');
  for (const m of report.members) {
    lines.push(`${ICON[m.status] || '•'} ${m.name} — ${m.summary}`);
    const phrases = (m.changed_signals || []).map(signalPhrase).filter(Boolean);
    if (phrases.length) lines.push(`   ${phrases.join('; ')}`);
    if (m.suggestion) lines.push(`   ↳ ${m.suggestion}`);
  }
  return lines.join('\n');
}

export async function sendTelegram(text, config = getTelegramConfig(), fetchImpl = fetch) {
  if (!config.token || !config.chatId) throw new Error('Telegram config missing (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)');
  const url = `https://api.telegram.org/bot${config.token}/sendMessage`;
  // Plain text only (no parse_mode): a reliable message beats a bold one.
  const post = () => fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: config.chatId, text, disable_web_page_preview: true }),
  });

  let res = await post();
  if (!res.ok) {
    // Defense-in-depth: retry once as plain text before giving up.
    res = await post();
    if (!res.ok) {
      let description = '';
      try { description = (await res.json())?.description || ''; } catch { /* ignore */ }
      throw new Error(`Telegram sendMessage failed: ${res.status}${description ? ` — ${description}` : ''}`);
    }
  }
  return res.json();
}
