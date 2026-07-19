# Demo Guide

Target roles: bot developer, agent-platform engineer, operator-runtime roles (Bluepina, Mindrift, Hermes-style).

The proof is not a web page. The proof is a LangGraph runtime behind real channel adapters.

---

## 1. Core Proof — Runtime Architecture

Every inbound message goes through:

```text
channel adapter → normalized event → LangGraph state graph → tools → decision → JSONL audit → approval-first reply
```

Graph nodes: `select_route → run_tools → build_decision → persist_event`

Show:

```bash
npm run test
```

Expected output (all pass):

```text
Smoke passed: config runtime, phone webhook normalization, Telegram/Slack normalization, routing, tools, and JSONL memory work.
Demo smoke passed: salon Telegram, Discord moderation, Slack workflow, and real-estate WhatsApp scenarios run through LangGraph.
Command smoke passed: help, tools, route, demo, history, lead, book, handoff, and approval commands work.
HTTP smoke passed: health, WhatsApp Cloud verify, Hermes JSON webhook, Twilio form webhook, and events endpoint work.
OK telegram: bot @chant_my_bot
OK openrouter: 14 free model(s) visible
OK discord: bot token validates and channel send proof passed.
OK slack: bot/app/signing credentials present
```

---

## 2. Config + Routing + Tools

Agent behavior is YAML-defined. Show the salon config:

```yaml
id: salon-appointment-telegram
mode: approval_first
routes:
  appointment:
    when:
      any: [book, appointment, nails, lashes]
    steps: [extract_appointment_request, check_salon_availability, create_salon_booking, draft_salon_reply]
policy:
  auto_reply: false
```

Run the deterministic salon simulation:

```bash
npm run simulate:salon
```

Expected: extracted service (nails), available slots (10:30, 14:00, 16:30), drafted reply, `approval_required: true`, `outbound_status: queued_for_approval`.

---

## 3. Telegram Live — Salon Appointment Bot

**Use case**: beauty salon appointment booking.

Run:

```bash
npm run telegram:salon
```

Message `@chant_my_bot`:

```text
/help
/route Can I book nails tomorrow afternoon?
/lead I need lashes tomorrow if you have a slot
/approve_last
/handoff
/history 5
```

What it proves:
- Telegram Bot API via grammY
- Appointment extraction + availability check
- Booking draft + approval queue
- JSONL conversation audit

Send test:

```bash
npm run send-test:telegram
```

---

## 4. Discord Live — Moderation Bot

**Use case**: community moderation assistant.

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
- Discord API via discord.js
- Channel allow-listing
- Moderation classification (keyword-based severity)
- Human approval for risky actions (`hide_and_escalate`, `warn_user`)

Send test:

```bash
npm run send-test:discord
```

---

## 5. WhatsApp — Real Estate Intake (Simulation + Webhook)

**Use case**: real-estate viewing request intake.

Simulation (no credentials needed):

```bash
npm run simulate:whatsapp
```

Expected: city/district parsing, 3 matched 2-bedroom listings, multi-language reply (SK/DE/EN), viewing request persisted to SQLite.

HTTP webhook proof:

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

Webhook verification:

```bash
WHATSAPP_VERIFY_TOKEN=demo npm run server:whatsapp
curl 'http://127.0.0.1:4337/webhooks/whatsapp-cloud?hub.mode=subscribe&hub.verify_token=demo&hub.challenge=12345'
```

Expected: `12345`

---

## 6. Slack — Internal Workflow Triage (Simulation)

**Use case**: internal operations triage.

```bash
npm run simulate:slack
```

Expected: `priority: high`, `category: incident`, `owner: operator`, `approval_required: true`.

Live Slack requires inviting the app to the target channel first.

---

## 7. LLM Drafting — OpenRouter Optional Upgrade

Each demo bot has an LLM-enabled sibling config (`*-llm.yaml`) that swaps the templated reply for a live OpenRouter completion. Design boundary worth stating: the LLM only phrases the outbound message. Intent, severity, and availability decisions stay in deterministic tool code.

```bash
npm run simulate:salon-llm
npm run simulate:discord-llm
npm run simulate:whatsapp-llm
```

Fallback proof — run with invalid key:

```bash
OPENROUTER_API_KEY=invalid npm run simulate:whatsapp-llm
```

Expected: same reply text as the non-LLM demo, plus `"llm": {"error": "OpenRouter HTTP 401", "fallback": "template"}`.

---

## 8. Bluepina Adaptation

How I would adapt this for Bluepina:

- **Host knowledge**: replace `realEstateDb.mjs` SQLite with Bluepina's listing/host database via REST API
- **Availability + bookings**: add tools for calendar checks, slot booking, confirmation workflows
- **Guest questions**: add FAQ/intent routes mapped to host/property knowledge base
- **Evals**: add a `test:*` suite for each route with expected intents and replies — regression-test the agent, not just the code
- **Channels**: Telegram and WhatsApp for guests, Discord/Slack for internal host notifications

---

## Job-Application Framing

```text
I built a LangGraph-backed multi-channel bot runtime in Node.js. Telegram, Discord, Slack, and
WhatsApp-style webhooks normalize into the same state graph. The graph handles route selection,
tool execution, decision building, persistence, and approval-first outbound replies.

I included separate demos for salon appointment booking, Discord moderation, Slack workflow
triage, and WhatsApp real-estate intake, with smoke tests and provider checks.

Each bot has an OpenReader-backed LLM drafting mode: the model phrases the outbound message
only, while intent, severity, and availability decisions stay in deterministic tool code.
A failed LLM call falls back to a template reply instead of breaking the conversation.
```

Honest boundary:

```text
Telegram (@chant_my_bot) and Discord (Piligrim) are live-testable now. Slack auth validates
but needs a channel invite. WhatsApp webhook handling is tested locally; real sending needs
Meta/Twilio/Hermes credentials. OpenRouter drafting runs on a free-tier model, so latency
and occasional empty completions are expected — the fallback path is what makes it acceptable
for a demo.
```
