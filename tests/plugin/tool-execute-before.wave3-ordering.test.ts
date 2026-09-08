import { describe, expect, test } from "bun:test"
import { createToolExecuteBeforeHandler } from "../../src/plugin/tool-execute-before"

describe("Wave 3 hook ordering", () => {
  test("rtkBashRewriter runs before nonInteractiveEnv", async () => {
    //#given
    const callOrder: string[] = []
    
    const hooks = {
      rtkBashRewriter: {
        "tool.execute.before": async (_input: unknown, output: { args: Record<string, unknown> }) => {
          callOrder.push("rtkBashRewriter")
          // Simulate RTK rewrite: prepend "rtk " to command
          const cmd = output.args.command as string
          if (cmd && !cmd.startsWith("rtk ")) {
            output.args.command = `rtk ${cmd}`
          }
        },
      },
      nonInteractiveEnv: {
        "tool.execute.before": async (_input: unknown, output: { args: Record<string, unknown> }) => {
          callOrder.push("nonInteractiveEnv")
          // Simulate nonInteractiveEnv: prepend env vars to git commands
          const cmd = output.args.command as string
          if (cmd && /\bgit\b/.test(cmd)) {
            output.args.command = `CI=true GIT_EDITOR=: ${cmd}`
          }
        },
      },
    }

    const ctx = { client: {} } as any
    const handler = createToolExecuteBeforeHandler({ ctx, hooks })
    const input = { tool: "bash", sessionID: "ses_test", callID: "call_1" }
    const output = { args: { command: "git status" } }

    //#when
    await handler(input, output)

    //#then
    // Verify call order: RTK must run BEFORE nonInteractiveEnv
    expect(callOrder).toEqual(["rtkBashRewriter", "nonInteractiveEnv"])
    
    // Verify the command was rewritten correctly:
    // 1. RTK rewrites "git status" → "rtk git status"
    // 2. nonInteractiveEnv detects "git" in "rtk git status" and prepends env vars
    // Final: "CI=true GIT_EDITOR=: rtk git status"
    expect(output.args.command).toBe("CI=true GIT_EDITOR=: rtk git status")
  })

  test("Wave 3 executes all 6 hooks in correct order", async () => {
    //#given
    const callOrder: string[] = []
    
    const hooks = {
      rtkBashRewriter: { "tool.execute.before": async () => { callOrder.push("rtkBashRewriter") } },
      nonInteractiveEnv: { "tool.execute.before": async () => { callOrder.push("nonInteractiveEnv") } },
      bashFileReadGuard: { "tool.execute.before": async () => { callOrder.push("bashFileReadGuard") } },
      oracleMdOnly: { "tool.execute.before": async () => { callOrder.push("oracleMdOnly") } },
      mouseNotepad: { "tool.execute.before": async () => { callOrder.push("mouseNotepad") } },
      architectHook: { "tool.execute.before": async () => { callOrder.push("architectHook") } },
    }

    const ctx = { client: {} } as any
    const handler = createToolExecuteBeforeHandler({ ctx, hooks })
    const input = { tool: "bash", sessionID: "ses_test", callID: "call_1" }
    const output = { args: { command: "echo test" } }

    //#when
    await handler(input, output)

    //#then
    // Verify all 6 Wave 3 hooks executed in correct order
    // oracleMdOnly runs TWICE: once in Wave 2 (BLOCKING) before all Wave 3 hooks,
    // and once in Wave 3d (MUTATOR) after bashFileReadGuard
    expect(callOrder).toEqual([
      "oracleMdOnly",  // Wave 2 (BLOCKING)
      "rtkBashRewriter",   // Wave 3a
      "nonInteractiveEnv", // Wave 3b
      "bashFileReadGuard", // Wave 3c
      "oracleMdOnly",  // Wave 3d (MUTATOR)
      "mouseNotepad",      // Wave 3e
      "architectHook",     // Wave 3f
    ])
  })
})
