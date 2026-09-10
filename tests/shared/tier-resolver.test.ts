import { beforeAll, describe, expect, it } from "bun:test"

let resolveTier: typeof import("../../src/shared/tier-resolver").resolveTier
let parseTierReference: typeof import("../../src/shared/tier-resolver").parseTierReference
let buildTierSpecs: typeof import("../../src/shared/model-tiers").buildTierSpecs
let getTierNames: typeof import("../../src/shared/model-tiers").getTierNames
let getTierSpec: typeof import("../../src/shared/model-tiers").getTierSpec

// fixture: synthetic tier config with 5 tiers — no literals are canonical, just test doubles
function makeTestConfig() {
  return {
    tiers: {
      free: {
        providerPriority: ["opencode", "xai", "opencode-go", "zai-coding-plan"],
        modelPattern: "-free$|kimi-k2\\.5-free|minimax-m2\\.5-free|grok-code-fast",
        fallback: [
          { providers: ["opencode"], model: "kimi-k2.5-free" },
          { providers: ["xai"], model: "grok-code-fast-1" },
        ],
      },
      fast: {
        providerPriority: ["anthropic", "openai", "google", "opencode-go"],
        modelPattern: "claude-haiku|gpt-5-nano|gemini-2\\.5-flash|deepseek-v4-flash",
        fallback: [{ providers: ["anthropic"], model: "claude-haiku-4-5" }],
        fallbackTier: "free",
      },
      standard: {
        providerPriority: ["anthropic", "openai", "google", "opencode-go"],
        modelPattern: "claude-sonnet|gpt-5\\.2|gemini-2\\.5-pro",
        fallback: [{ providers: ["anthropic"], model: "claude-sonnet-4-6" }],
        fallbackTier: "fast",
      },
      premium: {
        providerPriority: ["anthropic", "openai", "google", "opencode-go"],
        modelPattern: "claude-opus|gpt-5\\.3-codex|gemini-3-pro",
        fallback: [{ providers: ["anthropic"], model: "claude-opus-4-6" }],
        fallbackTier: "standard",
      },
      frontier: {
        providerPriority: ["anthropic", "openai", "google", "opencode-go"],
        modelPattern: "claude-opus|gpt-5\\.3-codex|gemini-3\\.1-pro",
        fallback: [{ providers: ["anthropic"], model: "claude-opus-4-6" }],
        fallbackTier: "premium",
      },
    },
  }
}

beforeAll(async () => {
  ;({ resolveTier, parseTierReference } = await import("../../src/shared/tier-resolver"))
  ;({ buildTierSpecs, getTierNames, getTierSpec } = await import("../../src/shared/model-tiers"))
})

