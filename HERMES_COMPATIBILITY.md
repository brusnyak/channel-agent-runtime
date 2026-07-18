# Hermes Compatibility Notes

## Decision

This runtime is a Hermes-style proof, not a Hermes replacement.

The point is to demonstrate the same useful architecture:

```text
message gateway -> normalized event -> agent config -> tools -> memory -> approval/sending policy
```

## Why This Shape

Hermes already solves a lot of plumbing:

- messaging gateways
- memory
- skills
- cron
- long-running service deployment

So the valuable proof is not another dashboard. The valuable proof is showing that we understand and can build the same operational pattern in a small, inspectable runtime.

## Channel Strategy

### Telegram

Use real adapter first.

- Low setup friction.
- Bot token is enough.
- `grammY` supports polling now and webhook later.

### Discord

Use real adapter second.

- `discord.js` is the standard Node.js path.
- Requires bot token, intents, and target channel ID.

### WhatsApp / Phone

Do not start with browser-session automation.

This runtime exposes a generic `whatsapp_phone` HTTP adapter that accepts:

- Hermes-normalized events
- Twilio-style form payloads
- WhatsApp Cloud-like JSON payloads

That means the agent runtime can be wired later to:

- Hermes WhatsApp gateway
- Twilio SMS/WhatsApp webhook
- Meta WhatsApp Cloud API webhook

without changing agent behavior or tools.

## What To Show In Applications

Strong statement:

```text
I built a config-driven channel agent runtime. Telegram, Discord, and WhatsApp/phone webhooks all normalize into the same agent loop. The agent selects YAML-defined routes, calls tools, writes JSONL memory, and queues replies for approval by default.
```

Honest boundary:

```text
Telegram and Discord adapters are implemented. WhatsApp is implemented as a provider-neutral phone/webhook adapter so it can connect to Hermes, Twilio, or WhatsApp Cloud API without coupling the agent to one vendor.
```

## Next Real Step

Connect Telegram with the user's real bot token and send a real message through the loop.

After that:

1. add a simple approval command
2. add SQLite/Supabase memory
3. deploy to Oracle as a systemd service
4. connect Discord
5. wire WhatsApp through whichever Hermes/phone gateway is actually available
