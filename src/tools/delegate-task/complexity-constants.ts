import type { Tiers } from "../../config/schema"
import type { TierConfigHolder } from "../../shared/model-tiers"
import { resolveTier, type TierResolverContext } from "../../shared/tier-resolver"
import type { ComplexityLevel } from "./complexity-types"
import { isDowngradable } from "./complexity-types"

export type ComplexityDowngradesConfig = Record<string, Record<string, string>>

export type ComplexityConfigHolder = {
  complexityDowngrades?: ComplexityDowngradesConfig
  tiers?: Tiers
}

/**
 * Resolve the model for a given category and complexity level.
 *
 * Config-driven: no built-in literals. Downgrade map is resolved as:
 *   userDowngrades ?? config.complexityDowngrades?.[category] ?? {}
 * If no entry for this complexity, returns original (no downgrade).
 * If value starts with "tier:", resolves via live tier resolver.
 *
 * @param category - The task category name
 * @param complexity - The complexity level (1-5)
 * @param originalModel - The currently resolved model string
 * @param userDowngrades - Optional per-category user override from CategoryConfig.complexity_downgrades
 * @param config - Optional holder with global complexityDowngrades and tiers
 * @param tierContext - Optional live provider context for tier: resolution
 * @returns The model to use and whether a downgrade was applied
 */
export function resolveComplexityModel(
  category: string,
  complexity: ComplexityLevel,
  originalModel: string,
  userDowngrades?: Record<string, string>,
  config?: ComplexityConfigHolder | ComplexityDowngradesConfig,
  tierContext?: TierResolverContext,
): { model: string; downgraded: boolean } {
  if (!isDowngradable(complexity)) {
    return { model: originalModel, downgraded: false }
  }

  let complexityDowngrades: ComplexityDowngradesConfig | undefined
  let tiersConfig: TierConfigHolder | undefined

  if (config) {
    const maybe = config as Record<string, unknown>
    const hasHolderKeys = "complexityDowngrades" in maybe || "tiers" in maybe
    if (hasHolderKeys) {
      const holder = config as ComplexityConfigHolder
      complexityDowngrades = holder.complexityDowngrades
      if (holder.tiers) {
        tiersConfig = holder as TierConfigHolder
      }
    } else {
      complexityDowngrades = config as ComplexityDowngradesConfig
    }
  }

  const downgrades = userDowngrades ?? complexityDowngrades?.[category] ?? {}
  const rawDowngrade = downgrades[String(complexity)]

  if (!rawDowngrade) {
    return { model: originalModel, downgraded: false }
  }

  if (rawDowngrade.startsWith("tier:")) {
    const tierName = rawDowngrade.slice(5).trim()
    if (!tierName) {
      return { model: originalModel, downgraded: false }
    }
    if (!tierContext || !tiersConfig) {
      return { model: originalModel, downgraded: false }
    }
    const resolved = resolveTier(tierName, tierContext, tiersConfig)
    if (!resolved) {
      return { model: originalModel, downgraded: false }
    }
    return { model: resolved.model, downgraded: true }
  }

  return { model: rawDowngrade, downgraded: true }
}
