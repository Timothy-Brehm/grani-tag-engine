import { describe, expect, it } from 'vitest';
import {
  ENGINE_VERSION,
  assertCompatibleEngineVersion,
  engineVersionCompatibilityKey,
  isCompatibleEngineVersion,
  parseEngineVersion,
} from './version';

describe('engine version', () => {
  it('exports a four-part ENGINE_VERSION', () => {
    expect(ENGINE_VERSION).toBe('0.2.1.0');
    expect(parseEngineVersion(ENGINE_VERSION)).toEqual({
      major: 0,
      minor: 2,
      patch: 1,
      build: 0,
    });
  });

  it('treats major.minor as the compatibility epoch', () => {
    expect(engineVersionCompatibilityKey('0.1.0.0')).toBe('0.1');
    expect(isCompatibleEngineVersion('0.1.2.3', '0.1.0.0')).toBe(true);
    expect(isCompatibleEngineVersion('0.2.0.0', '0.1.0.0')).toBe(false);
    expect(isCompatibleEngineVersion('1.1.0.0', '0.1.0.0')).toBe(false);
  });

  it('assertCompatibleEngineVersion rejects bad or foreign epochs', () => {
    expect(() => assertCompatibleEngineVersion(undefined)).toThrow(
      /Missing engineVersion/,
    );
    expect(() => assertCompatibleEngineVersion('0.1.0.0')).toThrow(
      /Incompatible engineVersion/,
    );
    expect(() => assertCompatibleEngineVersion('0.2.9.9')).not.toThrow();
  });
});
