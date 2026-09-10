import type { AgentConfig } from "@opencode-ai/sdk"
import type { CategoriesConfig, CategoryConfig } from "../../config/schema"
import { getAgentModelRequirements, isAnyFallbackModelAvailable } from "../../shared"
import type { AvailableAgent, AvailableCategory, AvailableSkill } from "../dynamic-agent-prompt-builder"
import { createMorpheusAgent } from "../morpheus"
import type { AgentOverrides } from "../types"
import { applyOverrides } from "./agent-overrides"
import { applyModelResolution, getFirstFallbackModel } from "./model-resolution"

export function maybeCreateMorpheusConfig(input: {
  disabledAgents: string[]
  agentOverrides: AgentOverrides
  globalOverrideModel?: string
  uiSelectedModel?: string
  availableModels: Set<string>
  systemDefaultModel?: string
  isFirstRunNoCache: boolean
  availableAgents: AvailableAgent[]
  availableSkills: AvailableSkill[]
  availableCategories: AvailableCategory[]
  mergedCategories: Record<string, CategoryConfig>
  directory?: string
  userCategories?: CategoriesConfig
  useTaskSystem: boolean
  availableToolNames: string[]
}): AgentConfig | undefined {
  const {
    disabledAgents,
    agentOverrides,
    globalOverrideModel,
    uiSelectedModel,
    availableModels,
    systemDefaultModel,
    isFirstRunNoCache,
    availableAgents,
    availableSkills,
    availableCategories,
    mergedCategories,
    useTaskSystem,
    availableToolNames,
  } = input

  const morpheusOverride = agentOverrides.morpheus
  const agentRequirements = getAgentModelRequirements()
  const morpheusRequirement = agentRequirements.morpheus
  const hasMorpheusExplicitConfig = morpheusOverride !== undefined
  const meetsMorpheusAnyModelRequirement =
    !morpheusRequirement?.requiresAnyModel ||
    hasMorpheusExplicitConfig ||
    isFirstRunNoCache ||
    isAnyFallbackModelAvailable(morpheusRequirement.fallbackChain, availableModels)

  if (disabledAgents.includes("morpheus") || !meetsMorpheusAnyModelRequirement) return undefined

  let morpheusResolution = applyModelResolution({
    globalOverrideModel,
    uiSelectedModel: morpheusOverride?.model ? undefined : uiSelectedModel,
    userModel: morpheusOverride?.model,
    requirement: morpheusRequirement,
    availableModels,
    systemDefaultModel,
  })

  if (isFirstRunNoCache && !morpheusOverride?.model && !uiSelectedModel) {
    morpheusResolution = getFirstFallbackModel(morpheusRequirement)
  }

  if (!morpheusResolution) return undefined
  const { model: morpheusModel, variant: morpheusResolvedVariant } = morpheusResolution

  let morpheusConfig = createMorpheusAgent(
    morpheusModel,
    availableAgents,
    availableToolNames,
    availableSkills,
    availableCategories,
    useTaskSystem
  )

  if (morpheusResolvedVariant) {
    morpheusConfig = { ...morpheusConfig, variant: morpheusResolvedVariant }
  }

  morpheusConfig = applyOverrides(morpheusConfig, morpheusOverride, mergedCategories)

  return morpheusConfig
}
