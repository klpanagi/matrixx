/// <reference types="bun-types" />
import { describe, expect, mock, test } from "bun:test"

import { isAwaitingUserState, markAwaitingUser } from "../../shared/awaiting-user"
import type { SessionStateStore } from "../task-continuation-enforcer/session-state"
import { createSessionStateStore } from "../task-continuation-enforcer/session-state"
import { createStopContinuationGuardHook } from "./hook"

function makeMockPluginInput(): unknown {
  return {
    directory: "/tmp/test-project",
    client: {
      tui: { showToast: async () => ({}) },
      session: {
        messages: async () => ({ data: [] }),
        promptAsync: async () => ({}),
      },
    },
  } as unknown
}

interface MockBackgroundManager {
  cancelAllForSession: ReturnType<typeof mock>
  getTasksByParentSession: ReturnType<typeof mock>
}

function makeMockBackgroundManager(): MockBackgroundManager {
  return {
    cancelAllForSession: mock(() => 0),
    getTasksByParentSession: mock(() => []),
  }
}

function markAwaitingUserOnStore(store: SessionStateStore, sessionID: string): void {
  const record = store.getState(sessionID) as unknown as Record<string, unknown>
  markAwaitingUser(record)
}

// Guard wired to the same session state store the enforcer uses, so the
// awaiting-user flag set by markAwaitingUser is visible to stop().
function makeGuardWithStore(
  bgManager: MockBackgroundManager,
  store: SessionStateStore,
): ReturnType<typeof createStopContinuationGuardHook> {
  return createStopContinuationGuardHook(makeMockPluginInput() as never, {
    backgroundManager: bgManager,
    isAwaitingUser: (sessionID: string) =>
      isAwaitingUserState(store.getExistingState(sessionID)),
  })
}

describe("stop-continuation-guard awaiting-user guard", () => {
  describe("Mode B: stop() must not kill subagents while awaiting user", () => {
    test("stop() does NOT call cancelAllForSession when awaitingUser=true", async () => {
      //#given a session awaiting user answer (subagent asked a question)
      const bgManager = makeMockBackgroundManager()
      const store = createSessionStateStore()
      const guard = makeGuardWithStore(bgManager, store)
      const sessionID = "session-awaiting-2"
      markAwaitingUserOnStore(store, sessionID)

      //#when stop is called
      await guard.stop(sessionID)

      //#then cancelAllForSession should NOT be called (awaiting-user suppresses)
      expect(bgManager.cancelAllForSession).not.toHaveBeenCalled()

      store.shutdown()
    })

    test("control: stop() calls cancelAllForSession when NOT awaitingUser", async () => {
      //#given a session that is NOT awaiting user
      const bgManager = makeMockBackgroundManager()
      const store = createSessionStateStore()
      const guard = makeGuardWithStore(bgManager, store)
      const sessionID = "session-active-1"

      //#when stop is called
      await guard.stop(sessionID)

      //#then cancelAllForSession SHOULD be called (no awaitingUser = safe to stop)
      expect(bgManager.cancelAllForSession).toHaveBeenCalledTimes(1)
      expect(bgManager.cancelAllForSession).toHaveBeenCalledWith(sessionID)

      store.shutdown()
    })

    test("isStopped() still returns true regardless of awaitingUser (stop flag still set)", async () => {
      //#given session with awaitingUser
      const bgManager = makeMockBackgroundManager()
      const store = createSessionStateStore()
      const guard = makeGuardWithStore(bgManager, store)
      const sessionID = "session-awaiting-3"
      markAwaitingUserOnStore(store, sessionID)

      //#when stop is called
      await guard.stop(sessionID)

      //#then isStopped should still return true (continuation is still blocked)
      // The awaiting-user guard should only suppress background task cancellation,
      // not prevent the stoppedSessions flag from being set
      expect(guard.isStopped(sessionID)).toBe(true)

      store.shutdown()
    })
  })

  describe("Mode A: bg_* handle retention through stale timeout window", () => {
    test("Mode A placeholder: documenting the stale timeout behavior expectation", () => {
      //#given BackgroundManager behavior
      // DEFAULT_STALE_TIMEOUT_MS = 180_000 (3 minutes)
      // TASK_TTL_MS = 30 * 60 * 1000 (30 minutes)

      //#when a bg_* task is running for >3 minutes but <30 minutes

      //#then
      // - getTasksByParentSession() should still contain the task
      // - task.status should still be "running"
      // - TASK_TTL_MS (30min) is the real pruning threshold, not DEFAULT_STALE_TIMEOUT_MS

      // This test documents behavior rather than asserting bugs.
      expect(true).toBe(true)
    })
  })
})
