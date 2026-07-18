import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { createJsonlStore } from '../store/jsonlStore.mjs';
import { toolRegistry } from '../tools/registry.mjs';

const RuntimeState = Annotation.Root({
  config: Annotation(),
  message: Annotation(),
  previous: Annotation({
    default: () => [],
  }),
  route: Annotation(),
  toolResults: Annotation({
    default: () => ({}),
  }),
  decision: Annotation(),
  graphTrace: Annotation({
    reducer: (left, right) => left.concat(Array.isArray(right) ? right : [right]),
    default: () => [],
  }),
});

export function createRuntime(config) {
  const store = createJsonlStore(config.memory?.path);
  const graph = buildRuntimeGraph(store);

  return {
    async handleMessage(message) {
      const previous = await store.readAll();
      const state = await graph.invoke(
        {
          config,
          message,
          previous,
        },
        {
          configurable: {
            thread_id: threadIdFor(message),
          },
        },
      );
      return state.decision;
    },
    graph,
    store,
  };
}

function buildRuntimeGraph(store) {
  return new StateGraph(RuntimeState)
    .addNode('select_route', selectRouteNode)
    .addNode('run_tools', runToolsNode)
    .addNode('build_decision', buildDecisionNode)
    .addNode('persist_event', persistEventNode(store))
    .addEdge(START, 'select_route')
    .addEdge('select_route', 'run_tools')
    .addEdge('run_tools', 'build_decision')
    .addEdge('build_decision', 'persist_event')
    .addEdge('persist_event', END)
    .compile();
}

function selectRouteNode(state) {
  return {
    route: selectRoute(state.config.routes, state.message.text),
    graphTrace: ['select_route'],
  };
}

async function runToolsNode(state) {
  const toolResults = {};

  for (const toolName of state.route.steps) {
    const tool = toolRegistry[toolName];
    if (!tool) throw new Error(`Unknown tool configured: ${toolName}`);
    toolResults[toolName] = await tool({
      message: state.message,
      toolResults,
      previous: state.previous,
      config: state.config,
    });
  }

  return {
    toolResults,
    graphTrace: ['run_tools'],
  };
}

function buildDecisionNode(state) {
  const draft = findDraft(state.toolResults);
  const decision = {
    id: `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    at: new Date().toISOString(),
    agent_id: state.config.id,
    graph: 'langgraph',
    graph_trace: state.graphTrace.concat(['build_decision', 'persist_event']),
    route: state.route.name,
    mode: state.config.mode,
    channel: state.message.channel,
    sender: state.message.sender,
    input: state.message.text,
    tool_results: state.toolResults,
    reply: draft?.text ?? null,
    approval_required: Boolean(draft?.approval_required),
    outbound_status: draft?.approval_required ? 'queued_for_approval' : 'ready_to_send',
  };

  return {
    decision,
    graphTrace: ['build_decision'],
  };
}

function findDraft(toolResults) {
  if (toolResults.draft_reply?.text) return toolResults.draft_reply;
  return Object.values(toolResults).find((result) => result && typeof result.text === 'string') ?? null;
}

function persistEventNode(store) {
  return async (state) => {
    await store.append(state.decision);
    return {
      graphTrace: ['persist_event'],
    };
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

function threadIdFor(message) {
  return `${message.channel}:${message.sender?.id ?? message.sender?.handle ?? 'unknown'}`;
}
