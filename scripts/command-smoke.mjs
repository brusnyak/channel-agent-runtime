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
assert(tools.includes('qualify_lead'), 'tools should list qualify_lead');

const route = await handleCommand({
  command: parseCommand('/route Boiler stopped and we have no hot water today'),
  config,
  runtime,
  sourceMessage,
});
assert(route.includes('Route: urgent_service'), 'route command should classify urgent service');

const demo = await handleCommand({ command: parseCommand('/demo booking'), config, runtime, sourceMessage });
assert(demo.includes('Route: booking'), 'demo booking should use booking route');

const history = await handleCommand({ command: parseCommand('/history 2'), config, runtime, sourceMessage });
assert(history.includes('Last 2 event'), 'history should show recent events');

console.log('Command smoke passed: help, tools, route, demo, and history commands work.');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
