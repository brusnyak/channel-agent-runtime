import { Client, GatewayIntentBits } from 'discord.js';
import { normalizeDiscord } from './normalize.mjs';

export async function startDiscord(config, runtime) {
  const channel = config.channels.discord;
  const token = process.env[channel.token_env ?? 'DISCORD_BOT_TOKEN'];
  const allowedChannelId = process.env[channel.channel_id_env ?? 'DISCORD_CHANNEL_ID'];
  if (!token) throw new Error(`Missing ${channel.token_env ?? 'DISCORD_BOT_TOKEN'}`);

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  });

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (allowedChannelId && message.channelId !== allowedChannelId) return;
    const decision = await runtime.handleMessage(normalizeDiscord(message));
    const response = decision.approval_required ? `Draft queued for approval:\n\n${decision.reply}` : decision.reply;
    await message.reply(response);
  });

  process.once('SIGINT', () => client.destroy());
  process.once('SIGTERM', () => client.destroy());

  await client.login(token);
  console.log(`Discord adapter connected as ${client.user?.tag ?? 'bot'}`);
}
