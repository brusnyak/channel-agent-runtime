import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config/loadConfig.mjs';
import { createRuntime } from '../src/agent/runtime.mjs';
import { normalizePhoneWebhook, normalizeSlack, normalizeTelegram } from '../src/channels/normalize.mjs';

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

const slackDecision = await runtime.handleMessage(
  normalizeSlack({
    ts: '1784367000.000100',
    user: 'U123',
    text: 'Can I book a viewing tomorrow?',
  }),
);

const events = await runtime.store.readAll();

assert(phoneDecision.route === 'urgent_service', 'phone decision should use urgent route');
assert(telegramDecision.route === 'booking', 'telegram decision should use booking route');
assert(slackDecision.route === 'booking', 'slack decision should use booking route');
assert(phoneDecision.graph === 'langgraph', 'runtime should use LangGraph');
assert(phoneDecision.graph_trace.includes('select_route'), 'graph trace should include route node');
assert(phoneDecision.graph_trace.includes('run_tools'), 'graph trace should include tools node');
assert(phoneDecision.tool_results.draft_reply.text, 'phone decision should draft reply');
assert(events.length === 3, 'store should persist all decisions');

console.log('Smoke passed: config runtime, phone webhook normalization, Telegram/Slack normalization, routing, tools, and JSONL memory work.');

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}
