import type { AgentConfig } from "@opencode-ai/sdk"

/**
 * Agent mode determines UI model selection behavior:
 * - "primary": Respects user's UI-selected model (morpheus, architect)
 * - "subagent": Uses own fallback chain, ignores UI selection (merovingian, trinity, etc.)
 * - "all": Available in both contexts (OpenCode compatibility)
 */
export type AgentMode = "primary" | "subagent" | "all"

/**
 * Agent factory function with static mode property.
 * Mode is exposed as static property for pre-instantiation access.
 */
export type AgentFactory = ((model: string) => AgentConfig) & {
  mode: AgentMode
}

/**
 * Agent category for grouping in Morpheus prompt sections
 */
type AgentCategory = "exploration" | "specialist" | "advisor" | "utility"

/**
 * Cost classification for Tool Selection table
 */
type AgentCost = "FREE" | "CHEAP" | "EXPENSIVE"

/**
 * Delegation trigger for Morpheus prompt's Delegation Table
 */
interface DelegationTrigger {
  /** Domain of work (e.g., "Frontend UI/UX") */
  domain: string
  /** When to delegate (e.g., "Visual changes only...") */
  trigger: string
}

/**
 * Metadata for generating Morpheus prompt sections dynamically
 * This allows adding/removing agents without manually updating the Morpheus prompt
 */
export interface AgentPromptMetadata {
  /** Category for grouping in prompt sections */
  category: AgentCategory

  /** Cost classification for Tool Selection table */
  cost: AgentCost

  /** Domain triggers for Delegation Table */
  triggers: DelegationTrigger[]

  /** When to use this agent (for detailed sections) */
  useWhen?: string[]

  /** When NOT to use this agent */
  avoidWhen?: string[]

  /** Optional dedicated prompt section (markdown) - for agents like Oracle that have special sections */
  dedicatedSection?: string

  /** Nickname/alias used in prompt (e.g., "Consultant" instead of "merovingian") */
  promptAlias?: string

  /** Key triggers that should appear in Phase 0 (e.g., "External library mentioned → fire librarian") */
  keyTrigger?: string
}

function extractModelName(model: string): string {
  return model.includes("/") ? model.split("/").pop() ?? model : model
}

const GPT_MODEL_PREFIXES = ["gpt-", "gpt4", "o1", "o3", "o4"]

export function isGptModel(model: string): boolean {
  if (!model || typeof model !== "string") return false;
  if (model.startsWith("openai/") || model.startsWith("github-copilot/gpt-"))
    return true

  const modelName = extractModelName(model).toLowerCase()
  return GPT_MODEL_PREFIXES.some((prefix) => modelName.startsWith(prefix))
}

const ANTHROPIC_INDICATORS = ["anthropic", "claude"]

/**
 * Detect Anthropic/Claude models by provider or model name.
 * Matches: "<provider>/<model>" e.g., provider/model strings containing relevant indicators — replace with live model from provider.list
 */
export function isAnthropicModel(model: string): boolean {
  if (!model || typeof model !== "string") return false;
  const lowered = model.toLowerCase()
  return ANTHROPIC_INDICATORS.some((indicator) => lowered.includes(indicator))
}

const QWEN_INDICATORS = ["qwen"]

export function isQwenModel(model: string): boolean {
  if (!model || typeof model !== "string") return false;
  const modelName = extractModelName(model).toLowerCase()
  return QWEN_INDICATORS.some((indicator) => modelName.startsWith(indicator))
}

const MIMO_INDICATORS = ["mimo"]

export function isMimoModel(model: string): boolean {
  if (!model || typeof model !== "string") return false;
  const modelName = extractModelName(model).toLowerCase()
  return MIMO_INDICATORS.some((indicator) => modelName.startsWith(indicator))
}

const DEEPSEEK_INDICATORS = ["deepseek"]

export function isDeepSeekModel(model: string): boolean {
  if (!model || typeof model !== "string") return false;
  const modelName = extractModelName(model).toLowerCase()
  return DEEPSEEK_INDICATORS.some((indicator) => modelName.startsWith(indicator))
}

export type BuiltinAgentName =
  | "morpheus"
  | "keymaker"
  | "oracle"
  | "merovingian"
  | "operator"
  | "trinity"
  | "construct"
  | "seraph"
  | "smith"
  | "architect"
  | "cipher"
  | "sentinel"
  | "sati"
  | "bdd-contract"

type OverridableAgentName =
  | "build"
  | BuiltinAgentName

export type AgentName = BuiltinAgentName

export type AgentOverrideConfig = Partial<AgentConfig> & {
  prompt_append?: string
  variant?: string
  fallbackChain?: { providers: string[]; model: string; variant?: string }[]
}

export type AgentOverrides = Partial<Record<OverridableAgentName, AgentOverrideConfig>>
