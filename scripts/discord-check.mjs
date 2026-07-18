import { loadRuntimeEnv } from '../src/config/env.mjs';

loadRuntimeEnv();

if (!process.env.DISCORD_BOT_TOKEN) {
  console.log('Discord check skipped: DISCORD_BOT_TOKEN missing.');
  process.exit(0);
}

const response = await fetch('https://discord.com/api/v10/users/@me', {
  headers: {
    authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
  },
});
const data = await response.json();

console.log(
  JSON.stringify(
    {
      ok: response.ok,
      status: response.status,
      id: data.id,
      username: data.username,
      bot: data.bot,
      error: data.message ?? null,
      code: data.code ?? null,
      channel_configured: Boolean(process.env.DISCORD_CHANNEL_ID),
    },
    null,
    2,
  ),
);

if (!response.ok) process.exit(1);
