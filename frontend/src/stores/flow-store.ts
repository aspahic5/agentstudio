import { create } from 'zustand';
import { applyNodeChanges, type NodeChange, type Connection } from '@xyflow/react';
import type { Agent, Version } from '@/types/api';
import type {
  EditorAgentNode,
  EditorSaConfig,
  EditorNodeType,
  FlowNode,
  FlowEdge,
  EditorOperation,
} from '@/types/editor';
import type { AIEditOperation } from '@/types/ai-editor';
import { apiClient } from '@/lib/api-client';
import { deriveEdges } from '@/lib/edge-derivation';
import { getDefaultConfigJson, nodeTypeNeedsSaConfig } from '@/lib/node-type-meta';
import { useAIEditorStore } from './ai-editor-store';

interface FlowState {
  // Agent context
  agentId: string | null;
  agent: Agent | null;

  // Version management
  versions: Version[];
  activeVersion: string | null;

  // Editor data
  agentNodes: Map<string, EditorAgentNode>;
  saConfigs: Map<string, EditorSaConfig>;

  // React Flow state
  rfNodes: FlowNode[];
  rfEdges: FlowEdge[];

  // UI state
  selectedNodeId: string | null;
  isDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;

  // Actions — data loading
  loadAgent: (agentId: string) => Promise<void>;
  loadVersions: () => Promise<void>;
  loadVersionData: (version: string) => Promise<void>;

  // Actions — React Flow callbacks
  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onConnect: (connection: Connection) => void;

  // Actions — node management
  addNode: (nodeType: EditorNodeType, position: { x: number; y: number }) => string;
  duplicateNode: (nodeId: string) => string;
  updateNode: (nodeId: string, updates: Partial<EditorAgentNode>) => void;
  removeNode: (nodeId: string) => void;
  selectNode: (nodeId: string | null) => void;

  // Actions — agent settings
  agentSettingsOpen: boolean;
  openAgentSettings: () => void;
  closeAgentSettings: () => void;
  updateAgentSettings: (updates: { initialNodeId?: string; description?: string }) => Promise<void>;

  // Actions — SA config management
  updateSaConfig: (configId: string, updates: Partial<EditorSaConfig>) => void;
  addSaConfig: (nodeId: string) => string;
  removeSaConfig: (configId: string) => void;

  // Actions — version operations
  saveNewVersion: (version: string, label?: string) => Promise<void>;
  overwriteVersion: () => Promise<void>;
  deleteVersion: (version: string) => Promise<void>;

  // Phase 7 prep
  applyOperation: (op: EditorOperation) => void;

  // AI editor highlights
  nodeHighlights: Map<string, 'added' | 'modified' | 'removed'>;
  setNodeHighlights: (highlights: Map<string, 'added' | 'modified' | 'removed'>) => void;
  clearNodeHighlights: () => void;
  applyAIOperation: (op: AIEditOperation) => void;

  // Reset
  reset: () => void;
}

function buildRfNodes(
  agentNodes: Map<string, EditorAgentNode>,
  selectedNodeId: string | null,
  nodeHighlights?: Map<string, 'added' | 'modified' | 'removed'>,
): FlowNode[] {
  return Array.from(agentNodes.values()).map((node) => ({
    id: node.id,
    type: node.nodeType,
    position: { x: node.positionX ?? 0, y: node.positionY ?? 0 },
    data: {
      agentNode: node,
      isSelected: node.id === selectedNodeId,
      isHighlighted: nodeHighlights?.get(node.id),
    },
    selected: node.id === selectedNodeId,
  }));
}

