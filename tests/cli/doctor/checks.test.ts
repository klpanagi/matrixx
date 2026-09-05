import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test"

let mockBunSpawnSyncCalls: Array<{ cmd: string[] }> = []
let mockBunSpawnSyncResults: Array<{ exitCode: number; stdout: string; stderr: string }> = []
let mockFiles: Set<string>
let mockFileContents: Map<string, string>

const origSpawnSync = Bun.spawnSync
let savedEnv: Record<string, string | undefined> = {}
const ENV_PROVIDER_PATTERN = /^[A-Z0-9_]+_(API_KEY|TOKEN)$/

function resetMocks(): void {
  mockBunSpawnSyncCalls = []
  mockBunSpawnSyncResults = []
  mockFiles = new Set()
  mockFileContents = new Map()
}

beforeEach(() => {
  resetMocks()
  savedEnv = {}
  for (const key of Object.keys(process.env)) {
    if (ENV_PROVIDER_PATTERN.test(key)) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  }
  Bun.spawnSync = mock((cmd: string[], _opts?: unknown) => {
    mockBunSpawnSyncCalls.push({ cmd })
    const result = mockBunSpawnSyncResults.shift() ?? { exitCode: 1, stdout: "", stderr: "" }
    return {
      exitCode: result.exitCode,
      stdout: Buffer.from(result.stdout),
      stderr: Buffer.from(result.stderr),
    }
  }) as unknown as typeof Bun.spawnSync
  mock.module("node:fs", () => ({
    existsSync: mock((path: string) => mockFiles.has(path)),
    readFileSync: mock((path: string) => {
      if (!mockFiles.has(path)) {
        const err = new Error(`ENOENT: no such file or directory, open '${path}'`) as NodeJS.ErrnoException
        err.code = "ENOENT"
        throw err
      }
      return mockFileContents.get(path) ?? ""
    }),
  }))
})

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (ENV_PROVIDER_PATTERN.test(key)) delete process.env[key]
  }
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  savedEnv = {}
})

afterAll(() => {
  Bun.spawnSync = origSpawnSync
  mock.restore()
  for (const key of Object.keys(process.env)) {
    if (ENV_PROVIDER_PATTERN.test(key)) delete process.env[key]
  }
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})
import { homedir } from "node:os"
import { join } from "node:path"
import { pluginInstallationCheck } from "../../../src/cli/doctor/checks/plugin"
import { configValidationCheck } from "../../../src/cli/doctor/checks/config"
import { authCheck } from "../../../src/cli/doctor/checks/auth"
import { runtimeDepsCheck } from "../../../src/cli/doctor/checks/runtime"
import { optionalToolsCheck } from "../../../src/cli/doctor/checks/optional"
import { mcpPrerequisitesCheck } from "../../../src/cli/doctor/checks/mcp"
import { ALL_CHECKS, getChecksByCategory, getCategories } from "../../../src/cli/doctor/checks"

describe("check registry", () => {
  test("ALL_CHECKS has 12 entries", () => {
    expect(ALL_CHECKS.length).toBe(12)
  })

  test("getCategories returns 6 unique categories including integrations", () => {
    const cats = getCategories()
    expect(cats.length).toBe(6)
    expect(cats).toContain("installation")
    expect(cats).toContain("configuration")
    expect(cats).toContain("authentication")
    expect(cats).toContain("dependencies")
    expect(cats).toContain("tools")
    expect(cats).toContain("integrations")
  })

  test("getChecksByCategory filters correctly", () => {
    const auth = getChecksByCategory("authentication")
    expect(auth.length).toBe(1)
    expect(auth[0].name).toBe("authentication")
    const integrations = getChecksByCategory("integrations")
    expect(integrations.length).toBe(6)
  })

  test("every check has name, category, check function", () => {
    for (const check of ALL_CHECKS) {
      expect(check).toHaveProperty("name")
      expect(check).toHaveProperty("category")
      expect(typeof check.check).toBe("function")
    }
  })

  test("check returns proper result shape", async () => {
    for (const check of ALL_CHECKS) {
      const result = await Promise.resolve(check.check())
      expect(result).toHaveProperty("name")
      expect(result).toHaveProperty("status")
      expect(result).toHaveProperty("message")
      expect(["pass", "warn", "fail"]).toContain(result.status)
    }
  })
})

