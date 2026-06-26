import { jsonrepair } from 'jsonrepair';

export function extractJsonFromMarkdown(text: string): string {
  const jsonBlock = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonBlock) return jsonBlock[1].trim();

  const codeBlock = text.match(/```\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();

  const rawJson = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (rawJson) return rawJson[1].trim();

  return text.trim();
}

export function repairJson(json: string): string {
  return jsonrepair(json);
}

export function parseJson(json: string): unknown {
  return JSON.parse(json);
}

export function normalizeEnumFields(obj: unknown, fields: string[]): unknown {
  const enumFields = new Set(fields);

  function normalize(value: unknown, key?: string): unknown {
    if (key && enumFields.has(key) && typeof value === 'string') {
      return value.toLowerCase();
    }
    if (Array.isArray(value)) {
      return value.map((item) => normalize(item));
    }
    if (isPlainObject(value)) {
      const record = value as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(record)) {
        result[k] = normalize(v, k);
      }
      return result;
    }
    return value;
  }

  return normalize(obj);
}

export interface ArrayNormalizer {
  field: string;
  createObject: (value: string, index: number) => Record<string, unknown>;
}

export function normalizeArrayFields(
  obj: unknown,
  normalizers: ArrayNormalizer[]
): unknown {
  if (!normalizers.length) return obj;

  const map = new Map<string, ArrayNormalizer>();
  for (const n of normalizers) {
    const key = n.field.split('.').pop() ?? n.field;
    map.set(key, n);
  }

  function normalize(value: unknown, key?: string): unknown {
    if (key && map.has(key) && Array.isArray(value)) {
      const normalizer = map.get(key)!;
      return value.map((item, i) =>
        typeof item === 'string'
          ? normalizer.createObject(item, i)
          : normalize(item)
      );
    }
    if (Array.isArray(value)) {
      return value.map((item) => normalize(item));
    }
    if (isPlainObject(value)) {
      const record = value as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(record)) {
        result[k] = normalize(v, k);
      }
      return result;
    }
    return value;
  }

  return normalize(obj);
}

export function sanitizeNulls<T>(obj: T): T {
  const cloned = structuredClone(obj);

  function removeNulls(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map(removeNulls);
    }
    if (isPlainObject(value)) {
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        if (record[key] === null) {
          delete record[key];
        } else {
          record[key] = removeNulls(record[key]);
        }
      }
    }
    return value;
  }

  return removeNulls(cloned) as T;
}

export function validateSchema<T>(
  obj: unknown,
  schema: { parse(data: unknown): T }
): T {
  return schema.parse(obj);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
