export function normalizeTelegram(ctxOrUpdate) {
  const msg = ctxOrUpdate.message ?? ctxOrUpdate.update?.message ?? ctxOrUpdate;
  const chat = msg.chat ?? {};
  return {
    channel: 'telegram',
    id: `telegram:${ctxOrUpdate.update_id ?? msg.message_id ?? Date.now()}`,
    text: msg.text ?? '',
    sender: {
      id: chat.id,
      name: [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || `telegram:${chat.id}`,
      handle: chat.username ? `@${chat.username}` : `telegram:${chat.id}`,
    },
    raw: ctxOrUpdate,
  };
}

export function normalizeDiscord(message) {
  return {
    channel: 'discord',
    id: `discord:${message.id ?? Date.now()}`,
    text: message.content ?? '',
    sender: {
      id: message.author?.id,
      name: message.author?.globalName ?? message.author?.username ?? 'Discord user',
      handle: message.author?.username ? `discord:${message.author.username}` : undefined,
    },
    raw: message,
  };
}

export function normalizePhoneWebhook(payload) {
  if (payload.channel && payload.text) {
    return {
      channel: payload.channel,
      id: payload.id ?? `${payload.channel}:${Date.now()}`,
      text: payload.text,
      sender: {
        id: payload.from,
        name: payload.name ?? payload.from ?? 'Contact',
        handle: payload.from,
        phone: payload.phone ?? payload.from,
      },
      raw: payload,
    };
  }

  if (payload.Body || payload.From) {
    return {
      channel: 'whatsapp_phone',
      id: payload.MessageSid ?? `twilio:${Date.now()}`,
      text: payload.Body ?? '',
      sender: {
        id: payload.From,
        name: payload.ProfileName ?? payload.From ?? 'Contact',
        handle: payload.From,
        phone: payload.From,
      },
      raw: payload,
    };
  }

  const change = payload?.entry?.[0]?.changes?.[0]?.value;
  const waMessage = change?.messages?.[0];
  const contact = change?.contacts?.[0];
  if (waMessage) {
    return {
      channel: 'whatsapp_phone',
      id: waMessage.id ?? `whatsapp:${Date.now()}`,
      text: waMessage.text?.body ?? '',
      sender: {
        id: waMessage.from,
        name: contact?.profile?.name ?? waMessage.from,
        handle: `whatsapp:+${waMessage.from}`,
        phone: `+${waMessage.from}`,
      },
      raw: payload,
    };
  }

  throw new Error('Unsupported phone/WhatsApp payload shape');
}
