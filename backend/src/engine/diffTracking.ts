import type { ChangeStatus, DiffTrackingConfig } from './types.js';
import type { FastifyBaseLogger } from 'fastify';

export type AnnotatedItem<T = Record<string, unknown>> = T & {
  _changeStatus: ChangeStatus;
};

export interface AnnotatedStringItem {
  value: string;
  _changeStatus: ChangeStatus;
}

export function computeArrayDiff<T extends Record<string, unknown>>(
  oldItems: T[],
  newItems: T[],
  config: DiffTrackingConfig
): AnnotatedItem<T>[] {
  const { identityField, includeRemoved, modifiedFields } = config;
  const oldMap = new Map<unknown, T>();
  for (const item of oldItems) oldMap.set(item[identityField], item);
  const newMap = new Map<unknown, T>();
  for (const item of newItems) newMap.set(item[identityField], item);

  const result: AnnotatedItem<T>[] = [];
  for (const newItem of newItems) {
    const id = newItem[identityField];
    const oldItem = oldMap.get(id);
    if (!oldItem) {
      result.push({ ...newItem, _changeStatus: 'added' });
    } else if (hasChanges(oldItem, newItem, modifiedFields)) {
      result.push({ ...newItem, _changeStatus: 'modified' });
    } else {
      result.push({ ...newItem, _changeStatus: 'unchanged' });
    }
  }

  if (includeRemoved) {
    for (const oldItem of oldItems) {
      const id = oldItem[identityField];
      if (!newMap.has(id)) result.push({ ...oldItem, _changeStatus: 'removed' });
    }
  }

  return result;
}

export function computeStringArrayDiff(
  oldItems: string[],
  newItems: string[],
  includeRemoved: boolean
): AnnotatedStringItem[] {
  const oldSet = new Set(oldItems);
  const newSet = new Set(newItems);
  const result: AnnotatedStringItem[] = [];

  for (const item of newItems) {
    result.push({ value: item, _changeStatus: oldSet.has(item) ? 'unchanged' : 'added' });
  }
  if (includeRemoved) {
    for (const item of oldItems) {
      if (!newSet.has(item)) result.push({ value: item, _changeStatus: 'removed' });
    }
  }
  return result;
}

export function computeNestedObjectDiff(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  config: DiffTrackingConfig
): Record<string, unknown> {
  const { nestedArrayKeys } = config;
  if (!nestedArrayKeys || nestedArrayKeys.length === 0) return newObj;

  const result: Record<string, unknown> = { ...newObj };
  for (const key of nestedArrayKeys) {
    const oldArr = (oldObj[key] ?? []) as unknown[];
    const newArr = (newObj[key] ?? []) as unknown[];
    const hasStrings = isStringArray(oldArr) || isStringArray(newArr);
    const hasObjects = isObjectArray(oldArr) || isObjectArray(newArr);

    if (hasStrings && !hasObjects) {
      result[key] = computeStringArrayDiff(
        isStringArray(oldArr) ? (oldArr as string[]) : [],
        isStringArray(newArr) ? (newArr as string[]) : [],
        config.includeRemoved
      );
    } else if (hasObjects) {
      result[key] = computeArrayDiff(
        isObjectArray(oldArr) ? (oldArr as Record<string, unknown>[]) : [],
        isObjectArray(newArr) ? (newArr as Record<string, unknown>[]) : [],
        config
      );
    } else {
      result[key] = newArr;
    }
  }
  return result;
}

export function computeObjectFieldDiff(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>
): Record<string, unknown> {
  const changedFields: string[] = [];
  for (const key of Object.keys(newObj)) {
    if (key === '_changedFields') continue;
    if (!deepEqual(oldObj[key], newObj[key])) changedFields.push(key);
  }
  if (changedFields.length === 0) return { ...newObj };
  return { ...newObj, _changedFields: changedFields };
}

export function stripAnnotations(content: unknown, config: DiffTrackingConfig): unknown {
  if (config.nestedArrayKeys && config.nestedArrayKeys.length > 0 && isPlainObject(content)) {
    return stripNestedAnnotations(content as Record<string, unknown>, config);
  }
  if (Array.isArray(content)) return stripArrayAnnotations(content);
  if (isPlainObject(content)) {
    const obj = content as Record<string, unknown>;
    if ('_changedFields' in obj) {
      const { _changedFields: _, ...rest } = obj;
      return rest;
    }
    return obj;
  }
  return content;
}

