import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = 4381;
const dataDir = await mkdtemp(join(tmpdir(), 'channel-runtime-http-'));
const child = spawn(process.execPath, ['src/cli.mjs', 'server', '--config', 'config/agents/missed-call-recovery.yaml'], {
  env: {
    ...process.env,
    RUNTIME_PORT: String(port),
    CHANNEL_AGENT_DATA_DIR: dataDir,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

try {
  await waitFor(`http://127.0.0.1:${port}/health`);

  const hermes = await postJson(`http://127.0.0.1:${port}/webhooks/hermes`, {
    channel: 'whatsapp_phone',
    from: '+447700900123',
    name: 'Demo Customer',
    text: 'Boiler stopped and we have no hot water today. Can someone come out?',
  });
  assert(hermes.decision.route === 'urgent_service', 'Hermes webhook should route urgent service');
  assert(hermes.decision.outbound_status === 'queued_for_approval', 'Hermes webhook should queue approval');

  const twilio = await postForm(`http://127.0.0.1:${port}/webhooks/whatsapp-phone`, {
    From: 'whatsapp:+447700900123',
    Body: 'Can I book an appointment tomorrow?',
    ProfileName: 'Demo Customer',
  });
  assert(twilio.decision.route === 'booking', 'Twilio form webhook should route booking');

  const events = await getJson(`http://127.0.0.1:${port}/events`);
  assert(events.events.length === 2, 'HTTP server should persist two events');

  console.log('HTTP smoke passed: health, Hermes JSON webhook, Twilio form webhook, and events endpoint work.');
} finally {
  child.kill('SIGTERM');
}

async function waitFor(url) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const result = await getJson(url);
      if (result.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}: ${await response.text()}`);
  return response.json();
}

async function postForm(url, fields) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}: ${await response.text()}`);
  return response.json();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
