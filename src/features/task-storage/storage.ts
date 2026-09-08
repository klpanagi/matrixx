import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { basename, dirname, isAbsolute, join } from "node:path"
import type { z } from "zod"
import type { MatrixxConfig } from "../../config/schema"
import { log } from "../../shared/logger"
import { getOpenCodeConfigDir } from "../../shared/opencode-config-dir"

export function getProjectTaskDir(directory: string): string {
  return join(directory, ".matrixx", "tasks")
}

export function getTaskDir(config: Partial<MatrixxConfig> = {}, directory?: string): string {
  const tasksConfig = config.morpheus?.tasks
  const storagePath = tasksConfig?.storage_path

  if (storagePath) {
    return isAbsolute(storagePath) ? storagePath : join(directory ?? process.cwd(), storagePath)
  }

  if (tasksConfig?.scope === "global" || !directory) {
    const configDir = getOpenCodeConfigDir({ binary: "opencode" })
    const listId = resolveTaskListId(config)
    return join(configDir, "tasks", listId)
  }

  return getProjectTaskDir(directory)
}

export function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-") || "default"
}

export function resolveTaskListId(config: Partial<MatrixxConfig> = {}): string {
  const envId = process.env.ULTRAWORK_TASK_LIST_ID?.trim()
  if (envId) return sanitizePathSegment(envId)

  const claudeEnvId = process.env.CLAUDE_CODE_TASK_LIST_ID?.trim()
  if (claudeEnvId) return sanitizePathSegment(claudeEnvId)

  const configId = config.morpheus?.tasks?.task_list_id?.trim()
  if (configId) return sanitizePathSegment(configId)

  return sanitizePathSegment(basename(process.cwd()))
}

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true })
  }
}

export function readJsonSafe<T>(filePath: string, schema: z.ZodType<T>): T | null {
  try {
    if (!existsSync(filePath)) {
      return null
    }

    const content = readFileSync(filePath, "utf-8")
    const parsed = JSON.parse(content)
    const result = schema.safeParse(parsed)

    if (!result.success) {
      return null
    }

    return result.data
  } catch {
    return null
  }
}

export function writeJsonAtomic(filePath: string, data: unknown): void {
  const dir = dirname(filePath)
  ensureDir(dir)

  const tempPath = `${filePath}.tmp.${Date.now()}`

  try {
    writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8")
    renameSync(tempPath, filePath)
  } catch (error) {
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath)
      }
    } catch {
      // Ignore cleanup errors
    }
    throw error
  }
}

const STALE_LOCK_THRESHOLD_MS = 30000

export async function acquireLockWithRetry(
  dirPath: string,
  retries = 4,
): Promise<{ acquired: boolean; release: () => void }> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const lock = acquireLock(dirPath)
    if (lock.acquired) return lock
    if (attempt < retries - 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 15 * 2 ** attempt))
    }
  }
  return { acquired: false, release: () => {} }
}

export function generateTaskId(): string {
  return `T-${randomUUID()}`
}

export function listTaskFiles(config: Partial<MatrixxConfig> = {}, directory?: string): string[] {
  const dir = getTaskDir(config, directory)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f.startsWith('T-'))
    .map((f) => f.replace('.json', ''))
}

export function migrateLegacyTasksIfNeeded(
  config: Partial<MatrixxConfig>,
  directory: string,
): { migrated: number; legacyDir: string; projectDir: string } {
  const projectDir = getProjectTaskDir(directory)
  const legacyDir = join(getOpenCodeConfigDir({ binary: "opencode" }), "tasks", resolveTaskListId(config))

  if (existsSync(projectDir)) {
    try {
      const existing = readdirSync(projectDir).filter((f) => f.startsWith("T-") && f.endsWith(".json"))
      if (existing.length > 0) {
        return { migrated: 0, legacyDir, projectDir }
      }
    } catch {
      // Ignore read errors, proceed to migration check
    }
  }

  if (!existsSync(legacyDir)) {
    return { migrated: 0, legacyDir, projectDir }
  }

  let files: string[] = []
  try {
    files = readdirSync(legacyDir).filter((f) => f.startsWith("T-") && f.endsWith(".json"))
  } catch {
    return { migrated: 0, legacyDir, projectDir }
  }

  if (files.length === 0) {
    return { migrated: 0, legacyDir, projectDir }
  }

  ensureDir(projectDir)

  let migrated = 0
  for (const file of files) {
    const src = join(legacyDir, file)
    const dest = join(projectDir, file)
    if (existsSync(dest)) continue
    try {
      const content = readFileSync(src, "utf-8")
      writeFileSync(dest, content, "utf-8")
      migrated++
    } catch {
      // Ignore individual file copy errors
    }
  }

  if (migrated > 0) {
    log(`[task-storage] Migrated ${migrated} legacy tasks from ${legacyDir} to ${projectDir}`)
  }

  return { migrated, legacyDir, projectDir }
}

export function acquireLock(dirPath: string): { acquired: boolean; release: () => void } {
  const lockPath = join(dirPath, ".lock")
  const lockId = randomUUID()

  const createLock = (timestamp: number) => {
    writeFileSync(lockPath, JSON.stringify({ id: lockId, timestamp }), {
      encoding: "utf-8",
      flag: "wx",
    })
  }

  const isStale = () => {
    try {
      const lockContent = readFileSync(lockPath, "utf-8")
      const lockData = JSON.parse(lockContent)
      const lockAge = Date.now() - lockData.timestamp
      return lockAge > STALE_LOCK_THRESHOLD_MS
    } catch {
      return true
    }
  }

  const tryAcquire = () => {
    const now = Date.now()
    try {
      createLock(now)
      return true
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
        return false
      }
      throw error
    }
  }

  ensureDir(dirPath)

  let acquired = tryAcquire()
  if (!acquired && isStale()) {
    try {
      unlinkSync(lockPath)
    } catch {
      // Ignore cleanup errors
    }
    acquired = tryAcquire()
  }

  if (!acquired) {
    return {
      acquired: false,
      release: () => {
        // No-op release for failed acquisition
      },
    }
  }

  return {
    acquired: true,
    release: () => {
      try {
        if (!existsSync(lockPath)) return
        const lockContent = readFileSync(lockPath, "utf-8")
        const lockData = JSON.parse(lockContent)
        if (lockData.id !== lockId) return
        unlinkSync(lockPath)
      } catch {
        // Ignore cleanup errors
      }
    },
  }
}
