import type { NodeTypes } from '@xyflow/react';
import { IntentParsingNode } from './intent-parsing-node';
import { GenerationNode } from './generation-node';
import { RoutingNode } from './routing-node';
import { ReviewNode } from './review-node';
import { ToolNode } from './tool-node';
import { AgenticNode } from './agentic-node';
import { ComputeNode } from './compute-node';
import { ConversationNode } from './conversation-node';

export const nodeTypes: NodeTypes = {
  intent_parsing: IntentParsingNode,
  generation: GenerationNode,
  routing: RoutingNode,
  review: ReviewNode,
  tool: ToolNode,
  agentic: AgenticNode,
  compute: ComputeNode,
  conversation: ConversationNode,
};
