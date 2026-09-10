import { describe, expect, it } from "bun:test"
import { buildTierSpecs, getTierNames, getTierSpec, parseTierReference } from "../../src/shared/model-tiers"

function makeConfig() {
  return {
    tiers: {
      free: {
        providerPriority: ["opencode", "xai"],
        modelPattern: "-free$|kimi-k2\\.5-free|grok-code-fast",
        fallback: [
          { providers: ["opencode"], model: "kimi-k2.5-free" },
          { providers: ["xai"], model: "grok-code-fast-1" },
        ],
      },
      fast: {
        providerPriority: ["provider-a", "provider-b"],
        modelPattern: "model-a|model-b",
        fallback: [{ providers: ["provider-a"], model: "model-a" }],
        fallbackTier: "free",
      },
      standard: {
        providerPriority: ["provider-a"],
        modelPattern: "standard-model",
        fallbackTier: "fast",
      },
    },
  }
}

describe("buildTierSpecs", () => {
  it("#given empty config #when buildTierSpecs({}) #then returns {}", () => {
    //#given / #when
    const result = buildTierSpecs({})
    //#then
    expect(result).toEqual({})
  })

  it("#given null config #when buildTierSpecs(null) #then returns {}", () => {
    //#given / #when
    const result = buildTierSpecs(null as never)
    //#then
    expect(result).toEqual({})
  })

  it("#given undefined config #when buildTierSpecs(undefined) #then returns {}", () => {
    //#given / #when
    const result = buildTierSpecs(undefined as never)
    //#then
    expect(result).toEqual({})
  })

  it("#given config with tiers #when buildTierSpecs #then compiles modelPattern to RegExp", () => {
    //#given
    const config = makeConfig()
    //#when
    const specs = buildTierSpecs(config as never)
    //#then
    expect(specs.free.modelPattern).toBeInstanceOf(RegExp)
    expect(specs.free.modelPattern.test("opencode/kimi-k2.5-free")).toBe(true)
    expect(specs.free.providerPriority).toEqual(["opencode", "xai"])
    expect(specs.fast.fallbackTier).toBe("free")
  })

  it("#given invalid regex #when buildTierSpecs #then pattern never matches", () => {
    //#given
    const config = {
      tiers: {
        bad: {
          providerPriority: ["provider-a"],
          modelPattern: "[invalid",
        },
      },
    }
    //#when
    const specs = buildTierSpecs(config as never)
    //#then
    expect(specs.bad.modelPattern).toBeInstanceOf(RegExp)
    expect(specs.bad.modelPattern.test("provider-a/anything")).toBe(false)
    expect(specs.bad.modelPattern.test("")).toBe(false)
  })

  it("#given config with tiers #when buildTierSpecs #then fallback is preserved", () => {
    //#given
    const config = makeConfig()
    //#when
    const specs = buildTierSpecs(config as never)
    //#then
    expect(specs.free.fallback).toEqual([
      { providers: ["opencode"], model: "kimi-k2.5-free" },
      { providers: ["xai"], model: "grok-code-fast-1" },
    ])
  })
})

describe("getTierSpec", () => {
  it("#given empty config #when getTierSpec('fast', {}) #then returns undefined", () => {
    //#given / #when
    const result = getTierSpec("fast", {})
    //#then
    expect(result).toBeUndefined()
  })

  it("#given empty config #when getTierSpec('free', null) #then returns undefined", () => {
    //#given / #when
    const result = getTierSpec("free", null as never)
    //#then
    expect(result).toBeUndefined()
  })

  it("#given config with tiers #when getTierSpec('free', config) #then returns spec", () => {
    //#given
    const config = makeConfig()
    //#when
    const spec = getTierSpec("free", config as never)
    //#then
    expect(spec).toBeDefined()
    expect(spec?.name).toBe("free")
    expect(spec?.modelPattern).toBeInstanceOf(RegExp)
  })

  it("#given unknown tier #when getTierSpec #then returns undefined", () => {
    //#given
    const config = makeConfig()
    //#when
    const spec = getTierSpec("nonexistent", config as never)
    //#then
    expect(spec).toBeUndefined()
  })
})

describe("getTierNames", () => {
  it("#given empty config #when getTierNames #then returns []", () => {
    //#given / #when
    const names = getTierNames({} as never)
    //#then
    expect(names).toEqual([])
  })

  it("#given config with tiers #when getTierNames #then returns tier keys", () => {
    //#given
    const config = makeConfig()
    //#when
    const names = getTierNames(config as never)
    //#then
    expect(names).toContain("free")
    expect(names).toContain("fast")
    expect(names).toContain("standard")
    expect(names).toHaveLength(3)
  })
})

describe("parseTierReference", () => {
  it("#given empty config #when parseTierReference('tier:fast', {}) #then returns null", () => {
    //#given / #when
    const result = parseTierReference("tier:fast", {} as never)
    //#then
    expect(result).toBeNull()
  })

  it("#given valid tier reference with config #when parseTierReference('tier:fast', config) #then returns tier name", () => {
    //#given
    const config = makeConfig()
    //#when
    const result = parseTierReference("tier:fast", config as never)
    //#then
    expect(result).toBe("fast")
  })

  it("#given uppercase tier reference #when parsed #then returns lowercased", () => {
    //#given
    const config = makeConfig()
    //#when
    const result = parseTierReference("tier:FAST", config as never)
    //#then
    expect(result).toBe("fast")
  })

  it("#given unknown tier #when parsed #then returns null", () => {
    //#given
    const config = makeConfig()
    //#when
    const result = parseTierReference("tier:unknown", config as never)
    //#then
    expect(result).toBeNull()
  })

  it("#given plain model string #when parsed #then returns null", () => {
    //#given
    const config = makeConfig()
    //#when
    const result = parseTierReference("provider-a/model-a", config as never)
    //#then
    expect(result).toBeNull()
  })

  it("#given undefined #when parsed #then returns null", () => {
    //#given / #when
    const result = parseTierReference(undefined, makeConfig() as never)
    //#then
    expect(result).toBeNull()
  })

  it("#given whitespace trimmed #when parseTierReference('  tier:free  ', config) #then returns free", () => {
    //#given
    const config = makeConfig()
    //#when
    const result = parseTierReference("  tier:free  ", config as never)
    //#then
    expect(result).toBe("free")
  })
})
