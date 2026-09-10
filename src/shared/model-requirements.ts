import {
  AgentModelRequirementsSchema,
  CategoryModelRequirementsSchema,
  type ModelRequirements,
} from "../config/schema/model-config"

export type FallbackEntry = {
  providers: string[]
  model: string
  variant?: string
}

export type ModelRequirement = {
  fallbackChain: FallbackEntry[]
  variant?: string
  requiresModel?: string
  requiresAnyModel?: boolean
  requiresProvider?: string[]
}

export function getAgentModelRequirements(
  config?: { modelRequirements?: ModelRequirements } | null,
): Record<string, ModelRequirement> {
  const agents = config?.modelRequirements?.agents
  if (!agents) return {}
  const result: Record<string, ModelRequirement> = {}
  for (const [key, value] of Object.entries(agents)) {
    const parsed = AgentModelRequirementsSchema.safeParse(value)
    if (parsed.success) {
      result[key] = parsed.data
    }
  }
  return result
}

export function getCategoryModelRequirements(
  config?: { modelRequirements?: ModelRequirements } | null,
): Record<string, ModelRequirement> {
  const categories = config?.modelRequirements?.categories
  if (!categories) return {}
  const result: Record<string, ModelRequirement> = {}
  for (const [key, value] of Object.entries(categories)) {
    const parsed = CategoryModelRequirementsSchema.safeParse(value)
    if (parsed.success) {
      result[key] = parsed.data
    }
  }
  return result
}