describe("pluginInstallationCheck", () => {
  test("fails when opencode CLI not found (spawnSync throws)", async () => {
    Bun.spawnSync = mock(() => {
      throw new Error("not found")
    }) as unknown as typeof Bun.spawnSync
    const result = await pluginInstallationCheck.check()
    expect(result.status).toBe("fail")
    expect(result.message).toContain("OpenCode CLI")
  })

  test("fails when opencode version check fails (exit code non-zero)", async () => {
    const result = await pluginInstallationCheck.check()
    expect(result.status).toBe("fail")
    expect(result.message).toContain("OpenCode CLI")
  })

  test("warns when opencode version available but config not found", async () => {
    mockBunSpawnSyncResults = [{ exitCode: 0, stdout: "opencode 1.0.155", stderr: "" }]
    const result = await pluginInstallationCheck.check()
    expect(result.status).toBe("warn")
    expect(result.message).toContain("opencode.json not found")
  })

  test("passes when opencode CLI and plugin registered", async () => {
    const configPath = join(homedir(), ".config", "opencode", "opencode.json")
    mockFiles.add(configPath)
    mockFileContents.set(configPath, JSON.stringify({ plugin: ["opencode-matrixx"] }))
    mockBunSpawnSyncResults = [{ exitCode: 0, stdout: "opencode 1.0.155", stderr: "" }]
    const result = await pluginInstallationCheck.check()
    expect(result.status).toBe("pass")
    expect(result.message).toContain("plugin registered")
  })
})

describe("configValidationCheck", () => {
  test("warns when no config file found", async () => {
    const result = await configValidationCheck.check()
    expect(result.status).toBe("warn")
    expect(result.message).toContain("No matrixx configuration")
  })

  test("passes when valid config found", async () => {
    mockFiles.add(join(process.cwd(), "matrixx.json"))
    mockFileContents.set(join(process.cwd(), "matrixx.json"), JSON.stringify({ agents: {} }))
    const result = await configValidationCheck.check()
    expect(result.status).toBe("pass")
    expect(result.message).toContain("valid")
  })

  test("fails when config has invalid JSON", async () => {
    mockFiles.add(join(process.cwd(), "matrixx.json"))
    mockFileContents.set(join(process.cwd(), "matrixx.json"), "{ invalid json")
    const result = await configValidationCheck.check()
    expect(result.status).toBe("fail")
    expect(result.message).toContain("Invalid JSONC")
  })
})

describe("authCheck", () => {
  test("fails when no provider configured and no cache", async () => {
    const result = await authCheck.check()
    expect(result.status).toBe("fail")
    expect(result.message).toContain("No API providers")
  })

  test("warns when providers found in config but cache empty", async () => {
    const configPath = join(homedir(), ".config", "opencode", "opencode.json")
    mockFiles.add(configPath)
    mockFileContents.set(
      configPath,
      JSON.stringify({
        plugin: ["opencode-matrixx"],
        provider: { anthropic: { apiKey: "sk-ant-xxx" } },
      }),
    )
    const result = await authCheck.check()
    expect(result.status).toBe("warn")
    expect(result.message).toContain("connected-providers cache empty")
  })

  test("passes when cache has providers", async () => {
    const cachePath = join(homedir(), ".cache", "matrixx", "connected-providers.json")
    mockFiles.add(cachePath)
    mockFileContents.set(cachePath, JSON.stringify({ connected: ["anthropic"], updatedAt: new Date().toISOString() }))
    const result = await authCheck.check()
    expect(result.status).toBe("pass")
    expect(result.message).toContain("Configured providers")
  })
})

