/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { ToolContext } from "@opencode-ai/plugin/tool"
import { createHashlineEditTool } from "../../../src/tools/hashline-edit/tools"
import { computeLineHash } from "../../../src/tools/hashline-edit/hash-computation"

/**
 * Regression suite for the hashline-edit PLANS_DIR rejection (Task 4 of
 * enforce-plan-tools-only-access). hashline-edit must refuse filePath OR
 * rename targets inside .matrixx/plans, redirecting to plan_update, while
 * non-plan files keep working.
 */

function createMockContext(): ToolContext {
  return {
    sessionID: "test",
    messageID: "test",
    agent: "test",
    abort: new AbortController().signal,
    metadata: () => {},
    ask: async () => {},
  } as unknown as ToolContext
}

describe("createHashlineEditTool: PLANS_DIR rejection", () => {
  let tempDir: string
  let tool: ReturnType<typeof createHashlineEditTool>

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "plan-enforcement-hashline-"))
    tool = createHashlineEditTool()
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it("rejects filePath inside .matrixx/plans", async () => {
    //#given a plans path
    const plansPath = path.join(tempDir, ".matrixx", "plans", "my-plan.md")
    fs.mkdirSync(path.dirname(plansPath), { recursive: true })
    fs.writeFileSync(plansPath, "line1\nline2")

    //#when hashline-edit targets it
    const result = tool.execute(
      { filePath: plansPath, edits: [{ op: "replace", pos: "1#AB", lines: ["x"] }] },
      createMockContext(),
    )
    //#then it throws with the plan_update redirect
    await expect(result).rejects.toThrow("Blocked: hashline-edit cannot modify files inside .matrixx/plans")
  })

  it("rejects rename target inside .matrixx/plans", async () => {
    //#given a source file outside plans and a rename target inside plans
    const sourcePath = path.join(tempDir, "source.txt")
    const plansRename = path.join(tempDir, ".matrixx", "plans", "my-plan.md")
    fs.writeFileSync(sourcePath, "line1\nline2")

    //#when hashline-edit renames into plans
    const result = tool.execute(
      { filePath: sourcePath, rename: plansRename, edits: [{ op: "replace", pos: "1#AB", lines: ["x"] }] },
      createMockContext(),
    )
    //#then it throws (rename target is also guarded)
    await expect(result).rejects.toThrow("Blocked: hashline-edit cannot modify files inside .matrixx/plans")
  })

  it("rejects delete mode on plans path", async () => {
    //#given a plans path
    const plansPath = path.join(tempDir, ".matrixx", "plans", "my-plan.md")
    fs.mkdirSync(path.dirname(plansPath), { recursive: true })
    fs.writeFileSync(plansPath, "line1")

    //#when hashline-edit deletes it
    const result = tool.execute({ filePath: plansPath, delete: true, edits: [] }, createMockContext())
    //#then it throws before any fs operation
    await expect(result).rejects.toThrow("Blocked: hashline-edit cannot modify files inside .matrixx/plans")
  })

  it("rejects plans path case-insensitively", async () => {
    //#given a plans path with uppercase dir
    const plansPath = path.join(tempDir, ".MATRIXX", "PLANS", "my-plan.md")
    fs.mkdirSync(path.dirname(plansPath), { recursive: true })
    fs.writeFileSync(plansPath, "line1")

    //#when hashline-edit targets it
    const result = tool.execute(
      { filePath: plansPath, edits: [{ op: "replace", pos: "1#AB", lines: ["x"] }] },
      createMockContext(),
    )
    //#then it throws
    await expect(result).rejects.toThrow("Blocked: hashline-edit cannot modify files inside .matrixx/plans")
  })

  it("still edits non-plan files (no regression)", async () => {
    //#given a regular file
    const filePath = path.join(tempDir, "test.txt")
    fs.writeFileSync(filePath, "line1\nline2")

    //#when hashline-edit targets it
    const result = await tool.execute(
      { filePath, edits: [{ op: "replace", pos: `1#${computeLineHash(1, "line1")}`, lines: ["modified"] }] },
      createMockContext(),
    )
    //#then it succeeds (non-plan files unaffected)
    expect(fs.readFileSync(filePath, "utf-8")).toBe("modified\nline2")
    expect(result).toBe(`Updated ${filePath}`)
  })

  it("still renames between non-plan files (no regression)", async () => {
    //#given a source file
    const sourcePath = path.join(tempDir, "source.txt")
    const renamedPath = path.join(tempDir, "renamed.txt")
    fs.writeFileSync(sourcePath, "line1\nline2")

    //#when hashline-edit renames between non-plan paths
    const result = await tool.execute(
      { filePath: sourcePath, rename: renamedPath, edits: [{ op: "replace", pos: `1#${computeLineHash(1, "line1")}`, lines: ["x"] }] },
      createMockContext(),
    )
    //#then it succeeds
    expect(fs.existsSync(sourcePath)).toBe(false)
    expect(fs.readFileSync(renamedPath, "utf-8")).toBe("x\nline2")
    expect(result).toBe(`Moved ${sourcePath} to ${renamedPath}`)
  })
})