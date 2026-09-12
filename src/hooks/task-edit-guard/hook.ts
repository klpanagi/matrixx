import type { Hooks, PluginInput } from "@opencode-ai/plugin"

import { log } from "../../shared"
import { BLOCKED_PATTERNS, HOOK_NAME, PLAN_READ_WARN, PLAN_WRITE_WARN } from "./constants"

export function createTaskEditGuardHook(ctx: PluginInput): Hooks {
  return {
    "tool.execute.before": async (input, output: { args: Record<string, unknown>; message?: string }): Promise<void> => {
      const tool = input.tool?.toLowerCase()

      // BLOCK generic Write/Edit to .matrixx/plans/*.md — force plan_* tools
      if (tool === "write" || tool === "edit") {
        const args = output.args as unknown as Record<string, unknown>
        const filePath = (args?.filePath ?? args?.path ?? args?.file) as string | undefined
        if (filePath) {
          const normalized = filePath.toLowerCase().replace(/\\/g, "/")
          if (normalized.includes(".matrixx/plans")) {
            log(`[${HOOK_NAME}] BLOCKED generic Write/Edit to .matrixx/plans — use plan_*`, {
              sessionID: input.sessionID,
              tool: input.tool,
              filePath,
            })
            throw new Error(PLAN_WRITE_WARN)
          }
        }
        return
      }

      // BLOCK generic Read to .matrixx/plans/*.md — force plan_read
      if (tool === "read") {
        const args = output.args as unknown as Record<string, unknown>
        const filePath = (args?.filePath ?? args?.path ?? args?.file) as string | undefined
        if (filePath) {
          const normalized = filePath.toLowerCase().replace(/\\/g, "/")
          if (normalized.includes(".matrixx/plans")) {
            log(`[${HOOK_NAME}] BLOCKED generic Read to .matrixx/plans — use plan_read`, {
              sessionID: input.sessionID,
              tool: input.tool,
              filePath,
            })
            throw new Error(PLAN_READ_WARN)
          }
        }
        return
      }

      if (tool !== "bash") return

      const args = output.args as unknown as Record<string, unknown>
      const cmd = args?.command as string | undefined
      if (!cmd) return

      // Allow read-only grep without mutation: e.g. grep -r ".matrixx/plans"
      // Only block when a mutation tool (sed/python/etc.) is present alongside the path.
      const lower = cmd.toLowerCase()
      if (lower.includes("grep") && !lower.includes("sed") && !lower.includes("python")) {
        // Quick allow for pure grep reads — none of the BLOCKED_PATTERNS should hit anyway,
        // but keep an explicit fast-path to avoid false positives if patterns evolve.
        const isOnlyGrep = BLOCKED_PATTERNS.every((rx) => !rx.test(cmd))
        if (isOnlyGrep) return
      }

      const hit = BLOCKED_PATTERNS.some((rx) => rx.test(cmd))
      if (!hit) return

      // ctx.directory is available for absolute-path resolution if needed;
      // substring match on ".matrixx/plans" / ".matrixx/tasks" already covers absolute paths.
      void ctx.directory

      log(`[${HOOK_NAME}] BLOCKED raw bash edit`, {
        sessionID: input.sessionID,
        command: cmd.slice(0, 120),
      })

      throw new Error(
        "Blocked: raw bash edit to plan/task files. " +
          "Use plan_update (hashline IDs) for .matrixx/plans/*.md and task_create/task_update/task_cleanup for .matrixx/tasks/T-*.json — raw bash sed/python bypasses project-scoped task system",
      )
    },
  }
}
