/**
 * Debug content sidecar tool (optional generation-time tags + `debug` capability).
 *
 * @agentTool debug-content
 * @agentTool engine-tools
 */

export type { GameDebugContentJSON, DebugContentTool } from './debug-content';
export {
  ENGINE_DEBUG_TAG_NAME,
  ENGINE_DEBUG_CONTENT_KIND,
  createDebugCapabilityTag,
  createDebugContentTool,
  loadDebugTagSource,
  mergeTagCatalogs,
} from './debug-content';
