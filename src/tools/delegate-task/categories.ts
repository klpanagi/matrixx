import type { CategoriesConfig, CategoryConfig, ModelRequirements } from "../../config/schema"
import { log } from "../../shared/logger"
import { isModelAvailable } from "../../shared/model-availability"
import { getCategoryModelRequirements } from "../../shared/model-requirements"
import { normalizeModel } from "../../shared/model-resolution-pipeline"
import type { TierResolverContext } from "../../shared/tier-resolver"
import { resolveTier } from "../../shared/tier-resolver"
import { CATEGORY_PROMPT_APPENDS, DEFAULT_CATEGORIES } from "./constants"

interface ResolveCategoryConfigOptions {
  userCategories?: CategoriesConfig
  inheritedModel?: string
  systemDefaultModel?: string
  availableModels?: Set<string>
  tierContext?: TierResolverContext
  modelRequirements?: ModelRequirements
}

interface ResolveCategoryConfigResult {
  config: CategoryConfig
  promptAppend: string
  model: string | undefined
  temperature: number | undefined
}

/**
 * Resolve the configuration for a given category name.
 * Merges default and user configurations, handles model resolution.
 *
 * Tier resolution: both `userConfig.tier` and `defaultConfig.tier` are
 * resolved against the live provider list (`tierContext`). An explicit
 * `userConfig.model` always wins; an explicit `userConfig.tier` wins
 * over the default tier; otherwise the default tier is used.
 */
export function resolveCategoryConfig(
  categoryName: string,
  options: ResolveCategoryConfigOptions
): ResolveCategoryConfigResult | null {
  const { userCategories, inheritedModel: _inheritedModel, systemDefaultModel, availableModels, tierContext, modelRequirements } = options

  const defaultConfig = DEFAULT_CATEGORIES[categoryName]
  const userConfig = userCategories?.[categoryName]
  const hasExplicitUserConfig = userConfig !== undefined

  if (userConfig?.disable) {
    return null
  }

  const categoryRequirements = getCategoryModelRequirements(modelRequirements ? { modelRequirements } : undefined)
  const categoryReq = categoryRequirements[categoryName]
  if (categoryReq?.requiresModel && availableModels && !hasExplicitUserConfig) {
    if (!isModelAvailable(categoryReq.requiresModel, availableModels)) {
      log(`[resolveCategoryConfig] Category ${categoryName} requires ${categoryReq.requiresModel} but not available`)
      return null
    }
  }
  const defaultPromptAppend = CATEGORY_PROMPT_APPENDS[categoryName] ?? ""

  if (!defaultConfig && !userConfig) {
    return null
  }

  // Resolve tiers: user tier wins over default tier; both resolve to model strings.
  const effectiveUserModel = resolveTierOnEntry(userConfig, tierContext)
  const effectiveDefaultModel = resolveTierOnEntry(defaultConfig, tierContext)

  // Model priority for categories: user override > category default > system default
  // Categories have explicit models - no inheritance from parent session
  const model =
    normalizeModel(effectiveUserModel ?? userConfig?.model) ??
    normalizeModel(effectiveDefaultModel ?? defaultConfig?.model) ??
    systemDefaultModel
  const hasUserModelOverride = (effectiveUserModel ?? userConfig?.model) !== undefined
  const config: CategoryConfig = {
    ...defaultConfig,
    ...userConfig,
    model,
    variant: userConfig?.variant ?? (hasUserModelOverride ? undefined : defaultConfig?.variant),
  }

  let promptAppend = defaultPromptAppend
  if (userConfig?.prompt_append) {
    promptAppend = defaultPromptAppend
      ? `${defaultPromptAppend}\n\n${userConfig.prompt_append}`
      : userConfig.prompt_append
  }

  return { config, promptAppend, model, temperature: config.temperature }
}

function resolveTierOnEntry(
  entry: { model?: string; tier?: string } | undefined,
  ctx: TierResolverContext | undefined,
): string | undefined {
  if (!entry || entry.model || !entry.tier || !ctx) return undefined
  const resolved = resolveTier(entry.tier as never, ctx)
  return resolved?.model
}
