import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { getOmoOpenCodeCacheDir } from "../../../shared/data-path"
import { parseJsoncSafe } from "../../../shared/jsonc-parser"
import { getOpenCodeConfigDir } from "../../../shared/opencode-config-dir"
import type { CheckResult, DoctorCheck } from "../types"

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
    return {
      name: "context-mode-integration",
      status: "pass",
      message: `context-mode plugin registered${hasCache ? ", cache present" : " (cache not yet created)"}`,
      detail: `Cache: ${cacheDir}`,
    }
  },
}
