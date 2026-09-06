import { describe, expect, mock, test } from "bun:test"
import type { PluginInput } from "@opencode-ai/plugin"
import { handleSessionIdle } from "./idle-event"
import { createSessionStateStore } from "./session-state"

function makeCtx(): PluginInput {
  return {
    directory: "/tmp",
    client: {
      tui: { showToast: mock(async () => ({} as never)) as never },
      session: {
        messages: async () => ({ data: [] } as unknown as never) as never,
        todo: async () => ({ data: [] } as unknown as never) as never,
      },
    },
  } as unknown as PluginInput
}

describe("todo-continuation idle-event", () => {
  test("skips when countdown already active", async () => {
    //#given
    const store = createSessionStateStore()
    const state = store.getState("s1")
    state.countdownTimer = setTimeout(() => {}, 999999) as unknown as ReturnType<typeof setTimeout>
    state.countdownInterval = setInterval(() => {}, 999999) as unknown as ReturnType<typeof setInterval>
    const ctx = makeCtx()
    //#when
    await handleSessionIdle({ ctx, sessionID: "s1", sessionStateStore: store, skipAgents: [] })
    //#then
    expect(state.countdownTimer).toBeDefined()
    clearTimeout(state.countdownTimer as unknown as NodeJS.Timeout)
    clearInterval(state.countdownInterval as unknown as NodeJS.Timeout)
    store.shutdown()
  })

  test("skips when no todos", async () => {
    //#given
    const store = createSessionStateStore()
    const toastMock = mock(async () => ({} as never))
    const ctx = {
      directory: "/tmp",
      client: {
        tui: { showToast: toastMock },
        session: {
          messages: async () => ({ data: [] } as unknown as never) as never,
          todo: async () => ({ data: [] } as unknown as never) as never,
        },
      },
    } as unknown as PluginInput
    //#when
    await handleSessionIdle({ ctx, sessionID: "s2", sessionStateStore: store, skipAgents: [] })
    //#then
    expect(toastMock).not.toHaveBeenCalled()
    expect(store.getState("s2").countdownTimer).toBeUndefined()
    store.shutdown()
  })
})
