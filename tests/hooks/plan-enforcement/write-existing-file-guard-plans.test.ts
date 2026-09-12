/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { createWriteExistingFileGuardHook } from "../../../src/hooks/write-existing-file-guard"

/**
 * Regression suite for the write-existing-file-guard plans carve-out removal
 * (Task 3 of enforce-plan-tools-only-access). Write to an EXISTING
 * .matrixx/plans/*.md file must be blocked (plan_* territory), while
 * .matrixx/drafts and other .matrixx/*.md files keep the overwrite carve-out.
 */

describe("write-existing-file-guard: plans carve-out removed, drafts exempt", () => {
  let tempDir: string
  let ctx: { directory: string }
  let hook: ReturnType<typeof createWriteExistingFileGuardHook>

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "plan-enforcement-write-guard-"))
    ctx = { directory: tempDir }
    hook = createWriteExistingFileGuardHook(ctx as never)
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  async function runWrite(filePath: string) {
    const input = { tool: "Write", sessionID: "ses_1", callID: "call_1" }
    const output = { args: { filePath, content: "# Updated" } }
    return hook["tool.execute.before"]?.(input, output)
  }

  test("blocks Write to existing .matrixx/plans/*.md (plan_* territory)", async () => {
    //#given an existing plan file
    const plansDir = path.join(tempDir, ".matrixx", "plans")
    fs.mkdirSync(plansDir, { recursive: true })
    const planFile = path.join(plansDir, "my-plan.md")
    fs.writeFileSync(planFile, "# Existing Plan")

    //#when Write targets it
    const result = runWrite(planFile)
    //#then it is blocked — plans excluded from the .matrixx/*.md carve-out
    await expect(result).rejects.toThrow("File already exists. Use edit tool instead.")
  })

  test("blocks Write to existing plans file via relative path", async () => {
    //#given an existing plan file
    const plansDir = path.join(tempDir, ".matrixx", "plans")
    fs.mkdirSync(plansDir, { recursive: true })
    fs.writeFileSync(path.join(plansDir, "my-plan.md"), "# Existing Plan")

    //#when Write targets it via a relative path
    const result = runWrite(".matrixx/plans/my-plan.md")
    //#then it is blocked
    await expect(result).rejects.toThrow("File already exists. Use edit tool instead.")
  })

  test("allows Write to existing .matrixx/drafts/*.md (drafts stay exempt)", async () => {
    //#given an existing draft file
    const draftsDir = path.join(tempDir, ".matrixx", "drafts")
    fs.mkdirSync(draftsDir, { recursive: true })
    const draftFile = path.join(draftsDir, "draft.md")
    fs.writeFileSync(draftFile, "# Draft")

    //#when Write targets it
    const result = runWrite(draftFile)
    //#then it passes through (drafts carve-out preserved)
    await expect(result).resolves.toBeUndefined()
  })

  test("allows Write to existing .matrixx/notes.md (non-plans carve-out preserved)", async () => {
    //#given an existing .matrixx markdown file outside plans
    const matrixDir = path.join(tempDir, ".matrixx")
    fs.mkdirSync(matrixDir, { recursive: true })
    const notesFile = path.join(matrixDir, "notes.md")
    fs.writeFileSync(notesFile, "# Notes")

    //#when Write targets it
    const result = runWrite(notesFile)
    //#then it passes through
    await expect(result).resolves.toBeUndefined()
  })

  test("allows Write to a NEW plans file (guard only blocks existing files)", async () => {
    //#given a plans dir with no file yet
    const plansDir = path.join(tempDir, ".matrixx", "plans")
    fs.mkdirSync(plansDir, { recursive: true })
    const planFile = path.join(plansDir, "new-plan.md")

    //#when Write targets the non-existing file
    const result = runWrite(planFile)
    //#then it passes through (first write is fine; task-edit-guard still blocks it separately)
    await expect(result).resolves.toBeUndefined()
  })

  test("blocks Write to existing regular file outside .matrixx", async () => {
    //#given an existing regular file
    const regularFile = path.join(tempDir, "regular.md")
    fs.writeFileSync(regularFile, "# Regular")

    //#when Write targets it
    const result = runWrite(regularFile)
    //#then it is blocked
    await expect(result).rejects.toThrow("File already exists. Use edit tool instead.")
  })
})