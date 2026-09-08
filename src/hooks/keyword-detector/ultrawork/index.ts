/**
 * Ultrawork message module - routes to appropriate message based on agent/model.
 *
 * Routing:
 * 1. Planner agents (oracle, plan) → planner.ts
 * 2. DeepSeek models → deepseek.ts
 * 3. Mimo models → mimo.ts
 * 4. GPT models → gpt5.2.ts
 * 5. Gemini models → gemini.ts
 * 6. GLM models → glm.ts
 * 7. Default (Claude, etc.) → default.ts
 */

export { getDeepseekUltraworkMessage, ULTRAWORK_DEEPSEEK_MESSAGE } from "./deepseek"
export { getDefaultUltraworkMessage, ULTRAWORK_DEFAULT_MESSAGE } from "./default"
export { getGeminiUltraworkMessage, ULTRAWORK_GEMINI_MESSAGE } from "./gemini"
export { getGlmUltraworkMessage, ULTRAWORK_GLM_MESSAGE } from "./glm"
export { getGptUltraworkMessage, ULTRAWORK_GPT_MESSAGE } from "./gpt5.2"
export { getMimoUltraworkMessage, ULTRAWORK_MIMO_MESSAGE } from "./mimo"
export { getPlannerUltraworkMessage, ULTRAWORK_PLANNER_SECTION } from "./planner"
export type { UltraworkSource } from "./source-detector"
export { getUltraworkSource, isDeepseekModel, isGeminiModel, isGlmModel, isGptModel, isMimoModel, isNonOmoAgent, isPlannerAgent } from "./source-detector"

import { getDeepseekUltraworkMessage } from "./deepseek"
import { getDefaultUltraworkMessage } from "./default"
import { getGeminiUltraworkMessage } from "./gemini"
import { getGlmUltraworkMessage } from "./glm"
import { getGptUltraworkMessage } from "./gpt5.2"
import { getMimoUltraworkMessage } from "./mimo"
import { getPlannerUltraworkMessage } from "./planner"
import { getUltraworkSource } from "./source-detector"

/**
 * Gets the appropriate ultrawork message based on agent and model context.
 */
export function getUltraworkMessage(agentName?: string, modelID?: string): string {
  const source = getUltraworkSource(agentName, modelID)

  switch (source) {
    case "planner":
      return getPlannerUltraworkMessage()
    case "deepseek":
      return getDeepseekUltraworkMessage()
    case "mimo":
      return getMimoUltraworkMessage()
    case "gpt":
      return getGptUltraworkMessage()
    case "gemini":
      return getGeminiUltraworkMessage()
    case "glm":
      return getGlmUltraworkMessage()
    default:
      return getDefaultUltraworkMessage()
  }
}
