import { Bot } from 'grammy';
import { formatDecision, handleCommand, parseCommand } from '../bot/commands.mjs';
import { normalizeTelegram } from './normalize.mjs';

export async function startTelegram(config, runtime) {
  const channel = config.channels.telegram;
  const token = process.env[channel.token_env ?? 'TELEGRAM_BOT_TOKEN'];
  if (!token) throw new Error(`Missing ${channel.token_env ?? 'TELEGRAM_BOT_TOKEN'}`);

  const bot = new Bot(token);

  bot.on('message:text', async (ctx) => {
    const message = normalizeTelegram(ctx.update);
    const command = parseCommand(message.text);
    if (command) {
      const reply = await handleCommand({ command, config, runtime, sourceMessage: message });
      await ctx.reply(reply);
      return;
    }

    const decision = await runtime.handleMessage(message);
    console.log(
      JSON.stringify({
        at: decision.at,
        channel: decision.channel,
        route: decision.route,
        sender: decision.sender?.handle ?? decision.sender?.id,
        outbound_status: decision.outbound_status,
      }),
    );
    if (decision.approval_required) {
      await ctx.reply(formatDecision(decision, 'Draft queued for approval'));
    } else {
      await ctx.reply(decision.reply);
    }
  });

  process.once('SIGINT', () => bot.stop());
  process.once('SIGTERM', () => bot.stop());

  await bot.start();
}
