import type { AgentConfig } from "@opencode-ai/sdk"
import type { BrowserAutomationProvider, CategoryConfig } from "../../config/schema"
import { getAgentModelRequirements, isModelAvailable } from "../../shared"
import type { ModelRequirement } from "../../shared/model-requirements"
import { buildAgent, isFactory } from "../agent-builder"
import type { AvailableAgent } from "../dynamic-agent-prompt-builder"
import type { AgentOverrides, AgentPromptMetadata, BuiltinAgentName } from "../types"
import { applyOverrides } from "./agent-overrides"
import { applyModelResolution, getFirstFallbackModel } from "./model-resolution"

export function collectPendingBuiltinAgents(input: {
  agentSources: Partial<Record<BuiltinAgentName, import("../agent-builder").AgentSource>>
  agentMetadata: Partial<Record<BuiltinAgentName, AgentPromptMetadata>>
  disabledAgents: string[]
  agentOverrides: AgentOverrides
  globalOverrideModel?: string
  directory?: string
  systemDefaultModel?: string
  mergedCategories: Record<string, CategoryConfig>
  browserProvider?: BrowserAutomationProvider
  uiSelectedModel?: string
  availableModels: Set<string>
  disabledSkills?: Set<string>
  useTaskSystem?: boolean
}): { pendingAgentConfigs: Map<string, AgentConfig>; availableAgents: AvailableAgent[] } {
  const {
    agentSources,
    agentMetadata,
    disabledAgents,
    agentOverrides,
    globalOverrideModel,
    directory,
    systemDefaultModel,
    mergedCategories,
    browserProvider,
    uiSelectedModel,
    availableModels,
    disabledSkills,
  } = input

  const availableAgents: AvailableAgent[] = []
  const pendingAgentConfigs: Map<string, AgentConfig> = new Map()

  for (const [name, source] of Object.entries(agentSources)) {
    const agentName = name as BuiltinAgentName

    // oracle is built dynamically, not in agentSources
    if (!source) continue
    if (agentName === "morpheus") continue
    if (agentName === "keymaker") continue
    if (agentName === "architect") continue
    if (disabledAgents.some((name) => name.toLowerCase() === agentName.toLowerCase())) continue

    const override = agentOverrides[agentName]
      ?? Object.entries(agentOverrides).find(([key]) => key.toLowerCase() === agentName.toLowerCase())?.[1]
    const agentRequirements = getAgentModelRequirements()
    const baseRequirement = agentRequirements[agentName]
    const requirement: ModelRequirement | undefined = override?.fallbackChain
      ? { ...baseRequirement, fallbackChain: override.fallbackChain }
      : baseRequirement

    // Check if agent requires a specific model
    if (requirement?.requiresModel && availableModels) {
      if (!isModelAvailable(requirement.requiresModel, availableModels)) {
        continue
      }
    }

    const isPrimaryAgent = isFactory(source) && source.mode === "primary"

    const resolution = applyModelResolution({
      globalOverrideModel,
      uiSelectedModel: (isPrimaryAgent && !override?.model) ? uiSelectedModel : undefined,
      userModel: override?.model,
      requirement,
      availableModels,
      systemDefaultModel,
    })
    const fallbackResolution = resolution ?? getFirstFallbackModel(requirement)
    if (!fallbackResolution) continue
    const { model, variant: resolvedVariant } = fallbackResolution

    let config = buildAgent(source, model, mergedCategories, browserProvider, disabledSkills)

    // Apply resolved variant from model fallback chain
    if (resolvedVariant) {
      config = { ...config, variant: resolvedVariant }
    }



    config = applyOverrides(config, override, mergedCategories, directory)

    // Store for later - will be added after morpheus and keymaker
    pendingAgentConfigs.set(name, config)

    const metadata = agentMetadata[agentName]
    if (metadata) {
      availableAgents.push({
        name: agentName,
        description: config.description ?? "",
        metadata,
      })
    }
  }

  // Oracle is dynamically built (not in agentSources), so inject manually for Morpheus delegation
  const oracleMetadata = agentMetadata.oracle
  if (oracleMetadata) {
    availableAgents.push({
      name: "oracle",
      description:
        "Plan Builder agent. Creates detailed, structured work plans from user requests. (Oracle - Matrixx)",
      metadata: oracleMetadata,
    })
  }

  return { pendingAgentConfigs, availableAgents }
}
