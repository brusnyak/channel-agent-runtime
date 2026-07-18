import { App } from '@slack/bolt';
import { formatDecision, handleCommand, parseCommand } from '../bot/commands.mjs';
import { normalizeSlack } from './normalize.mjs';

export async function startSlack(config, runtime) {
  const channel = config.channels.slack;
  const token = process.env[channel.bot_token_env ?? 'SLACK_BOT_TOKEN'];
  const appToken = process.env[channel.app_token_env ?? 'SLACK_APP_TOKEN'];
  const signingSecret = process.env[channel.signing_secret_env ?? 'SLACK_SIGNING_SECRET'];
  const allowedChannelId = process.env[channel.channel_id_env ?? 'SLACK_CHANNEL_ID'];

  if (!token) throw new Error(`Missing ${channel.bot_token_env ?? 'SLACK_BOT_TOKEN'}`);
  if (!appToken) throw new Error(`Missing ${channel.app_token_env ?? 'SLACK_APP_TOKEN'}`);
  if (!signingSecret) throw new Error(`Missing ${channel.signing_secret_env ?? 'SLACK_SIGNING_SECRET'}`);

  const app = new App({
    token,
    appToken,
    signingSecret,
    socketMode: true,
  });

  app.message(async ({ message, say }) => {
    if (message.subtype === 'bot_message') return;
    if (allowedChannelId && message.channel !== allowedChannelId) return;

    const normalized = normalizeSlack(message);
    const command = parseCommand(normalized.text);
    if (command) {
      await say(await handleCommand({ command, config, runtime, sourceMessage: normalized }));
      return;
    }

    const decision = await runtime.handleMessage(normalized);
    await say(decision.approval_required ? formatDecision(decision, 'Draft queued for approval') : decision.reply);
  });

  await app.start();
  console.log(`${config.name} Slack adapter connected with Socket Mode.`);
}
