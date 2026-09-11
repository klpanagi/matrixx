import type { PluginInput } from "@opencode-ai/plugin"

import { normalizeSDKResponse } from "../../shared"
import { hasPendingQuestionMessage } from "../../shared/awaiting-user"
import { log } from "../../shared/logger"

const HOOK_NAME = "stop-continuation-guard"

interface StopContinuationGuardOptions {
  backgroundManager?: {
    cancelAllForSession: (sessionID: string) => number
  }
  // Parity with the countdown-start / inject-time awaiting-user guards:
  // consulted before cancelling background tasks so in-flight subagents
  // that asked a question are not killed while the user owes an answer.
  isAwaitingUser?: (sessionID: string) => boolean
}

export interface StopContinuationGuard {
  event: (input: { event: { type: string; properties?: unknown } }) => Promise<void>
  "chat.message": (input: { sessionID?: string }) => Promise<void>
  stop: (sessionID: string) => Promise<void>
  isStopped: (sessionID: string) => boolean
  clear: (sessionID: string) => void
}

export function createStopContinuationGuardHook(
  ctx: PluginInput,
  options?: StopContinuationGuardOptions
): StopContinuationGuard {
  const stoppedSessions = new Set<string>()

  const isSessionAwaitingUser = async (sessionID: string): Promise<boolean> => {
    if (options?.isAwaitingUser?.(sessionID)) return true
    try {
      const resp = await ctx.client.session.messages({
        path: { id: sessionID },
        query: { directory: ctx.directory },
      })
      return hasPendingQuestionMessage(normalizeSDKResponse(resp, [] as Array<unknown>))
    } catch (error) {
      log(`[${HOOK_NAME}] Messages fetch failed, assuming not awaiting user`, { sessionID, error: String(error) })
      return false
    }
  }

  const stop = async (sessionID: string): Promise<void> => {
    stoppedSessions.add(sessionID)
    log(`[${HOOK_NAME}] Continuation stopped for session`, { sessionID })

    if (!options?.backgroundManager) return

    if (await isSessionAwaitingUser(sessionID)) {
      log(`[${HOOK_NAME}] Background cancellation suppressed: awaiting user`, { sessionID })
      return
    }

    const cancelled = options.backgroundManager.cancelAllForSession(sessionID)
    if (cancelled > 0) {
      log(`[${HOOK_NAME}] Cancelled ${cancelled} background task(s) for session`, { sessionID })
    }
  }

  const isStopped = (sessionID: string): boolean => {
    return stoppedSessions.has(sessionID)
  }

  const clear = (sessionID: string): void => {
    stoppedSessions.delete(sessionID)
    log(`[${HOOK_NAME}] Continuation guard cleared for session`, { sessionID })
  }

  const event = async ({
    event,
  }: {
    event: { type: string; properties?: unknown }
  }): Promise<void> => {
    const props = event.properties as Record<string, unknown> | undefined

    if (event.type === "session.deleted") {
      const sessionInfo = props?.info as { id?: string } | undefined
      if (sessionInfo?.id) {
        clear(sessionInfo.id)
        log(`[${HOOK_NAME}] Session deleted: cleaned up`, { sessionID: sessionInfo.id })
      }
    }
  }

  const chatMessage = async ({
    sessionID,
  }: {
    sessionID?: string
  }): Promise<void> => {
    if (sessionID && stoppedSessions.has(sessionID)) {
      clear(sessionID)
      log(`[${HOOK_NAME}] Cleared stop state on new user message`, { sessionID })
    }
  }

  return {
    event,
    "chat.message": chatMessage,
    stop,
    isStopped,
    clear,
  }
}
