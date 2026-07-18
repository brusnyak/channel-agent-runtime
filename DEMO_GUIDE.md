# Demo Guide

This repo targets the Mindrift/Tendem bot developer role: messaging-platform bots, webhooks, dialogue state, LLM-ready workflows, backend tools, logging, and reliability checks.

The proof is not a web page. The proof is a LangGraph runtime behind real channel adapters.

## Core Proof

Every inbound message goes through:

```text
channel adapter -> normalized event -> LangGraph state graph -> tools -> decision -> JSONL audit log -> approval-first reply
```

The graph nodes are:

```text
select_route -> run_tools -> build_decision -> persist_event
```

Run:

```bash
npm run test
```

Expected:

```text
Demo smoke passed: salon Telegram, Discord moderation, Slack workflow, and real-estate WhatsApp scenarios run through LangGraph.
```

## Telegram: Salon Appointment Bot

Use case: beauty salon appointment setting.

Run:

```bash
npm run telegram:salon
```

Message `@yjobiz_bot`:

```text
/help
/route Can I book nails tomorrow afternoon?
/lead I need lashes tomorrow if you have a slot
/handoff
/approve_last
```

What it proves:

- Telegram Bot API adapter through `grammY`
- appointment extraction
- demo availability check
- booking draft
- approval queue
- JSONL conversation audit

Send proof:

```bash
npm run send-test:telegram
```

## Discord: Moderation Bot

Use case: community moderation assistant.

Run:

```bash
npm run discord:moderation
```

In the configured Discord channel, send:

```text
!help
This is spam, join discord.gg/fake
!handoff
!approve_last
```

What it proves:

- Discord API adapter through `discord.js`
- channel allow-listing
- moderation classification
- human approval for risky actions

Channel send proof:

```bash
npm run send-test:discord
```

## Slack: Internal Workflow Triage Bot

Use case: internal operations triage.

Run:

```bash
npm run slack:workflow
```

In Slack, send:

```text
/help
/route Client waiting, workflow is broken and blocked
/handoff
```

What it proves:

- Slack Bolt Socket Mode adapter
- no public webhook needed for local development
- workflow priority classification
- operator update draft

If sending fails with `not_in_channel`, invite the app/bot to the channel.

If sending fails with `missing_scope`, add `chat:write` to Bot Token Scopes and reinstall the app.

## WhatsApp: Real Estate Intake Bot

Use case: real-estate viewing request intake.

Local webhook proof:

```bash
npm run server:whatsapp
```

In another terminal:

```bash
curl -s -X POST http://127.0.0.1:4337/webhooks/whatsapp-cloud \
  -H 'content-type: application/json' \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "contacts": [{ "profile": { "name": "Demo Buyer" } }],
          "messages": [{
            "id": "wamid.demo",
            "from": "421949504848",
            "text": { "body": "Can I arrange a viewing for a 2 bedroom apartment in Bratislava tomorrow?" }
          }]
        }
      }]
    }]
  }'
```

Webhook verification proof:

```bash
WHATSAPP_VERIFY_TOKEN=demo npm run server:whatsapp
curl 'http://127.0.0.1:4337/webhooks/whatsapp-cloud?hub.mode=subscribe&hub.verify_token=demo&hub.challenge=12345'
```

Expected:

```text
12345
```

Real WhatsApp send requires one of:

- WhatsApp Cloud API credentials: `WHATSAPP_CLOUD_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
- Twilio approved WhatsApp sender: `TWILIO_WHATSAPP_FROM`
- Hermes Baileys bridge paired by QR

Cloud API dry-run:

```bash
npm run check:whatsapp-cloud -- --to=421949504848
```

## Job-Application Framing

Use this wording:

```text
I built a LangGraph-backed multi-channel bot runtime in Node.js. Telegram, Discord, Slack, and WhatsApp-style webhooks normalize platform messages into the same state graph. The graph handles route selection, tool execution, decision building, persistence, and approval-first outbound replies. I included separate demos for salon appointment booking, Discord moderation, Slack workflow triage, and WhatsApp real-estate intake, with smoke tests and provider checks.
```

Honest boundary:

```text
Telegram and Discord are live-testable now. Slack auth validates, but the app must be invited to the channel before posting. WhatsApp Cloud webhook handling is implemented and tested locally; real WhatsApp sending needs Meta/Twilio/Hermes credentials.
```
