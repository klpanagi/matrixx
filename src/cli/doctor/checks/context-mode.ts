import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { getOmoOpenCodeCacheDir, getOpenCodeCacheDir } from "../../../shared/data-path"
import { parseJsoncSafe } from "../../../shared/jsonc-parser"
import { getOpenCodeConfigDir } from "../../../shared/opencode-config-dir"
import type { CheckResult, DoctorCheck } from "../types"

function resolveDisciplineInfo(): { path: string | null; version: string | null } {
  const candidates: string[] = []
  try {
    const resolved = require.resolve("context-mode/configs/opencode/AGENTS.md")
    candidates.push(resolved)
  } catch {}
  try {
    candidates.push(join(getOpenCodeCacheDir(), "packages/context-mode@latest/node_modules/context-mode/configs/opencode/AGENTS.md"))
  } catch {}
  try {
    const base = process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache")
    candidates.push(join(base, "opencode/packages/context-mode@latest/node_modules/context-mode/configs/opencode/AGENTS.md"))
  } catch {}
  for (const p of candidates) {
    try {
      if (existsSync(p)) {
        let version: string | null = null
        try {
          const pkgPath = join(p.replace(/configs\/opencode\/AGENTS\.md$/, ""), "package.json")
          const pkgRaw = readFileSync(pkgPath, "utf-8")
          const pkg = JSON.parse(pkgRaw)
          if (typeof pkg.version === "string") version = pkg.version
        } catch {}
        return { path: p, version }
      }
    } catch {}
  }
  return { path: null, version: null }
}

function loadContextModeConfig(): { enabled: boolean } | null {
  const dir = getOpenCodeConfigDir({ binary: "opencode" })
  const bases = [join(dir, "matrixx"), join(process.cwd(), ".opencode", "matrixx"), join(process.cwd(), "matrixx")]
  for (const base of bases) {
    for (const ext of [".jsonc", ".json"]) {
      const p = `${base}${ext}`
      if (!existsSync(p)) continue
      try {
        const c = readFileSync(p, "utf-8")
        const parsed = parseJsoncSafe<Record<string, unknown>>(c)
        if (!parsed.data || parsed.errors.length > 0) continue
        const cm = parsed.data.context_mode as Record<string, unknown> | undefined
        if (cm && typeof cm.enabled === "boolean") return { enabled: cm.enabled as boolean }
      } catch {}
    }
  }
  return null
}

function hasContextModePlugin(): boolean {
  const dir = getOpenCodeConfigDir({ binary: "opencode" })
  for (const name of ["opencode.jsonc", "opencode.json"]) {
    const p = join(dir, name)
    if (!existsSync(p)) continue
    try {
      const c = readFileSync(p, "utf-8")
      const parsed = parseJsoncSafe<Record<string, unknown>>(c)
      if (!parsed.data || parsed.errors.length > 0) continue
      const plugin = parsed.data.plugin
      if (!Array.isArray(plugin)) continue
      for (const entry of plugin) {
        if (typeof entry !== "string") continue
        if (entry === "context-mode" || entry === "@tarquinen/context-mode" || entry === "opencode-context-mode" || entry.includes("context-mode")) return true
      }
    } catch {}
  }
  return false
}

export const contextModeCheck: DoctorCheck = {
  name: "context-mode-integration",
  category: "integrations",
  check: (): CheckResult => {
    const cfg = loadContextModeConfig()
    if (cfg && !cfg.enabled) {
      return {
        name: "context-mode-integration",
        status: "pass",
        message: "context-mode disabled via matrixx.jsonc — skipping",
        detail: "Set context_mode.enabled:true in matrixx.jsonc to enable discipline and enforcer",
      }
    }
    const hasPlugin = hasContextModePlugin()
    const cacheDir = getOmoOpenCodeCacheDir()
    const hasCache = existsSync(cacheDir)
    if (!hasPlugin) {
      return {
        name: "context-mode-integration",
        status: "warn",
        message: "context-mode plugin not registered",
        detail: `Add "context-mode" to plugin array in ${join(getOpenCodeConfigDir({ binary: "opencode" }), "opencode.jsonc")}\nCache dir: ${cacheDir} ${hasCache ? "(exists)" : "(not found — will be created on first use)"}`,
      }
    }
    const discipline = resolveDisciplineInfo()
    const disciplineLine = discipline.path ? `Discipline: ${discipline.path}${discipline.version ? ` (v${discipline.version})` : ""}` : "Discipline: not found — fallback table in use"
    return {
      name: "context-mode-integration",
      status: "pass",
      message: `context-mode plugin registered${hasCache ? ", cache present" : " (cache not yet created)"}${discipline.version ? `, discipline v${discipline.version}` : ""}`,
      detail: `Cache: ${cacheDir}\n${disciplineLine}\nPlan tools: plan_create/read/update/list/delete (unconditional)`,
    }
  },
}
