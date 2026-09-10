/**
 * Mouse - Focused Task Executor
 *
 * Executes delegated tasks directly without spawning other agents.
 * Category-spawned executor with domain-specific configurations.
 *
 * Routing:
 * 1. GPT models (openai/*, github-copilot/gpt-*) -> gpt.ts (GPT-5.2 optimized)
 * 2. DeepSeek models (opencode-go/deepseek-*) -> deepseek.ts (DeepSeek-optimized)
 * 3. Mimo models (opencode-go/mimo-*) -> mimo.ts (Mimo-optimized)
 * 4. Qwen models (opencode-go/qwen-*) -> qwen.ts (Qwen-optimized)
 * 5. Default (Anthropic/Claude, etc.) -> default.ts (Claude-optimized)
 */

import type { AgentConfig } from "@opencode-ai/sdk"
import type { AgentOverrideConfig } from "../../config/schema"
import {
  createAgentToolRestrictions,
  type PermissionValue,
} from "../../shared/permission-compat"
import type { AgentMode } from "../types"
import {
  isAnthropicModel,
  isDeepSeekModel,
  isGptModel,
  isMimoModel,
  isQwenModel,
} from "../types"
import { buildDeepSeekMousePrompt } from "./deepseek"
import { buildDefaultMousePrompt } from "./default"
import { buildGptMousePrompt } from "./gpt"
import { buildMimoMousePrompt } from "./mimo"
import { buildQwenMousePrompt } from "./qwen"

const MODE: AgentMode = "subagent"

// Core tools that Mouse must NEVER have access to
// Note: delegate_agent is ALLOWED so subagents can spawn explore/librarian
const BLOCKED_TOOLS = ["task"]

export const MOUSE_DEFAULTS = {
  model: undefined as unknown as string, // no hardcoded model — resolved via config tiers/fallback
  temperature: 0.1,
} as const

export type MousePromptSource = "default" | "gpt" | "deepseek" | "mimo" | "qwen"

/**
 * Determines which Mouse prompt to use based on model.
 */
export function getMousePromptSource(model?: string): MousePromptSource {
  if (!model) return "default"
  if (isGptModel(model)) return "gpt"
  if (isDeepSeekModel(model)) return "deepseek"
  if (isMimoModel(model)) return "mimo"
  if (isQwenModel(model)) return "qwen"
  return "default"
}

/**
 * Builds the appropriate Mouse prompt based on model.
 */
export function buildMousePrompt(
  model: string | undefined,
  useTaskSystem: boolean,
  promptAppend?: string,
): string {
  const source = getMousePromptSource(model)

  switch (source) {
    case "gpt":
      return buildGptMousePrompt(useTaskSystem, promptAppend)
    case "deepseek":
      return buildDeepSeekMousePrompt(useTaskSystem, promptAppend)
    case "mimo":
      return buildMimoMousePrompt(useTaskSystem, promptAppend)
    case "qwen":
      return buildQwenMousePrompt(useTaskSystem, promptAppend)
    default:
      return buildDefaultMousePrompt(useTaskSystem, promptAppend)
  }
}

export function createMouseAgentWithOverrides(
  override: AgentOverrideConfig | undefined,
  systemDefaultModel?: string,
  useTaskSystem = false,
): AgentConfig {
  if (override?.disable) {
    override = undefined
  }

  const overrideModel = (override as { model?: string } | undefined)?.model
  const model = overrideModel ?? systemDefaultModel ?? MOUSE_DEFAULTS.model
  const temperature = override?.temperature ?? MOUSE_DEFAULTS.temperature

  const promptAppend = override?.prompt_append
  const prompt = buildMousePrompt(model, useTaskSystem, promptAppend)

  const baseRestrictions = createAgentToolRestrictions(BLOCKED_TOOLS)

  const userPermission = (override?.permission ?? {}) as Record<string, PermissionValue>
  const basePermission = baseRestrictions.permission
  const merged: Record<string, PermissionValue> = { ...userPermission }
  for (const tool of BLOCKED_TOOLS) {
    merged[tool] = "deny"
  }
  merged.delegate_agent = "allow"
  const toolsConfig = { permission: { ...merged, ...basePermission } }

  const base: AgentConfig = {
    description: override?.description ??
      "Focused task executor. Same discipline, no delegation. (Mouse - Matrixx)",
    mode: MODE,
    model,
    temperature,
    maxTokens: 64000,
    prompt,
    color: override?.color ?? "#20B2AA",
    ...toolsConfig,
  }

  if (override?.top_p !== undefined) {
    base.top_p = override.top_p
  }

  // Enable thinking for models that support it
  if (isGptModel(model)) {
    return { ...base, reasoningEffort: "medium" } as AgentConfig
  }

  if (isAnthropicModel(model) || isDeepSeekModel(model)) {
    return {
      ...base,
      thinking: { type: "enabled", budgetTokens: 32000 },
    } as AgentConfig
  }

  return base as AgentConfig
}

createMouseAgentWithOverrides.mode = MODE
