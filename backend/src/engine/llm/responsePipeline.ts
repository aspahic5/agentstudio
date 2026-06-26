import {
  JsonExtractionError,
  JsonParseError,
  SchemaValidationError,
} from './errors.js';
import {
  extractJsonFromMarkdown,
  repairJson,
  parseJson,
  normalizeEnumFields,
  normalizeArrayFields,
  sanitizeNulls,
  validateSchema,
  type ArrayNormalizer,
} from './steps.js';

export interface PipelineConfig<T> {
  schema: { parse(data: unknown): T };
  enumFieldsToLowercase?: string[];
  arrayFieldsToObjectify?: ArrayNormalizer[];
}

export function createResponsePipeline<T>(
  config: PipelineConfig<T>
): (response: string | unknown) => T {
  const {
    schema,
    enumFieldsToLowercase = ['intent'],
    arrayFieldsToObjectify = [],
  } = config;

  return function process(response: string | unknown): T {
    const raw =
      typeof response === 'string' ? response : JSON.stringify(response);

    let parsed: unknown;

    if (typeof response === 'string') {
      const extracted = extractJsonFromMarkdown(response);

      const trimmed = extracted.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        throw new JsonExtractionError(raw);
      }

      let repaired: string;
      try {
        repaired = repairJson(extracted);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new JsonParseError(raw, extracted, `jsonrepair failed: ${message}`);
      }

      try {
        parsed = parseJson(repaired);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new JsonParseError(raw, repaired, message);
      }
    } else if (response == null) {
      throw new JsonExtractionError('null or undefined');
    } else {
      parsed = response;
    }

    const enumNorm = normalizeEnumFields(parsed, enumFieldsToLowercase);
    const arrayNorm = normalizeArrayFields(enumNorm, arrayFieldsToObjectify);

    try {
      const validated = validateSchema(arrayNorm, schema);
      return sanitizeNulls(validated);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new SchemaValidationError(raw, arrayNorm, message);
    }
  };
}
