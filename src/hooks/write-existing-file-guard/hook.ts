import { existsSync } from "node:fs"
import { isAbsolute, join, normalize, resolve, sep } from "node:path"
import type { Hooks, PluginInput } from "@opencode-ai/plugin"

import { log } from "../../shared"

export function createWriteExistingFileGuardHook(ctx: PluginInput): Hooks {
  return {
    "tool.execute.before": async (input, output) => {
      const toolName = input.tool?.toLowerCase()
      if (toolName !== "write") {
        return
      }

      const args = output.args as
        | { filePath?: string; path?: string; file_path?: string }
        | undefined
      const filePath = args?.filePath ?? args?.path ?? args?.file_path
      if (!filePath) {
        return
      }

      const resolvedPath = normalize(
        isAbsolute(filePath) ? filePath : resolve(ctx.directory, filePath)
      )

      if (existsSync(resolvedPath)) {
        const matrixxRoot = join(ctx.directory, ".matrixx") + sep
        const isMatrixMarkdown =
          resolvedPath.startsWith(matrixxRoot) && resolvedPath.endsWith(".md")
        // .matrixx/plans is plan_* tool territory - exclude from the .matrixx/*.md carve-out
        // (separator normalization mirrors task-edit-guard for Windows-style paths)
        const normalizedPath = resolvedPath.replace(/\\/g, "/")
        const isPlansPath = normalizedPath.includes(".matrixx/plans")
        if (isMatrixMarkdown && !isPlansPath) {
          log("[write-existing-file-guard] Allowing .matrixx/*.md overwrite", {
            sessionID: input.sessionID,
            filePath,
          })
          return
        }

        log("[write-existing-file-guard] Blocking write to existing file", {
          sessionID: input.sessionID,
          filePath,
          resolvedPath,
        })

        throw new Error("File already exists. Use edit tool instead.")
      }
    },
  }
}
