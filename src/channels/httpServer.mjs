import http from 'node:http';
import { normalizePhoneWebhook, normalizeTelegram } from './normalize.mjs';

export async function startHttpServer(config, runtime) {
  const port = Number(process.env.RUNTIME_PORT ?? 4337);

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        return json(res, 200, { ok: true, agent: config.id, channels: Object.keys(config.channels) });
      }

      if (req.method === 'POST' && req.url === '/webhooks/telegram') {
        const payload = await readPayload(req);
        const decision = await runtime.handleMessage(normalizeTelegram(payload));
        return json(res, 201, { decision });
      }

      if (req.method === 'POST' && (req.url === '/webhooks/whatsapp-phone' || req.url === '/webhooks/hermes')) {
        const payload = await readPayload(req);
        const decision = await runtime.handleMessage(normalizePhoneWebhook(payload));
        return json(res, 201, { decision });
      }

      if (req.method === 'GET' && req.url === '/events') {
        return json(res, 200, { events: await runtime.store.readAll() });
      }

      return json(res, 404, { error: 'not found' });
    } catch (error) {
      return json(res, 500, { error: error.message });
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`${config.name} HTTP runtime listening on http://127.0.0.1:${port}`);
    console.log('Endpoints: /webhooks/telegram, /webhooks/hermes, /webhooks/whatsapp-phone, /events');
  });

  return server;
}

async function readPayload(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  const contentType = req.headers['content-type'] ?? '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  return raw ? JSON.parse(raw) : {};
}

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
  });
  res.end(JSON.stringify(body, null, 2));
}
