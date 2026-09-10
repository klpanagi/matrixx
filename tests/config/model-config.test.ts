import { describe, expect, test } from "bun:test"
import { MatrixxConfigSchema } from "../../src/config/schema/matrixx-config"
import {
  ComplexityDowngradesSchema,
  ModelFallbackEntrySchema,
  TierSpecSchema,
  TiersSchema,
} from "../../src/config/schema/model-config"

describe("ModelFallbackEntrySchema", () => {
  test("accepts valid entry with providers and model", () => {
    // #given
    const entry = { providers: ["provider-a", "provider-b"], model: "model-id" }

    // #when
    const result = ModelFallbackEntrySchema.safeParse(entry)

    // #then
    expect(result.success).toBe(true)
  })

  test("rejects empty provider string", () => {
    // #given
    const entry = { providers: [""], model: "model-id" }

    // #when
    const result = ModelFallbackEntrySchema.safeParse(entry)

    // #then
    expect(result.success).toBe(false)
  })

  test("rejects empty model string", () => {
    // #given
    const entry = { providers: ["provider-a"], model: "" }

    // #when
    const result = ModelFallbackEntrySchema.safeParse(entry)

    // #then
    expect(result.success).toBe(false)
  })
})

describe("TierSpecSchema", () => {
  test("accepts valid tier spec with regex pattern", () => {
    // #given
    const spec = {
      providerPriority: ["provider-a", "provider-b"],
      modelPattern: "model-.*",
    }

    // #when
    const result = TierSpecSchema.safeParse(spec)

    // #then
    expect(result.success).toBe(true)
  })

  test("rejects invalid regex pattern", () => {
    // #given
    const spec = {
      providerPriority: ["provider-a"],
      modelPattern: "[invalid-regex",
    }

    // #when
    const result = TierSpecSchema.safeParse(spec)

    // #then
    expect(result.success).toBe(false)
  })

  test("accepts tier spec with fallbackTier and fallback", () => {
    // #given
    const spec = {
      providerPriority: ["provider-a"],
      modelPattern: ".*",
      fallbackTier: "other-tier",
      fallback: [{ providers: ["provider-a"], model: "model-id" }],
    }

    // #when
    const result = TierSpecSchema.safeParse(spec)

    // #then
    expect(result.success).toBe(true)
  })
})

describe("TiersSchema", () => {
  test("accepts tiers record with dynamic keys", () => {
    // #given
    const tiers = {
      custom: {
        providerPriority: ["provider-a"],
        modelPattern: "model-.*",
      },
    }

    // #when
    const result = TiersSchema.safeParse(tiers)

    // #then
    expect(result.success).toBe(true)
  })
})

describe("ComplexityDowngradesSchema", () => {
  test("accepts tier reference value", () => {
    // #given
    const downgrades = {
      category_a: { "1": "tier:fast" },
    }

    // #when
    const result = ComplexityDowngradesSchema.safeParse(downgrades)

    // #then
    expect(result.success).toBe(true)
  })

  test("accepts provider/model value", () => {
    // #given
    const downgrades = {
      category_a: { "1": "provider-a/model-id" },
    }

    // #when
    const result = ComplexityDowngradesSchema.safeParse(downgrades)

    // #then
    expect(result.success).toBe(true)
  })

  test("rejects invalid downgrade value (neither tier nor provider/model)", () => {
    // #given
    const downgrades = {
      category_a: { "1": "invalid-value" },
    }

    // #when
    const result = ComplexityDowngradesSchema.safeParse(downgrades)

    // #then
    expect(result.success).toBe(false)
  })

  test("rejects tier reference with empty name", () => {
    // #given
    const downgrades = {
      category_a: { "1": "tier:" },
    }

    // #when
    const result = ComplexityDowngradesSchema.safeParse(downgrades)

    // #then
    expect(result.success).toBe(false)
  })
})

describe("MatrixxConfigSchema with new fields", () => {
  test("accepts config with tiers", () => {
    // #given
    const config = {
      tiers: {
        custom: {
          providerPriority: ["provider-a"],
          modelPattern: "model-.*",
        },
      },
    }

    // #when
    const result = MatrixxConfigSchema.safeParse(config)

    // #then
    expect(result.success).toBe(true)
  })

  test("accepts config with modelRequirements", () => {
    // #given
    const config = {
      modelRequirements: {
        agents: {
          trinity: {
            fallbackChain: [{ providers: ["provider-a"], model: "model-id" }],
          },
        },
        categories: {
          "bullet-time": {
            fallbackChain: [{ providers: ["provider-a"], model: "model-id" }],
          },
        },
      },
    }

    // #when
    const result = MatrixxConfigSchema.safeParse(config)

    // #then
    expect(result.success).toBe(true)
  })

  test("accepts config with complexityDowngrades using tier reference", () => {
    // #given
    const config = {
      complexityDowngrades: {
        "bullet-time": { "1": "tier:fast" },
      },
    }

    // #when
    const result = MatrixxConfigSchema.safeParse(config)

    // #then
    expect(result.success).toBe(true)
  })

  test("accepts empty config (all new fields optional)", () => {
    // #given
    const config = {}

    // #when
    const result = MatrixxConfigSchema.safeParse(config)

    // #then
    expect(result.success).toBe(true)
  })
})
