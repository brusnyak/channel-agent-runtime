import { createJsonlStore } from '../store/jsonlStore.mjs';
import { toolRegistry } from '../tools/registry.mjs';

export function createRuntime(config) {
  const store = createJsonlStore(config.memory?.path);

  return {
    async handleMessage(message) {
      const previous = await store.readAll();
      const route = selectRoute(config.routes, message.text);
      const toolResults = {};

      for (const toolName of route.steps) {
        const tool = toolRegistry[toolName];
        if (!tool) throw new Error(`Unknown tool configured: ${toolName}`);
        toolResults[toolName] = await tool({ message, toolResults, previous, config });
      }

      const decision = {
        id: `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        at: new Date().toISOString(),
        agent_id: config.id,
        route: route.name,
        mode: config.mode,
        channel: message.channel,
        sender: message.sender,
        input: message.text,
        tool_results: toolResults,
        reply: toolResults.draft_reply?.text ?? null,
        approval_required: Boolean(toolResults.draft_reply?.approval_required),
        outbound_status: toolResults.draft_reply?.approval_required ? 'queued_for_approval' : 'ready_to_send',
      };

      await store.append(decision);
      return decision;
    },
    store,
  };
}

function selectRoute(routes, text) {
  const lower = text.toLowerCase();
  for (const [name, route] of Object.entries(routes)) {
    if (name === 'default') continue;
    const needles = route.when?.any ?? [];
    if (needles.some((needle) => lower.includes(String(needle).toLowerCase()))) {
      return { name, ...route };
    }
  }
  return { name: 'default', ...routes.default };
}
