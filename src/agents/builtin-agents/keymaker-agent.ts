import type { AgentConfig } from "@opencode-ai/sdk"
import type { CategoryConfig } from "../../config/schema"
import { getAgentModelRequirements, isAnyProviderConnected } from "../../shared"
import type { AvailableAgent, AvailableCategory, AvailableSkill } from "../dynamic-agent-prompt-builder"
import { createKeymakerAgent } from "../keymaker"
import type { AgentOverrides } from "../types"
import { applyCategoryOverride, mergeAgentConfig } from "./agent-overrides"
import { applyModelResolution, getFirstFallbackModel } from "./model-resolution"

export function maybeCreateKeymakerConfig(input: {
  disabledAgents: string[]
  agentOverrides: AgentOverrides
  globalOverrideModel?: string
  availableModels: Set<string>
  systemDefaultModel?: string
  isFirstRunNoCache: boolean
  availableAgents: AvailableAgent[]
  availableSkills: AvailableSkill[]
  availableCategories: AvailableCategory[]
  mergedCategories: Record<string, CategoryConfig>
  directory?: string
  useTaskSystem: boolean
  availableToolNames: string[]
}): AgentConfig | undefined {
  const {
    disabledAgents,
    agentOverrides,
    globalOverrideModel,
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

  if (disabledAgents.includes("keymaker")) return undefined

  const keymakerOverride = agentOverrides.keymaker
  const agentRequirements = getAgentModelRequirements()
  const keymakerRequirement = agentRequirements.keymaker
  const hasKeymakerExplicitConfig = keymakerOverride !== undefined

  const hasRequiredProvider =
    !keymakerRequirement?.requiresProvider ||
    hasKeymakerExplicitConfig ||
    isFirstRunNoCache ||
    isAnyProviderConnected(keymakerRequirement.requiresProvider, availableModels)

  if (!hasRequiredProvider) return undefined

  let keymakerResolution = applyModelResolution({
    globalOverrideModel,
    userModel: keymakerOverride?.model,
    requirement: keymakerRequirement,
    availableModels,
    systemDefaultModel,
  })

  if (isFirstRunNoCache && !keymakerOverride?.model) {
    keymakerResolution = getFirstFallbackModel(keymakerRequirement)
  }

  if (!keymakerResolution) return undefined
  const { model: keymakerModel, variant: keymakerResolvedVariant } = keymakerResolution

  let keymakerConfig = createKeymakerAgent(
    keymakerModel,
    availableAgents,
    availableToolNames,
    availableSkills,
    availableCategories,
    useTaskSystem
  )

  keymakerConfig = { ...keymakerConfig, variant: keymakerResolvedVariant ?? "medium" }

  const keymakerOverrideCategory = (keymakerOverride as Record<string, unknown> | undefined)?.category as string | undefined
  if (keymakerOverrideCategory) {
    keymakerConfig = applyCategoryOverride(keymakerConfig, keymakerOverrideCategory, mergedCategories)
  }


  if (keymakerOverride) {
    keymakerConfig = mergeAgentConfig(keymakerConfig, keymakerOverride)
  }
  return keymakerConfig
}
