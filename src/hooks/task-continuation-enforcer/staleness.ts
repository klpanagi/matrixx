import { statSync } from "node:fs"
import type { MatrixxConfig } from "../../config/schema"

export const DEFAULT_STALE_AFTER_HOURS = 24

const HOUR_MS = 60 * 60 * 1000

/**
 * Resolve the stale threshold (ms) from plugin config.
 * `morpheus.tasks.stale_after_hours` (default 24h) — a pending task whose
 * task file has had no write activity for longer than this is "stale".
 */
export function getStaleAfterMs(config?: Partial<MatrixxConfig>): number {
  const hours = config?.morpheus?.tasks?.stale_after_hours ?? DEFAULT_STALE_AFTER_HOURS
  return hours * HOUR_MS
}

/**
 * Age of a task file in ms since last write (mtime). Returns null when the
 * file cannot be stat'ed (missing/unreadable) — callers treat null as "not stale".
 */
export function getTaskAgeMs(taskPath: string): number | null {
  try {
    const stat = statSync(taskPath)
    return Date.now() - stat.mtimeMs
  } catch {
    return null
  }
}

export function isTaskStale(taskPath: string, staleAfterMs: number): boolean {
  const ageMs = getTaskAgeMs(taskPath)
  return ageMs !== null && ageMs > staleAfterMs
}

/** Human-readable age, e.g. "3h", "2d". */
export function formatTaskAge(ageMs: number): string {
  const hours = Math.floor(ageMs / HOUR_MS)
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    return `${days}d`
  }
  return `${hours}h`
}