export function computeDiff(
  oldContent: unknown,
  newContent: unknown,
  config: DiffTrackingConfig,
  logger?: FastifyBaseLogger
): unknown {
  if (config.nestedArrayKeys && config.nestedArrayKeys.length > 0) {
    return computeNestedObjectDiff(
      (oldContent ?? {}) as Record<string, unknown>,
      (newContent ?? {}) as Record<string, unknown>,
      config
    );
  }

  if (Array.isArray(newContent)) {
    const oldArr = Array.isArray(oldContent) ? oldContent : [];
    if (isStringArray(newContent) || newContent.length === 0) {
      const oldStrings = isStringArray(oldArr)
        ? (oldArr as string[])
        : (oldArr as AnnotatedStringItem[]).map((i) => i.value);
      return computeStringArrayDiff(oldStrings, newContent as string[], config.includeRemoved);
    }
    if (isObjectArray(newContent)) {
      const oldObjects = isObjectArray(oldArr) ? (oldArr as Record<string, unknown>[]) : [];
      return computeArrayDiff(oldObjects, newContent as Record<string, unknown>[], config);
    }
  }

  if (isPlainObject(newContent) && isPlainObject(oldContent)) {
    return computeObjectFieldDiff(
      oldContent as Record<string, unknown>,
      newContent as Record<string, unknown>
    );
  }

  logger?.warn(
    { contentType: typeof newContent, isArray: Array.isArray(newContent) },
    '[diffTracking] computeDiff: unrecognized content shape, returning newContent unmodified'
  );
  return newContent;
}

export function hasAnnotations(content: unknown, config: DiffTrackingConfig): boolean {
  if (!isPlainObject(content)) return false;
  const obj = content as Record<string, unknown>;
  for (const key of config.nestedArrayKeys ?? []) {
    const arr = obj[key];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (isPlainObject(item) && '_changeStatus' in (item as Record<string, unknown>)) return true;
      }
    }
  }
  if ('_changedFields' in obj || '_changeStatus' in obj) return true;
  return false;
}

export function computeBaselineDiff(
  content: Record<string, unknown>,
  contextData: Record<string, unknown>,
  config: DiffTrackingConfig
): Record<string, unknown> {
  const { nestedBaselineKeys, nestedArrayKeys } = config;
  if (!nestedBaselineKeys || !nestedArrayKeys) return content;

  const baseline: Record<string, unknown> = {};
  for (const key of nestedArrayKeys) {
    const baselineKey = nestedBaselineKeys[key];
    if (baselineKey && contextData[baselineKey] != null) {
      baseline[key] = contextData[baselineKey];
    } else {
      baseline[key] = [];
    }
  }

  return computeNestedObjectDiff(baseline, content, config);
}

function hasChanges(
  oldItem: Record<string, unknown>,
  newItem: Record<string, unknown>,
  modifiedFields?: string[]
): boolean {
  if (modifiedFields && modifiedFields.length > 0) {
    return modifiedFields.some((f) => !deepEqual(oldItem[f], newItem[f]));
  }
  return !deepEqual(oldItem, newItem);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], (b as unknown[])[i])) return false;
    }
    return true;
  }
  const keysA = Object.keys(a as Record<string, unknown>).filter((k) => k !== '_changeStatus' && k !== '_changedFields');
  const keysB = Object.keys(b as Record<string, unknown>).filter((k) => k !== '_changeStatus' && k !== '_changedFields');
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!deepEqual(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key]
    )) return false;
  }
  return true;
}

function isStringArray(arr: unknown[]): boolean {
  return arr.length > 0 && arr.every((item) => typeof item === 'string');
}

function isObjectArray(arr: unknown[]): boolean {
  return arr.length > 0 && arr.every((item) => isPlainObject(item));
}

function isPlainObject(value: unknown): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stripArrayAnnotations(arr: unknown[]): unknown[] {
  return arr
    .filter((item) => {
      if (isPlainObject(item)) {
        const obj = item as Record<string, unknown>;
        return obj['_changeStatus'] !== 'removed';
      }
      if (typeof item === 'object' && item !== null && '_changeStatus' in (item as Record<string, unknown>)) {
        return (item as Record<string, unknown>)['_changeStatus'] !== 'removed';
      }
      return true;
    })
    .map((item) => {
      if (isPlainObject(item)) {
        const { _changeStatus: _, ...rest } = item as Record<string, unknown>;
        const keys = Object.keys(rest);
        if (keys.length === 1 && keys[0] === 'value' && typeof rest['value'] === 'string') {
          return rest['value'];
        }
        return rest;
      }
      return item;
    });
}

function stripNestedAnnotations(
  obj: Record<string, unknown>,
  config: DiffTrackingConfig
): Record<string, unknown> {
  const result = { ...obj };
  for (const key of config.nestedArrayKeys ?? []) {
    const arr = result[key];
    if (Array.isArray(arr)) result[key] = stripArrayAnnotations(arr);
  }
  return result;
}
