import { describe, expect, mock, test } from "bun:test"
import type { PluginInput } from "@opencode-ai/plugin"
import { injectContinuation } from "./continuation-injection"
import { handleSessionIdle } from "./idle-event"
import { createSessionStateStore } from "./session-state"

// ASSUMPTION (parity with task enforcer, discovery audit 2026-09-11):
// No awaiting-user signal exists in source. Future fix (TODO 4) mirrors TODO 3
// verbatim: guard at countdown-start (handleSessionIdle -> startCountdown,
// countdown.ts:32) and inject-time (injectContinuation -> promptAsync,
// continuation-injection.ts:34/144). Same two channels: (A) session.messages
// with pending question, (B) awaitingUser=true state marker. Legacy path gated
// by experimental.task_system=false still scopes this file. RED: suppression
// assertions fail before fix.

function pendingTodos(): Array<unknown> {
  return [{ content: "todo one", status: "pending", priority: "high" }]
}

function awaitingQuestionMessages(): Array<unknown> {
  return [
    { info: { role: "assistant", agent: "build" }, parts: [{ type: "text", text: "Which option should I use?" }] },
  ]
}

function makeCtx(
  toastMock: ReturnType<typeof mock>,
  messages: Array<unknown>,
  todos: Array<unknown>,
  promptAsyncMock?: ReturnType<typeof mock>,
): PluginInput {
  return {
    directory: "/tmp",
    client: {
      tui: { showToast: toastMock },
      session: {
        messages: async () => ({ data: messages }) as unknown as never,
        todo: async () => ({ data: todos }) as unknown as never,
        promptAsync: promptAsyncMock ?? (async () => ({})),
      },
    },
  } as unknown as PluginInput
}

function markAwaitingUser(store: ReturnType<typeof createSessionStateStore>, sessionID: string): void {
  const record = store.getState(sessionID) as unknown as Record<string, unknown>
  record["awaitingUser"] = true
}

describe("todo-continuation awaiting-user guard (RED)", () => {
  test("countdown-start suppressed when awaiting-user=true", async () => {
    //#given a session with pending todos awaiting user answer
    const toastMock = mock(async () => ({} as never))
    const ctx = makeCtx(toastMock, awaitingQuestionMessages(), pendingTodos())
    const store = createSessionStateStore()
    markAwaitingUser(store, "await-1")
    //#when idle fires while awaiting user
    await handleSessionIdle({ ctx, sessionID: "await-1", sessionStateStore: store, skipAgents: [] })
    //#then no countdown starts (hijack suppressed)
    expect(toastMock).not.toHaveBeenCalled()
    expect(store.getState("await-1").countdownTimer).toBeUndefined()
    store.shutdown()
  })

  test("inject-time suppressed when awaiting-user=true (race)", async () => {
    //#given countdown already started but user was asked meanwhile
    const toastMock = mock(async () => ({} as never))
    const promptAsyncMock = mock(async () => ({} as never))
    const ctx = makeCtx(toastMock, awaitingQuestionMessages(), pendingTodos(), promptAsyncMock)
    const store = createSessionStateStore()
    store.getState("await-2")
    markAwaitingUser(store, "await-2")
    //#when inject runs while awaiting user
    await injectContinuation({ ctx, sessionID: "await-2", sessionStateStore: store, skipAgents: [] })
    //#then no continuation prompt hijacks the pending question
    expect(promptAsyncMock).not.toHaveBeenCalled()
    store.shutdown()
  })

  test("enforcement fires when awaiting-user=false with pending work", async () => {
    //#given a session with pending todos and no awaiting flag
    const toastMock = mock(async () => ({} as never))
    const promptAsyncMock = mock(async () => ({} as never))
    const ctx = makeCtx(toastMock, [], pendingTodos(), promptAsyncMock)
    const store = createSessionStateStore()
    //#when idle fires and inject runs without awaiting signal
    await handleSessionIdle({ ctx, sessionID: "await-3", sessionStateStore: store, skipAgents: [] })
    await injectContinuation({ ctx, sessionID: "await-3b", sessionStateStore: store, skipAgents: [] })
    //#then enforcement still fires (control case)
    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(promptAsyncMock).toHaveBeenCalledTimes(1)
    store.shutdown()
  })

  test("suppression bounded: resumes after user responds", async () => {
    //#given a suppressed session that later receives user answer
    const toastMock = mock(async () => ({} as never))
    const ctxAwaiting = makeCtx(toastMock, awaitingQuestionMessages(), pendingTodos())
    const store = createSessionStateStore()
    markAwaitingUser(store, "await-4")
    //#when idle fires while awaiting then user responds and idle refires
    await handleSessionIdle({ ctx: ctxAwaiting, sessionID: "await-4", sessionStateStore: store, skipAgents: [] })
    expect(toastMock).not.toHaveBeenCalled()
    expect(store.getState("await-4").countdownTimer).toBeUndefined()
    const record = store.getState("await-4") as unknown as Record<string, unknown>
    record["awaitingUser"] = false
    const ctxAnswered = makeCtx(toastMock, [], pendingTodos())
    await handleSessionIdle({ ctx: ctxAnswered, sessionID: "await-4", sessionStateStore: store, skipAgents: [] })
    //#then enforcement resumes (bounded suppress, no indefinite mute)
    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(store.getState("await-4").countdownTimer).toBeDefined()
    store.shutdown()
  })
})
