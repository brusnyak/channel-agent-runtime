import { Bot } from 'grammy';
import { normalizeTelegram } from './normalize.mjs';

export async function startTelegram(config, runtime) {
  const channel = config.channels.telegram;
  const token = process.env[channel.token_env ?? 'TELEGRAM_BOT_TOKEN'];
  if (!token) throw new Error(`Missing ${channel.token_env ?? 'TELEGRAM_BOT_TOKEN'}`);

  const bot = new Bot(token);

  bot.command('start', async (ctx) => {
    await ctx.reply(`Running ${config.name}. Send a message and I will process it through the configured tools.`);
  });

  bot.on('message:text', async (ctx) => {
    const decision = await runtime.handleMessage(normalizeTelegram(ctx.update));
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
      await ctx.reply(`Draft queued for approval:\n\n${decision.reply}`);
    } else {
      await ctx.reply(decision.reply);
    }
  });

  process.once('SIGINT', () => bot.stop());
  process.once('SIGTERM', () => bot.stop());

  await bot.start();
}
