import { existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { type ToolDefinition, tool } from "@opencode-ai/plugin/tool"
import type { PluginContext } from "../../plugin/types"
import { PLAN_FILENAME_KEBAB_REGEX, PLANS_DIR } from "./constants"
import { resolveDirectory } from "./types"

export function createPlanListTool(ctx?: PluginContext): ToolDefinition {
  return tool({
    description: `List plan files under .matrixx/plans/*.md. Filters *.md with kebab-case, sorts by mtime.`,
    args: {},
    execute: async (_args, context) => {
      try {
        const directory = resolveDirectory(
          (context as Record<string, unknown>)?.directory,
          (ctx as unknown as Record<string, unknown>)?.directory,
        )
        const plansDir = join(directory, PLANS_DIR)
        if (!existsSync(plansDir)) {
          return JSON.stringify({ plans: [] })
        }
        const entries = readdirSync(plansDir).filter((f) => f.endsWith(".md") && PLAN_FILENAME_KEBAB_REGEX.test(f))
        const plans = entries
          .map((fileName) => {
            const filePath = join(plansDir, fileName)
            try {
              const stat = statSync(filePath)
              return {
                fileName,
                filePath,
                mtime: stat.mtime.toISOString(),
                mtimeMs: stat.mtimeMs,
                size: stat.size,
              }
            } catch {
              return null
            }
          })
          .filter((p): p is NonNullable<typeof p> => p !== null)
          .sort((a, b) => b.mtimeMs - a.mtimeMs)
        return JSON.stringify({ plans })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return JSON.stringify({ error: "internal_error", message })
      }
    },
  })
}
