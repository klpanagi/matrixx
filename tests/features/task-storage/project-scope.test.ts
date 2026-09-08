import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, rmSync, writeFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { getProjectTaskDir, getTaskDir, listTaskFiles, migrateLegacyTasksIfNeeded, sanitizePathSegment, resolveTaskListId } from "../../../src/features/task-storage/storage"
import type { MatrixxConfig } from "../../../src/config/schema"
import { getOpenCodeConfigDir } from "../../../src/shared/opencode-config-dir"
import { TaskObjectSchema } from "../../../src/tools/task/types"

function tmpDir(prefix: string): string {
  const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(join(dir, ".matrixx/tasks"), { recursive: true })
  return dir
}

describe("project-scoped storage", () => {
  const savedEnv = process.env.ULTRAWORK_TASK_LIST_ID
  afterEach(() => {
    if (savedEnv === undefined) delete process.env.ULTRAWORK_TASK_LIST_ID
    else process.env.ULTRAWORK_TASK_LIST_ID = savedEnv
  })

  test("getProjectTaskDir returns .matrixx/tasks", () => {
    //#given
    const dir = "/tmp/projA"
    //#when
    const result = getProjectTaskDir(dir)
    //#then
    expect(result).toBe(join(dir, ".matrixx", "tasks"))
  })

  test("getTaskDir with scope project and directory returns project path", () => {
    //#given
    const dir = "/tmp/projA"
    const config: Partial<MatrixxConfig> = { morpheus: { tasks: { scope: "project", claude_code_compat: false } as any } }
    //#when
    const result = getTaskDir(config, dir)
    //#then
    expect(result).toBe(join(dir, ".matrixx", "tasks"))
  })

  test("getTaskDir with scope global returns legacy config dir", () => {
    //#given
    const dir = "/tmp/projA"
    const config: Partial<MatrixxConfig> = { morpheus: { tasks: { scope: "global", claude_code_compat: false } as any } }
    const configDir = getOpenCodeConfigDir({ binary: "opencode" })
    //#when
    const result = getTaskDir(config, dir)
    //#then
    expect(result).toBe(join(configDir, "tasks", resolveTaskListId(config)))
  })

  test("getTaskDir no directory falls back to global", () => {
    //#given
    const config: Partial<MatrixxConfig> = { morpheus: { tasks: { scope: "project", claude_code_compat: false } as any } }
    const configDir = getOpenCodeConfigDir({ binary: "opencode" })
    //#when
    const result = getTaskDir(config)
    //#then
    expect(result).toBe(join(configDir, "tasks", resolveTaskListId(config)))
  })

  test("storage_path absolute is returned as-is", () => {
    //#given
    const dir = "/tmp/projA"
    const config: Partial<MatrixxConfig> = { morpheus: { tasks: { storage_path: "/tmp/abs-custom", claude_code_compat: false } as any } }
    //#when
    const result = getTaskDir(config, dir)
    //#then
    expect(result).toBe("/tmp/abs-custom")
  })

  test("storage_path relative resolves against directory", () => {
    //#given
    const dir = "/tmp/projA"
    const config: Partial<MatrixxConfig> = { morpheus: { tasks: { storage_path: "custom", claude_code_compat: false } as any } }
    //#when
    const result = getTaskDir(config, dir)
    //#then
    expect(result).toBe(join(dir, "custom"))
  })

  test("project isolation: two dirs separate", () => {
    //#given
    const projA = tmpDir("projA-iso")
    const projB = tmpDir("projB-iso")
    const config: Partial<MatrixxConfig> = { morpheus: { tasks: { scope: "project", claude_code_compat: false } as any } }
    const task = { id: "T-iso-1", subject: "projA task", description: "", status: "pending" as const, blocks: [], blockedBy: [], threadID: "ses-test", projectRoot: projA }
    const parsed = TaskObjectSchema.parse(task)
    writeFileSync(join(projA, ".matrixx/tasks", "T-iso-1.json"), JSON.stringify(parsed), "utf-8")
    //#when
    const listA = listTaskFiles(config, projA)
    const listB = listTaskFiles(config, projB)
    //#then
    expect(listA).toContain("T-iso-1")
    expect(listB).not.toContain("T-iso-1")
    expect(listB).toEqual([])
    rmSync(projA, { recursive: true, force: true })
    rmSync(projB, { recursive: true, force: true })
  })

  test("migrateLegacyTasksIfNeeded copies legacy when project empty", () => {
    //#given
    const uid = `test-migrate-${Date.now()}`
    const saved = process.env.ULTRAWORK_TASK_LIST_ID
    process.env.ULTRAWORK_TASK_LIST_ID = uid
    const config: Partial<MatrixxConfig> = { morpheus: { tasks: { scope: "project", claude_code_compat: false } as any } }
    const legacyDir = join(getOpenCodeConfigDir({ binary: "opencode" }), "tasks", uid)
    const proj = tmpDir("proj-migrate")
    // ensure legacy has 2 files
    mkdirSync(legacyDir, { recursive: true })
    writeFileSync(join(legacyDir, "T-mig-1.json"), JSON.stringify({ id: "T-mig-1", subject: "a", description: "", status: "pending", blocks: [], blockedBy: [], threadID: "ses" }), "utf-8")
    writeFileSync(join(legacyDir, "T-mig-2.json"), JSON.stringify({ id: "T-mig-2", subject: "b", description: "", status: "pending", blocks: [], blockedBy: [], threadID: "ses" }), "utf-8")
    //#when
    const result = migrateLegacyTasksIfNeeded(config, proj)
    //#then
    expect(result.migrated).toBe(2)
    expect(existsSync(join(proj, ".matrixx/tasks", "T-mig-1.json"))).toBe(true)
    expect(existsSync(join(proj, ".matrixx/tasks", "T-mig-2.json"))).toBe(true)
    // second call idempotent
    const result2 = migrateLegacyTasksIfNeeded(config, proj)
    expect(result2.migrated).toBe(0)
    // cleanup
    rmSync(legacyDir, { recursive: true, force: true })
    rmSync(proj, { recursive: true, force: true })
    if (saved === undefined) delete process.env.ULTRAWORK_TASK_LIST_ID
    else process.env.ULTRAWORK_TASK_LIST_ID = saved
  })

  test("migrate does not overwrite existing dest", () => {
    //#given
    const uid = `test-migrate-nooverwrite-${Date.now()}`
    const saved = process.env.ULTRAWORK_TASK_LIST_ID
    process.env.ULTRAWORK_TASK_LIST_ID = uid
    const config: Partial<MatrixxConfig> = { morpheus: { tasks: { scope: "project", claude_code_compat: false } as any } }
    const legacyDir = join(getOpenCodeConfigDir({ binary: "opencode" }), "tasks", uid)
    const proj = tmpDir("proj-nooverwrite")
    mkdirSync(legacyDir, { recursive: true })
    writeFileSync(join(legacyDir, "T-keep.json"), JSON.stringify({ id: "T-keep", subject: "legacy", description: "", status: "pending", blocks: [], blockedBy: [], threadID: "ses" }), "utf-8")
    // pre-create dest with different content
    writeFileSync(join(proj, ".matrixx/tasks", "T-keep.json"), JSON.stringify({ id: "T-keep", subject: "project-existing", description: "", status: "pending", blocks: [], blockedBy: [], threadID: "ses" }), "utf-8")
    //#when
    const result = migrateLegacyTasksIfNeeded(config, proj)
    const destContent = JSON.parse(require("node:fs").readFileSync(join(proj, ".matrixx/tasks", "T-keep.json"), "utf-8"))
    //#then
    expect(result.migrated).toBe(0)
    expect(destContent.subject).toBe("project-existing")
    rmSync(legacyDir, { recursive: true, force: true })
    rmSync(proj, { recursive: true, force: true })
    if (saved === undefined) delete process.env.ULTRAWORK_TASK_LIST_ID
    else process.env.ULTRAWORK_TASK_LIST_ID = saved
  })

  test("env-override precedence via resolveTaskListId", () => {
    //#given
    process.env.ULTRAWORK_TASK_LIST_ID = "env-override-id"
    //#when
    const result = resolveTaskListId({})
    //#then
    expect(result).toBe("env-override-id")
  })

  test("sanitizePathSegment preserved", () => {
    //#given
    const val = "a/b c@d"
    //#when
    const result = sanitizePathSegment(val)
    //#then
    expect(result).toBe("a-b-c-d")
  })
})
