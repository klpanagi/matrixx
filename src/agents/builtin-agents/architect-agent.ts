import type { AgentConfig } from "@opencode-ai/sdk"
import type { CategoriesConfig, CategoryConfig } from "../../config/schema"
import { getAgentModelRequirements } from "../../shared/model-requirements"
import { createArchitectAgent } from "../architect"
import type { AvailableAgent, AvailableSkill } from "../dynamic-agent-prompt-builder"
import type { AgentOverrides } from "../types"
import { applyOverrides } from "./agent-overrides"
import { applyModelResolution } from "./model-resolution"

export function maybeCreateArchitectConfig(input: {
  disabledAgents: string[]
  agentOverrides: AgentOverrides
  globalOverrideModel?: string
  uiSelectedModel?: string
  availableModels: Set<string>
  systemDefaultModel?: string
  availableAgents: AvailableAgent[]
  availableSkills: AvailableSkill[]
  mergedCategories: Record<string, CategoryConfig>
  directory?: string
  userCategories?: CategoriesConfig
  useTaskSystem?: boolean
}): AgentConfig | undefined {
  const {
    disabledAgents,
    agentOverrides,
    globalOverrideModel,
    uiSelectedModel,
    availableModels,
    systemDefaultModel,
    availableAgents,
    availableSkills,
    mergedCategories,
    directory,
    userCategories,
  } = input


  if (disabledAgents.includes("architect")) return undefined

  const orchestratorOverride = agentOverrides.architect
  const agentRequirements = getAgentModelRequirements()
  const architectRequirement = agentRequirements.architect

  const architectResolution = applyModelResolution({
    globalOverrideModel,
    uiSelectedModel: orchestratorOverride?.model ? undefined : uiSelectedModel,
    userModel: orchestratorOverride?.model,
    requirement: architectRequirement,
    availableModels,
    systemDefaultModel,
  })

  if (!architectResolution) return undefined
  const { model: architectModel, variant: architectResolvedVariant } = architectResolution

  let orchestratorConfig = createArchitectAgent({
    model: architectModel,
    availableAgents,
    availableSkills,
    userCategories,
  })

  if (architectResolvedVariant) {
    orchestratorConfig = { ...orchestratorConfig, variant: architectResolvedVariant }
  }

  orchestratorConfig = applyOverrides(orchestratorConfig, orchestratorOverride, mergedCategories, directory)

  return orchestratorConfig
}
