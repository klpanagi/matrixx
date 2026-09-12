/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { ToolContext } from "@opencode-ai/plugin/tool"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createPlanCreateTool } from "../../../src/tools/plan/plan-create"
import { createPlanDeleteTool } from "../../../src/tools/plan/plan-delete"
import { createPlanListTool } from "../../../src/tools/plan/plan-list"
import { createPlanReadTool } from "../../../src/tools/plan/plan-read"
import { createPlanUpdateTool } from "../../../src/tools/plan/plan-update"

/**
 * Regression suite proving the plan_* tools themselves are UNAFFECTED by the
 * enforcement work (Task 7 of enforce-plan-tools-only-access). The guards
 * block generic Write/Edit/bash/hashline-edit — the dedicated plan_* tools
 * must still create/read/update/list/delete .matrixx/plans/*.md freely.
 */

const TEST_ABORT = new AbortController()

function testContext(testDir: string): ToolContext {
  return {
    sessionID: "test-session-plan-enforcement",
    messageID: "test-message-plan-enforcement",
    agent: "test-agent",
    abort: TEST_ABORT.signal,
    directory: testDir,
  } as unknown as ToolContext
}

describe("plan_* tools unaffected by enforcement", () => {
  let testDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `plan-enforcement-plan-tools-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(testDir, ".matrixx/plans"), { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  test("plan_create → plan_read → plan_update → plan_list → plan_delete full lifecycle", async () => {
    //#given the five plan tools
    const createTool = createPlanCreateTool()
    const readTool = createPlanReadTool()
    const updateTool = createPlanUpdateTool()
    const listTool = createPlanListTool()
    const deleteTool = createPlanDeleteTool()
    const ctx = testContext(testDir)

    //#when create
    const created = JSON.parse(
      await createTool.execute({ filePath: ".matrixx/plans/regression-plan.md", content: "# Title\nline2\nline3\n" }, ctx),
    )
    //#then created
    expect(created.error).toBeUndefined()
    expect(created.filePath).toContain("regression-plan.md")

    //#when read
    const read = JSON.parse(await readTool.execute({ filePath: ".matrixx/plans/regression-plan.md" }, ctx))
    //#then hashline-tagged content returned
    expect(read.error).toBeUndefined()
    expect(read.content).toContain("# Title")
    expect(read.hashline).toContain("1#")

    //#when update via hashline anchor
    const firstLine: string = read.hashline.split("\n")[0]
    const anchor = firstLine.split("|")[0]
    const updated = await updateTool.execute(
      { filePath: ".matrixx/plans/regression-plan.md", edits: [{ op: "replace", pos: anchor, lines: ["# New Title"] }] },
      ctx,
    )
    //#then update applied (plain string result, not JSON)
    expect(updated).toContain("Updated")
    const read2 = JSON.parse(await readTool.execute({ filePath: ".matrixx/plans/regression-plan.md" }, ctx))
    expect(read2.content).toContain("# New Title")

    //#when list
    const listed = JSON.parse(await listTool.execute({}, ctx))
    //#then file present
    expect(listed.plans.length).toBe(1)
    expect(listed.plans[0].fileName).toBe("regression-plan.md")

    //#when delete
    const deleted = JSON.parse(await deleteTool.execute({ filePath: ".matrixx/plans/regression-plan.md" }, ctx))
    //#then deleted
    expect(deleted.success).toBe(true)

    //#when list again
    const listed2 = JSON.parse(await listTool.execute({}, ctx))
    //#then empty
    expect(listed2.plans.length).toBe(0)
  })

  test("plan_update works with append op on plans (hashline path intact)", async () => {
    //#given a created plan
    const createTool = createPlanCreateTool()
    const readTool = createPlanReadTool()
    const updateTool = createPlanUpdateTool()
    const ctx = testContext(testDir)
    await createTool.execute({ filePath: ".matrixx/plans/append-plan.md", content: "# A\n" }, ctx)

    //#when append via hashline anchor
    const read = JSON.parse(await readTool.execute({ filePath: ".matrixx/plans/append-plan.md" }, ctx))
    const anchor = read.hashline.split("\n")[0].split("|")[0]
    const updated = await updateTool.execute(
      { filePath: ".matrixx/plans/append-plan.md", edits: [{ op: "append", pos: anchor, lines: ["# B"] }] },
      ctx,
    )
    //#then append applied (plain string result, not JSON)
    expect(updated).toContain("Updated")
    const read2 = JSON.parse(await readTool.execute({ filePath: ".matrixx/plans/append-plan.md" }, ctx))
    expect(read2.content).toContain("# B")
  })

  test("plan_create still rejects invalid paths (scoping intact)", async () => {
    //#given the create tool
    const createTool = createPlanCreateTool()
    //#when an out-of-scope path is used
    const res = JSON.parse(await createTool.execute({ filePath: "src/evil.ts", content: "# x\n" }, testContext(testDir)))
    //#then rejected
    expect(res.error).toBeDefined()
  })

  test("plan_read returns file_not_found for missing plan", async () => {
    //#given the read tool
    const readTool = createPlanReadTool()
    //#when a missing plan is read
    const res = JSON.parse(await readTool.execute({ filePath: ".matrixx/plans/nope-plan.md" }, testContext(testDir)))
    //#then file_not_found
    expect(res.error).toBe("file_not_found")
  })
})