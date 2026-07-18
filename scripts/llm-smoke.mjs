import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntime } from '../src/agent/runtime.mjs';
import { normalizePhoneWebhook } from '../src/channels/normalize.mjs';
import { loadRuntimeEnv } from '../src/config/env.mjs';
import { loadConfig } from '../src/config/loadConfig.mjs';

loadRuntimeEnv();

if (!process.env.OPENROUTER_API_KEY) {
  console.log('LLM smoke skipped: OPENROUTER_API_KEY missing.');
  process.exit(0);
}

const config = await loadConfig('config/agents/missed-call-recovery-llm.yaml');
const dataDir = await mkdtemp(join(tmpdir(), 'channel-runtime-llm-'));
config.memory.path = join(dataDir, 'events.jsonl');
const runtime = createRuntime(config);
const decision = await runtime.handleMessage(
  normalizePhoneWebhook({
    channel: 'whatsapp_phone',
    from: '+447700900123',
    name: 'Demo Customer',
    text: 'Boiler stopped and we have no hot water today. Can someone come out?',
  }),
);

if (!decision.reply || decision.reply.length < 20) {
  throw new Error('LLM smoke produced an empty or too-short reply');
}
if (!decision.approval_required) {
  throw new Error('LLM smoke should still require approval');
}

console.log(
  JSON.stringify(
    {
      route: decision.route,
      approval_required: decision.approval_required,
      llm: decision.tool_results.draft_reply.llm,
      reply_chars: decision.reply.length,
    },
    null,
    2,
  ),
);
