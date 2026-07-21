import { describe, expect, it } from 'vitest';
import { getValidationMessage } from './getValidationMessage';
import { generateMVPFromSchema } from './generateMVPFromSchema';
import { resolveRef } from './resolveRef';
import { validateData } from './ajvHelpers';
import type { Schema } from './schema';

describe('resolveRef', () => {
  const root: Schema = {
    type: 'object',
    properties: {
      defs: {
        type: 'object',
        properties: {
          item: { type: 'string', default: 'hi' },
        },
      },
    },
  };

  it('resolves local #/ refs', () => {
    // attach defs at root-like shape used by editors
    const schema = {
      type: 'object',
      definitions: {
        Item: { type: 'string', default: 'x' },
      },
    } as Schema & { definitions: Record<string, Schema> };
    const resolved = resolveRef(schema as Schema, '#/definitions/Item');
    expect(resolved?.type).toBe('string');
  });

  it('returns undefined for non-local or missing refs', () => {
    expect(resolveRef(root, 'https://example.com/schema')).toBeUndefined();
    expect(resolveRef(root, '#/missing/path')).toBeUndefined();
  });
});

describe('generateMVPFromSchema', () => {
  it('builds nested MVP objects', () => {
    const schema: Schema = {
      type: 'object',
      properties: {
        name: { type: 'string', default: 'n' },
        count: { type: 'integer' },
        flag: { type: 'boolean' },
        tags: { type: 'array', items: { type: 'string' } },
        kind: { type: 'string', const: 'fixed' },
      },
    };
    expect(generateMVPFromSchema(schema)).toEqual({
      name: 'n',
      count: 0,
      flag: false,
      tags: [],
      kind: 'fixed',
    });
  });
});

describe('getValidationMessage', () => {
  it('formats required and generic errors', () => {
    expect(getValidationMessage(null)).toContain('Unknown');
    const msg = getValidationMessage([
      {
        keyword: 'required',
        instancePath: '',
        schemaPath: '#/required',
        params: { missingProperty: 'id' },
        message: 'must have required property id',
      },
      {
        keyword: 'type',
        instancePath: '/name',
        schemaPath: '#/properties/name/type',
        params: { type: 'string' },
        message: 'must be string',
      },
    ]);
    expect(msg).toContain("Missing required property");
    expect(msg).toContain("'id'");
    expect(msg).toContain("'/name'");
  });
});

describe('validateData', () => {
  it('validates against a simple schema', () => {
    const schema = {
      type: 'object',
      properties: { n: { type: 'number' } },
      required: ['n'],
      additionalProperties: false,
    };
    expect(validateData({ n: 1 }, schema).valid).toBe(true);
    expect(validateData({}, schema).valid).toBe(false);
  });
});
