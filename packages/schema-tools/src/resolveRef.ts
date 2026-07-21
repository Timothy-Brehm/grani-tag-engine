import type { Schema } from './schema';

/** Resolve a local JSON Pointer ref (`#/...`) against a root schema. */
export function resolveRef(schema: Schema, ref: string): Schema | undefined {
  if (!ref.startsWith('#/')) {
    return undefined;
  }
  const segments = ref.substring(2).split('/');
  let refSchema: unknown = schema;
  for (const segment of segments) {
    if (
      refSchema !== null &&
      typeof refSchema === 'object' &&
      segment in (refSchema as Record<string, unknown>)
    ) {
      refSchema = (refSchema as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return refSchema as Schema;
}
