import { existsSync, statSync } from "node:fs"
import { type ToolDefinition, tool } from "@opencode-ai/plugin/tool"
import { readPlanFile } from "../../features/mission-state/plan-storage"
import type { PluginContext } from "../../plugin/types"
import { formatHashLines } from "../hashline-edit/hash-computation"
import { MAX_PLAN_FILE_BYTES } from "./constants"
import { resolveDirectory, validatePlanFilePath } from "./types"

export function createPlanReadTool(ctx?: PluginContext): ToolDefinition {
  return tool({
    description: `Read a plan file from .matrixx/plans/*.md with hashline-tagged output (1#AB|content) + lsp-style. Enforces scoping and ${MAX_PLAN_FILE_BYTES} byte cap.`,
    args: {
      filePath: tool.schema.string().describe("Path to plan file (must be inside .matrixx/plans, kebab-case .md)"),
    },
    execute: async (args, context) => {
      try {
        const filePath = args.filePath as string
        const directory = resolveDirectory(
          (context as Record<string, unknown>)?.directory,
          (ctx as unknown as Record<string, unknown>)?.directory,
        )
        const validation = validatePlanFilePath(filePath, directory)
        if ("error" in validation) {
          return JSON.stringify({ error: "invalid_file_path", message: validation.error })
        }
        const resolved = validation.resolved
        if (!existsSync(resolved)) {
          return JSON.stringify({ error: "file_not_found", message: `File not found: ${resolved}` })
        }
        try {
          const stat = statSync(resolved)
          if (stat.size > MAX_PLAN_FILE_BYTES) {
            return JSON.stringify({
              error: "file_too_large",
              message: `File exceeds ${MAX_PLAN_FILE_BYTES} bytes (${stat.size}). Consider compressing the plan.`,
              filePath: resolved,
              size: stat.size,
            })
          }
        } catch {}
        const content = readPlanFile(resolved)
        if (content === null) {
          return JSON.stringify({
            error: "read_failed",
            message: `Failed to read ${resolved} (too large or unreadable, cap ${MAX_PLAN_FILE_BYTES})`,
            filePath: resolved,
          })
        }
        const hashline = formatHashLines(content)
        return JSON.stringify({ filePath: resolved, content, hashline })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return JSON.stringify({ error: "internal_error", message })
      }
    },
  })
}
