import type { ExperimentalConfig } from "../config/schema/experimental"
import type { ContextLimitModelCacheState } from "./context-limit-resolver"
import { isAnthropicProvider, resolveActualContextLimit } from "./context-limit-resolver"

/**
 * Single source for context window thresholds and limit defaults.
 * Boundary: monitor 70% warn (read-only) → preemptive 78% (proactive) → recovery (reactive, error-parse only).
 * Shared constants consumed via context-limits.ts + token-cache.ts.
 *
 * Thresholds:
 * - CONTEXT_WARNING_THRESHOLD (0.70) — read-only monitor warning, Anthropic only.
 * - PREEMPTIVE_COMPACTION_THRESHOLD (0.78) — proactive compaction trigger.
 * Limits:
 * - ANTHROPIC_DISPLAY_LIMIT (1_000_000) — UI display cap for Anthropic 1M context.
 * - DEFAULT_ANTHROPIC_ACTUAL_LIMIT (200_000) — fallback when 1M not enabled.
 * - DEFAULT_NON_ANTHROPIC_FALLBACK_LIMIT (128_000) — generic LLM fallback.
 *
 * Re-exports isAnthropicProvider + resolveActualContextLimit from resolver for single import surface.
 */

/** Warn threshold for monitor (read-only, does not trigger compaction). */
export const CONTEXT_WARNING_THRESHOLD = 0.70 as const

/** Proactive compaction threshold (preemptive-compaction trigger). */
export const PREEMPTIVE_COMPACTION_THRESHOLD = 0.78 as const

/** Default actual limit for Anthropic without 1M enabled. */
export const DEFAULT_ANTHROPIC_ACTUAL_LIMIT = 200_000 as const

/** Generic fallback for non-Anthropic providers. */
export const DEFAULT_NON_ANTHROPIC_FALLBACK_LIMIT = 128_000 as const

/** Display limit for Anthropic 1M UI. */
export const ANTHROPIC_DISPLAY_LIMIT = 1_000_000 as const

export type { ContextLimitModelCacheState }
export { isAnthropicProvider, resolveActualContextLimit }

/** Wrapper around resolveActualContextLimit for display vs actual semantics. */
export function getActualLimit(
  providerID: string,
  modelID: string,
  modelCacheState?: ContextLimitModelCacheState,
): number | null {
  return resolveActualContextLimit(providerID, modelID, modelCacheState)
}

/** Display limit is fixed 1M for Anthropic UI; actual may be smaller. */
export function getDisplayLimit(): number {
  return ANTHROPIC_DISPLAY_LIMIT
}

export function resolveWarningThreshold(experimental?: ExperimentalConfig): number {
  const v = experimental?.context_warning_threshold
  return typeof v === "number" ? v : CONTEXT_WARNING_THRESHOLD
}

export function resolvePreemptiveThreshold(experimental?: ExperimentalConfig): number {
  const v = experimental?.preemptive_compaction_threshold
  return typeof v === "number" ? v : PREEMPTIVE_COMPACTION_THRESHOLD
}
