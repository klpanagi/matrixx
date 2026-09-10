import { clearFailureCounter, getFailureCount, getFailureState, incFailureCounter, resetFailureCounter } from "../../features/session-state/state"
import { isCountableFailure } from "./patterns"

export const CONTINUATION_COOLDOWN_MS = 30_000

export interface HandleToolAfterOptions {
  parentSessionID?: string
}

export function handleToolAfter(sessionID: string, output: string, isSuccess: boolean, options?: HandleToolAfterOptions): void {
  const targetSessionID = options?.parentSessionID ?? sessionID

  if (isSuccess) {
    resetFailureCounter(targetSessionID)
    // If background attribution, also clear child entry to avoid double-count
    if (options?.parentSessionID && options.parentSessionID !== sessionID) {
      clearFailureCounter(sessionID)
    }
    return
  }

  if (!isCountableFailure(output)) return

  // 30s dedupe: skip if last failure was within cooldown
  const existing = getFailureState(targetSessionID)
  if (existing && Date.now() - existing.lastFailedAt < CONTINUATION_COOLDOWN_MS) {
    return
  }

  incFailureCounter(targetSessionID)
}

export { clearFailureCounter, getFailureCount, resetFailureCounter }
