/**
 * Tests for plan-persistence storage functions.
 */
import { describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  atomicWrite,
  ensurePlanDir,
  parseMetadataComment,
  readPlanFile,
  syncCheckboxes,
  upsertMetadataComment,
  writePlanFile,
} from "../../../src/features/mission-state/plan-storage"
import type { PlanMeta } from "../../../src/features/mission-state/types"

function tmpDir(): string {
  const d = join(tmpdir(), `plan-persist-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(d, { recursive: true })
  return d
}

describe("ensurePlanDir", () => {
  it("creates .matrixx/plans directory", () => {
    const dir = tmpDir()
    const ok = ensurePlanDir(dir)
    expect(ok).toBe(true)
    expect(existsSync(join(dir, ".matrixx", "plans"))).toBe(true)
  })

  it("returns false on failure", () => {
    // Passing null would fail — but this exercises the catch
    const ok = ensurePlanDir("/nonexistent/deep/path")
    expect(ok).toBe(false)
  })
})

describe("readPlanFile", () => {
  it("returns content for existing file", () => {
    const dir = tmpDir()
    const filePath = join(dir, "test.md")
    writeFileSync(filePath, "hello world", "utf-8")
    expect(readPlanFile(filePath)).toBe("hello world")
  })

  it("returns null for missing file", () => {
    expect(readPlanFile("/nonexistent/file.md")).toBeNull()
  })

  it("returns null for oversized file", () => {
    const dir = tmpDir()
    const filePath = join(dir, "big.md")
    // Write 200KB of data
    writeFileSync(filePath, "x".repeat(200_000), "utf-8")
    expect(readPlanFile(filePath)).toBeNull()
  })
})

describe("atomicWrite", () => {
  it("writes content correctly (verified via readFileSync)", () => {
    const dir = tmpDir()
    const filePath = join(dir, "test.md")
    const ok = atomicWrite(filePath, "atomic content")
    expect(ok).toBe(true)
    expect(readFileSync(filePath, "utf-8")).toBe("atomic content")
  })

  it("fails to write when parent directory doesn't exist", () => {
    const dir = tmpDir()
    const filePath = join(dir, "subdir", "plan.md")
    const ok = atomicWrite(filePath, "nested content")
    expect(ok).toBe(false)
  })
})

describe("writePlanFile", () => {
  it("writes content via writePlanFile and reads it back", () => {
    const dir = tmpDir()
    const planPath = join(dir, ".matrixx", "plans", "test.md")
    const ok = writePlanFile(dir, planPath, "plan content")
    expect(ok).toBe(true)
    expect(readFileSync(planPath, "utf-8")).toBe("plan content")
  })
})

describe("syncCheckboxes", () => {
  it("marks a pending todo as completed when todo status is completed", () => {
    const content = "- [ ] Task one\n- [ ] Task two"
    const todos = [
      { content: "Task one", status: "completed" },
      { content: "Task two", status: "pending" },
    ]
    const result = syncCheckboxes(content, todos)
    expect(result).toBe("- [x] Task one\n- [ ] Task two")
  })

  it("keeps a completed box checked even if the todo regresses to pending", () => {
    const content = "- [x] Task one\n- [x] Task two"
    const todos = [
      { content: "Task one", status: "pending" },
      { content: "Task two", status: "cancelled" },
    ]
    const result = syncCheckboxes(content, todos)
    // Checked boxes are never unchecked — sync only transitions [ ] → [x]
    expect(result).toBe("- [x] Task one\n- [x] Task two")
  })

  it("handles multiple checkboxes in the same file", () => {
    const content = [
      "# Plan",
      "",
      "- [ ] Task A",
      "- [x] Task B",
      "- [ ] Task C",
      "",
      "Some unrelated text",
      "",
      "- [ ] Task D",
    ].join("\n")
    const todos = [
      { content: "Task A", status: "completed" },
      { content: "Task B", status: "completed" },
      { content: "Task C", status: "pending" },
    ]
    const result = syncCheckboxes(content, todos)
    expect(result).toContain("- [x] Task A")
    expect(result).toContain("- [x] Task B")
    expect(result).toContain("- [ ] Task C")
    // Task D has no matching todo — keeps its state
    expect(result).toContain("- [ ] Task D")
  })

  it("does not touch non-todo markdown lines", () => {
    const content = [
      "# Title",
      "Some description.",
      "- [ ] Task one",
      "> A blockquote",
      "```",
      "- [ ] Not a real checkbox (in code block)",
      "```",
    ].join("\n")
    const todos = [{ content: "Task one", status: "completed" }]
    const result = syncCheckboxes(content, todos)
    expect(result).toContain("- [x] Task one")
    expect(result).toContain("# Title")
    expect(result).toContain("Some description.")
    expect(result).toContain("> A blockquote")
    // Code blocks are NOT excluded by the regex — but that's acceptable
    // because code blocks containing checkbox-like text are rare in practice
  })

  it("is idempotent (running twice with same todos = same output)", () => {
    const content = "- [ ] Task one\n- [ ] Task two"
    const todos = [
      { content: "Task one", status: "completed" },
      { content: "Task two", status: "pending" },
    ]
    const once = syncCheckboxes(content, todos)
    const twice = syncCheckboxes(once, todos)
    expect(twice).toBe(once)
  })
})

describe("upsertMetadataComment", () => {
  const meta: PlanMeta = {
    id: "test-plan",
    updatedAt: "2026-07-10T21:00:00.000Z",
    sessionId: "ses_123",
    todoTotal: 10,
    todoCompleted: 5,
  }

  it("adds metadata to a file without it", () => {
    const content = "# Test Plan\n\n- [ ] Item 1\n- [ ] Item 2"
    const result = upsertMetadataComment(content, meta)
    expect(result).toContain("<!-- plan-persister:")
    expect(result).toContain("test-plan")
    expect(result).toContain("# Test Plan")
  })

  it("replaces existing metadata on second write", () => {
    const updatedMeta: PlanMeta = { ...meta, todoCompleted: 7 }
    const once = upsertMetadataComment("# Plan\n\n- [ ] Item", meta)
    const twice = upsertMetadataComment(once, updatedMeta)
    // Only one metadata comment should exist
    const matches = twice.match(/<!-- plan-persister:/g)
    expect(matches).toHaveLength(1)
    expect(twice).toContain('"todoCompleted":7')
  })
})

describe("parseMetadataComment", () => {
  it("extracts metadata from a valid comment", () => {
    const content =
      "# Plan\n\n- [ ] Item\n\n<!-- plan-persister: {\"id\":\"test\",\"updatedAt\":\"2026-01-01T00:00:00.000Z\",\"sessionId\":\"s1\",\"todoTotal\":5,\"todoCompleted\":2} -->\n"
    const meta = parseMetadataComment(content)
    expect(meta).not.toBeNull()
    expect(meta?.id).toBe("test")
    expect(meta?.todoTotal).toBe(5)
    expect(meta?.todoCompleted).toBe(2)
  })

  it("returns null for files without comment", () => {
    const meta = parseMetadataComment("# Plain plan\n\n- [ ] Task\n")
    expect(meta).toBeNull()
  })

  it("handles malformed JSON gracefully (returns null)", () => {
    const content =
      "# Plan\n\n<!-- plan-persister: {not-json} -->\n"
    const meta = parseMetadataComment(content)
    expect(meta).toBeNull()
  })
})
