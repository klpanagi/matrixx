import { describe, expect, mock, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import { handleSessionIdle } from "./idle-event"
import { handleNonIdleEvent } from "./non-idle-events"
import { createSessionStateStore } from "./session-state"

function writeValidTask(dir: string, id: string, status = "pending"): void {
  mkdirSync(join(dir, ".matrixx", "tasks"), { recursive: true })
  writeFileSync(
    join(dir, ".matrixx", "tasks", `${id}.json`),
    JSON.stringify({ id, subject: `task ${id}`, description: "d", status, blocks: [], blockedBy: [], threadID: "thr-1" }),
  )
}

function makeIdleCtx(dir: string): PluginInput {
  return {
    directory: dir,
    client: {
      tui: { showToast: mock(async () => ({} as never)) as never },
      session: {
        messages: async () => ({ data: [] } as unknown as never) as never,
      },
    },
  } as unknown as PluginInput
}

describe("task-continuation idle-event", () => {
  test("skips when countdown already active", async () => {
    //#given
    const dir = mkdtempSync(join(tmpdir(), "task-idle-"))
    const store = createSessionStateStore()
    const state = store.getState("s1")
    state.countdownTimer = setTimeout(() => {}, 999999) as unknown as ReturnType<typeof setTimeout>
    state.countdownInterval = setInterval(() => {}, 999999) as unknown as ReturnType<typeof setInterval>
    const ctx = makeIdleCtx(dir)
    //#when
    await handleSessionIdle({ ctx, sessionID: "s1", sessionStateStore: store, skipAgents: [] })
    //#then
    expect(state.countdownTimer).toBeDefined()
    clearTimeout(state.countdownTimer as unknown as NodeJS.Timeout)
    clearInterval(state.countdownInterval as unknown as NodeJS.Timeout)
    store.shutdown()
    rmSync(dir, { recursive: true, force: true })
  })

  test("starts countdown when pending tasks exist", async () => {
    //#given
    const dir = mkdtempSync(join(tmpdir(), "task-idle-"))
    writeValidTask(dir, "T-one", "pending")
    const toastMock = mock(async () => ({} as never))
    const ctx = {
      directory: dir,
      client: {
        tui: { showToast: toastMock },
        session: { messages: async () => ({ data: [] } as unknown as never) as never },
      },
    } as unknown as PluginInput
    const store = createSessionStateStore()
    //#when
    await handleSessionIdle({ ctx, sessionID: "s2", sessionStateStore: store, skipAgents: [] })
    //#then
    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(store.getState("s2").countdownTimer).toBeDefined()
    store.shutdown()
    rmSync(dir, { recursive: true, force: true })
  })

  test("skips when no pending tasks", async () => {
    //#given
    const dir = mkdtempSync(join(tmpdir(), "task-idle-"))
    writeValidTask(dir, "T-done", "completed")
    const toastMock = mock(async () => ({} as never))
    const ctx = {
      directory: dir,
      client: {
        tui: { showToast: toastMock },
        session: { messages: async () => ({ data: [] } as unknown as never) as never },
      },
    } as unknown as PluginInput
    const store = createSessionStateStore()
    //#when
    await handleSessionIdle({ ctx, sessionID: "s3", sessionStateStore: store, skipAgents: [] })
    //#then
    expect(toastMock).not.toHaveBeenCalled()
    expect(store.getState("s3").countdownTimer).toBeUndefined()
    store.shutdown()
    rmSync(dir, { recursive: true, force: true })
  })

  test("rapid second idle is ignored while countdown active", async () => {
    //#given
    const dir = mkdtempSync(join(tmpdir(), "task-idle-"))
    writeValidTask(dir, "T-rapid", "pending")
    const toastMock = mock(async () => ({} as never))
    const ctx = {
      directory: dir,
      client: {
        tui: { showToast: toastMock },
        session: { messages: async () => ({ data: [] } as unknown as never) as never },
      },
    } as unknown as PluginInput
    const store = createSessionStateStore()
    await handleSessionIdle({ ctx, sessionID: "s4", sessionStateStore: store, skipAgents: [] })
    const firstCalls = (toastMock as unknown as { mock: { calls: unknown[] } }).mock.calls.length
    //#when
    await handleSessionIdle({ ctx, sessionID: "s4", sessionStateStore: store, skipAgents: [] })
    await handleSessionIdle({ ctx, sessionID: "s4", sessionStateStore: store, skipAgents: [] })
    //#then
    expect(toastMock).toHaveBeenCalledTimes(firstCalls)
    store.shutdown()
    rmSync(dir, { recursive: true, force: true })
  })

  test("tool activity cancels and next idle restarts", async () => {
    //#given
    const dir = mkdtempSync(join(tmpdir(), "task-idle-"))
    writeValidTask(dir, "T-tool", "pending")
    const toastMock = mock(async () => ({} as never))
    const ctx = {
      directory: dir,
      client: {
        tui: { showToast: toastMock },
        session: { messages: async () => ({ data: [] } as unknown as never) as never },
      },
    } as unknown as PluginInput
    const store = createSessionStateStore()
    await handleSessionIdle({ ctx, sessionID: "s5", sessionStateStore: store, skipAgents: [] })
    expect(store.getState("s5").countdownTimer).toBeDefined()
    //#when
    handleNonIdleEvent({ eventType: "tool.execute.before", properties: { sessionID: "s5" }, sessionStateStore: store })
    //#then
    expect(store.getState("s5").countdownTimer).toBeUndefined()
    toastMock.mockClear()
    await handleSessionIdle({ ctx, sessionID: "s5", sessionStateStore: store, skipAgents: [] })
    expect(toastMock).toHaveBeenCalledTimes(1)
    store.shutdown()
    rmSync(dir, { recursive: true, force: true })
  })

  test("skips countdown when only stale tasks remain", async () => {
    //#given
    const dir = mkdtempSync(join(tmpdir(), "task-idle-"))
    writeValidTask(dir, "T-stale", "pending")
    const old = new Date(Date.now() - 3 * 60 * 60 * 1000)
    utimesSync(join(dir, ".matrixx", "tasks", "T-stale.json"), old, old)
    const toastMock = mock(async () => ({} as never))
    const ctx = {
      directory: dir,
      client: {
        tui: { showToast: toastMock },
        session: { messages: async () => ({ data: [] } as unknown as never) as never },
      },
    } as unknown as PluginInput
    const store = createSessionStateStore()
    const config = { morpheus: { tasks: { stale_after_hours: 2 } } }
    //#when
    await handleSessionIdle({ ctx, sessionID: "s-stale", sessionStateStore: store, skipAgents: [], config })
    //#then
    expect(toastMock).not.toHaveBeenCalled()
    expect(store.getState("s-stale").countdownTimer).toBeUndefined()
    store.shutdown()
    rmSync(dir, { recursive: true, force: true })
  })

  test("starts countdown when active task exists alongside stale", async () => {
    //#given
    const dir = mkdtempSync(join(tmpdir(), "task-idle-"))
    writeValidTask(dir, "T-stale", "pending")
    writeValidTask(dir, "T-active", "pending")
    const old = new Date(Date.now() - 3 * 60 * 60 * 1000)
    utimesSync(join(dir, ".matrixx", "tasks", "T-stale.json"), old, old)
    const toastMock = mock(async () => ({} as never))
    const ctx = {
      directory: dir,
      client: {
        tui: { showToast: toastMock },
        session: { messages: async () => ({ data: [] } as unknown as never) as never },
      },
    } as unknown as PluginInput
    const store = createSessionStateStore()
    const config = { morpheus: { tasks: { stale_after_hours: 2 } } }
    //#when
    await handleSessionIdle({ ctx, sessionID: "s-mixed", sessionStateStore: store, skipAgents: [], config })
    //#then
    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(store.getState("s-mixed").countdownTimer).toBeDefined()
    store.shutdown()
    rmSync(dir, { recursive: true, force: true })
  })
})
