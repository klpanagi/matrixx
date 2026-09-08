import { describe, expect, test } from "bun:test"
import {
  getUltraworkSource,
  isDeepseekModel,
  isGeminiModel,
  isGlmModel,
  isNonOmoAgent,
  isPlannerAgent,
} from "../../../../src/hooks/keyword-detector/ultrawork/source-detector"

describe("isDeepseekModel", () => {
  test("matches official API ID", () => {
    expect(isDeepseekModel("deepseek-v4-flash")).toBe(true)
  })

  test("matches OpenRouter format", () => {
    expect(isDeepseekModel("deepseek/deepseek-v4-flash")).toBe(true)
    expect(isDeepseekModel("deepseek/deepseek-v4")).toBe(true)
  })

  test("matches HuggingFace format", () => {
    expect(isDeepseekModel("deepseek-ai/DeepSeek-V4-Flash")).toBe(true)
  })

  test("rejects non-DeepSeek models", () => {
    expect(isDeepseekModel("gpt-5.2")).toBe(false)
    expect(isDeepseekModel("claude-opus-4-6")).toBe(false)
    expect(isDeepseekModel("gemini-2.5-pro")).toBe(false)
  })

  test("is case insensitive", () => {
    expect(isDeepseekModel("DEEPSEEK-V4-FLASH")).toBe(true)
    expect(isDeepseekModel("DeepSeek/deepseek-v4-flash")).toBe(true)
  })
})

describe("isGeminiModel", () => {
  test("matches gemini- prefix", () => {
    expect(isGeminiModel("gemini-2.5-pro")).toBe(true)
    expect(isGeminiModel("gemini-3.1-pro")).toBe(true)
  })

  test("matches gemini/ in path format", () => {
    expect(isGeminiModel("google/gemini-2.5-pro")).toBe(true)
  })

  test("rejects non-Gemini models", () => {
    expect(isGeminiModel("gpt-5.2")).toBe(false)
    expect(isGeminiModel("claude-opus-4-6")).toBe(false)
  })

  test("is case insensitive", () => {
    expect(isGeminiModel("GEMINI-2.5-PRO")).toBe(true)
  })
})

describe("isGlmModel", () => {
  test("matches glm- prefix", () => {
    expect(isGlmModel("glm-5")).toBe(true)
    expect(isGlmModel("glm-4.7-free")).toBe(true)
  })

  test("matches glm/ in path format", () => {
    expect(isGlmModel("zhipu/glm-5")).toBe(true)
  })

  test("rejects non-GLM models", () => {
    expect(isGlmModel("gpt-5.2")).toBe(false)
    expect(isGlmModel("claude-opus-4-6")).toBe(false)
  })
})

describe("isNonOmoAgent", () => {
  test("detects builder agents", () => {
    expect(isNonOmoAgent("builder")).toBe(true)
    expect(isNonOmoAgent("openCode-builder")).toBe(true)
    expect(isNonOmoAgent("Builder")).toBe(true)
  })

  test("detects plan agent", () => {
    expect(isNonOmoAgent("plan")).toBe(true)
    expect(isNonOmoAgent("Plan")).toBe(true)
  })

  test("rejects matrixx agents", () => {
    expect(isNonOmoAgent("morpheus")).toBe(false)
    expect(isNonOmoAgent("oracle")).toBe(false)
    expect(isNonOmoAgent("trinity")).toBe(false)
  })

  test("returns false for undefined/empty", () => {
    expect(isNonOmoAgent(undefined)).toBe(false)
    expect(isNonOmoAgent("")).toBe(false)
  })
})

describe("isPlannerAgent", () => {
  test("detects oracle agent", () => {
    expect(isPlannerAgent("oracle")).toBe(true)
    expect(isPlannerAgent("Oracle")).toBe(true)
  })

  test("detects planner in agent name", () => {
    expect(isPlannerAgent("planner")).toBe(true)
    expect(isPlannerAgent("Oracle (Planner)")).toBe(true)
  })

  test("detects plan token", () => {
    expect(isPlannerAgent("Plan Agent")).toBe(true)
    expect(isPlannerAgent("plan-creator")).toBe(true)
  })

  test("rejects non-planner agents", () => {
    expect(isPlannerAgent("morpheus")).toBe(false)
    expect(isPlannerAgent("trinity")).toBe(false)
  })

  test("returns false for undefined/empty", () => {
    expect(isPlannerAgent(undefined)).toBe(false)
    expect(isPlannerAgent("")).toBe(false)
  })
})

describe("getUltraworkSource", () => {
  // Priority 1: Planner agents (overrides model)
  test("returns planner for oracle agent regardless of model", () => {
    expect(getUltraworkSource("oracle", "deepseek-v4-flash")).toBe("planner")
    expect(getUltraworkSource("oracle", "mimo-v2.5")).toBe("planner")
    expect(getUltraworkSource("oracle", "gpt-5.2")).toBe("planner")
  })

  // Priority 2: DeepSeek
  test("returns deepseek for deepseek model", () => {
    expect(getUltraworkSource(undefined, "deepseek-v4-flash")).toBe("deepseek")
    expect(getUltraworkSource(undefined, "deepseek/deepseek-v4-flash")).toBe("deepseek")
  })

  // Priority 3: Mimo
  test("returns mimo for mimo model", () => {
    expect(getUltraworkSource(undefined, "mimo-v2.5")).toBe("mimo")
    expect(getUltraworkSource(undefined, "opencode-go/mimo-v2.5")).toBe("mimo")
  })

  // Priority 4: GPT
  test("returns gpt for GPT model", () => {
    expect(getUltraworkSource(undefined, "gpt-5.2")).toBe("gpt")
    expect(getUltraworkSource(undefined, "openai/gpt-5.2")).toBe("gpt")
  })

  // Priority 5: Gemini
  test("returns gemini for Gemini model", () => {
    expect(getUltraworkSource(undefined, "gemini-2.5-pro")).toBe("gemini")
  })

  // Priority 6: GLM
  test("returns glm for GLM model", () => {
    expect(getUltraworkSource(undefined, "glm-5")).toBe("glm")
  })

  // Default
  test("returns default for unknown models", () => {
    expect(getUltraworkSource(undefined, "claude-opus-4-6")).toBe("default")
    expect(getUltraworkSource(undefined, "anthropic/claude-sonnet-4-6")).toBe("default")
  })

  test("returns default when no model or agent provided", () => {
    expect(getUltraworkSource(undefined, undefined)).toBe("default")
  })

  // Routing priority: deepseek before mimo
  test("deepseek has priority over mimo when both match", () => {
    // Model IDs that might match both patterns
    expect(getUltraworkSource(undefined, "deepseek/mimo")).toBe("deepseek")
  })

  // Routing priority: mimo before GPT  
  test("mimo has priority over GPT when both match", () => {
    expect(getUltraworkSource(undefined, "mimo-gpt")).toBe("mimo")
  })
})
