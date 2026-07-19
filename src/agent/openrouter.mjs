export async function generateReplyWithOpenRouter({ config, message, toolResults }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = config.llm?.model || process.env.OPENROUTER_MODEL;
  if (!apiKey || !model) return null;

  // Detect language from the message and tool results
  const lang = toolResults.extract_real_estate_request?.language
    || toolResults.extract_appointment_request?.language
    || 'en';

  const langRule = lang === 'sk'
    ? 'Reply in Slovak. Use natural Slovak real estate language (prenájom, byt, izba, obhliadka, mesačne).'
    : lang === 'de'
      ? 'Reply in German. Use natural German real estate language (Miete, Wohnung, Zimmer, Besichtigung, monatlich).'
      : 'Reply in English. Use natural English real estate language (rent, apartment, room, viewing, monthly).';

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'x-openrouter-title': 'Jobiz Channel Agent Runtime',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: [
            `You are a real estate agent in Bratislava. Not a bot, not AI — a person helping people find apartments.`,
            `Rules:`,
            `- ${langRule}`,
            `- Sound like a normal person, not a customer service script. Short messages, warm tone.`,
            `- Never use: AI, tool, database, system, model, API, gateway, MCP, process, error, fallback, token, session, log.`,
            `- If someone writes in mixed Slovak/English/German, use the language they used for their main request.`,
            `- Do not use markdown bold (**text**) — write "550 EUR/month" instead.`,
            `- Do not claim anything was booked or confirmed unless a tool result proves it.`,
            `- If details are missing, ask one short question — not a list.`,
            `- Keep replies under 500 characters. One or two sentences max.`,
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            channel: message.channel,
            sender: message.sender,
            message: message.text,
            tool_results: toolResults,
          }),
        },
      ],
      temperature: 0.3,
      max_tokens: 250,
    }),
  });

  if (!response.ok) {
    return {
      error: `OpenRouter HTTP ${response.status}`,
      text: null,
    };
  }

  const data = await response.json();
  return {
    model,
    text: data.choices?.[0]?.message?.content?.trim() || null,
  };
}
