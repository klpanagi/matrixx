/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { PluginInput } from "@opencode-ai/plugin"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { createTaskEditGuardHook } from "../../../src/hooks/task-edit-guard"
import { BLOCKED_PATTERNS, PLAN_READ_WARN, PLAN_WRITE_WARN } from "../../../src/hooks/task-edit-guard/constants"

/**
 * Regression suite for the task-edit-guard hook (Task 7 of
 * enforce-plan-tools-only-access). Proves every generic Write/Edit/bash
 * bypass on .matrixx/plans/*.md (and .matrixx/tasks/T-*.json) is closed,
 * while read-only grep and non-plan paths remain unaffected.
 */

describe("task-edit-guard: generic Write/Edit blocked on plans", () => {
  let tempDir: string
  let ctx: { directory: string }
  let hook: ReturnType<typeof createTaskEditGuardHook>

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "plan-enforcement-guard-"))
    ctx = { directory: tempDir }
    hook = createTaskEditGuardHook(ctx as unknown as PluginInput)
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  const plansPath = () => path.join(tempDir, ".matrixx", "plans", "my-plan.md")

  async function run(tool: string, args: Record<string, unknown>) {
    const input = { tool, sessionID: "ses_1", callID: "call_1" }
    const output = { args }
    return hook["tool.execute.before"]?.(input, output)
  }

  test("blocks Write to plans path via filePath arg", async () => {
    //#given a Write targeting .matrixx/plans
    //#when the guard runs
    const result = run("Write", { filePath: plansPath(), content: "# x" })
    //#then it throws the plan_* redirect warning
    await expect(result).rejects.toThrow(PLAN_WRITE_WARN)
  })

  test("blocks Write to plans path via 'path' arg", async () => {
    //#given a Write using the 'path' alias
    //#when the guard runs
    const result = run("Write", { path: plansPath(), content: "# x" })
    //#then it throws
    await expect(result).rejects.toThrow(PLAN_WRITE_WARN)
  })

  test("blocks Write to plans path via 'file' arg", async () => {
    //#given a Write using the 'file' alias
    //#when the guard runs
    const result = run("Write", { file: plansPath(), content: "# x" })
    //#then it throws
    await expect(result).rejects.toThrow(PLAN_WRITE_WARN)
  })

  test("blocks Edit to plans path", async () => {
    //#given an Edit targeting .matrixx/plans
    //#when the guard runs
    const result = run("Edit", { filePath: plansPath(), edits: [{ op: "replace", pos: "1#AB", lines: ["y"] }] })
    //#then it throws the plan_* redirect warning
    await expect(result).rejects.toThrow(PLAN_WRITE_WARN)
  })

  test("blocks Write to plans path with backslash separators (Windows-style)", async () => {
    //#given a Write with backslash path
    //#when the guard runs
    const result = run("Write", { filePath: `${tempDir}\\.matrixx\\plans\\my-plan.md`, content: "# x" })
    //#then it throws (normalization converts backslashes)
    await expect(result).rejects.toThrow(PLAN_WRITE_WARN)
  })

  test("blocks Write to plans path case-insensitively", async () => {
    //#given a Write with uppercase .MATRIXX/PLANS
    //#when the guard runs
    const result = run("Write", { filePath: `${tempDir}/.MATRIXX/PLANS/my-plan.md`, content: "# x" })
    //#then it throws
    await expect(result).rejects.toThrow(PLAN_WRITE_WARN)
  })

  test("allows Write to non-plan path", async () => {
    //#given a Write to a regular file
    //#when the guard runs
    const result = run("Write", { filePath: path.join(tempDir, "notes.md"), content: "# x" })
    //#then it passes through
    await expect(result).resolves.toBeUndefined()
  })

  test("allows Edit to non-plan path", async () => {
    //#given an Edit to a regular file
    //#when the guard runs
    const result = run("Edit", { filePath: path.join(tempDir, "notes.md"), edits: [] })
    //#then it passes through
    await expect(result).resolves.toBeUndefined()
  })

  test("allows Write to .matrixx/drafts (drafts are not plans)", async () => {
    //#given a Write to a drafts path
    //#when the guard runs
    const result = run("Write", { filePath: path.join(tempDir, ".matrixx", "drafts", "draft.md"), content: "# d" })
    //#then it passes through
    await expect(result).resolves.toBeUndefined()
  })

  test("blocks Read to plans path (closes the documented Read bypass)", async () => {
    //#given a Read tool on a plans path
    //#when the guard runs
    const result = run("Read", { filePath: plansPath() })
    //#then it throws the plan_read redirect warning
    await expect(result).rejects.toThrow(PLAN_READ_WARN)
  })

  test("blocks Read to plans path via 'path' arg", async () => {
    //#given a Read using the 'path' alias
    //#when the guard runs
    const result = run("Read", { path: plansPath() })
    //#then it throws
    await expect(result).rejects.toThrow(PLAN_READ_WARN)
  })

  test("blocks Read to plans path via 'file' arg", async () => {
    //#given a Read using the 'file' alias
    //#when the guard runs
    const result = run("Read", { file: plansPath() })
    //#then it throws
    await expect(result).rejects.toThrow(PLAN_READ_WARN)
  })

  test("blocks Read to plans path with backslash separators (Windows-style)", async () => {
    //#given a Read with backslash path
    //#when the guard runs
    const result = run("Read", { filePath: `${tempDir}\\.matrixx\\plans\\my-plan.md` })
    //#then it throws (normalization converts backslashes)
    await expect(result).rejects.toThrow(PLAN_READ_WARN)
  })

  test("blocks Read to plans path case-insensitively", async () => {
    //#given a Read with uppercase .MATRIXX/PLANS
    //#when the guard runs
    const result = run("Read", { filePath: `${tempDir}/.MATRIXX/PLANS/my-plan.md` })
    //#then it throws
    await expect(result).rejects.toThrow(PLAN_READ_WARN)
  })

  test("allows Read to non-plan path", async () => {
    //#given a Read to a regular file
    //#when the guard runs
    const result = run("Read", { filePath: path.join(tempDir, "notes.md") })
    //#then it passes through
    await expect(result).resolves.toBeUndefined()
  })

  test("allows Read to .matrixx/tasks path (tasks use task_* tools, Read is fine)", async () => {
    //#given a Read on a task file
    //#when the guard runs
    const result = run("Read", { filePath: path.join(tempDir, ".matrixx", "tasks", "T-123.json") })
    //#then it passes through — only plans are Read-blocked
    await expect(result).resolves.toBeUndefined()
  })

  test("allows plan_read tool on plans path (guard matches exact tool name 'read' only)", async () => {
    //#given the plan_read tool targeting a plans path
    //#when the guard runs
    const result = run("plan_read", { filePath: plansPath() })
    //#then it passes through — plan_read is the sanctioned reader
    await expect(result).resolves.toBeUndefined()
  })
})

