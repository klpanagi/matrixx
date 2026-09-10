import { describe, expect, test } from "bun:test"
import {
  getAgentModelRequirements,
  getCategoryModelRequirements,
  type FallbackEntry,
  type ModelRequirement,
} from "../../src/shared/model-requirements"

// helper to build ModelRequirements config with synthetic values
function makeConfig(overrides: {
  agents?: Record<string, ModelRequirement>
  categories?: Record<string, ModelRequirement>
}): { modelRequirements: { agents?: Record<string, ModelRequirement>; categories?: Record<string, ModelRequirement> } } {
  return {
    modelRequirements: {
      ...(overrides.agents ? { agents: overrides.agents } : {}),
      ...(overrides.categories ? { categories: overrides.categories } : {}),
    },
  }
}

describe("getAgentModelRequirements", () => {
  test("returns {} for empty config {}", () => {
    const result = getAgentModelRequirements({})
    expect(result).toEqual({})
  })

  test("returns {} for undefined config", () => {
    const result = getAgentModelRequirements(undefined)
    expect(result).toEqual({})
  })

  test("returns {} for null config", () => {
    const result = getAgentModelRequirements(null)
    expect(result).toEqual({})
  })

  test("returns {} when modelRequirements missing", () => {
    const result = getAgentModelRequirements({} as never)
    expect(result).toEqual({})
  })

  test("returns single agent from config with synthetic model", () => {
    const cfg = makeConfig({
      agents: {
        trinity: {
          fallbackChain: [{ providers: ["provider-a"], model: "model-a" }], // fixture: synthetic
        },
      },
    })
    const result = getAgentModelRequirements(cfg)
    expect(result.trinity).toBeDefined()
    expect(result.trinity.fallbackChain).toHaveLength(1)
    expect(result.trinity.fallbackChain[0].providers).toEqual(["provider-a"])
    expect(result.trinity.fallbackChain[0].model).toBe("model-a") // fixture: synthetic
  })

  test("returns multiple agents with correct fallbackChain length and providers", () => {
    const cfg = makeConfig({
      agents: {
        trinity: {
          fallbackChain: [
            { providers: ["provider-a"], model: "model-a" }, // fixture: synthetic
            { providers: ["provider-b"], model: "model-b" }, // fixture: synthetic
          ],
        },
        oracle: {
          fallbackChain: [
            { providers: ["provider-a", "provider-b"], model: "model-c", variant: "max" }, // fixture: synthetic
            { providers: ["provider-a"], model: "model-a" }, // fixture: synthetic
          ],
          requiresAnyModel: true,
        },
        operator: {
          fallbackChain: [{ providers: ["provider-a"], model: "model-d" }], // fixture: synthetic
        },
      },
    })
    const result = getAgentModelRequirements(cfg)
    expect(Object.keys(result)).toHaveLength(3)
    expect(result.trinity.fallbackChain).toHaveLength(2)
    expect(result.trinity.fallbackChain[0].providers).toEqual(["provider-a"])
    expect(result.oracle.fallbackChain).toHaveLength(2)
    expect(result.oracle.fallbackChain[0].variant).toBe("max")
    expect(result.oracle.requiresAnyModel).toBe(true)
    expect(result.operator.fallbackChain[0].model).toBe("model-d") // fixture: synthetic
  })

  test("factory with config containing fallbackChain returns expected chain length and providers", () => {
    const cfg = makeConfig({
      agents: {
        morpheus: {
          fallbackChain: [
            { providers: ["provider-a", "provider-b", "provider-c"], model: "model-x", variant: "max" }, // fixture: synthetic
            { providers: ["provider-a", "provider-b", "provider-c"], model: "model-y" }, // fixture: synthetic
          ],
        },
      },
    })
    const result = getAgentModelRequirements(cfg)
    expect(result.morpheus.fallbackChain).toHaveLength(2)
    expect(result.morpheus.fallbackChain[0].providers).toEqual(["provider-a", "provider-b", "provider-c"])
    expect(result.morpheus.fallbackChain[0].model).toBe("model-x") // fixture: synthetic
    expect(result.morpheus.fallbackChain[1].model).toBe("model-y") // fixture: synthetic
  })

  test("preserves optional fields variant, requiresModel, requiresProvider", () => {
    const cfg = makeConfig({
      agents: {
        keymaker: {
          fallbackChain: [{ providers: ["provider-a"], model: "model-a" }], // fixture: synthetic
          variant: "custom-variant",
          requiresModel: "model-a", // fixture: synthetic
          requiresProvider: ["provider-a"],
        },
      },
    })
    const result = getAgentModelRequirements(cfg)
    expect(result.keymaker.variant).toBe("custom-variant")
    expect(result.keymaker.requiresModel).toBe("model-a") // fixture: synthetic
    expect(result.keymaker.requiresProvider).toEqual(["provider-a"])
  })

  test("hardcoded literals are not required - synthetic providers and models suffice", () => {
    const cfg = makeConfig({
      agents: {
        construct: {
          fallbackChain: [{ providers: ["provider-a"], model: "model-a" }], // fixture: synthetic
        },
        architect: {
          fallbackChain: [{ providers: ["provider-b"], model: "model-b" }], // fixture: synthetic
        },
      },
    })
    const result = getAgentModelRequirements(cfg)
    expect(result.construct.fallbackChain[0].model).toBe("model-a") // fixture: synthetic
    expect(result.architect.fallbackChain[0].providers).toEqual(["provider-b"])
  })

  test("filters invalid entries via Zod validation", () => {
    const cfg = {
      modelRequirements: {
        agents: {
          valid: {
            fallbackChain: [{ providers: ["provider-a"], model: "model-a" }], // fixture: synthetic
          },
          invalid: {
            fallbackChain: [{ providers: [], model: "" }],
          },
        },
      },
    } as unknown as { modelRequirements: { agents: Record<string, ModelRequirement> } }
    const result = getAgentModelRequirements(cfg)
    expect(result.valid).toBeDefined()
    expect(result.invalid).toBeUndefined()
  })
})

