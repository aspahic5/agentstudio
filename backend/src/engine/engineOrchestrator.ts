import { createActor } from 'xstate';
import type { FastifyBaseLogger } from 'fastify';
import type {
  AgentDefinition,
  AgentNode,
  ConversationContext,
  ExecutorDependencies,
  ToolDefinition,
  EngineStreamChunk,
  UserProfile,
  ContextMapping,
} from './types.js';
import { buildMachine } from './buildMachine.js';
import { validateAgentGraph, validateAgentSchemas } from './validateAgent.js';
import { GenericExecutor, type EntryResult } from './executors/genericExecutor.js';
import { LoopDetectorImpl, type LoopDetectorConfig, type JudgeGenerateFn } from './loopDetector.js';
import { SemanticAgentFactoryImpl } from './semanticAgentFactory.js';
import { createDefaultToolDispatcher } from './toolCallCache.js';
import {
  buildPhaseStartChunk,
  buildNodeTitleChunk,
  buildTextChunk,
  buildTurnCompleteChunk,
} from './chunkBuilders.js';
import { ApplicationError } from './errors.js';
import { snapshotRepository } from './snapshotRepository.js';
import type { LLMProviderStrategy } from './llm/types.js';

export interface OrchestratorConfig {
  provider: LLMProviderStrategy;
  logger: FastifyBaseLogger;
  templateEnv?: Record<string, string>;
  credentials?: Record<string, string>;
  loopDetectorConfig?: Partial<LoopDetectorConfig>;
  maxAgentHops?: number;
  agentLoader?: (agentId: string) => Promise<{
    agent: AgentDefinition;
    nodes: AgentNode[];
    toolDefinitions: Map<string, ToolDefinition>;
  }>;
}

export interface ProcessMessageParams {
  sessionId: string;
  userId: string;
  agent: AgentDefinition;
  nodes: AgentNode[];
  toolDefinitions: Map<string, ToolDefinition>;
  message: string | null;
  userProfile?: UserProfile;
  initialContext?: Record<string, unknown>;
}

function getCurrentNodeId(actor: { getSnapshot: () => { value?: unknown } }): string {
  const value = actor.getSnapshot().value;
  if (typeof value === 'string') return value;
  if (value !== null && typeof value === 'object') {
    const values = Object.values(value as Record<string, unknown>);
    if (values.length > 0 && typeof values[0] === 'string') return values[0];
  }
  throw new ApplicationError(
    `Unexpected machine state value: ${JSON.stringify(value)}`,
    { code: 'AGENT_ERROR' },
  );
}

function applyContextMapping(
  sourceData: Record<string, unknown>,
  mappings: ContextMapping[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const mapping of mappings) {
    const parts = mapping.sourceKey.split('.');
    let current: unknown = sourceData;
    for (const part of parts) {
      if (current === null || current === undefined) break;
      current = (current as Record<string, unknown>)[part];
    }
    if (current !== undefined) result[mapping.targetKey] = current;
  }
  return result;
}

