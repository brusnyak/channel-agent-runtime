import { loadRuntimeEnv } from '../src/config/env.mjs';

loadRuntimeEnv();

const token = process.env.DISCORD_BOT_TOKEN;
const channelId = process.env.DISCORD_CHANNEL_ID;

if (!token || !channelId) {
  console.log('Discord send skipped: DISCORD_BOT_TOKEN or DISCORD_CHANNEL_ID missing.');
  process.exit(0);
}

const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
  method: 'POST',
  headers: {
    authorization: `Bot ${token}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    content: 'Channel Agent Runtime test: Discord bot can post. Try `/help` or `!help` when the runtime is started with `npm run discord`.',
  }),
});

const data = await response.json();
console.log(
  JSON.stringify(
    {
      ok: response.ok,
      status: response.status,
      id: data.id,
      channel_id: data.channel_id,
      error: response.ok ? null : data.message,
      code: response.ok ? null : data.code,
    },
    null,
    2,
  ),
);

if (!response.ok) process.exit(1);
