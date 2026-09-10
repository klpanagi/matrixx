import { beforeAll, describe, expect, it } from "bun:test"
import type { TierResolverContext } from "../../src/shared/tier-resolver"
import type { MatrixxConfig } from "../../src/config/schema/matrixx-config"

let resolveTiersInConfig: typeof import("../../src/config/resolve-tiers").resolveTiersInConfig

beforeAll(async () => {
  ;({ resolveTiersInConfig } = await import("../../src/config/resolve-tiers"))
})

function buildContext(
  availableModels: string[],
  connectedProviders: string[] | null = null,
): TierResolverContext {
  return {
    availableModels: new Set(availableModels),
    connectedProviders,
  }
}

function tierConfig(): MatrixxConfig["tiers"] {
  return {
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
  } as unknown as MatrixxConfig["tiers"]
}

function withTiers(config: MatrixxConfig): MatrixxConfig {
  return { ...config, tiers: tierConfig() } as MatrixxConfig
}

describe("resolveTiersInConfig", () => {
  it("#given agent with tier='premium' #when resolved #then agent.model is set and agent.tier is cleared", () => {
    //#given
    const config: MatrixxConfig = {
      agents: { morpheus: { tier: "premium" } },
    } as MatrixxConfig

    //#when
    const result = resolveTiersInConfig(
      withTiers(config),
      buildContext(["anthropic/claude-opus-4-6"], ["anthropic"]),
    )

    //#then
    expect(result.agents?.morpheus?.model).toBe("anthropic/claude-opus-4-6")
    expect(result.agents?.morpheus?.tier).toBeUndefined()
  })

  it("#given agent with both model and tier #when resolved #then model wins (model takes precedence over tier)", () => {
    //#given
    const config: MatrixxConfig = {
      agents: {
        morpheus: { model: "anthropic/claude-opus-4-6", tier: "fast" },
      },
    } as MatrixxConfig

    //#when
    const result = resolveTiersInConfig(
      withTiers(config),
      buildContext(["anthropic/claude-opus-4-6", "anthropic/claude-haiku-4-5"], ["anthropic"]),
    )

    //#then
    expect(result.agents?.morpheus?.model).toBe("anthropic/claude-opus-4-6")
    expect(result.agents?.morpheus?.tier).toBeUndefined()
  })

  it("#given agent with tier='premium' but only sonnet is live #when resolved #then recurses to 'standard' tier and sets model to sonnet", () => {
    //#given
    const config: MatrixxConfig = {
      agents: { morpheus: { tier: "premium" } },
    } as MatrixxConfig

    //#when
    const result = resolveTiersInConfig(
      withTiers(config),
      buildContext(["anthropic/claude-sonnet-4-6"], ["anthropic"]),
    )

    //#then
    expect(result.agents?.morpheus?.model).toBe("anthropic/claude-sonnet-4-6")
    expect(result.agents?.morpheus?.tier).toBeUndefined()
  })

  it("#given category with tier='standard' #when resolved #then category.model is set", () => {
    //#given
    const config: MatrixxConfig = {
      categories: { source: { tier: "standard" } },
    } as MatrixxConfig

    //#when
    const result = resolveTiersInConfig(
      withTiers(config),
      buildContext(["anthropic/claude-sonnet-4-6"], ["anthropic"]),
    )

    //#then
    expect(result.categories?.source?.model).toBe("anthropic/claude-sonnet-4-6")
    expect(result.categories?.source?.tier).toBeUndefined()
  })

  it("#given default_tier='fast' and an agent without model or tier #when resolved #then agent inherits default_tier", () => {
    //#given
    const config: MatrixxConfig = {
      default_tier: "fast",
      agents: { trinity: {} },
    } as unknown as MatrixxConfig

    //#when
    const result = resolveTiersInConfig(
      withTiers(config),
      buildContext(["anthropic/claude-haiku-4-5"], ["anthropic"]),
    )

    //#then
    expect(result.agents?.trinity?.model).toBe("anthropic/claude-haiku-4-5")
    expect(result.agents?.trinity?.tier).toBeUndefined()
  })

  it("#given default_tier='fast' and an agent with explicit model #when resolved #then explicit model wins (default_tier does not override)", () => {
    //#given
    const config: MatrixxConfig = {
      default_tier: "fast",
      agents: { trinity: { model: "anthropic/claude-opus-4-6" } },
    } as unknown as MatrixxConfig

    //#when
    const result = resolveTiersInConfig(
      withTiers(config),
      buildContext(["anthropic/claude-opus-4-6", "anthropic/claude-haiku-4-5"], ["anthropic"]),
    )

    //#then
    expect(result.agents?.trinity?.model).toBe("anthropic/claude-opus-4-6")
  })

  it("#given default_tier='fast' and an agent with explicit tier #when resolved #then explicit tier wins (default_tier does not override)", () => {
    //#given
    const config: MatrixxConfig = {
      default_tier: "fast",
      agents: { trinity: { tier: "premium" } },
    } as unknown as MatrixxConfig

    //#when
    const result = resolveTiersInConfig(
      withTiers(config),
      buildContext(["anthropic/claude-opus-4-6", "anthropic/claude-haiku-4-5"], ["anthropic"]),
    )

    //#then
    expect(result.agents?.trinity?.model).toBe("anthropic/claude-opus-4-6")
  })

  it("#given default_tier='fast' and a category without model or tier #when resolved #then category inherits default_tier", () => {
    //#given
    const config: MatrixxConfig = {
      default_tier: "fast",
      categories: { "bullet-time": {} },
    } as unknown as MatrixxConfig

    //#when
    const result = resolveTiersInConfig(
      withTiers(config),
      buildContext(["anthropic/claude-haiku-4-5"], ["anthropic"]),
    )

    //#then
    expect(result.categories?.["bullet-time"]?.model).toBe("anthropic/claude-haiku-4-5")
  })

  it("#given default_tier is set #when resolved #then top-level default_tier is cleared from the returned config", () => {
    //#given
    const config: MatrixxConfig = {
      default_tier: "fast",
    } as unknown as MatrixxConfig

    //#when
    const result = resolveTiersInConfig(
      withTiers(config),
      buildContext(["anthropic/claude-haiku-4-5"], ["anthropic"]),
    )

    //#then
    expect((result as unknown as { default_tier?: string }).default_tier).toBeUndefined()
  })

  it("#given a config with no tier or default_tier #when resolved #then the config is returned unchanged (no spurious modifications)", () => {
    //#given
    const config: MatrixxConfig = {
      agents: { morpheus: { model: "anthropic/claude-opus-4-6" } },
    } as MatrixxConfig

    //#when
    const result = resolveTiersInConfig(
      withTiers(config),
      buildContext(["anthropic/claude-opus-4-6"], ["anthropic"]),
    )

    //#then
    expect(result.agents?.morpheus?.model).toBe("anthropic/claude-opus-4-6")
  })

  it("#given no agents and no categories #when resolved #then does not throw and returns the config", () => {
    //#given
    const config: MatrixxConfig = {}

    //#when / #then
    expect(() =>
      resolveTiersInConfig(config, buildContext(["anthropic/claude-opus-4-6"], ["anthropic"])),
    ).not.toThrow()
  })

  it("#given an agent with tier that cannot be resolved (no models, no connected providers) #when resolved #then the agent entry is left with tier set and model undefined", () => {
    //#given
    const config: MatrixxConfig = {
      agents: { trinity: { tier: "premium" } },
    } as MatrixxConfig

    //#when
    const result = resolveTiersInConfig(config, { availableModels: new Set(), connectedProviders: [] })

    //#then
    expect(result.agents?.trinity?.model).toBeUndefined()
    expect(result.agents?.trinity?.tier).toBe("premium")
  })
})