export async function* processMessage(
  params: ProcessMessageParams,
  config: OrchestratorConfig,
): AsyncGenerator<EngineStreamChunk> {
  const {
    sessionId,
    userId,
    message,
    userProfile,
    initialContext,
  } = params;
  let { agent, nodes, toolDefinitions } = params;
  const {
    provider,
    logger,
    templateEnv,
    credentials,
    loopDetectorConfig,
    maxAgentHops,
    agentLoader,
  } = config;

  validateAgentGraph(agent, nodes);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  validateAgentSchemas(nodeMap, toolDefinitions);
  let machine = buildMachine(agent, nodes);

  const snapshot = await snapshotRepository.load(sessionId);
  let actor;
  let context: ConversationContext;

  if (snapshot) {
    actor = createActor(machine, { snapshot: snapshot.machineState } as any);
    actor.start();
    context = snapshot.context;
  } else {
    actor = createActor(machine);
    actor.start();
    context = {
      sessionId,
      userId,
      currentNodeId: agent.initialNodeId,
      conversationHistory: [],
      userProfile: userProfile ?? null,
      data: initialContext ? { ...initialContext } : {},
    };
  }

  // Inject temporal context
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  context.data._engine = {
    ...(context.data._engine as Record<string, unknown> | undefined),
    temporal: {
      date: now.toISOString().split('T')[0],
      dateFormatted: `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`,
      timestamp: now.toISOString(),
    },
  };
  context.data._agentId = agent.id;

  // Build ExecutorDependencies
  const judgeGenerateFn: JudgeGenerateFn = async (messages, options) => {
    const result = await provider.generate(
      messages.map((m) => ({ role: m.role, content: m.content })),
      { maxTokens: options.maxTokens, temperature: options.temperature },
    );
    return { content: result.content };
  };

  const saFactory = new SemanticAgentFactoryImpl(provider);
  const executor = new GenericExecutor();
  const deps: ExecutorDependencies = {
    agentFactory: saFactory,
    agentVersion: agent.version,
    logger,
    templateEnv: templateEnv ?? {},
    credentials: credentials ?? {},
    toolDefinitions,
    toolDispatcher: createDefaultToolDispatcher(templateEnv ?? {}, credentials ?? {}),
    toolDispatcherStrict: createDefaultToolDispatcher(templateEnv ?? {}, credentials ?? {}),
    createId: () => crypto.randomUUID(),
    loopDetector: new LoopDetectorImpl(
      { ...loopDetectorConfig, judgeGenerateFn },
      logger,
    ),
  };

  // Main while-loop
  let currentMessage = message;
  let previousNodeId: string | null = null;
  let lastEmittedTitleNodeId: string | null = null;
  let hopCounter = 0;
  const maxHops = maxAgentHops ?? 10;

  while (true) {
    const machineSnap = actor.getSnapshot();
    const currentNodeId = getCurrentNodeId(actor);
    deps.loopDetector.checkNodeEntry(currentNodeId);
    await deps.loopDetector.checkWithJudge();

    // Machine done?
    if (machineSnap.status === 'done') {
      await snapshotRepository.save(
        sessionId, agent.id, currentNodeId,
        actor.getPersistedSnapshot() as Record<string, unknown>,
        context,
      );
      yield buildTurnCompleteChunk(true, currentNodeId, context.data);
      return;
    }

    const node = nodeMap.get(currentNodeId);
    if (!node) {
      throw new ApplicationError(
        `Node not found: "${currentNodeId}"`,
        { code: 'NOT_FOUND', statusCode: 404 },
      );
    }

    let result: EntryResult | undefined;
    let messageConsumed = false;

    if (currentMessage !== null && executor.acceptsInput(node)) {
      messageConsumed = true;
      const gen = executor.executeInput(node, context, currentMessage, deps);
      let iterResult = await gen.next();
      while (!iterResult.done) {
        yield iterResult.value;
        iterResult = await gen.next();
      }
      result = iterResult.value as EntryResult;
    } else {
      if (currentNodeId !== previousNodeId) {
        yield buildPhaseStartChunk(node.phaseLabel, node.name, nodeMap.size);
        if (currentNodeId !== lastEmittedTitleNodeId) {
          yield buildNodeTitleChunk(node.id, node.name, node.phaseLabel, node.description);
          lastEmittedTitleNodeId = currentNodeId;
        }
        previousNodeId = currentNodeId;
      }
      const gen = executor.executeEntry(node, context, deps);
      let iterResult = await gen.next();
      while (!iterResult.done) {
        yield iterResult.value;
        iterResult = await gen.next();
      }
      result = iterResult.value;
    }

    // Update conversation history
    if (messageConsumed && currentMessage) {
      context = {
        ...context,
        conversationHistory: [
          ...context.conversationHistory,
          { role: 'user', content: currentMessage },
        ],
      };
    }
    if (result && 'response' in result && typeof (result as { response?: unknown }).response === 'string' && (result as { response: string }).response) {
      const response = (result as { response: string }).response;
      const contextUpdates = 'contextUpdates' in result ? (result as { contextUpdates?: Record<string, unknown> }).contextUpdates : undefined;
      const nodeReasoning = (contextUpdates?._reasoning as Record<string, string> | undefined)?.[currentNodeId];
      context = {
        ...context,
        conversationHistory: [
          ...context.conversationHistory,
          {
            role: 'assistant' as const,
            content: response,
            ...(nodeReasoning && { reasoning_content: nodeReasoning }),
          },
        ],
      };
    }

    // Apply context updates
    if (result && 'contextUpdates' in result) {
      const updates = (result as { contextUpdates?: Record<string, unknown> }).contextUpdates;
      if (updates) {
        context = { ...context, data: { ...context.data, ...updates } };
      }
    }

    // Record execution for loop detection
    const changedKeys = (result && 'contextUpdates' in result && (result as { contextUpdates?: Record<string, unknown> }).contextUpdates)
      ? Object.keys((result as { contextUpdates: Record<string, unknown> }).contextUpdates)
      : [];
    deps.loopDetector.recordExecution(currentNodeId, node.nodeType, changedKeys);

    // Cross-agent hop
    const routingResult = executor.getRoutingResult(result!);
    if (routingResult && routingResult.routingDecision.type === 'agent') {
      hopCounter++;
      if (hopCounter > maxHops) {
        throw new ApplicationError(
          `Cross-agent hop limit exceeded (${maxHops})`,
          { code: 'AGENT_ERROR' },
        );
      }
      if (!agentLoader) {
        throw new ApplicationError(
          'Cross-agent hop requires agentLoader in OrchestratorConfig',
          { code: 'CONFIGURATION_ERROR' },
        );
      }

      const decision = routingResult.routingDecision as { type: 'agent'; agentId: string; nodeId?: string };
      const loaded = await agentLoader(decision.agentId);

      const newContextData = routingResult.contextMapping
        ? applyContextMapping(context.data, routingResult.contextMapping)
        : {};

      agent = loaded.agent;
      nodes = loaded.nodes;
      nodeMap.clear();
      for (const n of nodes) nodeMap.set(n.id, n);
      toolDefinitions = loaded.toolDefinitions;
      deps.toolDefinitions = toolDefinitions;
      deps.agentVersion = agent.version;

      machine = buildMachine(agent, nodes);
      actor = createActor(machine);
      actor.start();

      const resolvedTargetNodeId = decision.nodeId ?? agent.initialNodeId;
      if (resolvedTargetNodeId !== agent.initialNodeId) {
        actor.send({ type: 'TRANSITION', target: resolvedTargetNodeId });
      }

      context = {
        sessionId,
        userId,
        currentNodeId: resolvedTargetNodeId,
        conversationHistory: context.conversationHistory,
        userProfile: context.userProfile,
        data: { ...newContextData, _engine: context.data._engine, _agentId: decision.agentId },
      };

      await snapshotRepository.save(
        sessionId, agent.id, resolvedTargetNodeId,
        actor.getPersistedSnapshot() as Record<string, unknown>,
        context,
      );
      currentMessage = null;
      continue;
    }

    // Send event to machine
    if (result && 'event' in result) {
      const event = (result as { event: { type: string; target?: string } }).event;
      if (event.type === 'TRANSITION' && event.target) {
        const nextNode = nodeMap.get(event.target);
        if (nextNode && nextNode.id !== lastEmittedTitleNodeId) {
          yield buildNodeTitleChunk(nextNode.id, nextNode.name, nextNode.phaseLabel, nextNode.description);
          lastEmittedTitleNodeId = nextNode.id;
        }
        if ('response' in result && typeof (result as { response?: unknown }).response === 'string' && (result as { response: string }).response) {
          yield buildTextChunk((result as { response: string }).response);
        }
        actor.send({ type: 'TRANSITION', target: event.target });
        context = { ...context, currentNodeId: event.target };
      } else if (event.type === 'COMPLETE') {
        actor.send({ type: 'COMPLETE' });
      }
    }

    // Save snapshot
    await snapshotRepository.save(
      sessionId, agent.id, context.currentNodeId,
      actor.getPersistedSnapshot() as Record<string, unknown>,
      context,
    );

    // Check completion
    const newSnap = actor.getSnapshot();
    if (newSnap.status === 'done' || executor.isComplete(result!)) {
      yield buildTurnCompleteChunk(true, getCurrentNodeId(actor), context.data);
      return;
    }

    // Waiting for input (no event in result — e.g. _waiting routing result)
    if (result && !('event' in result)) {
      yield buildTurnCompleteChunk(false, getCurrentNodeId(actor));
      return;
    }

    // ConversationResult presentation — waiting for next user message
    if (result && 'type' in result && (result as { type: string }).type === 'presentation') {
      yield buildTurnCompleteChunk(false, getCurrentNodeId(actor));
      return;
    }

    if (messageConsumed) currentMessage = null;
  }
}
