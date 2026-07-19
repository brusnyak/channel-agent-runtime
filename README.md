# Channel Agent Runtime

[![Node.js](https://img.shields.io/badge/Node.js-runtime-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![LangGraph](https://img.shields.io/badge/Runtime-LangGraph-7C3AED)](https://langchain-ai.github.io/langgraph/)
[![Telegram](https://img.shields.io/badge/Telegram-grammY-26A5E4?logo=telegram&logoColor=white)](https://grammy.dev/)
[![Discord](https://img.shields.io/badge/Discord-discord.js-5865F2?logo=discord&logoColor=white)](https://discord.js.org/)
[![Slack](https://img.shields.io/badge/Slack-Bolt_Socket_Mode-4A154B?logo=slack&logoColor=white)](https://slack.dev/bolt-js/)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-webhook_ready-25D366?logo=whatsapp&logoColor=white)](https://developers.facebook.com/docs/whatsapp/)

Channel Agent Runtime is a LangGraph-backed messaging bot runtime for Telegram, Discord, Slack, and WhatsApp/phone-style gateways. It normalizes messages from different platforms into one configurable agent workflow with tool execution, audit logging, and approval-gated outbound replies.

## Overview

This repository is a proof asset for bot, automation, and operator-workflow roles. It is not a web dashboard; the product surface is the channel layer plus YAML-driven agent configuration.

The core runtime proves that channel adapters can share one agent graph:

```text
channel adapter -> normalized event -> LangGraph state graph -> tools -> decision -> JSONL audit log -> approval-first reply
```

## What it proves

| Proof point | Details |
| --- | --- |
| Config-driven behavior | Agent routes, tools, channels, and outbound policy are defined in YAML. |
| Shared runtime | Telegram, Discord, Slack, and WhatsApp-style inputs flow into the same graph. |
| Real channel adapters | Telegram runs through `grammY`; Discord runs through `discord.js`; Slack uses Bolt Socket Mode. |
| WhatsApp-ready gateway | WhatsApp is represented through HTTP webhook normalization for Hermes, Twilio, or Meta Cloud API paths. |
| Tool reuse | Tools are registered once and reused across channel-specific workflows. |
| Auditability | Events are persisted to JSONL for replay, debugging, and proof. |
| Approval-first outbound | Drafted replies are queued for approval by default instead of auto-sending. |
| Testable demos | Salon booking, Discord moderation, Slack workflow triage, and real-estate WhatsApp intake are covered by smoke tests. |

## System design

```mermaid
flowchart TB
    Telegram[Telegram / grammY] --> Normalize[Message Normalization]
    Discord[Discord / discord.js] --> Normalize
    Slack[Slack / Bolt Socket Mode] --> Normalize
    WhatsApp[WhatsApp / Phone Webhook] --> Normalize

    Normalize --> Graph[LangGraph Runtime]
    Graph --> Route[select_route]
    Route --> Tools[run_tools]
    Tools --> Decision[build_decision]
    Decision --> Memory[persist_event]
    Decision --> Approval[Approval Queue]

    Tools --> ToolRegistry[Shared Tool Registry]
    Memory --> JSONL[(JSONL Audit Log)]
    Approval --> Outbound[Channel Reply Draft]

    classDef channel fill:#DBEAFE,stroke:#2563EB,color:#0F172A,stroke-width:1px
    classDef runtime fill:#EDE9FE,stroke:#7C3AED,color:#0F172A,stroke-width:1px
    classDef graph fill:#DCFCE7,stroke:#16A34A,color:#0F172A,stroke-width:1px
    classDef policy fill:#FEF3C7,stroke:#D97706,color:#0F172A,stroke-width:1px
    classDef data fill:#FCE7F3,stroke:#DB2777,color:#0F172A,stroke-width:1px

    class Telegram,Discord,Slack,WhatsApp channel
    class Normalize,Graph runtime
    class Route,Tools,Decision,Memory,ToolRegistry graph
    class Approval,Outbound policy
    class JSONL data
```

### Runtime flow

| Step | Component | Responsibility |
| --- | --- | --- |
| 1 | Channel adapter | Receives platform-specific events from Telegram, Discord, Slack, or webhook payloads. |
| 2 | Normalizer | Converts each platform event into a shared message format. |
| 3 | LangGraph runtime | Runs the configured state graph for route selection, tool execution, and decision building. |
| 4 | Tool registry | Provides reusable workflow tools across channel-specific agents. |
| 5 | Persistence node | Writes memory and audit events to JSONL. |
| 6 | Approval policy | Queues outbound replies for approval unless policy allows automatic sending. |

## Demo scenarios

| Scenario | Command | Purpose |
| --- | --- | --- |
| Missed-call recovery | `npm run simulate` | Default phone/webhook workflow for urgent service intake. |
| Salon Telegram bot | `npm run simulate:salon` / `npm run telegram:salon` | Appointment booking workflow. |
| Discord moderation | `npm run simulate:discord` / `npm run discord:moderation` | Moderation classification and approval-gated actions. |
| Slack workflow triage | `npm run simulate:slack` / `npm run slack:workflow` | Internal workflow priority classification. |
| Real-estate WhatsApp intake | `npm run simulate:whatsapp` / `npm run server:whatsapp` | Viewing request intake through WhatsApp-style webhook payloads. |

## Tech stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Runtime | Node.js ES modules | CLI, server, and channel process runner. |
| Agent graph | LangGraph | Route selection, tools, decision building, and persistence nodes. |
| Config | YAML | Agent behavior, routes, tools, channels, and policies. |
| Telegram | `grammY` | Long polling and bot command adapter. |
| Discord | `discord.js` | Channel-scoped Discord bot adapter. |
| Slack | `@slack/bolt` | Socket Mode adapter for local development without public webhooks. |
| WhatsApp / phone | HTTP gateway | Hermes-style, Twilio-style, and WhatsApp Cloud webhook normalization. |
| Memory | JSONL | Lightweight audit/replay log. |
| LLM drafting | OpenRouter optional | Disabled by default for deterministic tests. |

## Quick start

Install dependencies:

```bash
npm install
```

Run the full smoke suite:

```bash
npm run test
```

Run the default simulation:

```bash
npm run simulate
```

Start the HTTP gateway:

```bash
npm run server
```

Check health:

```bash
curl http://127.0.0.1:4337/health
```

## HTTP gateway examples

### Hermes-style normalized payload

```bash
curl -s -X POST http://127.0.0.1:4337/webhooks/hermes \
  -H 'content-type: application/json' \
  -d '{
    "channel": "whatsapp_phone",
    "from": "+447700900123",
    "name": "Demo Customer",
    "text": "Boiler stopped and we have no hot water today. Can someone come out?"
  }'
```

### Twilio-style payload

```bash
curl -s -X POST http://127.0.0.1:4337/webhooks/whatsapp-phone \
  -H 'content-type: application/x-www-form-urlencoded' \
  --data-urlencode 'From=whatsapp:+447700900123' \
  --data-urlencode 'Body=Can I book an appointment tomorrow?' \
  --data-urlencode 'ProfileName=Demo Customer'
```

Inspect events:

```bash
curl http://127.0.0.1:4337/events
```

## Channel setup

| Channel | Run command | Notes |
| --- | --- | --- |
| Telegram | `npm run telegram` or `npm run telegram:salon` | Requires `TELEGRAM_BOT_TOKEN`. |
| Discord | `npm run discord` or `npm run discord:moderation` | Requires `DISCORD_BOT_TOKEN`; optional `DISCORD_CHANNEL_ID` allow-listing. |
| Slack | `npm run slack` or `npm run slack:workflow` | Uses Bolt Socket Mode with `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, and signing secret. |
| WhatsApp Cloud | `npm run server:whatsapp` | Supports webhook verification and Cloud API-style inbound payloads. |
| Twilio WhatsApp | HTTP gateway | Supports form-encoded inbound payload normalization. |
| Hermes / Baileys | HTTP gateway | Good for fast personal WhatsApp demo via QR pairing. |

See [CHANNEL_SETUP.md](CHANNEL_SETUP.md) for credential setup and provider checks.

## Commands

Telegram runtime commands include:

```text
/help
/status
/tools
/routes
/demo urgent
/demo booking
/route <message>
/lead <customer message>
/book <request>
/handoff
/approve_last
/reject_last
/history 5
```

Discord commands can use `/help` or `!help`.

## Configuration

Main default config:

```text
config/agents/missed-call-recovery.yaml
```

Important config concepts:

| Field | Meaning |
| --- | --- |
| `policy.auto_reply` | When `false`, replies are drafted and queued instead of auto-sent. |
| `routes` | Maps message patterns or keywords to workflow routes. |
| `tools` | Controls available tool calls. |
| `channels` | Configures active adapters and required environment variables. |

## Verification

| Command | Purpose |
| --- | --- |
| `npm run test` | Full smoke suite across runtime, demos, commands, HTTP, and providers. |
| `npm run test:smoke` | Core config/runtime smoke test. |
| `npm run test:demos` | Demo scenario smoke tests. |
| `npm run test:commands` | Channel command smoke tests. |
| `npm run test:http` | HTTP webhook and gateway smoke tests. |
| `npm run test:providers` | Provider credential visibility checks. |
| `npm run check:discord` | Validate Discord token/channel configuration. |
| `npm run check:slack` | Validate Slack credentials. |
| `npm run check:whatsapp-cloud` | Validate WhatsApp Cloud API dry-run path. |

## Honest boundary

What works now:

- Config loading.
- LangGraph runtime.
- Route selection.
- Tool calls.
- JSONL memory.
- Telegram adapter.
- Discord adapter.
- Slack adapter.
- HTTP phone/WhatsApp gateway.
- Simulation and smoke tests.

What still needs production work:

- Durable approval queue beyond JSONL.
- Provider-specific send workers.
- Authentication on HTTP endpoints.
- Deployment service file.
- Database-backed memory.
- Broader LLM provider integration for non-template replies.

## Supporting docs

| Document | Purpose |
| --- | --- |
| [CHANNEL_SETUP.md](CHANNEL_SETUP.md) | Telegram, WhatsApp/Twilio, Discord, and Slack credential setup. |
| [DEMO_GUIDE.md](DEMO_GUIDE.md) | Exact demo flows for salon, Discord, Slack, and WhatsApp real-estate scenarios. |

## README style direction

This repository follows the shared portfolio README structure:

- Short product description at the top.
- Technology labels for fast scanning.
- Feature, scenario, channel, command, and verification tables.
- Coloured system design diagram when architecture is useful.
- Practical setup, config, boundary, and supporting-docs sections.

## License

No license file is currently included in this repository.
