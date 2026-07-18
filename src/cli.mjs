#!/usr/bin/env node
import { loadRuntimeEnv } from './config/env.mjs';
import { loadConfig } from './config/loadConfig.mjs';
import { createRuntime } from './agent/runtime.mjs';
import { normalizePhoneWebhook } from './channels/normalize.mjs';
import { startHttpServer } from './channels/httpServer.mjs';
import { startTelegram } from './channels/telegram.mjs';
import { startDiscord } from './channels/discord.mjs';
import { startSlack } from './channels/slack.mjs';

const command = process.argv[2] ?? 'simulate';
loadRuntimeEnv();
const configPath = valueAfter('--config') ?? 'config/agents/missed-call-recovery.yaml';
const config = await loadConfig(configPath);
const runtime = createRuntime(config);

if (command === 'simulate') {
  const message = normalizePhoneWebhook({
    channel: 'whatsapp_phone',
    from: '+447700900123',
    name: 'Demo Customer',
    text: 'Boiler stopped and we have no hot water today. Can someone come out?',
  });
  const decision = await runtime.handleMessage(message);
  console.log(JSON.stringify(decision, null, 2));
} else if (command === 'server') {
  await startHttpServer(config, runtime);
} else if (command === 'telegram') {
  await startTelegram(config, runtime);
} else if (command === 'discord') {
  await startDiscord(config, runtime);
} else if (command === 'slack') {
  await startSlack(config, runtime);
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
