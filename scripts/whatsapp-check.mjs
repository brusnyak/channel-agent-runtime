import { loadRuntimeEnv } from '../src/config/env.mjs';

loadRuntimeEnv();

const required = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.log(`WhatsApp check skipped: missing ${missing.join(', ')}`);
  process.exit(0);
}

const from = process.env.TWILIO_WHATSAPP_FROM;
if (!from) {
  console.log('WhatsApp send not configured: TWILIO_WHATSAPP_FROM missing.');
  console.log('Use Twilio WhatsApp Sandbox or an approved WhatsApp sender, then set TWILIO_WHATSAPP_FROM=whatsapp:+...');
  process.exit(0);
}

const to = process.argv.find((arg) => arg.startsWith('--to='))?.slice('--to='.length);
if (!to) {
  console.log('WhatsApp sender configured. Pass --to=whatsapp:+421949504848 to send a real test.');
  process.exit(0);
}

if (!process.argv.includes('--send')) {
  console.log(`Dry run only. Would send from ${redact(from)} to ${redact(to)}.`);
  console.log('Add --send to send a real WhatsApp message.');
  process.exit(0);
}

const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
const body = new URLSearchParams({
  From: from,
  To: to,
  Body: 'Channel Agent Runtime WhatsApp test. Reply with: Boiler stopped and we have no hot water today.',
});

const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
  method: 'POST',
  headers: {
    authorization: `Basic ${auth}`,
    'content-type': 'application/x-www-form-urlencoded',
  },
  body,
});

const result = await response.json();
console.log(
  JSON.stringify(
    {
      ok: response.ok,
      status: result.status,
      sid: result.sid,
      error_code: result.error_code,
      error_message: result.error_message,
    },
    null,
    2,
  ),
);

if (!response.ok) process.exit(1);

function redact(value) {
  return value.replace(/(\+\d{3})\d+(\d{2})/, '$1***$2');
}
