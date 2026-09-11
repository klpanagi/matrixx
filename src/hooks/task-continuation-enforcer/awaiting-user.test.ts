import { describe, expect, mock, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import { injectContinuation } from "./continuation-injection"
import { handleSessionIdle } from "./idle-event"
import { createSessionStateStore } from "./session-state"

// ASSUMPTION (discovery audit 2026-09-11, .matrixx/notepads/fix-task-continuation-hijack/learnings.md):
// No awaiting-user signal exists in source (rg for awaiting hits only unrelated
// runtime-fallback). SessionState has no awaiting field; mission/matrix-loop have
// no blocked flag. Future fix (TODO 3) will add a guard at countdown-start
// (handleSessionIdle -> startCountdown, countdown.ts:32) and inject-time
// (injectContinuation -> promptAsync, continuation-injection.ts:37/193).
// Tests simulate awaiting-user via two channels the guard must honor:
// (A) session.messages returns a pending assistant question awaiting user answer,
// (B) explicit state marker awaitingUser=true on the SessionStateStore state
// (matrix-loop/mission disposition state, set via Record cast to stay type-clean).
// Current code ignores both channels, so suppression assertions FAIL (RED).

function writeValidTask(dir: string, id: string, status = "pending"): void {
  mkdirSync(join(dir, ".matrixx", "tasks"), { recursive: true })
  writeFileSync(
    join(dir, ".matrixx", "tasks", `${id}.json`),
    JSON.stringify({ id, subject: `task ${id}`, description: "d", status, blocks: [], blockedBy: [], threadID: "thr-1" }),
  )
}

function awaitingQuestionMessages(): Array<unknown> {
  return [
    { info: { role: "assistant", agent: "build" }, parts: [{ type: "text", text: "Which option should I use?" }] },
  ]
}

function makeCtx(
  dir: string,
  toastMock: ReturnType<typeof mock>,
  messages: Array<unknown>,
  promptAsyncMock?: ReturnType<typeof mock>,
): PluginInput {
  return {
    directory: dir,
    client: {
      tui: { showToast: toastMock },
      session: {
        messages: async () => ({ data: messages }) as unknown as never,
        promptAsync: promptAsyncMock ?? (async () => ({})),
      },
    },
  } as unknown as PluginInput
}

function markAwaitingUser(store: ReturnType<typeof createSessionStateStore>, sessionID: string): void {
  const record = store.getState(sessionID) as unknown as Record<string, unknown>
  record["awaitingUser"] = true
}

describe("task-continuation awaiting-user guard (RED)", () => {
  test("countdown-start suppressed when awaiting-user=true", async () => {
    //#given a session with pending work awaiting user answer
    const dir = mkdtempSync(join(tmpdir(), "task-await-"))
    writeValidTask(dir, "T-await-1", "pending")
    const toastMock = mock(async () => ({} as never))
    const ctx = makeCtx(dir, toastMock, awaitingQuestionMessages())
    const store = createSessionStateStore()
    markAwaitingUser(store, "await-1")
    //#when idle fires while awaiting user
    await handleSessionIdle({ ctx, sessionID: "await-1", sessionStateStore: store, skipAgents: [] })
    //#then no countdown starts (hijack suppressed)
    expect(toastMock).not.toHaveBeenCalled()
    expect(store.getState("await-1").countdownTimer).toBeUndefined()
    store.shutdown()
    rmSync(dir, { recursive: true, force: true })
  })

  test("inject-time suppressed when awaiting-user=true (race)", async () => {
    //#given countdown already started but user was asked meanwhile
    const dir = mkdtempSync(join(tmpdir(), "task-await-"))
    writeValidTask(dir, "T-await-2", "pending")
    const toastMock = mock(async () => ({} as never))
    const promptAsyncMock = mock(async () => ({} as never))
    const ctx = makeCtx(dir, toastMock, awaitingQuestionMessages(), promptAsyncMock)
    const store = createSessionStateStore()
    store.getState("await-2")
    markAwaitingUser(store, "await-2")
    //#when inject runs while awaiting user
    await injectContinuation({ ctx, sessionID: "await-2", sessionStateStore: store, skipAgents: [] })
    //#then no continuation prompt hijacks the pending question
    expect(promptAsyncMock).not.toHaveBeenCalled()
    store.shutdown()
    rmSync(dir, { recursive: true, force: true })
  })

  test("enforcement fires when awaiting-user=false with pending work", async () => {
    //#given a session with pending work and no awaiting flag
    const dir = mkdtempSync(join(tmpdir(), "task-await-"))
    writeValidTask(dir, "T-await-3", "pending")
    const toastMock = mock(async () => ({} as never))
    const promptAsyncMock = mock(async () => ({} as never))
    const ctx = makeCtx(dir, toastMock, [], promptAsyncMock)
    const store = createSessionStateStore()
    //#when idle fires and inject runs without awaiting signal
    await handleSessionIdle({ ctx, sessionID: "await-3", sessionStateStore: store, skipAgents: [] })
    await injectContinuation({ ctx, sessionID: "await-3b", sessionStateStore: store, skipAgents: [] })
    //#then enforcement still fires (control case)
    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(promptAsyncMock).toHaveBeenCalledTimes(1)
    store.shutdown()
    rmSync(dir, { recursive: true, force: true })
  })

  test("suppression bounded: resumes after user responds", async () => {
    //#given a suppressed session that later receives user answer
    const dir = mkdtempSync(join(tmpdir(), "task-await-"))
    writeValidTask(dir, "T-await-4", "pending")
    const toastMock = mock(async () => ({} as never))
    const ctxAwaiting = makeCtx(dir, toastMock, awaitingQuestionMessages())
    const store = createSessionStateStore()
    markAwaitingUser(store, "await-4")
    //#when idle fires while awaiting then user responds and idle refires
    await handleSessionIdle({ ctx: ctxAwaiting, sessionID: "await-4", sessionStateStore: store, skipAgents: [] })
    expect(toastMock).not.toHaveBeenCalled()
    expect(store.getState("await-4").countdownTimer).toBeUndefined()
    const record = store.getState("await-4") as unknown as Record<string, unknown>
    record["awaitingUser"] = false
    const ctxAnswered = makeCtx(dir, toastMock, [])
    await handleSessionIdle({ ctx: ctxAnswered, sessionID: "await-4", sessionStateStore: store, skipAgents: [] })
    //#then enforcement resumes (bounded suppress, no indefinite mute)
    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(store.getState("await-4").countdownTimer).toBeDefined()
    store.shutdown()
    rmSync(dir, { recursive: true, force: true })
  })
})
