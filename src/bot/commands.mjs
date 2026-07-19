import { getRealEstateDigest, searchListings } from '../store/realEstateDb.mjs';

export function parseCommand(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed.startsWith('/')) return null;
  const [rawCommand, ...parts] = trimmed.split(/\s+/);
  return {
    name: rawCommand.replace(/^\/+/, '').split('@')[0].toLowerCase(),
    args: parts,
    rest: parts.join(' '),
  };
}

export async function handleCommand({ command, config, runtime, sourceMessage }) {
  const previous = await runtime.store.readAll();

  if (command.name === 'start') {
    return [
      `${config.name} is running.`,
      '',
      'Use /help to see commands.',
    ].join('\n');
  }

  if (command.name === 'help') {
    return [
      'Commands:',
      '/status - short operating status',
      '/digest - listings, conversations, and pending viewings',
      '/listings - current available demo listings',
      '/demo urgent|booking|general - run a built-in demo message',
      '/route <message> - test a custom customer message',
      '/lead <message> - process a lead/customer message',
      '/book <request> - process a booking request',
      '/handoff - summarize the latest event',
      '/approve_last - approve the latest queued event',
      '/reject_last - reject the latest queued event',
      '/history [n] - show recent events',
      '',
      'Plain messages are handled through the same workflow and stored for review.',
    ].join('\n');
  }

  if (command.name === 'status') {
    return [
      `Agent: ${config.name}`,
      `Mode: ${config.mode}`,
      `Events logged: ${previous.length}`,
      `Channels: ${Object.keys(config.channels).join(', ')}`,
      `Auto reply: ${String(config.policy?.auto_reply === true)}`,
    ].join('\n');
  }

  if (command.name === 'tools') {
    return 'Internal workflow tools are configured. Use /status, /digest, /listings, or /history for operator-facing state.';
  }

  if (command.name === 'routes') {
    return 'Routing is internal. Send a customer-style message or use /route <message> to test behavior.';
  }

  if (command.name === 'digest') {
    if (!config.tools.includes('real_estate_digest')) return 'Digest is not configured for this agent.';
    const digest = getRealEstateDigest(config);
    return formatRealEstateDigest(digest);
  }

  if (command.name === 'listings') {
    if (!config.tools.includes('match_real_estate_listings')) return 'Listings are not configured for this agent.';
    const listings = searchListings({
      config,
      request: { city: 'Bratislava', district: 'unknown', bedrooms: 'unknown', max_budget_eur: 'unknown' },
      limit: 10,
    });
    return formatListings(listings);
  }

  if (command.name === 'history') {
    const limit = clampNumber(Number(command.args[0] ?? 5), 1, 10);
    const recent = previous.slice(-limit).reverse();
    if (!recent.length) return 'No events logged yet.';
    return [
      `Last ${recent.length} event(s):`,
      ...recent.map(
        (event) =>
          `- ${event.channel} / ${event.route} / ${event.outbound_status}: ${truncate(event.input, 80)}`,
      ),
    ].join('\n');
  }

  if (command.name === 'lead') {
    if (!command.rest) return 'Usage: /lead <customer message>';
    const decision = await runtime.handleMessage({
      ...sourceMessage,
      text: command.rest,
      raw: { command: command.name },
    });
    return formatDecision(decision, 'Lead intake');
  }

  if (command.name === 'book') {
    if (!command.rest) return 'Usage: /book <booking request>';
    const decision = await runtime.handleMessage({
      ...sourceMessage,
      text: `book appointment ${command.rest}`,
      raw: { command: command.name },
    });
    return formatDecision(decision, 'Booking workflow');
  }

  if (command.name === 'handoff') {
    const latest = latestDecision(previous);
    if (!latest) return 'No event available for handoff.';
    return [
      'Operator handoff',
      `Event: ${latest.id}`,
      `Channel: ${latest.channel}`,
      `Route: ${latest.route}`,
      `Status: ${latest.outbound_status}`,
      `From: ${latest.sender?.name ?? latest.sender?.handle ?? latest.sender?.id ?? 'unknown'}`,
      '',
      `Message: ${latest.input}`,
      '',
      `Draft: ${latest.reply ?? 'none'}`,
    ].join('\n');
  }

  if (command.name === 'approve_last' || command.name === 'reject_last') {
    const latest = latestDecision(previous);
    if (!latest) return 'No event available to review.';
    const status = command.name === 'approve_last' ? 'approved' : 'rejected';
    await runtime.store.append({
      id: `review_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      at: new Date().toISOString(),
      type: 'operator_review',
      status,
      target_event_id: latest.id,
      target_route: latest.route,
      reviewer: sourceMessage.sender,
      note: command.rest || null,
    });
    return `${status === 'approved' ? 'Approved' : 'Rejected'} latest event ${latest.id}.`;
  }

  if (command.name === 'demo') {
    const kind = command.args[0] ?? 'urgent';
    const text = demoText(kind);
    const decision = await runtime.handleMessage({
      ...sourceMessage,
      text,
      raw: { command: command.name, kind },
    });
    return formatDecision(decision, `Demo: ${kind}`);
  }

  if (command.name === 'route') {
    if (!command.rest) return 'Usage: /route <message>';
    const decision = await runtime.handleMessage({
      ...sourceMessage,
      text: command.rest,
      raw: { command: command.name },
    });
    return formatDecision(decision, 'Route check');
  }

  return `Unknown command: /${command.name}. Use /help.`;
}

export function formatDecision(decision, title = 'Decision') {
  const lines = [
    title,
    `Status: ${decision.approval_required ? 'waiting for approval' : 'ready'}`,
  ];

  const qualification = decision.tool_results?.qualify_lead;
  if (qualification) {
    lines.push(`Intent: ${qualification.intent}`);
    lines.push(`Fit: ${qualification.fit}`);
  }

  if (decision.reply) {
    lines.push('');
    lines.push('Prepared reply:');
    lines.push(decision.reply);
  }

  return lines.join('\n');
}

function formatRealEstateDigest(digest) {
  const lines = [
    'Real estate digest',
    `Available listings: ${digest.available_listings}`,
    `Conversations stored: ${digest.conversations}`,
    `Pending viewings: ${digest.pending_viewings}`,
  ];

  if (digest.upcoming.length) {
    lines.push('', 'Pending viewing requests:');
    for (const viewing of digest.upcoming) {
      lines.push(`- #${viewing.id}: ${viewing.title} (${viewing.requested_time})`);
      lines.push(`  ${viewing.url}`);
    }
  }

  if (digest.recent.length) {
    lines.push('', 'Recent conversations:');
    for (const event of digest.recent) {
      lines.push(`- ${event.sender_name}: ${truncate(event.raw_message, 90)}`);
    }
  }

  return lines.join('\n');
}

function formatListings(listings) {
  if (!listings.length) return 'No available listings match the current filter.';
  return [
    'Available demo listings:',
    ...listings.map(
      (listing, index) =>
        `${index + 1}. ${listing.title} - EUR ${listing.price_eur}/mo, ${listing.district}, ${listing.size_sqm} sqm\n${listing.url}`,
    ),
  ].join('\n');
}

function demoText(kind) {
  if (kind === 'booking') return 'Can I book an appointment tomorrow afternoon?';
  if (kind === 'general') return 'Hi, can you tell me what services you offer?';
  return 'Boiler stopped and we have no hot water today. Can someone come out?';
}

function latestDecision(events) {
  return [...events].reverse().find((event) => event.reply || event.outbound_status);
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}
