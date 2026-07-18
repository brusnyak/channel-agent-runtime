import { loadRuntimeEnv } from '../src/config/env.mjs';

loadRuntimeEnv();

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_ALLOWED_CHAT_ID;

if (!token || !chatId) {
  console.log('Telegram send skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_ALLOWED_CHAT_ID missing.');
  process.exit(0);
}

const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    chat_id: chatId,
    text: 'Channel Agent Runtime test: Telegram bot can send. Run `npm run telegram:salon`, then try /help and /route Can I book nails tomorrow afternoon?',
  }),
});

const data = await response.json();
console.log(
  JSON.stringify(
    {
      ok: Boolean(data.ok),
      message_id: data.result?.message_id,
      chat_id: data.result?.chat?.id,
      error: data.ok ? null : data.description,
    },
    null,
    2,
  ),
);

if (!data.ok) process.exit(1);
