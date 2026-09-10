import type { ModelFallbackInfo } from "../../features/task-toast-manager/types"
import { readConnectedProvidersCache } from "../../shared/connected-providers-cache"
import { log } from "../../shared/logger"
import { mergeCategories } from "../../shared/merge-categories"
import { getCategoryModelRequirements } from "../../shared/model-requirements"
import { getAvailableModelsForDelegateTask } from "./available-models"
import { resolveCategoryConfig } from "./categories"
import { resolveComplexityModel } from "./complexity-constants"
import { autoScoreComplexity } from "./complexity-scorer"
import type { ComplexityLevel } from "./complexity-types"
import type { ExecutorContext } from "./executor-types"
import { resolveModelForDelegateTask } from "./model-selection"
import { parseModelString } from "./model-string-parser"
import { MOUSE_AGENT } from "./mouse-agent"
import type { DelegateTaskArgs } from "./types"

export interface CategoryResolutionResult {
  agentToUse: string
  categoryModel: { providerID: string; modelID: string; variant?: string; temperature?: number } | undefined
  categoryPromptAppend: string | undefined
  modelInfo: ModelFallbackInfo | undefined
  actualModel: string | undefined
  isUnstableAgent: boolean
  /** The complexity level that was applied (auto-scored or caller-provided) */
  complexityApplied?: import("./complexity-types").ComplexityLevel
  /** If true, model was downgraded due to low complexity */
  complexityDowngraded?: boolean
  /** Human-readable note about complexity-based model selection */
  _complexityNote?: string
  error?: string
}

