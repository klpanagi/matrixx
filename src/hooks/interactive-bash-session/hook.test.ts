import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { subagentSessions } from "../../features/session-state"
import { INTERACTIVE_BASH_SESSION_STORAGE } from "./constants"
import { createInteractiveBashSessionHook } from "./hook"

function makeMockCtx() {
  const abortCalls: string[] = []
  const client = {
    session: {
      abort: async ({ path }: { path: { id: string } }) => {
        abortCalls.push(path.id)
      },
    },
  }
  return { ctx: { client, directory: "/tmp" } as never, abortCalls }
}

function cleanupStorage(sessionIDs: string[]) {
  for (const id of sessionIDs) {
    const p = join(INTERACTIVE_BASH_SESSION_STORAGE, `${id}.json`)
    if (existsSync(p)) unlinkSync(p)
  }
}

describe("interactive-bash-session session.deleted handler", () => {
  afterEach(() => {
    subagentSessions.clear()
    cleanupStorage(["ses_owner", "ses_foreign"])
  })

  test("//#given a subagent session is tracked and a foreign session (no tmux state) is deleted\n//#when session.deleted fires for the foreign session\n//#then NO subagent session is aborted", async () => {
    const { ctx, abortCalls } = makeMockCtx()
    const hook = createInteractiveBashSessionHook(ctx)
    subagentSessions.add("ses_subagent")

    await hook.event({
      event: { type: "session.deleted", properties: { info: { id: "ses_foreign" } } },
    })

    expect(abortCalls).toEqual([])
  })

  test("//#given a session owns tracked tmux sessions and a subagent is running\n//#when session.deleted fires for that session\n//#then its subagents are aborted (control)", async () => {
    const { ctx, abortCalls } = makeMockCtx()
    const hook = createInteractiveBashSessionHook(ctx)
    subagentSessions.add("ses_subagent")

    await hook["tool.execute.after"](
      {
        tool: "interactive_bash",
        sessionID: "ses_owner",
        callID: "1",
        args: { tmux_command: "new-session -d -s matrixx-test" },
      },
      { title: "", output: "ok", metadata: {} },
    )

    await hook.event({
      event: { type: "session.deleted", properties: { info: { id: "ses_owner" } } },
    })

    expect(abortCalls).toContain("ses_subagent")
  })
})