describe("runtimeDepsCheck", () => {
  test("detects missing runtimes (default mock fails)", async () => {
    const result = await runtimeDepsCheck.check()
    expect(result.status).toBe("fail")
    expect(result.message).toContain("missing")
  })

  test("reports all present when spawn succeeds", async () => {
    mockBunSpawnSyncResults = [
      { exitCode: 0, stdout: "Bun 1.2.3", stderr: "" },
      { exitCode: 0, stdout: "v22.0.0", stderr: "" },
      { exitCode: 0, stdout: "git version 2.45.0", stderr: "" },
      { exitCode: 0, stdout: "Python 3.11.0", stderr: "" },
    ]
    const result = await runtimeDepsCheck.check()
    expect(result.status).toBe("pass")
    expect(result.message).toContain("Bun")
    expect(result.message).toContain("Node.js")
    expect(result.message).toContain("Git")
    expect(result.message).toContain("Python3")
  })
})

describe("optionalToolsCheck", () => {
  test("reports tools as missing (default mock fails)", async () => {
    const result = await optionalToolsCheck.check()
    expect(result.status).toBe("warn")
    expect(result.message).toContain("Missing")
  })
})

describe("mcpPrerequisitesCheck", () => {
  test("fails when uvx not installed (default mock fails)", async () => {
    const result = await mcpPrerequisitesCheck.check()
    expect(result.status).toBe("fail")
    expect(result.message).toContain("uvx")
  })

  test("passes when uvx installed and package resolves", async () => {
    mockBunSpawnSyncResults = [
      { exitCode: 0, stdout: "uvx 0.12.4", stderr: "" },
      { exitCode: 0, stdout: "usage: markitdown-mcp [-h] [--http]", stderr: "" },
    ]
    const result = await mcpPrerequisitesCheck.check()
    expect(result.status).toBe("pass")
    expect(result.message).toContain("uvx")
  })

  test("warns when uvx installed but markitdown-mcp cannot be resolved", async () => {
    mockBunSpawnSyncResults = [
      { exitCode: 0, stdout: "uvx 0.12.4", stderr: "" },
      { exitCode: 1, stdout: "", stderr: "error: package not found" },
    ]
    const result = await mcpPrerequisitesCheck.check()
    expect(result.status).toBe("warn")
    expect(result.message).toContain("uvx")
  })
})

describe("integration checks", () => {
  test("headroom disabled skips", async () => {
    const { headroomCheck } = await import("../../../src/cli/doctor/checks/headroom")
    const result = await headroomCheck.check()
    expect(result.status).toBe("pass")
    expect(result.message).toContain("disabled")
  })
  test("rtk disabled skips", async () => {
    const { rtkCheck } = await import("../../../src/cli/doctor/checks/rtk")
    const result = await rtkCheck.check()
    expect(result.status).toBe("pass")
    expect(result.message).toContain("disabled")
  })
  test("dcp passes or warns based on plugin presence", async () => {
    const { dcpCheck } = await import("../../../src/cli/doctor/checks/dcp")
    const result = await dcpCheck.check()
    expect(["pass", "warn"]).toContain(result.status)
  })
  test("context-mode warns when not registered", async () => {
    const { contextModeCheck } = await import("../../../src/cli/doctor/checks/context-mode")
    const result = await contextModeCheck.check()
    expect(["pass", "warn"]).toContain(result.status)
  })
  test("tmux disabled skips", async () => {
    const { tmuxCheck } = await import("../../../src/cli/doctor/checks/tmux")
    const result = await tmuxCheck.check()
    expect(result.status).toBe("pass")
    expect(result.message).toContain("disabled")
  })
  test("docker handles missing gracefully", async () => {
    const { dockerCheck } = await import("../../../src/cli/doctor/checks/docker")
    const result = await dockerCheck.check()
    expect(["pass", "warn"]).toContain(result.status)
  })
})
