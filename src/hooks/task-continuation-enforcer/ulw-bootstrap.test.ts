import { describe, expect, mock, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import { handleSessionIdle } from "./idle-event"
import { createSessionStateStore } from "./session-state"

function makeCtx(dir: string, bgTasks: Array<{ status: string }> = []): PluginInput {
  return {
    directory: dir,
    client: {
      tui: { showToast: mock(async () => ({} as never)) as never },
      session: { messages: async () => ({ data: [] } as unknown as never) as never },
    },
    backgroundManager: {
      getTasksByParentSession: () => bgTasks,
    },
  } as unknown as PluginInput
}

describe("ulw bootstrap", () => {
  test("bootstraps when no task dir but hadBgTasks", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ulw-boot-"))
    const toastMock = mock(async () => ({} as never))
    const ctx = {
      directory: dir,
      client: {
        tui: { showToast: toastMock },
        session: { messages: async () => ({ data: [] } as unknown as never) as never },
      },
    } as unknown as PluginInput
    const store = createSessionStateStore()
    const bg = { getTasksByParentSession: () => [{ status: "completed" }] } as never
    await handleSessionIdle({ ctx, sessionID: "ulw1", sessionStateStore: store, backgroundManager: bg, skipAgents: [] })
    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(store.getState("ulw1").countdownTimer).toBeDefined()
    store.shutdown()
    rmSync(dir, { recursive: true, force: true })
  })

  test("does not bootstrap when no task dir and no bg tasks", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ulw-boot-"))
    const toastMock = mock(async () => ({} as never))
    const ctx = makeCtx(dir, [])
    const store = createSessionStateStore()
    const bg2 = { getTasksByParentSession: () => [] } as never
    await handleSessionIdle({ ctx, sessionID: "ulw2", sessionStateStore: store, backgroundManager: bg2, skipAgents: [] })
    expect(toastMock).not.toHaveBeenCalled()
    expect(store.getState("ulw2").countdownTimer).toBeUndefined()
    store.shutdown()
    rmSync(dir, { recursive: true, force: true })
  })

  test("bootstraps when no tasks but hadBgTasks", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ulw-boot-"))
    mkdirSync(join(dir, ".matrixx", "tasks"), { recursive: true })
    const toastMock = mock(async () => ({} as never))
    const ctx2 = {
      directory: dir,
      client: {
        tui: { showToast: toastMock },
        session: { messages: async () => ({ data: [] } as unknown as never) as never },
      },
    } as unknown as PluginInput
    const store = createSessionStateStore()
    const bg2 = { getTasksByParentSession: () => [{ status: "completed" }] } as never
    await handleSessionIdle({ ctx: ctx2, sessionID: "ulw3", sessionStateStore: store, backgroundManager: bg2, skipAgents: [] })
    expect(toastMock).toHaveBeenCalledTimes(1)
    store.shutdown()
    rmSync(dir, { recursive: true, force: true })
  })

  test("skips when all tasks complete even with bgTasks history", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ulw-boot-"))
    mkdirSync(join(dir, ".matrixx", "tasks"), { recursive: true })
    writeFileSync(
      join(dir, ".matrixx", "tasks", "T-done.json"),
      JSON.stringify({ id: "T-done", subject: "done", description: "d", status: "completed", blocks: [], blockedBy: [], threadID: "thr-1" }),
    )
    const toastMock = mock(async () => ({} as never))
    const ctx = {
      directory: dir,
      client: {
        tui: { showToast: toastMock },
        session: { messages: async () => ({ data: [] } as unknown as never) as never },
      },
    } as unknown as PluginInput
    const store = createSessionStateStore()
    const bg4 = { getTasksByParentSession: () => [{ status: "completed" }] } as never
    await handleSessionIdle({ ctx, sessionID: "ulw4", sessionStateStore: store, backgroundManager: bg4, skipAgents: [] })
    expect(toastMock).not.toHaveBeenCalled()
    store.shutdown()
    rmSync(dir, { recursive: true, force: true })
  })
})
