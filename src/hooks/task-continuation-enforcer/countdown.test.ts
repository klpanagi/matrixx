import { describe, expect, mock, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import { startCountdown } from "./countdown"
import { createSessionStateStore } from "./session-state"

function makeCtx(dir: string, toastMock: ReturnType<typeof mock>): PluginInput {
  return {
    directory: dir,
    client: {
      tui: { showToast: toastMock },
      session: {
        messages: async () => ({ data: [] } as unknown as never) as never,
        promptAsync: async () => ({}) as never,
      },
    },
  } as unknown as PluginInput
}

describe("task-continuation countdown", () => {
  test("starts countdown and shows toast", () => {
    //#given
    const dir = mkdtempSync(join(tmpdir(), "task-count-"))
    const toastMock = mock(async () => ({} as never))
    const ctx = makeCtx(dir, toastMock)
    const store = createSessionStateStore()
    //#when
    startCountdown({ ctx, sessionID: "s1", incompleteCount: 2, total: 3, skipAgents: [], sessionStateStore: store })
    //#then
    expect(toastMock).toHaveBeenCalledTimes(1)
    const state = store.getState("s1")
    expect(state.countdownTimer).toBeDefined()
    expect(state.countdownInterval).toBeDefined()
    expect(state.countdownStartedAt).toBeDefined()
    store.shutdown()
    rmSync(dir, { recursive: true, force: true })
  })

  test("second start while active is skipped", () => {
    //#given
    const dir = mkdtempSync(join(tmpdir(), "task-count-"))
    const toastMock = mock(async () => ({} as never))
    const ctx = makeCtx(dir, toastMock)
    const store = createSessionStateStore()
    startCountdown({ ctx, sessionID: "s2", incompleteCount: 1, total: 1, skipAgents: [], sessionStateStore: store })
    //#when
    startCountdown({ ctx, sessionID: "s2", incompleteCount: 1, total: 1, skipAgents: [], sessionStateStore: store })
    //#then
    expect(toastMock).toHaveBeenCalledTimes(1)
    store.shutdown()
    rmSync(dir, { recursive: true, force: true })
  })

  test("restart after cancel works", () => {
    //#given
    const dir = mkdtempSync(join(tmpdir(), "task-count-"))
    const toastMock = mock(async () => ({} as never))
    const ctx = makeCtx(dir, toastMock)
    const store = createSessionStateStore()
    startCountdown({ ctx, sessionID: "s3", incompleteCount: 1, total: 1, skipAgents: [], sessionStateStore: store })
    store.cancelCountdown("s3")
    toastMock.mockClear()
    //#when
    startCountdown({ ctx, sessionID: "s3", incompleteCount: 1, total: 1, skipAgents: [], sessionStateStore: store })
    //#then
    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(store.getState("s3").countdownTimer).toBeDefined()
    store.shutdown()
    rmSync(dir, { recursive: true, force: true })
  })

  test("independent sessions do not interfere", () => {
    //#given
    const dir = mkdtempSync(join(tmpdir(), "task-count-"))
    const toastMock = mock(async () => ({} as never))
    const ctx = makeCtx(dir, toastMock)
    const store = createSessionStateStore()
    //#when
    startCountdown({ ctx, sessionID: "a", incompleteCount: 1, total: 1, skipAgents: [], sessionStateStore: store })
    startCountdown({ ctx, sessionID: "b", incompleteCount: 1, total: 1, skipAgents: [], sessionStateStore: store })
    //#then
    expect(toastMock).toHaveBeenCalledTimes(2)
    expect(store.getState("a").countdownTimer).toBeDefined()
    expect(store.getState("b").countdownTimer).toBeDefined()
    store.shutdown()
    rmSync(dir, { recursive: true, force: true })
  })
})
