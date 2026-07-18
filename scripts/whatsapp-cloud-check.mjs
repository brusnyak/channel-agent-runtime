import { loadRuntimeEnv } from '../src/config/env.mjs';

loadRuntimeEnv();

const token = process.env.WHATSAPP_CLOUD_TOKEN;
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const to = process.argv.find((arg) => arg.startsWith('--to='))?.slice('--to='.length);

if (!token || !phoneNumberId) {
  console.log('WhatsApp Cloud check skipped: WHATSAPP_CLOUD_TOKEN or WHATSAPP_PHONE_NUMBER_ID missing.');
  process.exit(0);
}

if (!to) {
  console.log('WhatsApp Cloud credentials configured. Pass --to=421949504848 to prepare a send test.');
  process.exit(0);
}

if (!process.argv.includes('--send')) {
  console.log(`Dry run only. Would send WhatsApp Cloud text from phone number id ${phoneNumberId} to ${redact(to)}.`);
  console.log('Add --send to send a real WhatsApp Cloud API message.');
  process.exit(0);
}

const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: {
      preview_url: false,
      body: 'Channel Agent Runtime WhatsApp Cloud test. Reply with: I want to view a 2 bedroom apartment in Bratislava tomorrow.',
    },
  }),
});

const data = await response.json();
console.log(
  JSON.stringify(
    {
      ok: response.ok,
      status: response.status,
      message_id: data.messages?.[0]?.id,
      error: data.error?.message ?? null,
      code: data.error?.code ?? null,
    },
    null,
    2,
  ),
);

if (!response.ok) process.exit(1);

function redact(value) {
  return value.replace(/(\d{3})\d+(\d{2})$/, '$1***$2');
}
