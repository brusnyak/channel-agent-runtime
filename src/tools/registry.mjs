import { generateReplyWithOpenRouter } from '../agent/openrouter.mjs';

export const toolRegistry = {
  qualify_lead: async ({ message }) => {
    const text = message.text.toLowerCase();
    const urgent = /(urgent|emergency|leak|boiler|no hot water|locked out)/.test(text);
    const booking = /(book|booking|appointment|schedule|viewing)/.test(text);
    const hasContact = Boolean(message.sender?.phone || message.sender?.handle || message.sender?.id);
    return {
      fit: urgent || booking ? 'high' : 'medium',
      intent: urgent ? 'urgent_service' : booking ? 'booking' : 'general_inquiry',
      missing: hasContact ? [] : ['reply contact'],
    };
  },

  summarize_thread: async ({ message, previous }) => ({
    summary: `${message.sender.name ?? message.sender.handle ?? 'Contact'} via ${message.channel}: ${message.text}`,
    previous_events: previous.length,
  }),

  draft_reply: async ({ message, toolResults, config }) => {
    let llmError = null;
    if (config.llm?.enabled) {
      const llmReply = await generateReplyWithOpenRouter({ config, message, toolResults });
      if (llmReply?.text) {
        return {
          text: llmReply.text.slice(0, config.policy?.max_reply_chars ?? 700),
          approval_required: config.policy?.auto_reply !== true,
          llm: { provider: 'openrouter', model: llmReply.model },
        };
      }
      llmError = llmReply?.error ?? 'OpenRouter returned no text';
    }

    const qualification = toolResults.qualify_lead ?? {};
    const missing = qualification.missing?.length ? ` Could you also send ${qualification.missing.join(' and ')}?` : '';
    const reply =
      qualification.intent === 'urgent_service'
        ? `Thanks, I have the details. I will flag this as urgent and get the right person to respond as soon as possible.${missing}`
        : qualification.intent === 'booking'
          ? `Thanks, I have the request. I will check availability and come back with the next available slot.${missing}`
          : `Thanks, I have the message. I will check it and come back with the next step.${missing}`;

    return {
      text: reply.slice(0, config.policy?.max_reply_chars ?? 700),
      approval_required: config.policy?.auto_reply !== true,
      llm: llmError ? { provider: 'openrouter', error: llmError, fallback: 'template' } : null,
    };
  },

  create_booking_request: async ({ message }) => ({
    status: 'drafted',
    title: `Booking request from ${message.sender.name ?? message.sender.handle ?? 'contact'}`,
    requested_time: extractTimeHint(message.text),
  }),

  notify_owner: async ({ message, toolResults }) => ({
    status: 'queued_dry_run',
    note: `Owner notification would be queued for ${toolResults.qualify_lead?.intent ?? 'message'} from ${
      message.sender.name ?? message.sender.handle ?? 'contact'
    }.`,
  }),

  extract_appointment_request: async ({ message }) => ({
    service: extractService(message.text),
    requested_time: extractTimeHint(message.text),
    customer: message.sender?.name ?? message.sender?.handle ?? 'contact',
    status: 'needs_availability_check',
  }),

  check_salon_availability: async ({ toolResults }) => {
    const requestedTime = toolResults.extract_appointment_request?.requested_time ?? 'not specified';
    const slots = requestedTime === 'tomorrow' ? ['10:30', '14:00', '16:30'] : ['09:30', '13:00', '15:30'];
    return {
      requested_time: requestedTime,
      available_slots: slots,
      calendar: 'demo_memory_calendar',
    };
  },

  create_salon_booking: async ({ message, toolResults }) => ({
    status: 'drafted',
    booking_id: `salon_${Date.now()}`,
    customer: message.sender?.name ?? message.sender?.handle ?? 'contact',
    service: toolResults.extract_appointment_request?.service ?? 'beauty service',
    offered_slots: toolResults.check_salon_availability?.available_slots ?? [],
  }),

  draft_salon_reply: async ({ toolResults }) => {
    const booking = toolResults.create_salon_booking;
    const slots = booking?.offered_slots?.length ? booking.offered_slots.join(', ') : 'the next available slots';
    return {
      text: `I can help with ${booking?.service ?? 'that service'}. Available demo slots: ${slots}. Which one should I hold for you?`,
      approval_required: true,
    };
  },

  classify_discord_message: async ({ message }) => {
    const text = message.text.toLowerCase();
    const toxic = /(idiot|stupid|hate|kill|scam|spam|free money|discord.gg)/.test(text);
    const severity = toxic ? (/(kill|hate|scam|spam|discord.gg)/.test(text) ? 'high' : 'medium') : 'low';
    return {
      severity,
      action: severity === 'high' ? 'hide_and_escalate' : severity === 'medium' ? 'warn_user' : 'allow',
      reason: toxic ? 'matched moderation policy keywords' : 'no policy issue detected',
    };
  },

  draft_moderation_action: async ({ message, toolResults }) => {
    const moderation = toolResults.classify_discord_message;
    return {
      text:
        moderation.action === 'allow'
          ? 'Message allowed. No moderation action needed.'
          : `Moderation draft: ${moderation.action} for ${message.sender?.handle ?? message.sender?.name ?? 'user'} because ${moderation.reason}.`,
      approval_required: moderation.action !== 'allow',
    };
  },

  triage_slack_request: async ({ message }) => {
    const text = message.text.toLowerCase();
    const priority = /(urgent|blocked|down|broken|asap|client waiting)/.test(text) ? 'high' : 'normal';
    return {
      priority,
      category: /(invoice|payment|billing)/.test(text)
        ? 'billing'
        : /(bug|broken|error|down)/.test(text)
          ? 'incident'
          : 'workflow_request',
      owner: priority === 'high' ? 'operator' : 'automation_queue',
    };
  },

  draft_slack_update: async ({ toolResults }) => {
    const triage = toolResults.triage_slack_request;
    return {
      text: `Slack workflow draft: ${triage.category}, priority ${triage.priority}, owner ${triage.owner}. Next step queued for review.`,
      approval_required: true,
    };
  },

  extract_real_estate_request: async ({ message }) => {
    const text = message.text.toLowerCase();
    return {
      intent: /(viewing|visit|see|tour)/.test(text) ? 'viewing_request' : 'property_question',
      city: text.includes('bratislava') ? 'Bratislava' : 'unknown',
      bedrooms: text.match(/(\d)\s*(bed|bedroom|izb)/)?.[1] ?? 'unknown',
      requested_time: extractTimeHint(text),
    };
  },

  draft_real_estate_reply: async ({ toolResults }) => {
    const request = toolResults.extract_real_estate_request;
    const time = request.requested_time === 'not specified' ? 'two time windows that work for you' : request.requested_time;
    return {
      text: `Thanks. I have this as a ${request.intent} in ${request.city}. Please send ${time}, your preferred area, and budget, and I will prepare the next step.`,
      approval_required: true,
    };
  },
};

function extractService(text) {
  const lower = text.toLowerCase();
  if (lower.includes('nail')) return 'nails';
  if (lower.includes('lash')) return 'lashes';
  if (lower.includes('brow')) return 'brows';
  if (lower.includes('hair')) return 'hair';
  if (lower.includes('massage')) return 'massage';
  return 'beauty service';
}

function extractTimeHint(text) {
  const lower = text.toLowerCase();
  if (lower.includes('today')) return 'today';
  if (lower.includes('tomorrow')) return 'tomorrow';
  if (lower.includes('monday')) return 'Monday';
  return 'not specified';
}
