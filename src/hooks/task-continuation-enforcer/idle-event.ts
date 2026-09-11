import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import type { MatrixxConfig } from "../../config/schema"
import type { BackgroundManager } from "../../features/background-agent"
import type { ToolPermission } from "../../features/hook-message-injector"
import { subagentSessions } from "../../features/session-state"
import { getTaskDir, readJsonSafe } from "../../features/task-storage/storage"
import type { Task } from "../../features/task-storage/types"
import { normalizeSDKResponse } from "../../shared"
import { getAgentConfigKey } from "../../shared/agent-display-names"
import { isAwaitingUser } from "../../shared/awaiting-user"
import { log } from "../../shared/logger"
import { TaskObjectSchema } from "../../tools/task/types"
import { isLastAssistantMessageAborted } from "./abort-detection"
import {
  ABORT_WINDOW_MS,
  CONTINUATION_COOLDOWN_MS,
  DEFAULT_SKIP_AGENTS,
  FAILURE_RESET_WINDOW_MS,
  HOOK_NAME,
  MAX_CONSECUTIVE_FAILURES,
} from "./constants"
import { startCountdown } from "./countdown"
import type { SessionStateStore } from "./session-state"
import { getStaleAfterMs, isTaskStale } from "./staleness"
import { getIncompleteTasks } from "./todo"
import type { MessageInfo, ResolvedMessageInfo } from "./types"