export async function resolveCategoryExecution(
  args: DelegateTaskArgs,
  executorCtx: ExecutorContext,
  inheritedModel: string | undefined,
  systemDefaultModel: string | undefined
): Promise<CategoryResolutionResult> {
  const { client, userCategories, mouseModel, globalModel, modelRequirements, complexityDowngrades, tiers } = executorCtx
  const categoryRequirements = getCategoryModelRequirements(modelRequirements ? { modelRequirements } : undefined)

  const availableModels = await getAvailableModelsForDelegateTask(client)
  const connectedProviders = readConnectedProvidersCache()

  const categoryName = args.category as string
  const enabledCategories = mergeCategories(userCategories)
  const categoryExists = enabledCategories[categoryName] !== undefined

  const resolved = resolveCategoryConfig(categoryName, {
    userCategories,
    inheritedModel,
    systemDefaultModel,
    availableModels,
    tierContext: { availableModels, connectedProviders },
    modelRequirements,
  })

  if (!resolved) {
    const requirement = categoryRequirements[categoryName]
    const allCategoryNames = Object.keys(enabledCategories).join(", ")

    if (categoryExists && requirement?.requiresModel) {
      return {
        agentToUse: "",
        categoryModel: undefined,
        categoryPromptAppend: undefined,
        modelInfo: undefined,
        actualModel: undefined,
        isUnstableAgent: false,
        error: `Category "${categoryName}" requires model "${requirement.requiresModel}" which is not available.

To use this category:
1. Connect a provider with this model: ${requirement.requiresModel}
2. Or configure an alternative model in your matrixx.json for this category

Available categories: ${allCategoryNames}`,
      }
    }

    return {
      agentToUse: "",
      categoryModel: undefined,
      categoryPromptAppend: undefined,
      modelInfo: undefined,
      actualModel: undefined,
      isUnstableAgent: false,
      error: `Unknown category: "${categoryName}". Available: ${allCategoryNames}`,
    }
  }

  const requirement = categoryRequirements[args.category as string]
  let actualModel: string | undefined
  let modelInfo: ModelFallbackInfo | undefined
  let categoryModel: { providerID: string; modelID: string; variant?: string; temperature?: number } | undefined

  const overrideModel = mouseModel
  const explicitCategoryModel = globalModel ?? userCategories?.[args.category as string]?.model
  if (!requirement) {
    // Precedence: explicit category model > category resolved model > mouse default
    // Category's resolved model (from defaults/system) wins over mouse model.
    // Mouse model is only used as a last-resort fallback.
    actualModel = explicitCategoryModel ?? resolved.model ?? overrideModel
    if (actualModel) {
      modelInfo = explicitCategoryModel
        ? { model: actualModel, type: "user-defined", source: "override" }
        : resolved.model
            ? { model: actualModel, type: "system-default", source: "system-default" }
            : { model: actualModel, type: "user-defined", source: "override" }
    }
  } else {
    const resolution = resolveModelForDelegateTask({
      userModel: explicitCategoryModel,
      categoryDefaultModel: resolved.model,
      fallbackChain: requirement.fallbackChain,
      availableModels,
      systemDefaultModel,
    })

    if (resolution) {
      const { model: resolvedModel, variant: resolvedVariant } = resolution
      actualModel = resolvedModel

      if (!parseModelString(actualModel)) {
        return {
          agentToUse: "",
          categoryModel: undefined,
          categoryPromptAppend: undefined,
          modelInfo: undefined,
          actualModel: undefined,
          isUnstableAgent: false,
          error: `Invalid model format "${actualModel}". Expected "provider/model" format (e.g., "anthropic/claude-sonnet-4-5").`,
        }
      }

      const type: "user-defined" | "inherited" | "category-default" | "system-default" =
        explicitCategoryModel
          ? "user-defined"
          : (systemDefaultModel && actualModel === systemDefaultModel)
              ? "system-default"
              : "category-default"

      const source: "override" | "category-default" | "system-default" =
        type === "user-defined"
          ? "override"
          : type === "system-default"
              ? "system-default"
              : "category-default"

      modelInfo = { model: actualModel, type, source }

      const parsedModel = parseModelString(actualModel)
      const variantToUse = userCategories?.[args.category as string]?.variant ?? resolvedVariant ?? resolved.config.variant
      categoryModel = parsedModel
        ? (variantToUse ? { ...parsedModel, variant: variantToUse, temperature: resolved.config.temperature } : { ...parsedModel, temperature: resolved.config.temperature })
        : undefined
    }
  }

  if (!categoryModel && actualModel) {
    const parsedModel = parseModelString(actualModel)
    categoryModel = parsedModel
      ? { ...parsedModel, temperature: resolved.config.temperature }
      : undefined
  }
  const categoryPromptAppend = resolved.promptAppend || undefined

  // === COMPLEXITY-AWARE MODEL DOWNGRADE ===
  let complexityLevel: ComplexityLevel = 3
  let complexityDowngraded = false
  let _complexityNote: string | undefined

  const complexityInput = args.complexity
  if (complexityInput === undefined || complexityInput === "auto") {
    if (actualModel) {
      complexityLevel = autoScoreComplexity({
        description: args.description,
        prompt: args.prompt,
        loadSkills: args.load_skills,
        category: args.category,
      })
    }
  } else {
    complexityLevel = complexityInput
  }

  if (actualModel && (complexityLevel === 1 || complexityLevel === 2)) {
    const userDowngrades = userCategories?.[args.category as string]?.complexity_downgrades
    const holder = complexityDowngrades || tiers ? { complexityDowngrades, tiers } : undefined
    const tierCtx = { availableModels, connectedProviders }
    const resolvedDowngrade = resolveComplexityModel(args.category as string, complexityLevel, actualModel, userDowngrades, holder, tierCtx)

    if (resolvedDowngrade.downgraded) {
      complexityDowngraded = true
      log("[complexity] Auto-downgraded model", {
        category: args.category,
        from: actualModel,
        to: resolvedDowngrade.model,
        complexity: complexityLevel,
      })
      const previousModel = actualModel
      actualModel = resolvedDowngrade.model
      // Re-parse model after downgrade
      const parsed = parseModelString(actualModel)
      if (parsed) {
        categoryModel = { ...parsed, temperature: resolved.config.temperature }
      }
      _complexityNote = `Model auto-downgraded from ${previousModel} to ${resolvedDowngrade.model} (complexity: ${complexityLevel})`
    }
  }

  if (!categoryModel && !actualModel) {
    const categoryNames = Object.keys(enabledCategories)
    return {
      agentToUse: "",
      categoryModel: undefined,
      categoryPromptAppend: undefined,
      modelInfo: undefined,
      actualModel: undefined,
      isUnstableAgent: false,
      error: `Model not configured for category "${args.category}".

Configure in one of:
1. OpenCode: Set "model" in opencode.json
2. Matrixx: Set category model in matrixx.json
3. Provider: Connect a provider with available models

Current category: ${args.category}
Available categories: ${categoryNames.join(", ")}`,
    }
  }

  const unstableModel = actualModel?.toLowerCase()
  const isUnstableAgent = resolved.config.is_unstable_agent === true || (unstableModel ? unstableModel.includes("gemini") || unstableModel.includes("minimax") : false)

  return {
    agentToUse: MOUSE_AGENT,
    categoryModel,
    categoryPromptAppend,
    modelInfo,
    actualModel,
    isUnstableAgent,
    complexityApplied: complexityLevel,
    complexityDowngraded,
    _complexityNote,
  }
}
