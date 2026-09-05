import type { Hooks } from "@opencode-ai/plugin"

import type { MatrixxConfig } from "../../config"
import { log } from "../../shared"
import {
  BLOCK_MESSAGE_GREP_GLOB,
  HOOK_NAME,
  WARN_MESSAGE_BASH_READ,
  WARN_MESSAGE_READ,
} from "./constants"

const BASH_FILE_READ_RE = /^\s*(cat|head|tail)\s+/
const BASH_GREP_RE = /\bgrep\b/

function resolveContextModeConfig(pluginConfig: MatrixxConfig) {
  const cfg = pluginConfig.context_mode
  return {
    enabled: cfg?.enabled ?? true,
    enforce: cfg?.enforce ?? false,
    blockedTools: new Set((cfg?.blocked_tools ?? ["grep", "glob"]).map((t) => t.toLowerCase())),
  }
}

export function createContextModeEnforcerHook(pluginConfig: MatrixxConfig): Hooks {
  const { enabled, enforce, blockedTools } = resolveContextModeConfig(pluginConfig)

  return {
    "tool.execute.before": async (input, output: { args: Record<string, unknown>; message?: string }): Promise<void> => {
      if (!enabled) return

      const tool = input.tool.toLowerCase()
      const isBlocked = blockedTools.has(tool)
      const isRead = tool === "read"
      const isGrepGlob = tool === "grep" || tool === "glob"
      const isBash = tool === "bash"

      if (isBash) {
        const command = output.args.command
        if (typeof command !== "string") return
        const isFileRead = BASH_FILE_READ_RE.test(command)
        const isGrep = BASH_GREP_RE.test(command)
        if (!isFileRead && !isGrep) return

        if (enforce && blockedTools.has("bash")) {
          log(`[${HOOK_NAME}] BLOCKED bash file read`, {
            sessionID: input.sessionID,
            command: command.slice(0, 120),
          })
          throw new Error(`${BLOCK_MESSAGE_GREP_GLOB}\n\nBash command: ${command.slice(0, 200)}`)
        }

        output.message = WARN_MESSAGE_BASH_READ
        log(`[${HOOK_NAME}] warned on bash`, { sessionID: input.sessionID, command: command.slice(0, 120) })
        return
      }

      if (isRead) {
        if (!isBlocked) return
        output.message = WARN_MESSAGE_READ
        log(`[${HOOK_NAME}] warned on read (soft)`, { sessionID: input.sessionID })
        return
      }

      if (isGrepGlob) {
        if (!isBlocked) return
        if (enforce) {
          log(`[${HOOK_NAME}] BLOCKED ${tool}`, { sessionID: input.sessionID })
          throw new Error(BLOCK_MESSAGE_GREP_GLOB)
        }
        output.message = WARN_MESSAGE_READ
        log(`[${HOOK_NAME}] warned on ${tool} (soft)`, { sessionID: input.sessionID })
      }
    },
  }
}
