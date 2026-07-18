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
  const text = valueAfter('--text') ?? demoTextFor(config.id);
  const message = normalizePhoneWebhook({
    channel: demoChannelFor(config.id),
    from: demoSenderFor(config.id),
    name: demoNameFor(config.id),
    text,
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

function demoTextFor(agentId) {
  if (agentId.includes('salon')) return 'Can I book nails tomorrow afternoon?';
  if (agentId.includes('moderation')) return 'This is spam, join discord.gg/fake';
  if (agentId.includes('slack')) return 'Client waiting, workflow is broken and blocked.';
  if (agentId.includes('real-estate')) return 'Can I arrange a viewing for a 2 bedroom apartment in Bratislava tomorrow?';
  return 'Boiler stopped and we have no hot water today. Can someone come out?';
}

function demoChannelFor(agentId) {
  if (agentId.includes('salon')) return 'telegram';
  if (agentId.includes('moderation')) return 'discord';
  if (agentId.includes('slack')) return 'slack';
  return 'whatsapp_phone';
}

function demoSenderFor(agentId) {
  if (agentId.includes('salon')) return 'telegram:demo_customer';
  if (agentId.includes('moderation')) return 'discord:demo_user';
  if (agentId.includes('slack')) return 'slack:demo_user';
  return '+447700900123';
}

function demoNameFor(agentId) {
  if (agentId.includes('salon')) return 'Salon Customer';
  if (agentId.includes('moderation')) return 'Discord Member';
  if (agentId.includes('slack')) return 'Ops Teammate';
  return 'Demo Customer';
}
