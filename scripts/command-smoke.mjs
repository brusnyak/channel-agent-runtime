import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntime } from '../src/agent/runtime.mjs';
import { handleCommand, parseCommand } from '../src/bot/commands.mjs';
import { loadConfig } from '../src/config/loadConfig.mjs';

const config = await loadConfig('config/agents/missed-call-recovery.yaml');
const dataDir = await mkdtemp(join(tmpdir(), 'channel-runtime-command-'));
config.memory.path = join(dataDir, 'events.jsonl');
const runtime = createRuntime(config);

const sourceMessage = {
  channel: 'telegram',
  id: 'test-command',
  text: '',
  sender: { id: 1, name: 'Tester', handle: '@tester' },
  raw: {},
};

const help = await handleCommand({ command: parseCommand('/help'), config, runtime, sourceMessage });
assert(help.includes('/status'), 'help should list status command');

const tools = await handleCommand({ command: parseCommand('/tools'), config, runtime, sourceMessage });
assert(tools.includes('Internal workflow tools'), 'tools command should not expose raw tool names');

const route = await handleCommand({
  command: parseCommand('/route Boiler stopped and we have no hot water today'),
  config,
  runtime,
  sourceMessage,
});
assert(route.includes('Prepared reply:'), 'route command should return a prepared reply');
assert(!route.includes('tool_results'), 'route command should hide raw tool output');

const demo = await handleCommand({ command: parseCommand('/demo booking'), config, runtime, sourceMessage });
assert(demo.includes('Prepared reply:'), 'demo booking should return a prepared reply');
assert(!demo.includes('tool_results'), 'demo command should hide raw tool output');

const history = await handleCommand({ command: parseCommand('/history 2'), config, runtime, sourceMessage });
assert(history.includes('Last 2 event'), 'history should show recent events');

const lead = await handleCommand({
  command: parseCommand('/lead Boiler stopped and we have no hot water today'),
  config,
  runtime,
  sourceMessage,
});
assert(lead.includes('Lead intake'), 'lead command should process lead intake');

const book = await handleCommand({
  command: parseCommand('/book tomorrow afternoon'),
  config,
  runtime,
  sourceMessage,
});
assert(book.includes('Booking workflow'), 'book command should process booking workflow');

const handoff = await handleCommand({ command: parseCommand('/handoff'), config, runtime, sourceMessage });
assert(handoff.includes('Operator handoff'), 'handoff should summarize latest event');

const approve = await handleCommand({ command: parseCommand('/approve_last'), config, runtime, sourceMessage });
assert(approve.includes('Approved latest event'), 'approve_last should approve latest event');

console.log('Command smoke passed: help, tools, route, demo, history, lead, book, handoff, and approval commands work.');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
