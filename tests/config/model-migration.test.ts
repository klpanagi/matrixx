import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { MatrixxConfigSchema } from "../../src/config/schema/matrixx-config"
import { migrateMatrixxConfig, normalizeModelInput } from "../../src/config/migrations/model-migration"
import * as logger from "../../src/shared/logger"

describe("normalizeModelInput", () => {
  let logSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    logSpy = spyOn(logger, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
  })

  test("prefixed model emits deprecation warning and keeps value", () => {
    // #given
    const value = "provider-a/model-id"

    // #when
    const result = normalizeModelInput(value)

    // #then
    expect(result).toBe(value)
    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[migration]"))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(value))
  })

  test("bare model does not warn", () => {
    // #given
    const value = "model-id"

    // #when
    const result = normalizeModelInput(value)

    // #then
    expect(result).toBe(value)
    expect(logSpy).not.toHaveBeenCalled()
  })

  test("tier reference does not warn", () => {
    // #given
    const value = "tier:fast"

    // #when
    const result = normalizeModelInput(value)

    // #then
    expect(result).toBe(value)
    expect(logSpy).not.toHaveBeenCalled()
  })

  test("prefixed with multiple slashes still warns (opaque provider check via includes)", () => {
    // #given
    const value = "provider-a/sub/model-id"

    // #when
    const result = normalizeModelInput(value)

    // #then
    expect(result).toBe(value)
    expect(logSpy).toHaveBeenCalledTimes(1)
  })
})

describe("migrateMatrixxConfig", () => {
  let logSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    logSpy = spyOn(logger, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
  })

  test("migrates global_model prefixed warns", () => {
    // #given
    const raw = { global_model: "provider-a/model-id" } as unknown as import("../../src/config/schema/matrixx-config").MatrixxConfig

    // #when
    const migrated = migrateMatrixxConfig(raw)

    // #then
    expect(migrated.global_model).toBe("provider-a/model-id")
    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(migrated._migrations).toContain("model-migration")
  })

  test("bare global_model does not warn", () => {
    // #given
    const raw = { global_model: "model-id" } as unknown as import("../../src/config/schema/matrixx-config").MatrixxConfig

    // #when
    const migrated = migrateMatrixxConfig(raw)

    // #then
    expect(migrated.global_model).toBe("model-id")
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("[migration] prefixed"))
    expect(migrated._migrations).toContain("model-migration")
  })

  test("tier global_model does not warn", () => {
    // #given
    const raw = { global_model: "tier:fast" } as unknown as import("../../src/config/schema/matrixx-config").MatrixxConfig

    // #when
    const migrated = migrateMatrixxConfig(raw)

    // #then
    expect(migrated.global_model).toBe("tier:fast")
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("[migration] prefixed"))
  })

  test("migrates tiers fallback models", () => {
    // #given
    const raw = {
      tiers: {
        fast: {
          providerPriority: ["provider-a"],
          modelPattern: ".*",
          fallback: [{ providers: ["provider-a"], model: "provider-a/model-id" }],
        },
        standard: {
          providerPriority: ["provider-b"],
          modelPattern: ".*",
          fallback: [{ providers: ["provider-b"], model: "model-id" }],
        },
      },
    } as unknown as import("../../src/config/schema/matrixx-config").MatrixxConfig

    // #when
    const migrated = migrateMatrixxConfig(raw)

    // #then
    expect(migrated.tiers?.fast?.fallback?.[0].model).toBe("provider-a/model-id")
    expect(migrated.tiers?.standard?.fallback?.[0].model).toBe("model-id")
    expect(logSpy).toHaveBeenCalledTimes(1) // only fast warns
  })

  test("migrates modelRequirements agents and categories fallbackChain", () => {
    // #given
    const raw = {
      modelRequirements: {
        agents: {
          myAgent: {
            fallbackChain: [{ providers: ["provider-a"], model: "provider-a/model-id" }],
          },
        },
        categories: {
          myCategory: {
            fallbackChain: [
              { providers: ["provider-b"], model: "model-id" },
              { providers: ["provider-c"], model: "provider-c/other-model" },
            ],
          },
        },
      },
    } as unknown as import("../../src/config/schema/matrixx-config").MatrixxConfig

    // #when
    const migrated = migrateMatrixxConfig(raw)

    // #then
    expect(migrated.modelRequirements?.agents?.myAgent?.fallbackChain[0].model).toBe("provider-a/model-id")
    expect(migrated.modelRequirements?.categories?.myCategory?.fallbackChain[0].model).toBe("model-id")
    expect(migrated.modelRequirements?.categories?.myCategory?.fallbackChain[1].model).toBe("provider-c/other-model")
    expect(logSpy).toHaveBeenCalledTimes(2)
  })

  test("migrates complexityDowngrades values", () => {
    // #given
    const raw = {
      complexityDowngrades: {
        myCategory: { "1": "provider-a/model-id", "2": "tier:fast" },
        other: { "1": "model-id" },
      },
    } as unknown as import("../../src/config/schema/matrixx-config").MatrixxConfig

    // #when
    const migrated = migrateMatrixxConfig(raw)

    // #then
    expect(migrated.complexityDowngrades?.myCategory?.["1"]).toBe("provider-a/model-id")
    expect(migrated.complexityDowngrades?.myCategory?.["2"]).toBe("tier:fast")
    expect(migrated.complexityDowngrades?.other?.["1"]).toBe("model-id")
    expect(logSpy).toHaveBeenCalledTimes(1) // only provider-a/model-id warns, tier:fast no warn, bare no warn
  })

  test("is idempotent via _migrations guard", () => {
    // #given
    const raw = { global_model: "provider-a/model-id" } as unknown as import("../../src/config/schema/matrixx-config").MatrixxConfig
    const once = migrateMatrixxConfig(raw)

    // #when
    logSpy.mockClear()
    const twice = migrateMatrixxConfig(once)

    // #then
    expect(twice).toBe(once) // same reference when already migrated
    expect(logSpy).not.toHaveBeenCalled()
  })

  test("does not rewrite file on disk — returns new object", () => {
    // #given
    const raw = { global_model: "provider-a/model-id" } as unknown as import("../../src/config/schema/matrixx-config").MatrixxConfig

    // #when
    const migrated = migrateMatrixxConfig(raw)

    // #then
    expect(migrated).not.toBe(raw)
    expect(raw._migrations).toBeUndefined()
  })

  test("existing matrixx.jsonc with prefixed model loads without Zod error (z.string not enum)", () => {
    // #given
    const raw = { global_model: "provider-a/model-id", tiers: {} }

    // #when
    const result = MatrixxConfigSchema.safeParse(raw)

    // #then
    expect(result.success).toBe(true)
  })

  test("invalid still validated at schema level but migration keeps value (prefixed not rejected)", () => {
    // #given
    const raw = {
      tiers: {
        fast: {
          providerPriority: ["provider-a"],
          modelPattern: "[invalid-regex",
        },
      },
    }

    // #when
    const result = MatrixxConfigSchema.safeParse(raw)

    // #then
    expect(result.success).toBe(false)
  })
})
