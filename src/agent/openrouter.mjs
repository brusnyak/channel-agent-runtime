export async function generateReplyWithOpenRouter({ config, message, toolResults }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || config.llm?.model;
  if (!apiKey || !model) return null;

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
            `You are a ${config.persona?.role ?? 'messaging operator'}.`,
            `Tone: ${config.persona?.tone ?? 'concise and practical'}.`,
            'Draft one short reply. Do not invent facts. If details are missing, ask for them.',
            'Do not claim anything was booked, sent, or completed unless a tool result proves it.',
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
      temperature: 0.2,
      max_tokens: 180,
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