describe("resolveTier", () => {
  describe("free tier", () => {
    it("#given available models with kimi-free #when resolveTier('free') #then picks opencode/kimi-k2.5-free", () => {
      //#given
      const config = makeTestConfig() as never
      const available = new Set([
        "opencode/kimi-k2.5-free",
        "anthropic/claude-opus-4-6",
        "openai/gpt-5.2",
      ])

      //#when
      const result = resolveTier("free", { availableModels: available, connectedProviders: null }, config)

      //#then
      expect(result?.model).toBe("opencode/kimi-k2.5-free")
      expect(result?.provenance).toBe("tier-resolved")
      expect(result?.tier).toBe("free")
    })

    it("#given no live models but opencode is connected #when resolveTier('free') #then uses fallback", () => {
      //#given
      const config = makeTestConfig() as never
      const available = new Set<string>()

      //#when
      const result = resolveTier("free", {
        availableModels: available,
        connectedProviders: ["opencode"],
      }, config)

      //#then
      expect(result?.model).toBe("opencode/kimi-k2.5-free")
      expect(result?.provenance).toBe("tier-static-fallback")
    })

    it("#given no live models and no connected providers #when resolveTier('free') #then returns null (no fallback match)", () => {
      //#given
      const config = makeTestConfig() as never
      const available = new Set<string>()

      //#when
      const result = resolveTier("free", {
        availableModels: available,
        connectedProviders: [],
      }, config)

      //#then - no fallback provider is connected
      expect(result).toBeNull()
    })

    it("#given empty config #when resolveTier('free') #then returns null gracefully", () => {
      //#given
      const available = new Set(["opencode/kimi-k2.5-free"])
      //#when
      const result = resolveTier("free", { availableModels: available, connectedProviders: null }, {} as never)
      //#then
      expect(result).toBeNull()
    })
  })

  describe("premium tier", () => {
    it("#given anthropic + openai connected with claude-opus #when resolveTier('premium') #then picks anthropic/claude-opus-4-6 (provider priority)", () => {
      //#given
      const config = makeTestConfig() as never
      const available = new Set([
        "anthropic/claude-opus-4-6",
        "openai/gpt-5.3-codex",
        "openai/gpt-5.2",
      ])

      //#when
      const result = resolveTier("premium", {
        availableModels: available,
        connectedProviders: ["anthropic", "openai"],
      }, config)

      //#then
      expect(result?.model).toBe("anthropic/claude-opus-4-6")
      expect(result?.provenance).toBe("tier-resolved")
    })

    it("#given only openai connected #when resolveTier('premium') #then picks openai/gpt-5.3-codex (cross-provider)", () => {
      //#given
      const config = makeTestConfig() as never
      const available = new Set(["openai/gpt-5.3-codex", "openai/gpt-5.2"])

      //#when
      const result = resolveTier("premium", {
        availableModels: available,
        connectedProviders: ["openai"],
      }, config)

      //#then
      expect(result?.model).toBe("openai/gpt-5.3-codex")
    })

    it("#given only sonnet is available (no opus) #when resolveTier('premium') #then recurses to 'standard' tier", () => {
      //#given
      const config = makeTestConfig() as never
      const available = new Set([
        "anthropic/claude-sonnet-4-6",
        "openai/gpt-5.2",
      ])

      //#when
      const result = resolveTier("premium", {
        availableModels: available,
        connectedProviders: ["anthropic", "openai"],
      }, config)

      //#then - falls through to standard tier (premium.fallbackTier === "standard")
      expect(result?.model).toBe("anthropic/claude-sonnet-4-6")
      expect(result?.tier).toBe("standard")
    })

    it("#given newer claude-opus-4-7 model #when resolveTier('premium') #then regex matches automatically (no code change needed)", () => {
      //#given - simulating a future OpenCode lineup
      const config = makeTestConfig() as never
      const available = new Set(["anthropic/claude-opus-4-7"])

      //#when
      const result = resolveTier("premium", {
        availableModels: available,
        connectedProviders: ["anthropic"],
      }, config)

      //#then
      expect(result?.model).toBe("anthropic/claude-opus-4-7")
    })
  })

  describe("frontier tier", () => {
    it("#given anthropic opus + gpt-5.3-codex #when resolveTier('frontier') #then picks claude-opus (provider priority)", () => {
      //#given
      const config = makeTestConfig() as never
      const available = new Set([
        "anthropic/claude-opus-4-6",
        "openai/gpt-5.3-codex",
      ])

      //#when
      const result = resolveTier("frontier", {
        availableModels: available,
        connectedProviders: ["anthropic", "openai"],
      }, config)

      //#then
      expect(result?.model).toBe("anthropic/claude-opus-4-6")
    })
  })

  describe("fast tier", () => {
    it("#given haiku + gpt-5-nano #when resolveTier('fast') #then picks haiku (provider priority)", () => {
      //#given
      const config = makeTestConfig() as never
      const available = new Set([
        "anthropic/claude-haiku-4-5",
        "openai/gpt-5-nano",
      ])

      //#when
      const result = resolveTier("fast", {
        availableModels: available,
        connectedProviders: ["anthropic", "openai"],
      }, config)

      //#then
      expect(result?.model).toBe("anthropic/claude-haiku-4-5")
    })
  })

  describe("invalid tier", () => {
    it("#given an unknown tier name #when resolveTier #then returns null", () => {
      //#given
      const config = makeTestConfig() as never
      const available = new Set(["anthropic/claude-opus-4-6"])

      //#when
      //#ts-expect-error testing invalid input
      const result = resolveTier("nonexistent" as never, {
        availableModels: available,
        connectedProviders: ["anthropic"],
      }, config)

      //#then
      expect(result).toBeNull()
    })
  })
})

