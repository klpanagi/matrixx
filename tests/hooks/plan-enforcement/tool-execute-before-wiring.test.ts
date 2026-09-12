/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { createTaskEditGuardHook } from "../../../src/hooks/task-edit-guard"
import { PLAN_WRITE_WARN } from "../../../src/hooks/task-edit-guard/constants"
import { createToolExecuteBeforeHandler } from "../../../src/plugin/tool-execute-before"

/**
 * Regression suite for the tool-execute-before WIRING (Task 2 of
 * enforce-plan-tools-only-access). taskEditGuardHook must be cached and
 * invoked inside the blocking Wave 2 chain — a generic Write to
 * .matrixx/plans must reject through the FULL handler, not just in
 * isolation. Also proves the chain degrades gracefully when the hook is
 * absent (optional chaining).
 */

describe("tool-execute-before: taskEditGuardHook wired in blocking Wave 2", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "plan-enforcement-wiring-"))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  const plansPath = () => path.join(tempDir, ".matrixx", "plans", "my-plan.md")

  function makeHandler(hooks: Record<string, unknown>) {
    const ctx = { directory: tempDir }
    return createToolExecuteBeforeHandler({
      ctx: ctx as never,
      hooks: hooks as never,
    })
  }

  test("real taskEditGuard hook rejects Write to plans through the full handler", async () => {
    //#given the real guard wired into the handler
    const guard = createTaskEditGuardHook({ directory: tempDir } as never)
    const handler = makeHandler({ taskEditGuard: guard })

    //#when a generic Write targets .matrixx/plans
    const input = { tool: "Write", sessionID: "ses_1", callID: "call_1" }
    const output = { args: { filePath: plansPath(), content: "# x" } }

    //#then the Wave 2 chain propagates the guard rejection
    await expect(handler(input, output)).rejects.toThrow(PLAN_WRITE_WARN)
  })

  test("real taskEditGuard hook rejects bash mutation through the full handler", async () => {
    //#given the real guard wired into the handler
    const guard = createTaskEditGuardHook({ directory: tempDir } as never)
    const handler = makeHandler({ taskEditGuard: guard })

    //#when a raw bash sed targets .matrixx/plans
    const input = { tool: "bash", sessionID: "ses_1", callID: "call_1" }
    const output = { args: { command: `sed -i 's/a/b/' ${plansPath()}` } }

    //#then the Wave 2 chain propagates the guard rejection
    await expect(handler(input, output)).rejects.toThrow("Blocked: raw bash edit to plan/task files")
  })

  test("stub taskEditGuard hook is invoked (wiring present, not dead code)", async () => {
    //#given a stub guard that records invocation
    let invoked = false
    const stubGuard = {
      "tool.execute.before": async () => {
        invoked = true
      },
    }
    const handler = makeHandler({ taskEditGuard: stubGuard })

    //#when any tool runs through the handler
    const input = { tool: "Write", sessionID: "ses_1", callID: "call_1" }
    const output = { args: { filePath: path.join(tempDir, "notes.md"), content: "# x" } }

    //#then the guard was called (Wave 2 wiring is live)
    await handler(input, output)
    expect(invoked).toBe(true)
  })

  test("handler without taskEditGuard passes Write through (graceful degradation)", async () => {
    //#given a handler with no taskEditGuard hook
    const handler = makeHandler({})

    //#when a generic Write targets .matrixx/plans
    const input = { tool: "Write", sessionID: "ses_1", callID: "call_1" }
    const output = { args: { filePath: plansPath(), content: "# x" } }

    //#then no rejection (optional chaining — enforcement depends on the hook being registered)
    await expect(handler(input, output)).resolves.toBeUndefined()
  })

  test("handler without taskEditGuard passes bash through (graceful degradation)", async () => {
    //#given a handler with no taskEditGuard hook
    const handler = makeHandler({})

    //#when a raw bash sed targets .matrixx/plans
    const input = { tool: "bash", sessionID: "ses_1", callID: "call_1" }
    const output = { args: { command: `sed -i 's/a/b/' ${plansPath()}` } }

    //#then no rejection
    await expect(handler(input, output)).resolves.toBeUndefined()
  })
})