export async function handleSessionIdle(args: {
  ctx: PluginInput
  sessionID: string
  sessionStateStore: SessionStateStore
  backgroundManager?: BackgroundManager
  skipAgents?: string[]
  isContinuationStopped?: (sessionID: string) => boolean
  config?: Partial<MatrixxConfig>
}): Promise<void> {
  const {
    ctx,
    sessionID,
    sessionStateStore,
    backgroundManager,
    skipAgents = DEFAULT_SKIP_AGENTS,
    isContinuationStopped,
    config,
  } = args

  log(`[${HOOK_NAME}] session.idle`, { sessionID })

  if (subagentSessions.has(sessionID)) {
    log(`[${HOOK_NAME}] Skipped: subagent session`, { sessionID })
    return
  }

  const state = sessionStateStore.getState(sessionID)
  if (state.countdownTimer || state.countdownInterval) {
    log(`[${HOOK_NAME}] Skipped: countdown already active`, { sessionID })
    return
  }
  if (state.isRecovering) {
    log(`[${HOOK_NAME}] Skipped: in recovery`, { sessionID })
    return
  }

  if (state.abortDetectedAt) {
    const timeSinceAbort = Date.now() - state.abortDetectedAt
    if (timeSinceAbort < ABORT_WINDOW_MS) {
      log(`[${HOOK_NAME}] Skipped: abort detected via event ${timeSinceAbort}ms ago`, { sessionID })
      state.abortDetectedAt = undefined
      return
    }
    state.abortDetectedAt = undefined
  }
  if (isAwaitingUser(state)) {
    log(`[${HOOK_NAME}] Skipped: awaiting user`, { sessionID })
    return
  }

  const hasRunningBgTasks = backgroundManager
    ? backgroundManager.getTasksByParentSession(sessionID).some((task: { status: string }) => task.status === "running")
    : false

  if (hasRunningBgTasks) {
    log(`[${HOOK_NAME}] Skipped: background tasks running`, { sessionID })
    return
  }

  try {
    const messagesResp = await ctx.client.session.messages({
      path: { id: sessionID },
      query: { directory: ctx.directory },
    })
    const messages = normalizeSDKResponse(messagesResp, [] as Array<{ info?: MessageInfo }>)
    if (isLastAssistantMessageAborted(messages)) {
      log(`[${HOOK_NAME}] Skipped: last assistant message was aborted (API fallback)`, { sessionID })
      return
    }
    if (isAwaitingUser(state, messages)) {
      log(`[${HOOK_NAME}] Skipped: awaiting user (pending question)`, { sessionID })
      return
    }
  } catch (error) {
    log(`[${HOOK_NAME}] Messages fetch failed, continuing`, { sessionID, error: String(error) })
  }

  let incompleteCount = 0
  let total = 0
  let isBootstrap = false
  let taskDir = ""
  try {
    taskDir = getTaskDir(config, ctx.directory)
    if (!existsSync(taskDir)) {
      const hadBgTasks = backgroundManager ? backgroundManager.getTasksByParentSession(sessionID).length > 0 : false
      if (hadBgTasks) {
        log(`[${HOOK_NAME}] No task dir — bootstrap (hadBgTasks)`, { sessionID, taskDir })
        isBootstrap = true
        total = 0
        incompleteCount = 1
      } else {
        log(`[${HOOK_NAME}] No task dir`, { sessionID, taskDir })
        return
      }
    } else {
      const files = readdirSync(taskDir).filter((f) => f.startsWith("T-") && f.endsWith(".json"))
      const tasks: Task[] = []
      for (const f of files) {
        const parsed = readJsonSafe(`${taskDir}/${f}`, TaskObjectSchema)
        if (parsed) tasks.push(parsed)
      }
      total = tasks.length
      if (total === 0) {
        const hadBgTasks = backgroundManager ? backgroundManager.getTasksByParentSession(sessionID).length > 0 : false
        if (hadBgTasks) {
          log(`[${HOOK_NAME}] No tasks — bootstrap (hadBgTasks)`, { sessionID })
          isBootstrap = true
          incompleteCount = 1
        } else {
          log(`[${HOOK_NAME}] No tasks`, { sessionID })
          return
        }
      } else {
        const incompleteTasks = getIncompleteTasks(tasks)
        incompleteCount = incompleteTasks.length
        const staleAfterMs = getStaleAfterMs(config)
        const staleIncompleteCount = incompleteTasks.filter((t) =>
          isTaskStale(join(taskDir, `${t.id}.json`), staleAfterMs),
        ).length
        const activeIncompleteCount = incompleteCount - staleIncompleteCount
        if (activeIncompleteCount === 0 && staleIncompleteCount > 0) {
          log(`[${HOOK_NAME}] Skipped: only stale tasks remain`, {
            sessionID,
            staleIncompleteCount,
            staleAfterMs,
          })
          return
        }
      }
    }
  } catch (error) {
    log(`[${HOOK_NAME}] Task fetch failed`, { sessionID, error: String(error) })
    return
  }

  if (!isBootstrap && incompleteCount === 0) {
    log(`[${HOOK_NAME}] All tasks complete`, { sessionID, total })
    return
  }

  if (isBootstrap) {
    const s = sessionStateStore.getState(sessionID) as unknown as Record<string, unknown>
    s._bootstrap = true
  }

  if (state.inFlight) {
    log(`[${HOOK_NAME}] Skipped: injection in flight`, { sessionID })
    return
  }

  if (
    (state.consecutiveFailures ?? 0) >= MAX_CONSECUTIVE_FAILURES
    && state.lastInjectedAt
    && Date.now() - state.lastInjectedAt >= FAILURE_RESET_WINDOW_MS
  ) {
    state.consecutiveFailures = 0
    log(`[${HOOK_NAME}] Reset consecutive failures after recovery window`, {
      sessionID,
      failureResetWindowMs: FAILURE_RESET_WINDOW_MS,
    })
  }

  if ((state.consecutiveFailures ?? 0) >= MAX_CONSECUTIVE_FAILURES) {
    log(`[${HOOK_NAME}] Skipped: max consecutive failures reached`, {
      sessionID,
      consecutiveFailures: state.consecutiveFailures ?? 0,
      maxConsecutiveFailures: MAX_CONSECUTIVE_FAILURES,
    })
    return
  }

  const effectiveCooldown =
    CONTINUATION_COOLDOWN_MS * 2 ** Math.min(state.consecutiveFailures ?? 0, 5)
  if (state.lastInjectedAt && Date.now() - state.lastInjectedAt < effectiveCooldown) {
    log(`[${HOOK_NAME}] Skipped: cooldown active`, {
      sessionID,
      effectiveCooldown,
      consecutiveFailures: state.consecutiveFailures ?? 0,
    })
    return
  }

  let resolvedInfo: ResolvedMessageInfo | undefined
  let hasCompactionMessage = false
  try {
    const messagesResp = await ctx.client.session.messages({
      path: { id: sessionID },
    })
    const messages = normalizeSDKResponse(messagesResp, [] as Array<{ info?: MessageInfo }>)
    for (let i = messages.length - 1; i >= 0; i--) {
      const info = messages[i].info
      if (info?.agent === "compaction") {
        hasCompactionMessage = true
        continue
      }
      if (info?.agent || info?.model || (info?.modelID && info?.providerID)) {
        resolvedInfo = {
          agent: info.agent,
          model: info.model ?? (info.providerID && info.modelID ? { providerID: info.providerID, modelID: info.modelID } : undefined),
          tools: info.tools as Record<string, ToolPermission> | undefined,
        }
        break
      }
    }
  } catch (error) {
    log(`[${HOOK_NAME}] Failed to fetch messages for agent check`, { sessionID, error: String(error) })
  }

  log(`[${HOOK_NAME}] Agent check`, { sessionID, agentName: resolvedInfo?.agent, skipAgents, hasCompactionMessage })

  const resolvedAgentName = resolvedInfo?.agent
  if (resolvedAgentName && skipAgents.some(s => getAgentConfigKey(s) === getAgentConfigKey(resolvedAgentName))) {
    log(`[${HOOK_NAME}] Skipped: agent in skipAgents list`, { sessionID, agent: resolvedAgentName })
    return
  }
  if (hasCompactionMessage && !resolvedInfo?.agent) {
    log(`[${HOOK_NAME}] Skipped: compaction occurred but no agent info resolved`, { sessionID })
    return
  }

  if (isContinuationStopped?.(sessionID)) {
    log(`[${HOOK_NAME}] Skipped: continuation stopped for session`, { sessionID })
    return
  }

  if (isAwaitingUser(state)) {
    log(`[${HOOK_NAME}] Skipped: awaiting user (race)`, { sessionID })
    return
  }
  startCountdown({
    ctx,
    sessionID,
    incompleteCount,
    total,
    resolvedInfo,
    backgroundManager,
    skipAgents,
    sessionStateStore,
    config,
  })
}