describe("task-edit-guard: bash mutation matrix blocked on plans/tasks", () => {
  let tempDir: string
  let ctx: { directory: string }
  let hook: ReturnType<typeof createTaskEditGuardHook>

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "plan-enforcement-bash-"))
    ctx = { directory: tempDir }
    hook = createTaskEditGuardHook(ctx as unknown as PluginInput)
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  async function runBash(command: string) {
    const input = { tool: "bash", sessionID: "ses_1", callID: "call_1" }
    const output = { args: { command } }
    return hook["tool.execute.before"]?.(input, output)
  }

  // Every BLOCKED_PATTERN from constants.ts, exercised with a concrete command.
  // Built as a function so tempDir is read at call time (after beforeEach).
  const blockedCommands = (): Array<{ label: string; command: string }> => [
    { label: "sed on plans", command: `sed -i 's/a/b/' ${tempDir}/.matrixx/plans/my-plan.md` },
    { label: "sed on tasks", command: `sed -i 's/a/b/' ${tempDir}/.matrixx/tasks/T-123.json` },
    { label: "python3 on plans", command: `python3 -c "print(1)" ${tempDir}/.matrixx/plans/my-plan.md` },
    { label: "python on plans", command: `python -c "print(1)" ${tempDir}/.matrixx/plans/my-plan.md` },
    { label: "python3 on tasks", command: `python3 -c "print(1)" ${tempDir}/.matrixx/tasks/T-123.json` },
    { label: "echo append on plans", command: `echo "x" >> ${tempDir}/.matrixx/plans/my-plan.md` },
    { label: "echo append on tasks", command: `echo "x" >> ${tempDir}/.matrixx/tasks/T-123.json` },
    { label: "cat > on plans", command: `cat > ${tempDir}/.matrixx/plans/my-plan.md` },
    { label: "cat > on tasks", command: `cat > ${tempDir}/.matrixx/tasks/T-123.json` },
    { label: "mv into plans", command: `mv /tmp/a ${tempDir}/.matrixx/plans/my-plan.md` },
    { label: "mv into tasks", command: `mv /tmp/a ${tempDir}/.matrixx/tasks/T-123.json` },
    { label: "rm on plans", command: `rm ${tempDir}/.matrixx/plans/my-plan.md` },
    { label: "rm on task file", command: `rm ${tempDir}/.matrixx/tasks/T-123.json` },
    { label: "cp into plans", command: `cp /tmp/a ${tempDir}/.matrixx/plans/my-plan.md` },
    { label: "tee on plans", command: `echo x | tee ${tempDir}/.matrixx/plans/my-plan.md` },
    { label: "touch on plans", command: `touch ${tempDir}/.matrixx/plans/my-plan.md` },
    { label: "truncate on plans", command: `truncate -s 0 ${tempDir}/.matrixx/plans/my-plan.md` },
    { label: "printf on plans", command: `printf "x" > ${tempDir}/.matrixx/plans/my-plan.md` },
    { label: "printf on tasks", command: `printf "x" > ${tempDir}/.matrixx/tasks/T-123.json` },
  ]


  test("BLOCKED_PATTERNS covers the full mutation matrix", () => {
    //#given the constants module
    //#when inspecting BLOCKED_PATTERNS
    //#then every mutation tool from the matrix is represented
    const joined = BLOCKED_PATTERNS.map((rx) => rx.source).join("\n")
    for (const tool of ["sed", "python", "echo", "cat", "mv", "rm", "cp", "tee", "touch", "truncate", "printf"]) {
      expect(joined).toContain(tool)
    }
  })

  for (const { label, command } of blockedCommands()) {
    test(`blocks bash: ${label}`, async () => {
      //#given a raw bash mutation command touching plans/tasks
      //#when the guard runs
      const result = runBash(command)
      //#then it throws the raw-bash-edit block message
      await expect(result).rejects.toThrow("Blocked: raw bash edit to plan/task files")
    })
  }

  test("allows pure read-only grep on plans path", async () => {
    //#given a read-only grep referencing .matrixx/plans
    //#when the guard runs
    const result = runBash(`grep -rn "plan" ${tempDir}/.matrixx/plans/`)
    //#then it passes through (fast-path for pure grep reads)
    await expect(result).resolves.toBeUndefined()
  })

  test("allows grep with .matrixx/plans substring when no mutation tool present", async () => {
    //#given a grep that mentions the plans dir
    //#when the guard runs
    const result = runBash(`grep -r ".matrixx/plans" ${tempDir}/src`)
    //#then it passes through
    await expect(result).resolves.toBeUndefined()
  })

  test("blocks grep piped into sed on plans", async () => {
    //#given grep output piped into sed touching plans
    //#when the guard runs
    const result = runBash(`grep -r "x" ${tempDir}/src | sed -i 's/a/b/' ${tempDir}/.matrixx/plans/my-plan.md`)
    //#then it throws (mutation tool present alongside plans path)
    await expect(result).rejects.toThrow("Blocked: raw bash edit to plan/task files")
  })

  test("allows sed on non-plan files", async () => {
    //#given sed on a regular source file
    //#when the guard runs
    const result = runBash(`sed -i 's/a/b/' ${tempDir}/src/index.ts`)
    //#then it passes through
    await expect(result).resolves.toBeUndefined()
  })

  test("allows bash without plans/tasks paths", async () => {
    //#given an unrelated bash command
    //#when the guard runs
    const result = runBash(`ls -la ${tempDir}`)
    //#then it passes through
    await expect(result).resolves.toBeUndefined()
  })

  test("allows rm on non-task json in tasks dir (pattern targets T-*.json only)", async () => {
    //#given rm on a non-T-*.json file under .matrixx/tasks
    //#when the guard runs
    const result = runBash(`rm ${tempDir}/.matrixx/tasks/other.json`)
    //#then it passes through (by design — only T-*.json task files are guarded)
    await expect(result).resolves.toBeUndefined()
  })
})