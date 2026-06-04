// tests/telegram.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatReport, sendTelegram, getTelegramConfig } from '../src/telegram.js';

const report = {
  date: '2026-06-03',
  headline: 'Three steady, one worth a check-in.',
  members: [
    { name: 'Mom', status: 'all_clear', summary: 'Within range.', changed_signals: [], suggestion: '' },
    { name: 'Dad', status: 'worth_noting', summary: 'RHR up, HRV/sleep down.',
      changed_signals: [
        { metric: 'rhr', z: 2.4, phrase: 'resting heart rate noticeably higher than usual' },
        { metric: 'hrv', z: -1.9, phrase: 'HRV lower than usual' },
      ],
      suggestion: 'Take it easy.' },
  ],
};

test('formatReport leads with the synthetic-data disclosure and the value headline', () => {
  const text = formatReport(report);
  const lines = text.split('\n');
  assert.ok(/simulated|synthetic/i.test(lines[0]), 'first line must disclose synthetic data');
  assert.ok(text.includes('Three steady'));
  assert.ok(text.includes('Dad'));
  assert.ok(text.includes('Mom'));
});

test('formatReport renders changed_signals in plain language, not raw sigma', () => {
  const text = formatReport(report);
  assert.ok(text.includes('resting heart rate noticeably higher than usual'));
  assert.ok(!/rhr\s*\+?2\.4σ/.test(text), 'must NOT show raw "rhr +2.4σ" in the family message');
  assert.ok(!text.includes('σ'), 'no sigma symbol in the family-facing Telegram message');
});

test('formatReport + sendTelegram deliver text with Markdown metacharacters safely (no throw)', async () => {
  const tricky = {
    date: '2026-06-03',
    headline: 'Heads-up: _underscores_ * stars * [brackets] and `backticks` 100% fine.',
    members: [
      { name: 'Sam_*[`', status: 'worth_noting', summary: 'a_b *c* [d] `e`',
        changed_signals: [{ metric: 'rhr', z: 2.4, phrase: 'resting heart rate higher (≈ +2.4 _units_)' }],
        suggestion: 'mention `it` to a doctor_' },
    ],
  };
  const text = formatReport(tricky);
  let calledBody;
  const fakeFetch = async (url, opts) => { calledBody = JSON.parse(opts.body); return { ok: true, json: async () => ({ ok: true }) }; };
  await sendTelegram(text, { token: 'TOK', chatId: '123' }, fakeFetch);
  // plain text: payload carries the raw characters verbatim and has NO parse_mode
  assert.equal(calledBody.text, text);
  assert.ok(calledBody.text.includes('`backticks`'));
  assert.ok(!('parse_mode' in calledBody), 'must send plain text (no parse_mode)');
});

test('sendTelegram posts to the bot API as plain text and resolves on ok', async () => {
  let calledUrl, calledBody;
  const fakeFetch = async (url, opts) => {
    calledUrl = url; calledBody = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ ok: true }) };
  };
  await sendTelegram('hello', { token: 'TOK', chatId: '123' }, fakeFetch);
  assert.ok(calledUrl.includes('/botTOK/sendMessage'));
  assert.equal(calledBody.chat_id, '123');
  assert.equal(calledBody.text, 'hello');
  assert.ok(!('parse_mode' in calledBody), 'no parse_mode — plain text');
});

test('sendTelegram retries once as plain text then throws surfacing the API description', async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls++;
    return { ok: false, status: 400, json: async () => ({ ok: false, description: "can't parse entities" }) };
  };
  await assert.rejects(
    () => sendTelegram('x', { token: 't', chatId: 'c' }, fakeFetch),
    (e) => /400/.test(e.message) && /can't parse entities/.test(e.message),
  );
  assert.equal(calls, 2, 'should attempt the send twice (initial + one retry)');
});

test('getTelegramConfig reads env', () => {
  const c = getTelegramConfig({ TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: 'c' });
  assert.deepEqual(c, { token: 't', chatId: 'c' });
});

test('sendTelegram delivers to every chat id in a comma-separated list', async () => {
  const seen = [];
  const fakeFetch = async (url, opts) => {
    seen.push(JSON.parse(opts.body).chat_id);
    return { ok: true, json: async () => ({ ok: true }) };
  };
  await sendTelegram('hi', { token: 'TOK', chatId: '111, -1002222222222 ,333' }, fakeFetch);
  assert.deepEqual(seen, ['111', '-1002222222222', '333'], 'sends once per trimmed id');
});

test('sendTelegram delivers to good chats even if one id fails, then throws', async () => {
  const seen = [];
  const fakeFetch = async (url, opts) => {
    const id = JSON.parse(opts.body).chat_id;
    seen.push(id);
    if (id === 'bad') return { ok: false, status: 400, json: async () => ({ description: 'chat not found' }) };
    return { ok: true, json: async () => ({ ok: true }) };
  };
  await assert.rejects(
    () => sendTelegram('hi', { token: 'TOK', chatId: 'good1,bad,good2' }, fakeFetch),
    (e) => /bad/.test(e.message) && /chat not found/.test(e.message),
  );
  // good1 once; bad twice (initial + retry); good2 once — delivery to good chats not blocked
  assert.deepEqual(seen, ['good1', 'bad', 'bad', 'good2']);
});