export const useFlowStore = create<FlowState>((set, get) => ({
  agentId: null,
  agent: null,
  versions: [],
  activeVersion: null,
  agentNodes: new Map(),
  saConfigs: new Map(),
  rfNodes: [],
  rfEdges: [],
  selectedNodeId: null,
  isDirty: false,
  isLoading: false,
  isSaving: false,
  error: null,

  loadAgent: async (agentId: string) => {
    set({ isLoading: true, error: null, agentId });
    try {
      const agent = await apiClient.getAgent(agentId);
      set({ agent });
      await get().loadVersions();
      const { versions } = get();
      const versionToLoad = agent.currentVersion ?? versions[0]?.version ?? null;
      if (versionToLoad) {
        await get().loadVersionData(versionToLoad);
      }
    } catch (err) {
      set({ error: (err as Error).message });
    } finally {
      set({ isLoading: false });
    }
  },

  loadVersions: async () => {
    const { agentId } = get();
    if (!agentId) return;
    try {
      const versions = await apiClient.getVersions(agentId);
      set({ versions });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  loadVersionData: async (version: string) => {
    const { agentId } = get();
    if (!agentId) return;
    set({ isLoading: true, error: null });
    try {
      const data = await apiClient.getVersionData(agentId, version);
      const agentNodes = new Map<string, EditorAgentNode>();
      for (const n of data.nodes) {
        agentNodes.set(n.id, {
          ...n,
          configJson: (n.configJson as Record<string, unknown>) ?? {},
        });
      }
      const saConfigs = new Map<string, EditorSaConfig>();
      for (const c of data.saConfigs) {
        saConfigs.set(c.id, c);
      }
      const selectedNodeId = null;
      set({
        activeVersion: version,
        agentNodes,
        saConfigs,
        selectedNodeId,
        rfNodes: buildRfNodes(agentNodes, selectedNodeId, get().nodeHighlights),
        rfEdges: deriveEdges(agentNodes),
        isDirty: false,
      });
    } catch (err) {
      set({ error: (err as Error).message });
    } finally {
      set({ isLoading: false });
    }
  },

  onNodesChange: (changes: NodeChange<FlowNode>[]) => {
    const state = get();
    const newRfNodes = applyNodeChanges(changes, state.rfNodes);

    // Sync position changes back to agentNodes
    let dirty = state.isDirty;
    const agentNodes = new Map(state.agentNodes);
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        const node = agentNodes.get(change.id);
        if (node) {
          agentNodes.set(change.id, {
            ...node,
            positionX: change.position.x,
            positionY: change.position.y,
          });
          dirty = true;
        }
      }
    }

    set({ rfNodes: newRfNodes, agentNodes, isDirty: dirty });
  },

  onConnect: (connection: Connection) => {
    if (!connection.source || !connection.target) return;

    const { agentNodes } = get();
    const sourceNode = agentNodes.get(connection.source);
    if (!sourceNode) return;

    const cfg = { ...(sourceNode.configJson ?? {}) } as Record<string, unknown>;

    switch (sourceNode.nodeType) {
      case 'generation':
      case 'tool':
      case 'agentic':
      case 'compute':
      case 'conversation':
        cfg.targetNodeId = connection.target;
        break;
      case 'intent_parsing':
      case 'review': {
        const transitions = (cfg.transitions ?? {}) as Record<string, { target: string; actions: unknown[] }>;
        const intentName = `intent_${Object.keys(transitions).length + 1}`;
        transitions[intentName] = { target: connection.target, actions: [] };
        cfg.transitions = transitions;
        break;
      }
      case 'routing': {
        const rules = (cfg.rules ?? []) as Array<{ condition: string; target: { type: string; nodeId?: string } }>;
        rules.push({
          condition: `condition_${rules.length + 1}`,
          target: { type: 'node', nodeId: connection.target },
        });
        cfg.rules = rules;
        break;
      }
    }

    get().updateNode(sourceNode.id, { configJson: cfg });
  },

  addNode: (nodeType: EditorNodeType, position: { x: number; y: number }) => {
    const nodeId = crypto.randomUUID();
    const node: EditorAgentNode = {
      id: nodeId,
      name: `New ${nodeType.replace(/_/g, ' ')}`,
      nodeType,
      configJson: getDefaultConfigJson(nodeType),
      positionX: position.x,
      positionY: position.y,
    };

    const { agentNodes, saConfigs, selectedNodeId } = get();
    const newNodes = new Map(agentNodes);
    newNodes.set(nodeId, node);

    const newConfigs = new Map(saConfigs);

    if (nodeTypeNeedsSaConfig(nodeType)) {
      const configId = crypto.randomUUID();
      newConfigs.set(configId, {
        id: configId,
        nodeId,
        name: `${node.name} Config`,
        systemPrompt: '',
        temperature: 0.7,
        maxRetries: 2,
        outputFormatting: 'markdown',
        outputDensity: 'compact',
        reasoningFormatting: 'concise',
      });
      newNodes.set(nodeId, { ...node, semanticAgentConfigId: configId });

      // Review nodes need a second SA config for refinement
      if (nodeType === 'review') {
        const refinementConfigId = crypto.randomUUID();
        newConfigs.set(refinementConfigId, {
          id: refinementConfigId,
          nodeId,
          name: `${node.name} Refinement Config`,
          systemPrompt: '',
          temperature: 0.7,
          maxRetries: 2,
          outputFormatting: 'markdown',
          outputDensity: 'compact',
          reasoningFormatting: 'concise',
        });
      }
    }

    set({
      agentNodes: newNodes,
      saConfigs: newConfigs,
      rfNodes: buildRfNodes(newNodes, selectedNodeId, get().nodeHighlights),
      rfEdges: deriveEdges(newNodes),
      isDirty: true,
    });

    return nodeId;
  },

  duplicateNode: (nodeId: string) => {
    const source = get().agentNodes.get(nodeId);
    if (!source) return '';
    const newId = crypto.randomUUID();

    const newNode: EditorAgentNode = {
      ...source,
      id: newId,
      name: `${source.name} (copy)`,
      positionX: (source.positionX ?? 0) + 40,
      positionY: (source.positionY ?? 0) + 40,
      semanticAgentConfigId: undefined,
    };

    const sourceSaConfigs = Array.from(get().saConfigs.values()).filter(
      (c) => c.nodeId === nodeId,
    );

    const newSaConfigs: EditorSaConfig[] = sourceSaConfigs.map((c) => {
      const newSaId = crypto.randomUUID();
      if (c.id === source.semanticAgentConfigId) {
        newNode.semanticAgentConfigId = newSaId;
      }
      return { ...c, id: newSaId, nodeId: newId };
    });

    const newAgentNodes = new Map(get().agentNodes);
    newAgentNodes.set(newId, newNode);
    const newSaConfigsMap = new Map(get().saConfigs);
    newSaConfigs.forEach((c) => newSaConfigsMap.set(c.id, c));

    set({
      agentNodes: newAgentNodes,
      saConfigs: newSaConfigsMap,
      rfNodes: buildRfNodes(newAgentNodes, get().selectedNodeId, get().nodeHighlights),
      rfEdges: deriveEdges(newAgentNodes),
      isDirty: true,
    });

    return newId;
  },

  updateNode: (nodeId: string, updates: Partial<EditorAgentNode>) => {
    const { agentNodes, selectedNodeId } = get();
    const node = agentNodes.get(nodeId);
    if (!node) return;

    const newNodes = new Map(agentNodes);
    newNodes.set(nodeId, { ...node, ...updates });

    set({
      agentNodes: newNodes,
      rfNodes: buildRfNodes(newNodes, selectedNodeId, get().nodeHighlights),
      rfEdges: deriveEdges(newNodes),
      isDirty: true,
    });
  },

  removeNode: (nodeId: string) => {
    const { agentNodes, saConfigs, selectedNodeId } = get();

    const newNodes = new Map(agentNodes);
    newNodes.delete(nodeId);

    const newConfigs = new Map(saConfigs);
    for (const [id, config] of newConfigs) {
      if (config.nodeId === nodeId) {
        newConfigs.delete(id);
      }
    }

    const newSelectedId = selectedNodeId === nodeId ? null : selectedNodeId;

    set({
      agentNodes: newNodes,
      saConfigs: newConfigs,
      selectedNodeId: newSelectedId,
      rfNodes: buildRfNodes(newNodes, newSelectedId, get().nodeHighlights),
      rfEdges: deriveEdges(newNodes),
      isDirty: true,
    });
  },

  selectNode: (nodeId: string | null) => {
    const { agentNodes } = get();
    set({
      selectedNodeId: nodeId,
      rfNodes: buildRfNodes(agentNodes, nodeId, get().nodeHighlights),
      ...(nodeId ? { agentSettingsOpen: false } : {}),
    });
  },

  agentSettingsOpen: false,

  openAgentSettings: () => {
    set({ agentSettingsOpen: true, selectedNodeId: null });
    useAIEditorStore.getState().close();
  },

  closeAgentSettings: () => set({ agentSettingsOpen: false }),

  updateAgentSettings: async (updates) => {
    const { agentId, agent } = get();
    if (!agentId || !agent) return;
    try {
      await apiClient.updateAgent(agentId, updates);
      set({ agent: { ...agent, ...updates } });
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  updateSaConfig: (configId: string, updates: Partial<EditorSaConfig>) => {
    const { saConfigs } = get();
    const config = saConfigs.get(configId);
    if (!config) return;

    const newConfigs = new Map(saConfigs);
    newConfigs.set(configId, { ...config, ...updates });

    set({ saConfigs: newConfigs, isDirty: true });
  },

  addSaConfig: (nodeId: string) => {
    const configId = crypto.randomUUID();
    const { saConfigs } = get();
    const newConfigs = new Map(saConfigs);
    newConfigs.set(configId, {
      id: configId,
      nodeId,
      name: 'New Config',
      systemPrompt: '',
      temperature: 0.7,
      maxRetries: 2,
      outputFormatting: 'markdown',
      outputDensity: 'compact',
      reasoningFormatting: 'concise',
    });
    set({ saConfigs: newConfigs, isDirty: true });
    return configId;
  },

  removeSaConfig: (configId: string) => {
    const { saConfigs } = get();
    const newConfigs = new Map(saConfigs);
    newConfigs.delete(configId);
    set({ saConfigs: newConfigs, isDirty: true });
  },

  saveNewVersion: async (version: string, label?: string) => {
    const { agentId, agentNodes, saConfigs } = get();
    if (!agentId) return;

    set({ isSaving: true, error: null });
    try {
      await apiClient.saveNewVersion(agentId, {
        version,
        label,
        nodes: Array.from(agentNodes.values()),
        saConfigs: Array.from(saConfigs.values()),
      });
      await get().loadVersions();
      await get().loadVersionData(version);
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    } finally {
      set({ isSaving: false });
    }
  },

  overwriteVersion: async () => {
    const { agentId, activeVersion, agentNodes, saConfigs } = get();
    if (!agentId || !activeVersion) return;

    set({ isSaving: true, error: null });
    try {
      await apiClient.overwriteVersion(agentId, activeVersion, {
        nodes: Array.from(agentNodes.values()),
        saConfigs: Array.from(saConfigs.values()),
      });
      await get().loadVersionData(activeVersion);
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    } finally {
      set({ isSaving: false });
    }
  },

  deleteVersion: async (version: string) => {
    const { agentId, activeVersion } = get();
    if (!agentId) return;

    try {
      await apiClient.deleteVersion(agentId, version);
      await get().loadVersions();
      if (activeVersion === version) {
        const { versions } = get();
        if (versions.length > 0) {
          await get().loadVersionData(versions[0].version);
        } else {
          set({
            activeVersion: null,
            agentNodes: new Map(),
            saConfigs: new Map(),
            rfNodes: [],
            rfEdges: [],
            selectedNodeId: null,
            isDirty: false,
          });
        }
      }
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  applyOperation: (op: EditorOperation) => {
    const state = get();
    switch (op.type) {
      case 'add_node': {
        const nodeId = state.addNode(op.nodeType, op.position);
        if (op.name) {
          get().updateNode(nodeId, { name: op.name });
        }
        break;
      }
      case 'update_node':
        state.updateNode(op.nodeId, op.updates);
        break;
      case 'remove_node':
        state.removeNode(op.nodeId);
        break;
      case 'update_positions':
        for (const pos of op.positions) {
          const node = state.agentNodes.get(pos.nodeId);
          if (node) {
            state.updateNode(pos.nodeId, { positionX: pos.x, positionY: pos.y });
          }
        }
        break;
    }
  },

  nodeHighlights: new Map(),

  setNodeHighlights: (highlights) => {
    const { agentNodes, selectedNodeId } = get();
    set({
      nodeHighlights: highlights,
      rfNodes: buildRfNodes(agentNodes, selectedNodeId, highlights),
    });
  },

  clearNodeHighlights: () => {
    const { agentNodes, selectedNodeId } = get();
    const empty = new Map<string, 'added' | 'modified' | 'removed'>();
    set({
      nodeHighlights: empty,
      rfNodes: buildRfNodes(agentNodes, selectedNodeId, empty),
    });
  },

  applyAIOperation: (op: AIEditOperation) => {
    const state = get();
    switch (op.op) {
      case 'add_node': {
        const nodeId = state.addNode(op.node.nodeType as EditorNodeType, op.position ?? { x: 0, y: 0 });
        const updates: Partial<EditorAgentNode> = { name: op.node.name };
        if (op.node.configJson) updates.configJson = op.node.configJson;
        if (op.node.phaseLabel) updates.phaseLabel = op.node.phaseLabel;
        if (op.node.progressWeight !== undefined) updates.progressWeight = op.node.progressWeight;
        get().updateNode(nodeId, updates);
        if (op.saConfig) {
          const node = get().agentNodes.get(nodeId);
          if (node?.semanticAgentConfigId) {
            const saUpdates: Partial<EditorSaConfig> = {};
            if (op.saConfig.name) saUpdates.name = op.saConfig.name;
            if (op.saConfig.systemPrompt) saUpdates.systemPrompt = op.saConfig.systemPrompt;
            if (op.saConfig.temperature !== undefined) saUpdates.temperature = op.saConfig.temperature;
            if (op.saConfig.maxRetries !== undefined) saUpdates.maxRetries = op.saConfig.maxRetries;
            if (op.saConfig.outputSchemaJson !== undefined) saUpdates.outputSchemaJson = op.saConfig.outputSchemaJson;
            if (op.saConfig.outputFormatting) saUpdates.outputFormatting = op.saConfig.outputFormatting;
            if (op.saConfig.outputDensity) saUpdates.outputDensity = op.saConfig.outputDensity;
            if (op.saConfig.reasoningFormatting) saUpdates.reasoningFormatting = op.saConfig.reasoningFormatting;
            get().updateSaConfig(node.semanticAgentConfigId, saUpdates);
          }
        }
        break;
      }
      case 'update_node': {
        const node = state.agentNodes.get(op.nodeId);
        if (!node) break;
        const updates: Partial<EditorAgentNode> = {};
        const changes = op.changes;
        if (changes.name) updates.name = changes.name as string;
        if (changes.phaseLabel !== undefined) updates.phaseLabel = changes.phaseLabel as string;
        if (changes.configJson) {
          updates.configJson = { ...node.configJson, ...(changes.configJson as Record<string, unknown>) };
        }
        state.updateNode(op.nodeId, updates);
        break;
      }
      case 'remove_node':
        state.removeNode(op.nodeId);
        break;
      case 'add_sa_config': {
        const saId = state.addSaConfig(op.saConfig.nodeId);
        const { nodeId: _, ...saUpdates } = op.saConfig;
        get().updateSaConfig(saId, saUpdates as Partial<EditorSaConfig>);
        break;
      }
      case 'update_sa_config': {
        const configs = Array.from(get().saConfigs.values());
        const config = configs.find(c => c.nodeId === op.nodeId);
        if (config) {
          get().updateSaConfig(config.id, op.changes as Partial<EditorSaConfig>);
        }
        break;
      }
      case 'update_agent': {
        const agent = get().agent;
        if (agent) {
          set({ agent: { ...agent, ...op.changes }, isDirty: true });
        }
        break;
      }
      case 'add_transition':
      case 'update_transition': {
        const node = get().agentNodes.get(op.nodeId);
        if (!node) break;
        const configJson = { ...node.configJson };
        const transitions = { ...(configJson.transitions as Record<string, unknown> ?? {}) };
        transitions[op.intent] = op.rule;
        configJson.transitions = transitions;
        const validIntents = [...(configJson.validIntents as string[] ?? [])];
        if (!validIntents.includes(op.intent)) {
          validIntents.push(op.intent);
          configJson.validIntents = validIntents;
        }
        get().updateNode(op.nodeId, { configJson });
        break;
      }
      case 'remove_transition': {
        const node = get().agentNodes.get(op.nodeId);
        if (!node) break;
        const configJson = { ...node.configJson };
        const transitions = { ...(configJson.transitions as Record<string, unknown> ?? {}) };
        delete transitions[op.intent];
        configJson.transitions = transitions;
        get().updateNode(op.nodeId, { configJson });
        break;
      }
      case 'add_routing_rule': {
        const node = get().agentNodes.get(op.nodeId);
        if (!node) break;
        const configJson = { ...node.configJson };
        const rules = [...(configJson.rules as unknown[] ?? [])];
        rules.push(op.rule);
        configJson.rules = rules;
        get().updateNode(op.nodeId, { configJson });
        break;
      }
      case 'update_routing_rule': {
        const node = get().agentNodes.get(op.nodeId);
        if (!node) break;
        const configJson = { ...node.configJson };
        const rules = [...(configJson.rules as unknown[] ?? [])];
        if (op.ruleIndex < rules.length) {
          rules[op.ruleIndex] = op.rule;
        }
        configJson.rules = rules;
        get().updateNode(op.nodeId, { configJson });
        break;
      }
    }
  },

  reset: () => {
    set({
      agentId: null,
      agent: null,
      versions: [],
      activeVersion: null,
      agentNodes: new Map(),
      saConfigs: new Map(),
      rfNodes: [],
      rfEdges: [],
      selectedNodeId: null,
      agentSettingsOpen: false,
      isDirty: false,
      isLoading: false,
      isSaving: false,
      error: null,
      nodeHighlights: new Map(),
    });
  },
}));
