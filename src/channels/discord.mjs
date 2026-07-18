import { Client, GatewayIntentBits } from 'discord.js';
import { formatDecision, handleCommand, parseCommand } from '../bot/commands.mjs';
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
    const normalized = normalizeDiscord(message);
    const command = parseCommand(normalized.text.replace(/^!/, '/'));
    if (command) {
      const response = await handleCommand({ command, config, runtime, sourceMessage: normalized });
      await message.reply(response);
      return;
    }
    const decision = await runtime.handleMessage(normalized);
    const response = decision.approval_required ? formatDecision(decision, 'Draft queued for approval') : decision.reply;
    await message.reply(response);
  });

  process.once('SIGINT', () => client.destroy());
  process.once('SIGTERM', () => client.destroy());

  await client.login(token);
  console.log(`Discord adapter connected as ${client.user?.tag ?? 'bot'}`);
}
