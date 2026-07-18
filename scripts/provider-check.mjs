import { loadRuntimeEnv } from '../src/config/env.mjs';

loadRuntimeEnv();

const checks = [];

if (process.env.TELEGRAM_BOT_TOKEN) {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`);
  const data = await res.json();
  checks.push({
    provider: 'telegram',
    ok: Boolean(data.ok),
    detail: data.result?.username ? `bot @${data.result.username}` : data.description ?? 'unknown',
  });
} else {
  checks.push({ provider: 'telegram', ok: false, detail: 'TELEGRAM_BOT_TOKEN missing' });
}

if (process.env.OPENROUTER_API_KEY) {
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
  });
  const data = await res.json();
  const freeCount = (data.data ?? []).filter((model) => String(model.id).includes(':free')).length;
  checks.push({
    provider: 'openrouter',
    ok: res.ok && freeCount > 0,
    detail: `${freeCount} free model(s) visible`,
  });
} else {
  checks.push({ provider: 'openrouter', ok: false, detail: 'OPENROUTER_API_KEY missing' });
}

if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CHANNEL_ID) {
  checks.push({ provider: 'discord', ok: true, detail: 'credentials present; live gateway not tested in provider check' });
} else {
  checks.push({ provider: 'discord', ok: true, detail: 'credentials missing; adapter skipped' });
}

if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_APP_TOKEN && process.env.SLACK_SIGNING_SECRET) {
  checks.push({ provider: 'slack', ok: true, detail: 'credentials present; Socket Mode not live-tested in provider check' });
} else {
  checks.push({ provider: 'slack', ok: true, detail: 'credentials missing; adapter skipped' });
}

for (const check of checks) {
  console.log(`${check.ok ? 'OK' : 'FAIL'} ${check.provider}: ${check.detail}`);
}

const failures = checks.filter((check) => !check.ok && check.provider !== 'discord');
if (failures.length) process.exit(1);
