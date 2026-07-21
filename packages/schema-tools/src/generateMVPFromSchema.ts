import type { Schema } from './schema';

/** Build a minimal valid-ish placeholder value from a schema fragment. */
export function generateMVPFromSchema(schema: Schema): unknown {
  if ('const' in schema && schema.const !== undefined) {
    return schema.const;
  }
  if (schema.type === 'object' || schema.properties) {
    const obj: Record<string, unknown> = {};
    if (schema.properties) {
      for (const key of Object.keys(schema.properties)) {
        obj[key] = generateMVPFromSchema(schema.properties[key]!);
      }
    }
    return obj;
  }

  if (schema.type === 'array' || schema.items) {
    return [];
  }

  switch (schema.type) {
    case 'string':
      return schema.default || '';
    case 'number':
    case 'integer':
      return schema.default || 0;
    case 'boolean':
      return schema.default || false;
    default:
      return null;
  }
}
