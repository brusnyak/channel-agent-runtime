import { loadRuntimeEnv } from '../src/config/env.mjs';

loadRuntimeEnv();

const token = process.env.SLACK_BOT_TOKEN;
const channel = process.env.SLACK_CHANNEL_ID;

if (!token || !channel) {
  console.log('Slack send skipped: SLACK_BOT_TOKEN or SLACK_CHANNEL_ID missing.');
  process.exit(0);
}

const response = await fetch('https://slack.com/api/chat.postMessage', {
  method: 'POST',
  headers: {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    channel,
    text: 'Channel Agent Runtime test: Slack bot can post. Try `/help` when the runtime is started with `npm run slack`.',
  }),
});

const data = await response.json();
console.log(
  JSON.stringify(
    {
      ok: Boolean(data.ok),
      channel: data.channel,
      ts: data.ts,
      error: data.ok ? null : data.error,
    },
    null,
    2,
  ),
);

if (!data.ok) process.exit(1);
