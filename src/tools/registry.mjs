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
};

function extractTimeHint(text) {
  const lower = text.toLowerCase();
  if (lower.includes('today')) return 'today';
  if (lower.includes('tomorrow')) return 'tomorrow';
  if (lower.includes('monday')) return 'Monday';
  return 'not specified';
}
