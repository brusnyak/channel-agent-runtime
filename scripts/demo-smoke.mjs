import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntime } from '../src/agent/runtime.mjs';
import { loadConfig } from '../src/config/loadConfig.mjs';

const scenarios = [
  {
    config: 'config/agents/salon-telegram.yaml',
    channel: 'telegram',
    text: 'Can I book nails tomorrow afternoon?',
    expectTool: 'create_salon_booking',
    expectReply: 'Available demo slots',
  },
  {
    config: 'config/agents/discord-moderation.yaml',
    channel: 'discord',
    text: 'This is spam, join discord.gg/fake',
    expectTool: 'classify_discord_message',
    expectReply: 'Moderation draft',
  },
  {
    config: 'config/agents/slack-workflow.yaml',
    channel: 'slack',
    text: 'Client waiting, workflow is broken and blocked.',
    expectTool: 'triage_slack_request',
    expectReply: 'Slack workflow draft',
  },
  {
    config: 'config/agents/real-estate-whatsapp.yaml',
    channel: 'whatsapp_phone',
    text: 'Can I arrange a viewing for a 2 bedroom apartment in Bratislava tomorrow?',
    expectTool: 'extract_real_estate_request',
    expectReply: 'https://www.nehnutelnosti.sk/',
  },
];

for (const scenario of scenarios) {
  const config = await loadConfig(scenario.config);
  const dataDir = await mkdtemp(join(tmpdir(), 'channel-runtime-demo-'));
  config.memory.path = join(dataDir, 'events.jsonl');
  if (config.real_estate?.db_path) config.real_estate.db_path = join(dataDir, 'real-estate.sqlite');
  const runtime = createRuntime(config);
  const decision = await runtime.handleMessage({
    channel: scenario.channel,
    id: `${scenario.channel}:demo`,
    text: scenario.text,
    sender: { id: 'demo-user', name: 'Demo User', handle: 'demo-user' },
    raw: {},
  });

  assert(decision.graph === 'langgraph', `${scenario.config} should use LangGraph`);
  assert(decision.tool_results[scenario.expectTool], `${scenario.config} should run ${scenario.expectTool}`);
  assert(decision.reply, `${scenario.config} should create a reply`);
  assert(decision.reply.includes(scenario.expectReply), `${scenario.config} should create a scenario-specific reply`);
}

console.log('Demo smoke passed: salon Telegram, Discord moderation, Slack workflow, and real-estate WhatsApp scenarios run through LangGraph.');

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}