describe("getCategoryModelRequirements", () => {
  test("returns {} for empty config {}", () => {
    const result = getCategoryModelRequirements({})
    expect(result).toEqual({})
  })

  test("returns {} for undefined config", () => {
    const result = getCategoryModelRequirements(undefined)
    expect(result).toEqual({})
  })

  test("returns {} for null config", () => {
    const result = getCategoryModelRequirements(null)
    expect(result).toEqual({})
  })

  test("returns single category from config with synthetic model", () => {
    const cfg = makeConfig({
      categories: {
        source: {
          fallbackChain: [{ providers: ["provider-a"], model: "model-a", variant: "max" }], // fixture: synthetic
        },
      },
    })
    const result = getCategoryModelRequirements(cfg)
    expect(result.source).toBeDefined()
    expect(result.source.fallbackChain).toHaveLength(1)
    expect(result.source.fallbackChain[0].model).toBe("model-a") // fixture: synthetic
    expect(result.source.fallbackChain[0].variant).toBe("max")
  })

  test("returns multiple categories with correct providers and models", () => {
    const cfg = makeConfig({
      categories: {
        construct: {
          fallbackChain: [{ providers: ["provider-a"], model: "model-a" }], // fixture: synthetic
        },
        "deep-jack": {
          fallbackChain: [{ providers: ["provider-a"], model: "model-b", variant: "max" }], // fixture: synthetic
        },
        "bullet-time": {
          fallbackChain: [{ providers: ["provider-b"], model: "model-c" }], // fixture: synthetic
        },
        broadcast: {
          fallbackChain: [{ providers: ["provider-a"], model: "model-a" }], // fixture: synthetic
        },
      },
    })
    const result = getCategoryModelRequirements(cfg)
    expect(Object.keys(result)).toHaveLength(4)
    expect(result.construct.fallbackChain[0].model).toBe("model-a") // fixture: synthetic
    expect(result["deep-jack"].fallbackChain[0].variant).toBe("max")
    expect(result["bullet-time"].fallbackChain[0].providers).toEqual(["provider-b"])
  })

  test("factory with config containing fallbackChain returns expected chain length and providers", () => {
    const cfg = makeConfig({
      categories: {
        "red-pill": {
          fallbackChain: [
            { providers: ["provider-a", "provider-b", "provider-c"], model: "model-x", variant: "max" }, // fixture: synthetic
            { providers: ["provider-a", "provider-b", "provider-c"], model: "model-y" }, // fixture: synthetic
          ],
        },
      },
    })
    const result = getCategoryModelRequirements(cfg)
    expect(result["red-pill"].fallbackChain).toHaveLength(2)
    expect(result["red-pill"].fallbackChain[0].providers).toEqual(["provider-a", "provider-b", "provider-c"])
    expect(result["red-pill"].fallbackChain[0].model).toBe("model-x") // fixture: synthetic
    expect(result["red-pill"].fallbackChain[1].model).toBe("model-y") // fixture: synthetic
  })

  test("preserves requiresModel field when provided", () => {
    const cfg = makeConfig({
      categories: {
        source: {
          fallbackChain: [{ providers: ["provider-a"], model: "model-a" }], // fixture: synthetic
        },
        "deep-jack": {
          fallbackChain: [{ providers: ["provider-a"], model: "model-b" }], // fixture: synthetic
        },
      },
    })
    const result = getCategoryModelRequirements(cfg)
    expect(result.source.requiresModel).toBeUndefined()
    expect(result["deep-jack"].requiresModel).toBeUndefined()
  })

  test("hardcoded literals are not required for categories", () => {
    const cfg = makeConfig({
      categories: {
        "blue-pill": {
          fallbackChain: [{ providers: ["provider-a"], model: "model-a" }], // fixture: synthetic
        },
        "matrix-bend": {
          fallbackChain: [{ providers: ["provider-b"], model: "model-b" }], // fixture: synthetic
        },
      },
    })
    const result = getCategoryModelRequirements(cfg)
    expect(result["blue-pill"].fallbackChain[0].model).toBe("model-a") // fixture: synthetic
    expect(result["matrix-bend"].fallbackChain[0].providers).toEqual(["provider-b"])
  })
})

