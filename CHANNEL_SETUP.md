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

Do not use unofficial WhatsApp Web automation for a professional demo.

## Discord

Status: adapter implemented, credentials missing.

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

## Slack

Status: not implemented yet.

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

Then we can add `@slack/bolt` adapter matching the same command/runtime interface.
