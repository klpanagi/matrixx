/**
 * Plan Persister Hook
 *
 * Continuation hook that persists active plan state (todos + metadata)
 * to the plan file on session.idle, and builds rehydration context
 * for injection after compaction.
 */

import { existsSync, readdirSync } from "node:fs"
import type { PluginInput } from "@opencode-ai/plugin"
import {
  atomicWrite,
  ensurePlanDir,
  readMissionState,
  readPlanFile,
  syncCheckboxes,
  upsertMetadataComment,
} from "../../features/mission-state"
import { buildRehydrationContext } from "../../features/mission-state/rehydrate"
import type { PlanMeta, PlanPersistenceOptions } from "../../features/mission-state/types"
import { getTaskDir, readJsonSafe } from "../../features/task-storage/storage"
import { log } from "../../shared/logger"
import { getGitHead } from "../../tools/handoff/git"
import { TaskObjectSchema } from "../../tools/task/types"

const HOOK_NAME = "plan-persister"

export interface PlanPersister {
  buildRehydrationContext: (sessionID: string) => string | null
  capture: (sessionID: string) => Promise<void>
  event: (input: { event: { type: string; properties?: unknown } }) => Promise<void>
}

export function createPlanPersister(
  ctx: PluginInput,
  options: PlanPersistenceOptions,
): PlanPersister {
  const { directory } = options

  const capture = async (sessionID: string): Promise<void> => {
    if (!sessionID) return

    const mission = readMissionState(directory)
    if (!mission?.active_plan) return

    // Only capture for sessions that are part of this mission
    if (!mission.session_ids?.includes(sessionID)) return

    const planPath = mission.active_plan
    if (!existsSync(planPath)) return

    // Read current todo/task state — task-system-aware (fixes checklist left outdated)

    let todos: Array<{ content: string; status: string }> = []

    // Try file-backed tasks first (task_system:true default). Falls back to session.todo for legacy.

    try {

      const taskDir = getTaskDir({}, directory)

      if (existsSync(taskDir)) {

        const files = readdirSync(taskDir).filter((f) => f.startsWith("T-") && f.endsWith(".json"))

        const tasks: Array<{ content: string; status: string }> = []

        for (const f of files) {

          const parsed = readJsonSafe(`${taskDir}/${f}`, TaskObjectSchema)

          if (parsed) tasks.push({ content: parsed.subject, status: parsed.status })

        }

        if (tasks.length > 0) {

          todos = tasks

        }

      }

    } catch {

      // ignore task dir read errors, fallback to todos

    }

    if (todos.length === 0) {

      try {

        const response = await ctx.client.session.todo({ path: { id: sessionID } })

        todos = normalizeTodos(response)

      } catch (err) {

        log(`[${HOOK_NAME}] Failed to fetch todos`, { sessionID, error: String(err) })

        return

      }

    }

    // Read current plan content
    const content = readPlanFile(planPath)
    if (!content) return

    // Sync checkbox state
    const syncedContent = syncCheckboxes(content, todos)

    // Add/update metadata — count progress from synced content, not file
    const total = (syncedContent.match(/^[-*]\s*\[[ xX]\]/gm) || []).length
    const completed = (syncedContent.match(/^[-*]\s*\[[xX]\]/gm) || []).length
    const gitHead = await getGitHead(directory)
    const meta: PlanMeta = {
      id: mission.plan_name,
      updatedAt: new Date().toISOString(),
      sessionId: sessionID,
      todoTotal: total,
      todoCompleted: completed,
      gitHead: gitHead ?? undefined,
    }
    const finalContent = upsertMetadataComment(syncedContent, meta)

    // Atomic write
    ensurePlanDir(directory)
    const ok = atomicWrite(planPath, finalContent)
    if (ok) {
      log(`[${HOOK_NAME}] Plan file updated`, { planPath, completed, total })
    } else {
      log(`[${HOOK_NAME}] Failed to write plan file`, { planPath })
    }
  }

  const event = async ({ event: evt }: { event: { type: string; properties?: unknown } }): Promise<void> => {
    const props = evt.properties as Record<string, unknown> | undefined

    if (evt.type === "session.idle") {
      const sessionID = props?.sessionID as string | undefined
      if (!sessionID) return
      await capture(sessionID)
      return
    }

    if (evt.type === "session.compacted") {
      const sessionID = (props?.sessionID ?? (props?.info as { id?: string } | undefined)?.id) as string | undefined
      if (!sessionID) return
      // On compaction, capture latest state before it's lost
      await capture(sessionID)
      return
    }
  }

  const buildRehydrationCtx = (_sessionID: string): string | null => {
    const ctx = buildRehydrationContext(directory)
    return ctx?.directive ?? null
  }

  return { capture, event, buildRehydrationContext: buildRehydrationCtx }
}

/** Normalize OpenCode SDK todo response to our Todo shape */
function normalizeTodos(response: unknown): Array<{ content: string; status: string }> {
  try {
    const data = (response as { data?: unknown }).data ?? response
    if (Array.isArray(data)) {
      return data.map((t: Record<string, unknown>) => ({
        content: String(t.content ?? ""),
        status: String(t.status ?? "pending"),
      }))
    }
  } catch {
    // fall through
  }
  return []
}
