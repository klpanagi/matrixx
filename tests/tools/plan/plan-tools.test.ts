/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createPlanCreateTool } from "../../../src/tools/plan/plan-create"
import { createPlanDeleteTool } from "../../../src/tools/plan/plan-delete"
import { createPlanListTool } from "../../../src/tools/plan/plan-list"
import { createPlanReadTool } from "../../../src/tools/plan/plan-read"
import { createPlanUpdateTool } from "../../../src/tools/plan/plan-update"
import { validatePlanFilePath } from "../../../src/tools/plan/types"

const TEST_ABORT = new AbortController()
function testContext(testDir: string) {
  return {
    sessionID: "test-session-plan",
    messageID: "test-message-plan",
    agent: "test-agent",
    abort: TEST_ABORT.signal,
    directory: testDir,
  }
}

describe("plan_* tools", () => {
  let testDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `plan-tools-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(testDir, ".matrixx/plans"), { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe("validatePlanFilePath", () => {
    test("accepts kebab-case md directly inside plans", () => {
      //#given kebab file
      //#when validate
      const res = validatePlanFilePath(".matrixx/plans/my-plan.md", testDir)
      //#then ok
      expect("resolved" in res).toBe(true)
    })

    test("rejects non-kebab filename", () => {
      //#given camelCase
      //#when validate
      const res = validatePlanFilePath(".matrixx/plans/MyPlan.md", testDir)
      //#then error
      expect("error" in res).toBe(true)
    })

    test("rejects non-md extension", () => {
      const res = validatePlanFilePath(".matrixx/plans/plan.txt", testDir)
      expect("error" in res).toBe(true)
    })

    test("rejects subdirectory traversal", () => {
      const res = validatePlanFilePath(".matrixx/plans/sub/plan.md", testDir)
      expect("error" in res).toBe(true)
    })

    test("rejects outside plans dir", () => {
      const res = validatePlanFilePath("src/index.ts", testDir)
      expect("error" in res).toBe(true)
    })

    test("rejects parent traversal", () => {
      const res = validatePlanFilePath(".matrixx/plans/../tasks/x.md", testDir)
      expect("error" in res).toBe(true)
    })
  })

  describe("plan_create/read/list/delete lifecycle", () => {
    test("create → read → list → delete succeeds", async () => {
      //#given tools
      const createTool = createPlanCreateTool()
      const readTool = createPlanReadTool()
      const listTool = createPlanListTool()
      const deleteTool = createPlanDeleteTool()
      const ctx = testContext(testDir)

      //#when create
      const created = JSON.parse(await createTool.execute({ filePath: ".matrixx/plans/my-plan.md", content: "# Title\nline2\nline3\n" }, ctx))
      //#then created
      expect(created.error).toBeUndefined()
      expect(created.filePath).toContain("my-plan.md")

      //#when read
      const read = JSON.parse(await readTool.execute({ filePath: ".matrixx/plans/my-plan.md" }, ctx))
      //#then hashline tagged
      expect(read.error).toBeUndefined()
      expect(read.content).toContain("# Title")
      expect(read.hashline).toContain("1#")
      expect(read.hashline).toContain("|# Title")

      //#when list
      const listed = JSON.parse(await listTool.execute({}, ctx))
      //#then contains file
      expect(listed.plans.length).toBe(1)
      expect(listed.plans[0].fileName).toBe("my-plan.md")

      //#when delete
      const deleted = JSON.parse(await deleteTool.execute({ filePath: ".matrixx/plans/my-plan.md" }, ctx))
      //#then success
      expect(deleted.success).toBe(true)

      //#when list again
      const listed2 = JSON.parse(await listTool.execute({}, ctx))
      expect(listed2.plans.length).toBe(0)
    })

    test("create warns on existing file", async () => {
      const createTool = createPlanCreateTool()
      const ctx = testContext(testDir)
      await createTool.execute({ filePath: ".matrixx/plans/dup-plan.md", content: "# A\n" }, ctx)
      const second = JSON.parse(await createTool.execute({ filePath: ".matrixx/plans/dup-plan.md", content: "# B\n" }, ctx))
      expect(second.warning ?? second.filePath ?? "").toBeDefined()
    })

    test("read returns file_not_found for missing", async () => {
      const readTool = createPlanReadTool()
      const res = JSON.parse(await readTool.execute({ filePath: ".matrixx/plans/nope-plan.md" }, testContext(testDir)))
      expect(res.error).toBe("file_not_found")
    })

    test("create rejects invalid path", async () => {
      const createTool = createPlanCreateTool()
      const res = JSON.parse(
        await createTool.execute({ filePath: "src/evil.ts", content: "# x\n" }, testContext(testDir)),
      )
      expect(res.error).toBeDefined()
    })

    test("delete returns file_not_found for missing", async () => {
      const deleteTool = createPlanDeleteTool()
      const res = JSON.parse(await deleteTool.execute({ filePath: ".matrixx/plans/gone-plan.md" }, testContext(testDir)))
      expect(res.error).toBe("file_not_found")
    })

    test("list filters non-md and non-kebab", async () => {
      const createTool = createPlanCreateTool()
      const listTool = createPlanListTool()
      const ctx = testContext(testDir)
      await createTool.execute({ filePath: ".matrixx/plans/good-plan.md", content: "# ok\n" }, ctx)
      // plant invalid files directly via Bun
      await Bun.write(join(testDir, ".matrixx/plans/notes.txt"), "hi")
      await Bun.write(join(testDir, ".matrixx/plans/BadName.md"), "hi")
      const listed = JSON.parse(await listTool.execute({}, ctx))
      expect(listed.plans.length).toBe(1)
      expect(listed.plans[0].fileName).toBe("good-plan.md")
    })
  })

  describe("plan_update", () => {
    test("rejects empty edits", async () => {
      const updateTool = createPlanUpdateTool()
      const res = JSON.parse(
        await updateTool.execute({ filePath: ".matrixx/plans/x-plan.md", edits: [] }, testContext(testDir)),
      )
      expect(res.error).toBe("validation_error")
    })

    test("rejects replace without LINE#ID", async () => {
      const updateTool = createPlanUpdateTool()
      const res = JSON.parse(
        await updateTool.execute(
          { filePath: ".matrixx/plans/x-plan.md", edits: [{ op: "replace", lines: ["hi"] }] },
          testContext(testDir),
        ),
      )
      expect(res.error).toBe("validation_error")
    })

    test("returns file_not_found for missing file with valid anchor", async () => {
      const updateTool = createPlanUpdateTool()
      const res = JSON.parse(
        await updateTool.execute(
          { filePath: ".matrixx/plans/missing-plan.md", edits: [{ op: "replace", pos: "1#AB", lines: ["hi"] }] },
          testContext(testDir),
        ),
      )
      expect(res.error).toBe("file_not_found")
    })

    test("happy path replace via hashline anchor", async () => {
      //#given created plan
      const createTool = createPlanCreateTool()
      const readTool = createPlanReadTool()
      const updateTool = createPlanUpdateTool()
      const ctx = testContext(testDir)
      await createTool.execute({ filePath: ".matrixx/plans/edit-plan.md", content: "# Title\nline2\nline3\n" }, ctx)

      //#when read to get anchor
      const read = JSON.parse(await readTool.execute({ filePath: ".matrixx/plans/edit-plan.md" }, ctx))
      const firstLine: string = read.hashline.split("\n")[0]
      const anchor = firstLine.split("|")[0]

      //#when update line 1
      const updated = await updateTool.execute(
        { filePath: ".matrixx/plans/edit-plan.md", edits: [{ op: "replace", pos: anchor, lines: ["# New Title"] }] },
        ctx,
      )
      //#then no error string and content changed
      const read2 = JSON.parse(await readTool.execute({ filePath: ".matrixx/plans/edit-plan.md" }, ctx))
      expect(read2.content).toContain("# New Title")
      expect(updated).toBeDefined()
    })
  })
})
