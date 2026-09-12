import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createBuiltinMcps } from "../../src/mcp/index"

// NOTE: This suite tests the NEW contract (v2.0.1+): createBuiltinMcps returns
// { mcps, failures } with defensive creation. Broken MCPs are skipped with a
// disabled stub + recorded failure instead of throwing.

const ORIGINAL_ENV: Record<string, string | undefined> = {}

function withEnvVar(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

beforeEach(() => {
  ORIGINAL_ENV.EXA_API_KEY = process.env.EXA_API_KEY
  ORIGINAL_ENV.TAVILY_API_KEY = process.env.TAVILY_API_KEY
})

afterEach(() => {
  withEnvVar("EXA_API_KEY", ORIGINAL_ENV.EXA_API_KEY)
  withEnvVar("TAVILY_API_KEY", ORIGINAL_ENV.TAVILY_API_KEY)
})

describe("createBuiltinMcps — new { mcps, failures } contract", () => {
  test("returns { mcps, failures } shape with all MCPs when healthy", () => {
    //#given
    const disabledMcps: string[] = []

    //#when
    const result = createBuiltinMcps(disabledMcps, undefined, {
      isCommandAvailable: () => true,
    })

    //#then
    expect(result).toHaveProperty("mcps")
    expect(result).toHaveProperty("failures")
    expect(result.mcps).toHaveProperty("websearch")
    expect(result.mcps).toHaveProperty("context7")
    expect(result.mcps).toHaveProperty("white_rabbit")
    expect(result.mcps).toHaveProperty("document_reader")
    expect(Object.keys(result.mcps)).toHaveLength(4)
    expect(result.failures).toHaveLength(0)
  })

  test("filters out disabled built-in MCPs", () => {
    //#given
    const disabledMcps = ["context7"]

    //#when
    const result = createBuiltinMcps(disabledMcps, undefined, {
      isCommandAvailable: () => true,
    })

    //#then
    expect(result.mcps).toHaveProperty("websearch")
    expect(result.mcps).not.toHaveProperty("context7")
    expect(result.mcps).toHaveProperty("white_rabbit")
    expect(result.mcps).toHaveProperty("document_reader")
    expect(Object.keys(result.mcps)).toHaveLength(3)
    expect(result.failures).toHaveLength(0)
  })

  test("filters out all built-in MCPs when all disabled", () => {
    //#given
    const disabledMcps = ["websearch", "context7", "white_rabbit", "document_reader"]

    //#when
    const result = createBuiltinMcps(disabledMcps, undefined, {
      isCommandAvailable: () => true,
    })

    //#then
    expect(Object.keys(result.mcps)).toHaveLength(0)
    expect(result.failures).toHaveLength(0)
  })

  test("ignores unknown MCP names in disabled_mcps", () => {
    //#given
    const disabledMcps = ["context7", "playwright", "custom"]

    //#when
    const result = createBuiltinMcps(disabledMcps, undefined, {
      isCommandAvailable: () => true,
    })

    //#then
    expect(result.mcps).toHaveProperty("websearch")
    expect(result.mcps).not.toHaveProperty("context7")
    expect(result.mcps).toHaveProperty("white_rabbit")
    expect(result.mcps).toHaveProperty("document_reader")
    expect(Object.keys(result.mcps)).toHaveLength(3)
  })
})

describe("createBuiltinMcps — defensive creation (S2/S3)", () => {
  test("tavily without key: websearch becomes disabled stub, failure recorded, NO throw, others intact", () => {
    //#given
    delete process.env.TAVILY_API_KEY
    const config = { websearch: { provider: "tavily" as const } }

    //#when — accessing websearch must not throw
    let result: ReturnType<typeof createBuiltinMcps>
    expect(() => {
      result = createBuiltinMcps([], config, { isCommandAvailable: () => true })
    }).not.toThrow()

    result = createBuiltinMcps([], config, { isCommandAvailable: () => true })
    const websearch = result.mcps.websearch

    //#then
    expect(websearch.enabled).toBe(false) // disabled stub
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].name).toBe("websearch")
    expect(result.failures[0].error).toContain("TAVILY_API_KEY")
    // other MCPs unaffected
    expect(result.mcps).toHaveProperty("context7")
    expect(result.mcps).toHaveProperty("white_rabbit")
    expect(result.mcps).toHaveProperty("document_reader")
  })

  test("uvx missing: document_reader becomes disabled stub, failure recorded, others intact", () => {
    //#given
    const result = createBuiltinMcps([], undefined, {
      isCommandAvailable: (cmd) => cmd !== "uvx",
    })

    //#then
    expect(result.mcps.document_reader.enabled).toBe(false)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].name).toBe("document_reader")
    expect(result.failures[0].error).toContain("uvx")
    expect(result.mcps).toHaveProperty("websearch")
    expect(result.mcps).toHaveProperty("context7")
    expect(result.mcps).toHaveProperty("white_rabbit")
  })

  test("uvx present: document_reader stays enabled, no failure", () => {
    //#given
    const result = createBuiltinMcps([], undefined, {
      isCommandAvailable: () => true,
    })

    //#then
    expect(result.mcps.document_reader.enabled).toBe(true)
    expect(result.failures).toHaveLength(0)
  })

  test("websearch disabled via disabled_mcps: no failure recorded for it", () => {
    //#given
    delete process.env.TAVILY_API_KEY
    const config = { websearch: { provider: "tavily" as const } }

    //#when
    const result = createBuiltinMcps(["websearch"], config, {
      isCommandAvailable: () => true,
    })

    //#then
    expect(result.mcps).not.toHaveProperty("websearch")
    expect(result.failures).toHaveLength(0)
  })
})

