/**
 * Engine protocol version (`major.minor.patch.build`).
 *
 * Compatibility is keyed by **`major.minor`**. Bumping `minor` (or `major`)
 * marks the protocol incompatible with older saves and hosts. `patch` / `build`
 * are for compatible revisions within the same epoch.
 */
export const ENGINE_VERSION = '0.2.4.0' as const;

export type EngineVersionParts = {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly build: number;
};

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/;

/** Parse a four-part engine version string. */
export function parseEngineVersion(version: string): EngineVersionParts {
  const match = VERSION_RE.exec(version);
  if (!match) {
    throw new Error(
      `Invalid engine version "${version}"; expected major.minor.patch.build`,
    );
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    build: Number(match[4]),
  };
}

/** Compatibility key: `major.minor` (e.g. `"0.1"`). */
export function engineVersionCompatibilityKey(version: string): string {
  const parts = parseEngineVersion(version);
  return `${parts.major}.${parts.minor}`;
}

/** True when both versions share the same major.minor compatibility epoch. */
export function isCompatibleEngineVersion(
  saved: string,
  current: string = ENGINE_VERSION,
): boolean {
  try {
    return (
      engineVersionCompatibilityKey(saved) ===
      engineVersionCompatibilityKey(current)
    );
  } catch {
    return false;
  }
}

/**
 * Throws when `saved` is missing, malformed, or not compatible with `current`.
 */
export function assertCompatibleEngineVersion(
  saved: string | undefined,
  current: string = ENGINE_VERSION,
): void {
  if (typeof saved !== 'string' || !saved) {
    throw new Error(
      `Missing engineVersion; current engine requires ${current}`,
    );
  }
  if (!isCompatibleEngineVersion(saved, current)) {
    throw new Error(
      `Incompatible engineVersion ${saved}; this engine is ${current} ` +
        `(compatibility epoch ${engineVersionCompatibilityKey(current)})`,
    );
  }
}
