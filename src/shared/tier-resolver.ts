import { log } from "./logger"
import { getTierSpec, parseTierReference as parseTierReferenceFromTiers, type TierConfigHolder } from "./model-tiers"

export interface TierResolverContext {
  availableModels: Set<string>
  connectedProviders: string[] | null
}

export type TierProvenance = "tier-resolved" | "tier-static-fallback"

export interface TierResolutionResult {
  model: string
  provenance: TierProvenance
  tier: string
}

/**
 * Resolve a tier alias to a concrete "provider/model" string.
 *
 * Strategy:
 *   1. Live resolution: walk `providerPriority`, test `modelPattern` against
 *      each `provider/model` in the available set (config-driven, compiled at runtime).
 *   2. Config fallback: pick the first `fallback` whose provider is
 *      connected (used at first run when the live cache is cold, user-provided).
 *   3. Recurse into `fallbackTier` if defined.
 *
 * Returns null when no match is possible (no live models, no fallback
 * available, no fallback tier). When config is empty, returns null gracefully.
 */
export function resolveTier(
  tier: string,
  ctx: TierResolverContext,
  config?: TierConfigHolder,
): TierResolutionResult | null {
  const spec = getTierSpec(tier, config)
  if (!spec) return null

  if (ctx.availableModels.size > 0) {
    for (const provider of spec.providerPriority) {
      const match = findRegexMatch(spec.modelPattern, provider, ctx.availableModels)
      if (match) {
        log("[tier-resolver] resolved via regex", { tier, provider, match })
        return { model: match, provenance: "tier-resolved", tier }
      }
    }
    log("[tier-resolver] no live match found, recursing to fallback tier", { tier })
  } else if (ctx.connectedProviders) {
    const connectedSet = new Set(ctx.connectedProviders)
    const fallback = spec.fallback ?? []
    for (const entry of fallback) {
      for (const provider of entry.providers) {
        if (connectedSet.has(provider)) {
          const model = `${provider}/${entry.model}`
          log("[tier-resolver] using config fallback (cold cache)", { tier, provider, model })
          return { model, provenance: "tier-static-fallback", tier }
        }
      }
    }
    log("[tier-resolver] no config fallback provider is connected", { tier })
  } else {
    log("[tier-resolver] no live models and no connected providers cache", { tier })
  }

  if (spec.fallbackTier) {
    return resolveTier(spec.fallbackTier, ctx, config)
  }

  return null
}

function findRegexMatch(
  pattern: RegExp,
  provider: string,
  available: Set<string>,
): string | null {
  for (const candidate of available) {
    if (!candidate.startsWith(`${provider}/`)) continue
    if (pattern.test(candidate)) return candidate
  }
  return null
}

export function parseTierReference(
  value: string | undefined | null,
  config?: TierConfigHolder,
): string | null {
  return parseTierReferenceFromTiers(value, config)
}
