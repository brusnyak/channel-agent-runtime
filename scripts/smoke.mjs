import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config/loadConfig.mjs';
import { createRuntime } from '../src/agent/runtime.mjs';
import { normalizePhoneWebhook, normalizeTelegram } from '../src/channels/normalize.mjs';

const config = await loadConfig('config/agents/missed-call-recovery.yaml');
const dataDir = await mkdtemp(join(tmpdir(), 'channel-agent-runtime-'));
config.memory.path = join(dataDir, 'events.jsonl');

const runtime = createRuntime(config);

const phoneDecision = await runtime.handleMessage(
  normalizePhoneWebhook({
    channel: 'whatsapp_phone',
    from: '+447700900123',
    name: 'Demo Customer',
    text: 'Boiler stopped and we have no hot water today. Can someone come out?',
  }),
);

const telegramDecision = await runtime.handleMessage(
  normalizeTelegram({
    update_id: 1,
    message: {
      chat: { id: 123, first_name: 'Alex', username: 'alex_demo' },
      text: 'Can I book an appointment tomorrow?',
    },
  }),
);

const events = await runtime.store.readAll();

assert(phoneDecision.route === 'urgent_service', 'phone decision should use urgent route');
assert(telegramDecision.route === 'booking', 'telegram decision should use booking route');
assert(phoneDecision.tool_results.draft_reply.text, 'phone decision should draft reply');
assert(events.length === 2, 'store should persist both decisions');

console.log('Smoke passed: config runtime, phone webhook normalization, Telegram normalization, routing, tools, and JSONL memory work.');

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}
