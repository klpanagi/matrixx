import { resolveTiersInCategoryRegistry } from "../config/resolve-tiers"
import type { CategoriesConfig, CategoryConfig } from "../config/schema"
import { DEFAULT_CATEGORIES } from "../tools/delegate-task/constants"
import { readConnectedProvidersCache, readProviderModelsCache } from "./connected-providers-cache"
import type { TierResolverContext } from "./tier-resolver"

/**
 * Merge default and user categories, filtering out disabled ones.
 * Single source of truth for category merging across the codebase.
 *
 * The built-in `DEFAULT_CATEGORIES` registry is now tier-based. Before
 * returning, the tier fields are resolved against the live provider cache
 * (or the static fallback) so callers always see concrete `model:` strings.
 */
export function mergeCategories(
  userCategories?: CategoriesConfig,
  config?: { tiers?: Record<string, { providerPriority: string[]; modelPattern: string; fallbackTier?: string; fallback?: { providers: string[]; model: string; variant?: string }[] }> } | null,
): Record<string, CategoryConfig> {
  const resolvedDefaults = resolveDefaultCategories(config)
  const merged = userCategories
    ? { ...resolvedDefaults, ...userCategories }
    : { ...resolvedDefaults }

  return Object.fromEntries(
    Object.entries(merged).filter(([, config]) => !config.disable),
  )
}

function resolveDefaultCategories(
  config?: { tiers?: Record<string, { providerPriority: string[]; modelPattern: string; fallbackTier?: string; fallback?: { providers: string[]; model: string; variant?: string }[] }> } | null,
): Record<string, CategoryConfig> {
  const providerCache = readProviderModelsCache()
  const availableModels = new Set<string>()
  if (providerCache) {
    const connected = new Set(providerCache.connected)
    for (const [providerId, models] of Object.entries(providerCache.models)) {
      if (!connected.has(providerId)) continue
      for (const item of models as Array<string | { id?: string }>) {
        const modelID = typeof item === "string" ? item : item?.id
        if (modelID) availableModels.add(`${providerId}/${modelID}`)
      }
    }
  }
  const ctx: TierResolverContext = {
    availableModels,
    connectedProviders: readConnectedProvidersCache(),
  }
  return resolveTiersInCategoryRegistry(
    DEFAULT_CATEGORIES as unknown as Record<string, { model?: string; tier?: string }>,
    ctx,
    config as never,
  ) as Record<string, CategoryConfig>
}
