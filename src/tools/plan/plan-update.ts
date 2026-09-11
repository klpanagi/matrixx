import { existsSync } from "node:fs"
import { type ToolDefinition, tool } from "@opencode-ai/plugin/tool"
import type { PluginContext } from "../../plugin/types"
import { executeHashlineEditTool } from "../hashline-edit/hashline-edit-executor"
import { resolveDirectory, validatePlanFilePath } from "./types"

export function createPlanUpdateTool(ctx?: PluginContext): ToolDefinition {
  return tool({
    description: `Update a plan file under .matrixx/plans/*.md via hashline edits. Delegates to executeHashlineEditTool scoped to PLANS_DIR. Requires LINE#ID anchors, validates file exists.`,
    args: {
      filePath: tool.schema.string().describe("Absolute path to the file to edit (must be inside .matrixx/plans, kebab-case .md)"),
      edits: tool.schema
        .array(
          tool.schema.object({
            op: tool.schema.union([tool.schema.literal("replace"), tool.schema.literal("append"), tool.schema.literal("prepend")]).describe("Hashline edit operation mode"),
            pos: tool.schema.string().optional().describe("Primary anchor in LINE#ID format"),
            end: tool.schema.string().optional().describe("Range end anchor in LINE#ID format"),
            lines: tool.schema.union([tool.schema.array(tool.schema.string()), tool.schema.string(), tool.schema.null()]).describe("Replacement or inserted lines"),
          }),
        )
        .describe("Array of edit operations to apply"),
    },
    execute: async (args, context) => {
      try {
        const filePath = args.filePath as string
        const edits = args.edits as Array<Record<string, unknown>>
        if (!Array.isArray(edits) || edits.length === 0) {
          return JSON.stringify({ error: "validation_error", message: "edits must be a non-empty array" })
        }
        for (const e of edits) {
          const op = (e as { op?: string }).op
          if (op === "replace" || op === "append" || op === "prepend") {
            const pos = (e as { pos?: string }).pos
            if (op === "replace" && (!pos || typeof pos !== "string" || pos.trim() === "")) {
              return JSON.stringify({ error: "validation_error", message: "replace op requires LINE#ID pos anchor" })
            }
            if ((op === "append" || op === "prepend") && pos !== undefined) {
              if (typeof pos !== "string" || pos.trim() === "") {
                return JSON.stringify({ error: "validation_error", message: `${op} pos must be LINE#ID if provided` })
              }
            }
          }
        }
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
        const result = await executeHashlineEditTool({ filePath: resolved, edits: edits as never }, context as never, ctx)
        return result
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return JSON.stringify({ error: "internal_error", message })
      }
    },
  })
}
