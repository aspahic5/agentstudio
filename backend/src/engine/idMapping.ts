import type { IdMappingRule, IdMappingConfig } from './types.js';
import type { FastifyBaseLogger } from 'fastify';
import { extractPath, setPath } from './applyActions.js';
import { ApplicationError } from './errors.js';

export interface IdRegistry {
  realToAlias: Map<string, string>;
  aliasToReal: Map<string, string>;
  knownPrefixes: Set<string>;
  prefixCounters: Map<string, number>;
}

export interface IdMappingReport {
  reversed: number;
  generated: number;
  errors: string[];
}

export function buildIdRegistry(
  inputRules: IdMappingRule[],
  contextData: Record<string, unknown>,
  logger?: FastifyBaseLogger
): IdRegistry {
  const realToAlias = new Map<string, string>();
  const aliasToReal = new Map<string, string>();
  const knownPrefixes = new Set<string>();
  const prefixCounters = new Map<string, number>();

  for (const rule of inputRules) {
    knownPrefixes.add(rule.aliasPrefix);
    prefixCounters.set(rule.aliasPrefix, 0);

    const rawArray = contextData[rule.contextKey];
    if (rawArray === null || rawArray === undefined) continue;

    if (!Array.isArray(rawArray)) {
      throw new ApplicationError(
        `[idMapping] buildIdRegistry: contextKey "${rule.contextKey}" is not an array. Got: ${typeof rawArray}`,
        { code: 'VALIDATION_ERROR', statusCode: 400, context: { contextKey: rule.contextKey } }
      );
    }

    for (let i = 0; i < rawArray.length; i++) {
      const item = rawArray[i];
      const realId = extractPath(item, rule.idField);

      if (realId === undefined || realId === null) {
        throw new ApplicationError(
          `[idMapping] buildIdRegistry: item ${i} in "${rule.contextKey}" has no value at idField "${rule.idField}"`,
          { code: 'VALIDATION_ERROR', statusCode: 400, context: { contextKey: rule.contextKey, index: i, idField: rule.idField } }
        );
      }
      if (typeof realId !== 'string') {
        throw new ApplicationError(
          `[idMapping] buildIdRegistry: item ${i} in "${rule.contextKey}" idField "${rule.idField}" is ${typeof realId}, expected string`,
          { code: 'VALIDATION_ERROR', statusCode: 400, context: { contextKey: rule.contextKey, index: i, idField: rule.idField, actualType: typeof realId } }
        );
      }
      if (realToAlias.has(realId)) {
        throw new ApplicationError(
          `[idMapping] buildIdRegistry: duplicate ID "${realId}" found in "${rule.contextKey}[${i}].${rule.idField}". Already registered as "${realToAlias.get(realId)}"`,
          { code: 'VALIDATION_ERROR', statusCode: 400, context: { contextKey: rule.contextKey, index: i, idField: rule.idField, duplicateId: realId } }
        );
      }

      const counter = prefixCounters.get(rule.aliasPrefix)! + 1;
      prefixCounters.set(rule.aliasPrefix, counter);
      const alias = `${rule.aliasPrefix}-${counter}`;
      realToAlias.set(realId, alias);
      aliasToReal.set(alias, realId);
    }
  }

  logger?.info(
    { registeredIds: realToAlias.size, prefixCount: knownPrefixes.size },
    '[idMapping] buildIdRegistry: registered IDs'
  );

  return { realToAlias, aliasToReal, knownPrefixes, prefixCounters };
}

export function simplifyContextIds(
  flatContext: Record<string, unknown>,
  inputRules: IdMappingRule[],
  registry: IdRegistry
): Record<string, unknown> {
  const cloned = structuredClone(flatContext);

  for (const rule of inputRules) {
    const arr = cloned[rule.contextKey];
    if (!Array.isArray(arr)) continue;

    for (const item of arr) {
      const realId = extractPath(item, rule.idField);
      if (typeof realId === 'string' && registry.realToAlias.has(realId)) {
        setPath(item, rule.idField, registry.realToAlias.get(realId)!);
      }

      if (rule.crossReferenceFields) {
        for (const crossRefField of rule.crossReferenceFields) {
          const value = extractPath(item, crossRefField);
          if (typeof value === 'string' && registry.realToAlias.has(value)) {
            setPath(item, crossRefField, registry.realToAlias.get(value)!);
          } else if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
              if (typeof value[i] === 'string' && registry.realToAlias.has(value[i])) {
                value[i] = registry.realToAlias.get(value[i])!;
              }
            }
          }
        }
      }
    }
  }

  return cloned;
}

export function reverseMapOutput(
  output: Record<string, unknown>,
  config: IdMappingConfig,
  registry: IdRegistry,
  createId: () => string
): IdMappingReport {
  const report: IdMappingReport = { reversed: 0, generated: 0, errors: [] };

  for (const fieldPath of config.outputIdFields) {
    if (fieldPath.includes('[]')) {
      const splitIndex = fieldPath.indexOf('[].');
      if (splitIndex === -1) continue;
      const arrayPath = fieldPath.substring(0, splitIndex);
      const childPath = fieldPath.substring(splitIndex + 3);
      const arr = extractPath(output, arrayPath);
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        if (item === null || typeof item !== 'object') continue;
        reverseField(item as Record<string, unknown>, childPath, config, registry, createId, report);
      }
    } else {
      reverseField(output, fieldPath, config, registry, createId, report);
    }
  }

  if (report.errors.length > 0) {
    throw new ApplicationError(
      `[idMapping] reverseMapOutput: ${report.errors.length} unknown alias(es) with unknownIdStrategy "error":\n${report.errors.join('\n')}`,
      { code: 'VALIDATION_ERROR', statusCode: 400, context: { errorCount: report.errors.length, errors: report.errors } }
    );
  }

  return report;
}

function reverseField(
  obj: Record<string, unknown>,
  fieldPath: string,
  config: IdMappingConfig,
  registry: IdRegistry,
  createId: () => string,
  report: IdMappingReport
): void {
  const value = extractPath(obj, fieldPath);
  if (typeof value === 'string') {
    const reversed = reverseOneId(value, config, registry, createId, report);
    if (reversed !== value) setPath(obj, fieldPath, reversed);
  } else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (typeof value[i] === 'string') {
        value[i] = reverseOneId(value[i] as string, config, registry, createId, report);
      }
    }
  }
}

function reverseOneId(
  value: string,
  config: IdMappingConfig,
  registry: IdRegistry,
  createId: () => string,
  report: IdMappingReport
): string {
  if (registry.aliasToReal.has(value)) {
    report.reversed++;
    return registry.aliasToReal.get(value)!;
  }

  const match = value.match(/^([a-z][a-z0-9]*)-(\d+)$/);
  if (match && registry.knownPrefixes.has(match[1])) {
    if (config.unknownIdStrategy === 'generate') {
      const newRealId = createId();
      registry.aliasToReal.set(value, newRealId);
      report.generated++;
      return newRealId;
    } else {
      report.errors.push(
        `Unknown alias "${value}" (matches prefix "${match[1]}") — not found in registry of ${registry.realToAlias.size} known IDs`
      );
      return value;
    }
  }

  return value;
}
