/**
 * Plan Persistence Storage
 *
 * Atomic file operations for plan files.
 * Reuses the write-temp-then-rename pattern from handoff/storage.ts.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { MAX_PLAN_FILE_BYTES, META_TAG_PREFIX, META_TAG_SUFFIX, PLANS_DIR } from "./constants"
import type { PlanMeta } from "./types"

/**
 * Ensure the .matrixx/plans directory exists under the project root.
 */
export function ensurePlanDir(directory: string): boolean {
  try {
    mkdirSync(join(directory, PLANS_DIR), { recursive: true })
    return true
  } catch {
    return false
  }
}

/**
 * Read a plan file's content.
 * Returns null if the file does not exist, is too large, or cannot be read.
 */
export function readPlanFile(planPath: string): string | null {
  try {
    if (!existsSync(planPath)) return null
    const content = readFileSync(planPath, "utf-8")
    if (content.length > MAX_PLAN_FILE_BYTES) return null
    return content
  } catch {
    return null
  }
}

/**
 * Atomic write: write to a .tmp.{pid} file, then rename over the target.
 * Prevents partial/corrupt files on crash mid-write.
 */
export function atomicWrite(filePath: string, content: string): boolean {
  try {
    const tmpPath = `${filePath}.tmp.${process.pid}`
    writeFileSync(tmpPath, content, "utf-8")
    renameSync(tmpPath, filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Write content to a plan file using atomic write.
 * Ensures the plan directory exists first.
 */
export function writePlanFile(directory: string, planPath: string, content: string): boolean {
  try {
    ensurePlanDir(directory)
    return atomicWrite(planPath, content)
  } catch {
    return false
  }
}

/**
 * Sync markdown checkbox status to match todos.
 *
 * For each `- [ ]` or `- [x]` line, finds the matching todo by content
 * and marks it completed if the todo status is completed/cancelled.
 * Lines without a matching todo keep their current state.
 * Checked boxes are never unchecked — sync only transitions [ ] → [x].
 */
export function syncCheckboxes(
  content: string,
  todos: Array<{ content: string; status: string }>,
): string {
  const completedStatuses = new Set(["completed", "cancelled", "deleted"])
  return content.replace(
    /^(\s*[-*]\s*)\[([ xX])\]\s*(.*)$/gm,
    (_match: string, prefix: string, current: string, text: string) => {
      const todo = todos.find(
        (t) => text.includes(t.content) || t.content.includes(text),
      )
      // No matching todo → preserve current state (never revert manual marks)
      if (todo === undefined) return `${prefix}[${current}] ${text}`
      // Only check, never uncheck: a checked box stays checked
      const done = completedStatuses.has(todo.status) || current.toLowerCase() === "x"
      return `${prefix}[${done ? "x" : " "}] ${text}`
    },
  )
}

/**
 * Append or replace the <!-- plan-persister: ... --> metadata comment.
 *
 * If a comment already exists at the end of the file, it is replaced in-place.
 * Otherwise, the tag is appended after the last line.
 */
export function upsertMetadataComment(content: string, meta: PlanMeta): string {
  const json = JSON.stringify(meta)
  const tag = `${META_TAG_PREFIX} ${json} ${META_TAG_SUFFIX}`

  // Escape regex special chars in the prefix
  const escapedPrefix = META_TAG_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const escapedSuffix = META_TAG_SUFFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const regex = new RegExp(`${escapedPrefix}\\s*[^>]*?\\s*${escapedSuffix}`, "g")

  if (regex.test(content)) {
    return content.replace(regex, tag)
  }

  // Append: strip trailing whitespace, add blank line, then tag
  return `${content.replace(/\n*$/, "")}\n\n${tag}\n`
}

/**
 * Extract PlanMeta from an HTML comment, or null if absent/malformed.
 */
export function parseMetadataComment(content: string): PlanMeta | null {
  const escapedPrefix = META_TAG_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const escapedSuffix = META_TAG_SUFFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const regex = new RegExp(
    `${escapedPrefix}\\s*([^>]+?)\\s*${escapedSuffix}`,
  )
  const match = content.match(regex)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1]) as PlanMeta
    return parsed
  } catch {
    return null
  }
}