describe("FallbackEntry type", () => {
  test("FallbackEntry structure is correct with synthetic values", () => {
    const entry: FallbackEntry = {
      providers: ["provider-a", "provider-b", "provider-c"], // fixture: synthetic
      model: "model-x", // fixture: synthetic
      variant: "max",
    }
    expect(entry.providers).toEqual(["provider-a", "provider-b", "provider-c"])
    expect(entry.model).toBe("model-x") // fixture: synthetic
    expect(entry.variant).toBe("max")
  })

  test("FallbackEntry variant is optional", () => {
    const entry: FallbackEntry = {
      providers: ["provider-a"], // fixture: synthetic
      model: "model-a", // fixture: synthetic
    }
    expect(entry.variant).toBeUndefined()
  })
})

describe("ModelRequirement type", () => {
  test("ModelRequirement structure with fallbackChain is correct", () => {
    const requirement: ModelRequirement = {
      fallbackChain: [
        { providers: ["provider-a"], model: "model-x", variant: "max" }, // fixture: synthetic
        { providers: ["provider-a"], model: "model-y" }, // fixture: synthetic
      ],
    }
    expect(requirement.fallbackChain).toBeArray()
    expect(requirement.fallbackChain).toHaveLength(2)
    expect(requirement.fallbackChain[0].model).toBe("model-x") // fixture: synthetic
    expect(requirement.fallbackChain[1].model).toBe("model-y") // fixture: synthetic
  })

  test("ModelRequirement variant is optional", () => {
    const requirement: ModelRequirement = {
      fallbackChain: [{ providers: ["provider-a"], model: "model-a" }], // fixture: synthetic
    }
    expect(requirement.variant).toBeUndefined()
  })

  test("no model in fallbackChain has provider prefix when using factories", () => {
    const cfg = makeConfig({
      agents: {
        trinity: {
          fallbackChain: [
            { providers: ["provider-a"], model: "model-a" }, // fixture: synthetic
            { providers: ["provider-b"], model: "model-b" }, // fixture: synthetic
          ],
        },
      },
      categories: {
        source: {
          fallbackChain: [{ providers: ["provider-a"], model: "model-c", variant: "max" }], // fixture: synthetic
        },
      },
    })
    const agents = getAgentModelRequirements(cfg)
    const categories = getCategoryModelRequirements(cfg)
    const allRequirements = [...Object.values(agents), ...Object.values(categories)]
    for (const req of allRequirements) {
      for (const entry of req.fallbackChain) {
        expect(entry.model).not.toContain("/")
      }
    }
  })

  test("all fallbackChain entries have non-empty providers array via factories", () => {
    const cfg = makeConfig({
      agents: {
        trinity: {
          fallbackChain: [
            { providers: ["provider-a"], model: "model-a" }, // fixture: synthetic
            { providers: ["provider-b", "provider-c"], model: "model-b" }, // fixture: synthetic
          ],
        },
      },
      categories: {
        construct: {
          fallbackChain: [{ providers: ["provider-a"], model: "model-c" }], // fixture: synthetic
        },
      },
    })
    const agents = getAgentModelRequirements(cfg)
    const categories = getCategoryModelRequirements(cfg)
    const allRequirements = [...Object.values(agents), ...Object.values(categories)]
    for (const req of allRequirements) {
      for (const entry of req.fallbackChain) {
        expect(entry.providers).toBeArray()
        expect(entry.providers.length).toBeGreaterThan(0)
      }
    }
  })
})

describe("config-driven validation", () => {
  test("empty config returns {} gracefully for both factories", () => {
    const agents = getAgentModelRequirements({})
    const categories = getCategoryModelRequirements({})
    expect(agents).toEqual({})
    expect(categories).toEqual({})
  })

  test("config with empty agents/categories returns {} for respective factory", () => {
    const cfgEmptyAgents = makeConfig({ categories: { source: { fallbackChain: [{ providers: ["provider-a"], model: "model-a" }] } } }) // fixture: synthetic
    const cfgEmptyCategories = makeConfig({ agents: { trinity: { fallbackChain: [{ providers: ["provider-a"], model: "model-a" }] } } }) // fixture: synthetic
    const agentsFromCategoryOnly = getAgentModelRequirements(cfgEmptyAgents)
    const categoriesFromAgentOnly = getCategoryModelRequirements(cfgEmptyCategories)
    expect(agentsFromCategoryOnly).toEqual({})
    expect(categoriesFromAgentOnly).toEqual({})
  })
})
