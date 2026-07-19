import { generateReplyWithOpenRouter } from '../agent/openrouter.mjs';
import {
  createViewing,
  getRealEstateDigest,
  logConversation,
  searchListings,
} from '../store/realEstateDb.mjs';

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
    note: `Owner notification would be queued for ${
      toolResults.qualify_lead?.intent ?? toolResults.extract_real_estate_request?.intent ?? 'message'
    } from ${
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

  draft_salon_reply: async ({ message, toolResults, config }) => {
    const booking = toolResults.create_salon_booking;
    const slots = booking?.offered_slots?.length ? booking.offered_slots.join(', ') : 'the next available slots';
    const template = `I can help with ${booking?.service ?? 'that service'}. Available demo slots: ${slots}. Which one should I hold for you?`;

    if (config.llm?.enabled) {
      const llmReply = await generateReplyWithOpenRouter({ config, message, toolResults });
      if (llmReply?.text) {
        return {
          text: llmReply.text.slice(0, config.policy?.max_reply_chars ?? 700),
          approval_required: true,
          llm: { provider: 'openrouter', model: llmReply.model },
        };
      }
      return {
        text: template,
        approval_required: true,
        llm: { provider: 'openrouter', error: llmReply?.error ?? 'OpenRouter returned no text', fallback: 'template' },
      };
    }

    return { text: template, approval_required: true };
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

  draft_moderation_action: async ({ message, toolResults, config }) => {
    const moderation = toolResults.classify_discord_message;
    const template =
      moderation.action === 'allow'
        ? 'Message allowed. No moderation action needed.'
        : `Moderation draft: ${moderation.action} for ${message.sender?.handle ?? message.sender?.name ?? 'user'} because ${moderation.reason}.`;

    // The action/severity/reason are decided by the deterministic rule
    // engine above, never by the LLM — the model only phrases the notice
    // for an action that is already made. 'allow' cases skip the LLM call
    // entirely since there is nothing to phrase or send.
    if (config.llm?.enabled && moderation.action !== 'allow') {
      const llmReply = await generateReplyWithOpenRouter({ config, message, toolResults });
      if (llmReply?.text) {
        return {
          text: llmReply.text.slice(0, config.policy?.max_reply_chars ?? 500),
          approval_required: true,
          llm: { provider: 'openrouter', model: llmReply.model },
        };
      }
      return {
        text: template,
        approval_required: true,
        llm: { provider: 'openrouter', error: llmReply?.error ?? 'OpenRouter returned no text', fallback: 'template' },
      };
    }

    return { text: template, approval_required: moderation.action !== 'allow' };
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
    const text = message.text;
    const lower = text.toLowerCase();
    const intent =
      /(view|viewing|visit|see|tour|arrange|obhliadk|prehliadk|besichtig)/i.test(lower) ? 'viewing_request'
      : /(rent|hire|miet|prenaj|hľad|hľadám|looking|search|need|potreb|need flat)/i.test(lower) ? 'property_search'
      : 'property_question';
    return {
      intent,
      language: detectLanguage(text),
      city: lower.includes('bratislava') || lower.includes('pressburg') || lower.includes('bts') ? 'Bratislava' : 'unknown',
      district: extractDistrict(text),
      room_type: extractRoomType(text),
      bedrooms: text.match(/(\d)\s*(bed|bedroom|izb|zimmer)/i)?.[1] ?? 'unknown',
      max_budget_eur: extractBudget(text),
      min_size: extractMinSize(text),
      features: extractFeatures(text),
      development_type: extractDevelopmentType(text),
      occupants: extractOccupants(text),
      move_in_date: extractMoveInDate(text),
      requested_time: extractTimeHint(text),
    };
  },

  match_real_estate_listings: async ({ toolResults, config }) => {
    const request = toolResults.extract_real_estate_request;
    const listings = searchListings({ request, config });
    // Log features and preferences for tracking
    const featureTags = request.features?.length ? ` [${request.features.join(', ')}]` : '';
    return {
      count: listings.length,
      listings,
      features_matched: request.features || [],
      development_type: request.development_type || 'unknown',
      occupants: request.occupants || 'unknown',
      move_in_date: request.move_in_date || 'unknown',
      _log_line: `${request.district} ${request.room_type || request.bedrooms + 'i'} ≤${request.max_budget_eur}€${featureTags}`,
    };
  },

  create_real_estate_viewing: async ({ message, toolResults, config }) => {
    const request = toolResults.extract_real_estate_request;
    const listings = toolResults.match_real_estate_listings?.listings ?? [];
    return createViewing({ message, request, listings, config });
  },

  draft_real_estate_reply: async ({ message, toolResults, config }) => {
    const request = toolResults.extract_real_estate_request;
    const matches = toolResults.match_real_estate_listings?.listings ?? [];
    const lang = request.language || 'en';

    // No matches — natural follow-up question
    if (matches.length === 0) {
      const followUp = lang === 'sk'
        ? 'Zatiaľ nemám presnú ponuku. Môžete mi povedať akú lokalitu, veľkosť a približný rozpočet hľadáte?'
        : lang === 'de'
          ? 'Ich habe noch keine passende Wohnung. Sagen Sie mir bitte, welche Lage, Größe und welches Budget Sie suchen.'
          : 'I don\'t have an exact match yet. What area, size, and budget are you looking for?';
      return { text: followUp, approval_required: true };
    }

    // Build listing text — clean, no markdown bold, natural language
    const listingText = matches
      .map(
        (listing, index) => {
          const price = `${listing.price_eur} EUR/mesiac`;
          const size = `${listing.size_sqm} m2`;
          const prefix = lang === 'sk' ? `${index + 1}.` : lang === 'de' ? `${index + 1}.` : `${index + 1}.`;
          const addr = listing.title || listing.address || '';
          const url = listing.url ? `\n${listing.url}` : '';
          return `${prefix} ${addr}, ${listing.district}, ${size}, ${price}${url}`;
        },
      )
      .join('\n\n');

    // Time question
    const timeAsk = request.requested_time === 'not specified'
      ? (lang === 'sk'
          ? 'Ktorý termín by vám vyhovoval na obhliadku?'
          : lang === 'de'
            ? 'Welcher Termin würde Ihnen für eine Besichtigung passen?'
            : 'What time would work for a viewing?')
      : (lang === 'sk'
          ? `Super, beriem na vedomie ${request.requested_time}.`
          : lang === 'de'
            ? `Prima, ich notiere ${request.requested_time}.`
            : `Noted for ${request.requested_time}.`);

    const intro = lang === 'sk'
      ? `Ahoj, mám pre vás ${matches.length} ponuk` + (matches.length > 1 ? 'y:' : 'u:')
      : lang === 'de'
        ? `Hallo, ich habe ${matches.length} passende` + (matches.length > 1 ? ' Wohnungen:' : ' Wohnung:')
        : `Hi, I have ${matches.length} option` + (matches.length > 1 ? 's:' : ':');

    const template = [intro, '', listingText, '', timeAsk].join('\n');

    if (config.llm?.enabled) {
      const llmReply = await generateReplyWithOpenRouter({ config, message, toolResults });
      if (llmReply?.text) {
        return {
          text: llmReply.text.slice(0, config.policy?.max_reply_chars ?? 700),
          approval_required: true,
          llm: { provider: 'openrouter', model: llmReply.model },
        };
      }
      return {
        text: template,
        approval_required: true,
        llm: { provider: 'openrouter', error: llmReply?.error ?? 'OpenRouter returned no text', fallback: 'template' },
      };
    }

    return { text: template, approval_required: true };
  },

  log_real_estate_conversation: async ({ message, toolResults, config }) => {
    const request = toolResults.extract_real_estate_request;
    const matches = toolResults.match_real_estate_listings ?? {};
    const listings = matches.listings ?? [];
    const reply = toolResults.draft_real_estate_reply?.text ?? '';
    // Include feature/occupant/development info in the log
    const enrichedRequest = {
      ...request,
      features: request.features || [],
      development_type: request.development_type || 'unknown',
      occupants: request.occupants || 'unknown',
      move_in_date: request.move_in_date || 'unknown',
    };
    return logConversation({ message, request: enrichedRequest, listings, reply, config });
  },

  real_estate_digest: async ({ config }) => {
    const digest = getRealEstateDigest(config);
    // Add human-readable summary
    const lines = [`Nehnuteľnosti: ${digest.available_listings} voľných, ${digest.conversations} konverzácií, ${digest.pending_viewings} obhliadok`];
    if (digest.popular_districts?.length) {
      lines.push('Záujem podľa lokalít: ' + digest.popular_districts.map(d => `${d.district} (${d.count})`).join(', '));
    }
    digest._summary = lines.join('\n');
    return digest;
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
  const days = { today: 'today', dnes: 'today', tomorrow: 'tomorrow', zajtra: 'tomorrow',
    monday: 'Monday', 'pondelok': 'Monday', tuesday: 'Tuesday', 'utorok': 'Tuesday',
    wednesday: 'Wednesday', 'streda': 'Wednesday', thursday: 'Thursday', 'štvrtok': 'Thursday',
    friday: 'Friday', 'piatok': 'Friday', saturday: 'Saturday', 'sobota': 'Saturday',
    sunday: 'Sunday', 'nedeľa': 'Sunday' };
  for (const [word, norm] of Object.entries(days)) {
    if (lower.includes(word)) return norm;
  }
  const dateMatch = lower.match(/(\d{1,2})[.\/\s]+(\d{1,2})/);
  if (dateMatch) return `${dateMatch[1]}.${dateMatch[2]}.`;
  return 'not specified';
}

const DISTRICTS = {
  'ruzinov': 'Ružinov', 'ružinov': 'Ružinov',
  'stare mesto': 'Staré Mesto', 'staré mesto': 'Staré Mesto', 'old town': 'Staré Mesto',
  'petrzalka': 'Petržalka', 'petržalka': 'Petržalka',
  'nove mesto': 'Nové Mesto', 'nové mesto': 'Nové Mesto', 'new town': 'Nové Mesto',
  'dubravka': 'Dúbravka', 'dúbravka': 'Dúbravka',
  'karlova ves': 'Karlova Ves', 'karlova ves': 'Karlova Ves',
  'rac': 'Rača', 'raca': 'Rača', 'rača': 'Rača',
  'vrakuna': 'Vrakuňa', 'vrakuňa': 'Vrakuňa',
  'podunajske bisku': 'Podunajské Biskupice', 'podunajské biskupice': 'Podunajské Biskupice', 'bisku': 'Podunajské Biskupice',
  'lamac': 'Lamač', 'lamač': 'Lamač',
  'zahorska': 'Záhorská Bystrica', 'zahorská bystrica': 'Záhorská Bystrica',
  'devinska': 'Devínska Nová Ves', 'devínska nová ves': 'Devínska Nová Ves',
  'vajnory': 'Vajnory',
  'jaro': 'Jarovce', 'jarovce': 'Jarovce',
  'rusovce': 'Rusovce',
  'cunovo': 'Čunovo', 'cunovo': 'Čunovo',
  'devín': 'Devín',
  'koliba': 'Koliba',
  'kramare': 'Kramáre', 'kramáre': 'Kramáre',
  'slavin': 'Slavín',
};

function extractDistrict(text) {
  const lower = text.toLowerCase();
  for (const [key, value] of Object.entries(DISTRICTS)) {
    if (lower.includes(key)) return value;
  }
  return 'unknown';
}

function extractBudget(text) {
  // Slovak: "do 800", "max 1000€", "800 eur", "cca 700", "okolo 600"
  // English: "under 800", "up to 1000", "max 1000 eur", "budget 800"
  // German: "bis 800", "maximal 1000", "ca 700"
  const patterns = [
    /(?:do|under|up to|max|maxim|budget|bis|maximal|nie viac|not more)\s*(?:eur|€)?\s*(\d{3,5})/i,
    /(?:eur|€)\s*(\d{3,5})/i,
    /(?:okolo|around|about|cca|ca\b|approximately|približne)\s*(?:eur|€)?\s*(\d{3,5})/i,
    /(\d{3,5})\s*(?:eur|€)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return 'unknown';
}

function extractRoomType(text) {
  const lower = text.toLowerCase();
  // Slovak: "1i", "2 izb", "3-izbový", "jednoizbový", "dvojizbový"
  // English: "1 bedroom", "2 bed", "studio"
  // German: "1 zi", "2 zimmer", "einzimmer"
  const roomPatterns = [
    /(\d)\s*i(?:zb|zimmer|zi|z)?[.\s]/i,
    /(\d)\s*(?:bed|bedroom|bedrm|br)/i,
    /(\d)\s*(?:room|zimmer)/i,
    /\b(?:1|one|jedno)\s*(?:i|izb|izbov|bed|bedroom|zimmer|zi)\w*/i,
  ];
  for (const pattern of roomPatterns) {
    const match = lower.match(pattern);
    if (match) {
      const num = match[1] === 'one' || match[1] === 'jedno' ? '1' : match[1];
      return `${num}-izb`;
    }
  }
  if (/garçonka|garsoniér|studio|garsonka|1i\b/i.test(lower)) return '1-izb';
  if (/mezonet|duplex/i.test(lower)) return 'mezonet';
  return 'unknown';
}

function extractFeatures(text) {
  const lower = text.toLowerCase();
  const features = [];
  // Balcony / terrace
  if (/(balkón|balkon|balcony|balk|terasa|terrace)/i.test(lower)) features.push('balkón/terasa');
  // Furnished
  if (/(zariaden|furnished|möbliert|fully furn)/i.test(lower)) features.push('zariadený');
  if (/(nezariaden|unfurnished|unmöbliert|empty)/i.test(lower)) features.push('nezariadený');
  // Parking
  if (/(parkova|parking|parkingové|garage|garáž|parkplatz)/i.test(lower)) features.push('parkovanie');
  // Elevator
  if (/(výťah|vytah|lift|elevator|aufzug)/i.test(lower)) features.push('výťah');
  // Air conditioning
  if (/(klíma|klima|ac\b|air cond|klimatiz)/i.test(lower)) features.push('klíma');
  // Pet friendly
  if (/(pet|domáce zviera|zvierat|dog|cat|pes|mačka|tier|haustier)/i.test(lower) &&
      !/(no pet|bez zvierat|keine tiere)/i.test(lower)) features.push('pet friendly');
  // Heating type
  if (/(kúrenie|kur|heating|gas\b|plyn|diaľkov|fernwärme)/i.test(lower)) features.push('kúrenie');
  // Cellar / storage
  if (/(pivnic|cellar|storage|keller|komora)/i.test(lower)) features.push('pivnica');
  // Floor (low/ground/high)
  if (/(prízem|ground floor|piano terra|1.posch|first floor)/i.test(lower)) features.push('nízke poschodie');
  return features;
}

function extractDevelopmentType(text) {
  const lower = text.toLowerCase();
  if (/(novostavb|nové byt|new develop|nový projekt|newly build|neubau)/i.test(lower)) return 'novostavba';
  if (/(starš|older build|altbau|pôvodn|rekonštru|renov)/i.test(lower)) return 'rekonštrukcia';
  if (/(projekt|development|výstav|under construction)/i.test(lower)) return 'vo výstavbe';
  return 'unknown';
}

function extractOccupants(text) {
  const lower = text.toLowerCase();
  const match = lower.match(/(\d)\s*(?:people|person|persons|dospel|adult|occupant|osoba|osoby|ľud|človek)/i);
  return match ? Number(match[1]) : 'unknown';
}

function extractMinSize(text) {
  const lower = text.toLowerCase();
  // "nad 50m2", "min 45m2", "aspoň 40", "minimum 50 sqm", "ab 50qm", ">50m2"
  const match = lower.match(/(?:nad|min|aspoň|minimum|ab|above|viac ako|>)\s*(\d{2,3})\s*(?:m2|m²|sqm|qm)?/i);
  if (match) return Number(match[1]);
  // Just a size in m2: "50m2" or "50 m2"
  const justSize = lower.match(/(\d{2,3})\s*(?:m2|m²|sqm)/i);
  return justSize ? Number(justSize[1]) : 'unknown';
}

function extractMoveInDate(text) {
  const lower = text.toLowerCase();
  // Slovak: "od augusta", "od 1.8.", "najskôr september", "1. augusta"
  // English: "from august", "move in august", "starting 1st august"
  // German: "ab august", "ab 1. August", "einzug"
  const months = {
    'januar': '01', 'januára': '01', 'january': '01', 'jan': '01', 'jänner': '01',
    'február': '02', 'februára': '02', 'february': '02', 'feb': '02',
    'marec': '03', 'marca': '03', 'march': '03', 'mar': '03', 'märz': '03',
    'apríl': '04', 'apríla': '04', 'april': '04', 'apr': '04',
    'máj': '05', 'mája': '05', 'may': '05',
    'jún': '06', 'júna': '06', 'june': '06', 'jun': '06',
    'júl': '07', 'júla': '07', 'july': '07', 'jul': '07',
    'august': '08', 'augusta': '08', 'aug': '08',
    'september': '09', 'septembra': '09', 'sep': '09',
    'október': '10', 'októbra': '10', 'october': '10', 'okt': '10', 'oct': '10',
    'november': '11', 'novembra': '11', 'nov': '11',
    'december': '12', 'decembra': '12', 'december': '12', 'dec': '12',
  };
  for (const [monthName, monthNum] of Object.entries(months)) {
    if (lower.includes(monthName)) {
      const dayMatch = lower.match(new RegExp(`(\\d{1,2})\\\\s*(?:\\\.|\\\\.)?\\\\s*${monthName}`, 'i'));
      if (dayMatch) return `${dayMatch[1]}.${monthNum}.`;
      return `${monthNum}.`; // just month
    }
  }
  if (/(ihneď|now|immediately|asap|okamžite|sofort)/i.test(lower)) return 'ihneď';
  if (/(čo najskôr|asap|as soon)/i.test(lower)) return 'čo najskôr';
  return 'unknown';
}

function detectLanguage(text) {
  // Count characteristic patterns
  const skScore = (text.match(/[ďĺľňôŕšťúýžäô]/gi) || []).length
    + (text.match(/\b(som|mám|chcem|potrebujem|byť|prosím|ďakujem|dakujem|prenájom|mesiac|izb|byty)\b/gi) || []).length * 2;
  const deScore = (text.match(/[äöüß]/gi) || []).length
    + (text.match(/\b(ich|bin|möchte|brauche|wohnung|zimmer|miete|monat|bitte|danke|und|oder|aber|nicht)\b/gi) || []).length * 2;
  const enScore = (text.match(/\b(i\s|i'm|i'd|i'll|i want|i need|i would|looking for|apartment|flat|bedroom|month)\b/gi) || []).length;

  if (skScore > deScore && skScore > enScore) return 'sk';
  if (deScore > skScore && deScore > enScore) return 'de';
  return 'en'; // default english
}