describe("lazy websearch config (S5 — P1 regression)", () => {
  test("websearch config property exists before config is created", () => {
    //#given
    const result = createBuiltinMcps([], undefined, {
      isCommandAvailable: () => true,
    })
    const mcps = result.mcps

    //#then - property exists (enumerable getter) but config is deferred
    expect("websearch" in mcps).toBe(true)
    expect(Object.keys(mcps)).toContain("websearch")

    //#when - accessing triggers config creation
    const websearch = mcps.websearch
    expect(websearch).toBeDefined()
    expect(websearch.type).toBe("remote")
  })

  test("disabled websearch never appears in result", () => {
    //#given
    const result = createBuiltinMcps(["websearch"], undefined, {
      isCommandAvailable: () => true,
    })
    const mcps = result.mcps

    //#then
    expect("websearch" in mcps).toBe(false)
    expect(Object.keys(mcps)).not.toContain("websearch")
  })

  test("EXA_API_KEY is NOT read during createBuiltinMcps — read lazily on first websearch access", () => {
    //#given
    process.env.EXA_API_KEY = "should-be-read-lazily"

    //#when — construct mcps (env var present)
    const result = createBuiltinMcps([], undefined, {
      isCommandAvailable: () => true,
    })
    const mcps = result.mcps

    // Immediately clear env var — if eagerly read, too late
    delete process.env.EXA_API_KEY

    // Access websearch config — triggers lazy factory
    const websearch = mcps.websearch

    //#then — config was built lazily; env var was gone by then
    expect(websearch.url).not.toContain("should-be-read-lazily")
    expect(websearch.url).toBe("https://mcp.exa.ai/mcp?tools=web_search_exa")
  })

  test("tavily without key at access time: disabled stub instead of throw (contract change)", () => {
    //#given
    delete process.env.TAVILY_API_KEY

    //#when — construct with tavily config, key absent
    const result = createBuiltinMcps([], { websearch: { provider: "tavily" } }, {
      isCommandAvailable: () => true,
    })
    const mcps = result.mcps

    //#then — accessing does NOT throw; returns disabled stub
    let websearch: { enabled: boolean } | undefined
    expect(() => {
      websearch = mcps.websearch
    }).not.toThrow()
    expect(websearch!.enabled).toBe(false)
    expect(result.failures.length).toBeGreaterThan(0)
  })

  test("env vars are still read correctly when present at first access time", () => {
    //#given — set env vars before lazy access
    process.env.EXA_API_KEY = "access-time-key"
    const result = createBuiltinMcps([], undefined, {
      isCommandAvailable: () => true,
    })
    const mcps = result.mcps

    //#when — env var is present at access time
    const websearch = mcps.websearch

    //#then — config captures the env var value
    expect(websearch.url).toContain("access-time-key")
  })
})
