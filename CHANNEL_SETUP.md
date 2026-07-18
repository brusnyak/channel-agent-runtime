# Channel Setup

## Telegram

Status: working.

Current read-only provider check:

```text
OK telegram: bot @yjobiz_bot
```

Run:

```bash
npm run telegram
```

Commands:

```text
/help
/status
/tools
/routes
/demo urgent
/demo booking
/route Boiler stopped and we have no hot water today
/lead Boiler stopped and we have no hot water today
/book tomorrow afternoon
/handoff
/approve_last
/history 5
```

## WhatsApp

Status: inbound webhook adapter works. Real WhatsApp sending is not configured.

Current env:

```text
TWILIO_ACCOUNT_SID present
TWILIO_AUTH_TOKEN present
TWILIO_PHONE_NUMBER present
TWILIO_WHATSAPP_FROM missing
```

This means we can test Twilio/Hermes-style inbound payloads locally, but cannot honestly test real WhatsApp send/receive yet.

Fast demo path with Hermes:

```bash
hermes gateway setup
```

Pick WhatsApp. Hermes uses a Baileys bridge for the quick path, so it pairs through WhatsApp Web by QR code. That is much simpler than Twilio/Meta setup and good enough for personal demo testing. It is not the clean production path because it is unofficial and tied to a WhatsApp Web session.

Production path:

- Hermes WhatsApp Business Cloud API
- Twilio WhatsApp
- direct Meta WhatsApp Cloud API

Twilio requires either:

- WhatsApp Sandbox joined by the recipient, or
- an approved WhatsApp sender.

After setup, add:

```bash
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

Then dry-run:

```bash
node scripts/whatsapp-check.mjs --to=whatsapp:+421949504848
```

Real send:

```bash
node scripts/whatsapp-check.mjs --to=whatsapp:+421949504848 --send
```

Use Hermes Baileys for fast private demo if needed. Use Cloud/Twilio/Meta for a professional client-facing proof.

Local proof that WhatsApp/Hermes-style inbound handling works:

```bash
npm run test:http
```

This proves the agent accepts Hermes-normalized and Twilio-style WhatsApp payloads. It does not prove real WhatsApp delivery.

WhatsApp Cloud API webhook verification is implemented at:

```text
GET /webhooks/whatsapp-cloud
```

Set:

```bash
WHATSAPP_VERIFY_TOKEN=...
WHATSAPP_CLOUD_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
```

Dry-run a Cloud API send:

```bash
npm run check:whatsapp-cloud -- --to=421949504848
```

## Discord

Status: adapter implemented. Token validates and channel send proof passed.

Setup:

1. Open [Discord Developer Portal](https://discord.com/developers/applications).
2. Create a new application.
3. Go to **Bot**.
4. Create/reset bot token.
5. Enable **Message Content Intent** under privileged gateway intents.
6. OAuth2 -> URL Generator:
   - scopes: `bot`
   - bot permissions: `Send Messages`, `Read Message History`, `View Channels`
7. Invite the bot to your server.
8. Copy the target channel ID. Developer Mode must be enabled in Discord user settings.

Add:

```bash
DISCORD_BOT_TOKEN=...
DISCORD_CHANNEL_ID=...
```

Run:

```bash
npm run discord
```

Commands can use `/help` or `!help`.

Check token:

```bash
npm run check:discord
```

Send a channel proof message:

```bash
npm run send-test:discord
```

Expected result after a valid token:

```text
"ok": true
```

## Slack

Status: adapter implemented. App-level Socket Mode token and bot token validate. Bot must be invited to the target channel before posting.

Recommended setup: Bolt for JavaScript with Socket Mode. This avoids needing a public URL during local development.

Create Slack app:

1. Open [Slack API Apps](https://api.slack.com/apps).
2. Create app from scratch.
3. Enable **Socket Mode**.
4. Create app-level token with `connections:write`.
5. OAuth & Permissions -> Bot Token Scopes:
   - `app_mentions:read`
   - `channels:history`
   - `chat:write`
   - `im:history`
6. Install app to workspace.

Add:

```bash
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_SIGNING_SECRET=...
SLACK_CHANNEL_ID=...
```

The runtime already includes a Bolt Socket Mode adapter matching the same command/runtime interface.

Check tokens:

```bash
npm run check:slack
```

Send a channel proof message:

```bash
npm run send-test:slack
```

If this returns `missing_scope`, add `chat:write` to Bot Token Scopes and reinstall the app to the workspace.
