import { existsSync, unlinkSync } from "node:fs"
import { type ToolDefinition, tool } from "@opencode-ai/plugin/tool"
import type { PluginContext } from "../../plugin/types"
import { resolveDirectory, validatePlanFilePath } from "./types"

export function createPlanDeleteTool(ctx?: PluginContext): ToolDefinition {
  return tool({
    description: `Delete a plan file under .matrixx/plans/*.md. Scoped unlink inside PLANS_DIR, refuses outside paths.`,
    args: {
      filePath: tool.schema.string().describe("Path to plan file to delete (must be inside .matrixx/plans, kebab-case .md)"),
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
        unlinkSync(resolved)
        return JSON.stringify({ success: true, filePath: resolved, message: `Deleted ${resolved}` })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return JSON.stringify({ error: "internal_error", message })
      }
    },
  })
}