describe("parseTierReference", () => {
  it("#given 'tier:premium' #when parsed #then returns 'premium'", () => {
    //#given / #when
    const config = makeTestConfig() as never
    const result = parseTierReference("tier:premium", config)

    //#then
    expect(result).toBe("premium")
  })

  it("#given 'tier:STANDARD' (uppercase) #when parsed #then returns 'standard' (lowercased)", () => {
    //#given / #when
    const config = makeTestConfig() as never
    const result = parseTierReference("tier:STANDARD", config)

    //#then
    expect(result).toBe("standard")
  })

  it("#given a plain model string #when parsed #then returns null", () => {
    //#given / #when
    const config = makeTestConfig() as never
    const result = parseTierReference("anthropic/claude-opus-4-6", config)

    //#then
    expect(result).toBeNull()
  })

  it("#given an unknown tier name #when parsed #then returns null", () => {
    //#given / #when
    const config = makeTestConfig() as never
    const result = parseTierReference("tier:unknown", config)

    //#then
    expect(result).toBeNull()
  })

  it("#given undefined input #when parsed #then returns null", () => {
    //#given / #when
    const config = makeTestConfig() as never
    const result = parseTierReference(undefined, config)

    //#then
    expect(result).toBeNull()
  })

  it("#given empty config #when parsed #then returns null", () => {
    //#given / #when
    const result = parseTierReference("tier:premium", {} as never)
    //#then
    expect(result).toBeNull()
  })
})

describe("buildTierSpecs config-driven", () => {
  it("#given the registry #when iterated #then contains all 5 tiers via config", () => {
    //#given
    const config = makeTestConfig() as never
    //#then
    const names = getTierNames(config)
    expect(names).toContain("free")
    expect(names).toContain("fast")
    expect(names).toContain("standard")
    expect(names).toContain("premium")
    expect(names).toContain("frontier")
    expect(names).toHaveLength(5)
  })

  it("#given the registry #when each spec is examined #then every spec has required fields", () => {
    //#given
    const config = makeTestConfig() as never
    const specs = buildTierSpecs(config)
    //#then
    for (const [name, spec] of Object.entries(specs)) {
      expect(spec.name).toBe(name)
      expect(spec.providerPriority).toBeInstanceOf(Array)
      expect(spec.providerPriority.length).toBeGreaterThan(0)
      expect(spec.modelPattern).toBeInstanceOf(RegExp)
      expect(spec.fallback).toBeInstanceOf(Array)
      expect(spec.fallback!.length).toBeGreaterThan(0)
    }
  })

  it("#given empty config #when buildTierSpecs({}) #then returns {}", () => {
    //#then
    expect(buildTierSpecs({} as never)).toEqual({})
  })

  it("#given empty config #when getTierSpec('fast', {}) #then returns undefined", () => {
    //#then
    expect(getTierSpec("fast", {} as never)).toBeUndefined()
  })

  it("#given invalid regex #when buildTierSpecs #then pattern never matches", () => {
    //#given
    const config = { tiers: { bad: { providerPriority: ["provider-a"], modelPattern: "[invalid" } } } as never
    //#when
    const spec = getTierSpec("bad", config)
    //#then
    expect(spec?.modelPattern.test("provider-a/anything")).toBe(false)
  })
})
