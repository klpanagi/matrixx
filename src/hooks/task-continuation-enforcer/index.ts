import type { PluginInput } from "@opencode-ai/plugin"
import { isAwaitingUserState } from "../../shared/awaiting-user"
import { log } from "../../shared/logger"
import { DEFAULT_SKIP_AGENTS, HOOK_NAME } from "./constants"
import { createTaskContinuationHandler } from "./handler"
import { createSessionStateStore } from "./session-state"
import type { TaskContinuationEnforcer, TaskContinuationEnforcerOptions } from "./types"

export { createTaskContinuationHandler } from "./handler"
export type { TaskContinuationEnforcer, TaskContinuationEnforcerOptions } from "./types"

export function createTaskContinuationEnforcer(
  ctx: PluginInput,
  options: TaskContinuationEnforcerOptions = {}
): TaskContinuationEnforcer {
  const {
    backgroundManager,
    skipAgents = DEFAULT_SKIP_AGENTS,
    isContinuationStopped,
    config,
  } = options

  const sessionStateStore = createSessionStateStore()

  const isAwaitingUser = (sessionID: string): boolean =>
    isAwaitingUserState(sessionStateStore.getExistingState(sessionID))

  const markRecovering = (sessionID: string): void => {
    const state = sessionStateStore.getState(sessionID)
    state.isRecovering = true
    sessionStateStore.cancelCountdown(sessionID)
    log(`[${HOOK_NAME}] Session marked as recovering`, { sessionID })
  }

  const markRecoveryComplete = (sessionID: string): void => {
    const state = sessionStateStore.getExistingState(sessionID)
    if (state) {
      state.isRecovering = false
      log(`[${HOOK_NAME}] Session recovery complete`, { sessionID })
    }
  }

  const handler = createTaskContinuationHandler({
    ctx,
    sessionStateStore,
    backgroundManager,
    skipAgents,
    isContinuationStopped,
    config,
  })

  const cancelAllCountdowns = (): void => {
    sessionStateStore.cancelAllCountdowns()
    log(`[${HOOK_NAME}] All countdowns cancelled`)
  }

  return {
    handler,
    markRecovering,
    markRecoveryComplete,
    cancelAllCountdowns,
    isAwaitingUser,
  }
}

// Back-compat alias
export const createTodoContinuationEnforcer = createTaskContinuationEnforcer
