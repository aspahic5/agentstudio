import type { LLMProviderStrategy } from './llm/types.js';
import type {
  SemanticAgent,
  SemanticAgentConfig,
  SemanticAgentFactory,
} from './types.js';
import { SemanticAgentImpl } from './semanticAgentImpl.js';
import { JsonSchemaValidator } from './jsonSchemaValidator.js';
import { ApplicationError } from './errors.js';
import { saConfigRepository } from '../repositories/SemanticAgentConfigRepository.js';

export class SemanticAgentFactoryImpl implements SemanticAgentFactory {
  constructor(private readonly provider: LLMProviderStrategy) {}

  async createForNode<TOutput>(
    agentId: string,
    version: string,
    nodeId: string,
    thinkingGuidelines?: string,
  ): Promise<SemanticAgent<TOutput>> {
    const row = await saConfigRepository.findByNode(agentId, version, nodeId);

    if (!row) {
      throw new ApplicationError(
        `Semantic agent config not found for agent "${agentId}" version "${version}" node "${nodeId}"`,
        {
          code: 'NOT_FOUND',
          statusCode: 404,
          context: { agentId, version, nodeId },
        },
      );
    }

    const outputSchemaJson = (row.outputSchemaJson ?? {}) as Record<string, unknown>;
    const validator = new JsonSchemaValidator<TOutput>(outputSchemaJson, row.name);

    const config: SemanticAgentConfig<TOutput> = {
      id: row.id,
      name: row.name,
      systemPrompt: row.systemPrompt,
      outputSchema: validator,
      outputSchemaJson,
      maxRetries: row.maxRetries,
      temperature: row.temperature,
      maxOutputTokens: row.maxOutputTokens,
      outputFormatting: (row.outputFormatting as 'plain' | 'markdown') ?? 'markdown',
      outputDensity: (row.outputDensity as 'compact' | 'spacious') ?? 'compact',
      reasoningFormatting:
        (row.reasoningFormatting as 'concise' | 'structured' | 'thinking_markers') ?? 'concise',
      thinkingGuidance: thinkingGuidelines ?? row.thinkingGuidance ?? undefined,
      modelAlias: row.modelAlias,
    };

    return new SemanticAgentImpl<TOutput>(config, this.provider);
  }
}
