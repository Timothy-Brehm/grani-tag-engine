import { createTag, type Tag } from '../../tag';
import type { TagCollectionJSON } from '../../tag-collection';
import { TagCollection } from '../../tag-collection';
import type { EngineState } from '../../state';
import { upsertEntity } from '../../state';
import { withEntityTags } from '../../entity';
import type { EngineDocument } from '../../document';
import { withUniversalTags } from '../../document';
import type { AnalyzeOptions } from '../analyzer/analyze';

/**
 * Canonical debug capability tag. Block summary shortcuts and other generation
 * tools should require `{ type: 'tag', tagName: ENGINE_DEBUG_TAG_NAME, exists: true }`.
 */
export const ENGINE_DEBUG_TAG_NAME = 'debug' as const;

/** Agent / tooling discriminant for {@link DebugContentTool}. */
export const ENGINE_DEBUG_CONTENT_KIND = 'debug-content' as const;

/**
 * Optional sidecar loaded beside a game’s main tag catalog (debug / generation
 * builds only). Hosts typically keep this in `debug-tags.json` next to content.
 */
export type GameDebugContentJSON = {
  readonly sourceId?: string;
  /** Defaults to {@link ENGINE_DEBUG_TAG_NAME}. */
  readonly debugTagName?: string;
  /**
   * Extra tags (summary shortcuts, cheat grants, …). The engine always ensures
   * the debug capability tag itself exists even if omitted here.
   */
  readonly tags?: TagCollectionJSON | readonly Tag[];
};

/**
 * Engine generation tool: optional debug tag catalog + capability tag `debug`.
 * Not a runtime UI debugger.
 */
export type DebugContentTool = {
  readonly kind: typeof ENGINE_DEBUG_CONTENT_KIND;
  readonly sourceId?: string;
  readonly debugTagName: string;
  /** Thin capability tag (`effects: []` unless customized in the source). */
  readonly debugTag: Tag;
  /** Extra tags from the sidecar (includes debugTag). */
  readonly extraTags: ReadonlyMap<string, Tag>;
  /**
   * Catalog suitable for `HostWithTagCatalog.tagCatalog` and analyzer options
   * when merged with the game’s primary catalog via {@link mergeTagCatalogs}.
   */
  readonly tagCatalog: ReadonlyMap<string, Tag>;
  mergeWith(
    base?: ReadonlyMap<string, Tag> | Readonly<Record<string, Tag>>,
  ): ReadonlyMap<string, Tag>;
  analyzeOptions(base?: AnalyzeOptions): AnalyzeOptions;
  /** True when the debug capability tag is held on UniversalTags. */
  isDebugEnabledOnDocument(doc: EngineDocument): boolean;
  /** True when the debug capability tag is held on the primary entity. */
  isDebugEnabledOnPrimary(state: EngineState): boolean;
  /** Grant debug onto Settings.universalTags (cross-game cheats). */
  enableOnDocument(doc: EngineDocument): EngineDocument;
  /** Grant debug onto the game primary entity. */
  enableOnPrimary(state: EngineState): EngineState;
};

function tagsFromJSON(
  input: TagCollectionJSON | readonly Tag[] | undefined,
): Tag[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return [...input].map((t) => createTag(t));
  }
  const json = input as TagCollectionJSON;
  return TagCollection.fromJSON(json).list().map((t) => createTag(t));
}

function toTagMap(
  input?: ReadonlyMap<string, Tag> | Readonly<Record<string, Tag>>,
): Map<string, Tag> {
  const out = new Map<string, Tag>();
  if (!input) return out;
  if (input instanceof Map) {
    for (const [k, v] of input) out.set(k, v);
    return out;
  }
  for (const [k, v] of Object.entries(input)) out.set(k, v);
  return out;
}

/** Merge catalogs; later maps win on name collision. */
export function mergeTagCatalogs(
  ...parts: Array<
    ReadonlyMap<string, Tag> | Readonly<Record<string, Tag>> | undefined
  >
): ReadonlyMap<string, Tag> {
  const out = new Map<string, Tag>();
  for (const part of parts) {
    for (const [k, v] of toTagMap(part)) {
      out.set(k, v);
    }
  }
  return out;
}

export function createDebugCapabilityTag(
  name: string = ENGINE_DEBUG_TAG_NAME,
): Tag {
  return createTag({
    name,
    label: 'Debug',
    description:
      'Engine debug capability. Required by debug-only block summaries and tools.',
    effects: [],
  });
}

/**
 * Parse a debug sidecar and build a {@link DebugContentTool}.
 * Always injects the debug capability tag if missing from `tags`.
 */
export function createDebugContentTool(
  source: GameDebugContentJSON = {},
): DebugContentTool {
  const debugTagName = source.debugTagName ?? ENGINE_DEBUG_TAG_NAME;
  const extras = tagsFromJSON(source.tags);
  const map = new Map<string, Tag>();
  for (const tag of extras) {
    map.set(tag.name, tag);
  }
  const debugTag = map.get(debugTagName) ?? createDebugCapabilityTag(debugTagName);
  map.set(debugTagName, debugTag);

  const tagCatalog = map as ReadonlyMap<string, Tag>;

  return {
    kind: ENGINE_DEBUG_CONTENT_KIND,
    sourceId: source.sourceId,
    debugTagName,
    debugTag,
    extraTags: tagCatalog,
    tagCatalog,
    mergeWith(base) {
      return mergeTagCatalogs(base, tagCatalog);
    },
    analyzeOptions(base = {}) {
      return {
        ...base,
        tagCatalog: mergeTagCatalogs(base.tagCatalog, tagCatalog),
      };
    },
    isDebugEnabledOnDocument(doc) {
      return doc.settings.universalTags.has(debugTagName);
    },
    isDebugEnabledOnPrimary(state) {
      return (
        state.entities.get(state.primaryEntityId)?.tags.has(debugTagName) ??
        false
      );
    },
    enableOnDocument(doc) {
      if (doc.settings.universalTags.has(debugTagName)) return doc;
      return withUniversalTags(doc, doc.settings.universalTags.add(debugTag));
    },
    enableOnPrimary(state) {
      const primary = state.entities.get(state.primaryEntityId);
      if (!primary || primary.tags.has(debugTagName)) return state;
      return upsertEntity(
        state,
        withEntityTags(primary, primary.tags.add(debugTag), state.tick),
      );
    },
  };
}

/** Hosts own file I/O; pass parsed JSON (or omit for debug-tag-only). */
export function loadDebugTagSource(
  json: GameDebugContentJSON | undefined,
): DebugContentTool {
  return createDebugContentTool(json ?? {});
}
