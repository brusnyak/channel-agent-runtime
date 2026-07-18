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
      '/status - runtime and memory status',
      '/tools - configured tools',
      '/routes - configured routes',
      '/demo urgent|booking|general - run a built-in demo message',
      '/route <message> - classify and draft for custom text',
      '/history [n] - show recent events',
      '',
      'Plain messages are processed through the same runtime and queued for approval.',
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
    return ['Configured tools:', ...config.tools.map((tool) => `- ${tool}`)].join('\n');
  }

  if (command.name === 'routes') {
    return [
      'Configured routes:',
      ...Object.entries(config.routes).map(([name, route]) => {
        const triggers = route.when?.any?.length ? ` triggers: ${route.when.any.join(', ')}` : '';
        return `- ${name}: ${route.steps.join(' -> ')}${triggers}`;
      }),
    ].join('\n');
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
    `Route: ${decision.route}`,
    `Status: ${decision.outbound_status}`,
    `Approval required: ${String(decision.approval_required)}`,
  ];

  const qualification = decision.tool_results?.qualify_lead;
  if (qualification) {
    lines.push(`Intent: ${qualification.intent}`);
    lines.push(`Fit: ${qualification.fit}`);
  }

  if (decision.reply) {
    lines.push('');
    lines.push('Draft:');
    lines.push(decision.reply);
  }

  return lines.join('\n');
}

function demoText(kind) {
  if (kind === 'booking') return 'Can I book an appointment tomorrow afternoon?';
  if (kind === 'general') return 'Hi, can you tell me what services you offer?';
  return 'Boiler stopped and we have no hot water today. Can someone come out?';
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}
