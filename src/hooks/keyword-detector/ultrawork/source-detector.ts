/**
 * Agent/model detection utilities for ultrawork message routing.
 *
 * Routing logic:
 * 1. Planner agents (oracle, plan) → planner.ts
 * 2. DeepSeek models → deepseek.ts
 * 3. Mimo models → mimo.ts
 * 4. GPT models → gpt5.2.ts
 * 5. Gemini models → gemini.ts
 * 6. GLM models → glm.ts
 * 7. Everything else (Claude, etc.) → default.ts
 */

import { isGptModel, isMimoModel } from "../../../agents/types"

/**
 * Checks if agent is a planner-type agent.
 * Planners don't need ultrawork injection (they ARE the planner).
 */
export function isPlannerAgent(agentName?: string): boolean {
  if (!agentName) return false
  const lowerName = agentName.toLowerCase()
  if (lowerName.includes("oracle") || lowerName.includes("planner")) return true

  const normalized = lowerName.replace(/[_-]+/g, " ")
  return /\bplan\b/.test(normalized)
}

/**
 * Checks if agent is a non-Matrixx agent (e.g., OpenCode's built-in Builder/Plan).
 * Non-Matrixx agents should not receive ultrawork injection.
 */
export function isNonOmoAgent(agentName?: string): boolean {
  if (!agentName) return false
  const lowerName = agentName.toLowerCase()
  return lowerName.includes("builder") || lowerName === "plan"
}

export { isGptModel, isMimoModel }

/** Gemini model detection */
const GEMINI_MODEL_PREFIXES = ["gemini-", "gemini/"]

export function isGeminiModel(model: string): boolean {
  const modelName = model.includes("/") ? model.split("/").pop() ?? model : model
  return GEMINI_MODEL_PREFIXES.some((prefix) => modelName.toLowerCase().startsWith(prefix))
}

/** GLM model detection */
const GLM_MODEL_PREFIXES = ["glm-", "glm/"]

export function isGlmModel(model: string): boolean {
  const modelName = model.includes("/") ? model.split("/").pop() ?? model : model
  return GLM_MODEL_PREFIXES.some((prefix) => modelName.toLowerCase().startsWith(prefix))
}

/** DeepSeek model detection */
const DEEPSEEK_INDICATORS = ["deepseek"]

export function isDeepseekModel(model: string): boolean {
  const lowered = model.toLowerCase()
  return DEEPSEEK_INDICATORS.some((indicator) => lowered.includes(indicator))
}

/** Ultrawork message source type */
export type UltraworkSource = "planner" | "deepseek" | "mimo" | "gpt" | "gemini" | "glm" | "default"

/**
 * Determines which ultrawork message source to use.
 */
export function getUltraworkSource(
  agentName?: string,
  modelID?: string
): UltraworkSource {
  // Priority 1: Planner agents
  if (isPlannerAgent(agentName)) {
    return "planner"
  }

  // Priority 2: DeepSeek models
  if (modelID && isDeepseekModel(modelID)) {
    return "deepseek"
  }

  // Priority 3: Mimo models
  if (modelID && isMimoModel(modelID)) {
    return "mimo"
  }

  // Priority 4: GPT models
  if (modelID && isGptModel(modelID)) {
    return "gpt"
  }

  // Priority 5: Gemini models
  if (modelID && isGeminiModel(modelID)) {
    return "gemini"
  }

  // Priority 6: GLM models
  if (modelID && isGlmModel(modelID)) {
    return "glm"
  }

  // Default: Claude and other models
  return "default"
}
