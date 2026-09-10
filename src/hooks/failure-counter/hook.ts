import type { PluginInput } from "@opencode-ai/plugin"

import { clearFailureCounter } from "../../features/session-state/state"
import { handleToolAfter } from "./counter"

function isSuccessOutput(output: string): boolean {
  if (!output) return true
  if (output.includes("[ERROR]") || output.includes("Error:")) return false
  return true
}

export function createFailureCounterHook(_ctx: PluginInput) {
  return {
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { title: string; output: string; metadata: unknown },
    ) => {
      const tool = input.tool.toLowerCase()
      if (tool !== "task" && tool !== "delegate_agent") return
      if (typeof output.output !== "string") return

      const isSuccess = isSuccessOutput(output.output)
      handleToolAfter(input.sessionID, output.output, isSuccess)
    },

    event: async (input: { event: { type: string; properties: Record<string, unknown> } }) => {
      if (input.event.type === "session.compacted") {
        const sessionID = (input.event.properties as { sessionID?: string }).sessionID as string | undefined
        if (sessionID) {
          clearFailureCounter(sessionID)
        }
      }
      if (input.event.type === "session.deleted") {
        const sessionID = (input.event.properties as { sessionID?: string }).sessionID as string | undefined
        if (sessionID) {
          clearFailureCounter(sessionID)
        }
      }
    },
  }
}
