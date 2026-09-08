import { existsSync, readdirSync } from "node:fs"
import type { PluginInput } from "@opencode-ai/plugin"

import type { BackgroundManager } from "../../features/background-agent"
import {
  findNearestMessageWithFields,
  findNearestMessageWithFieldsFromSDK,
  type ToolPermission,
} from "../../features/hook-message-injector"
import { getTaskDir, readJsonSafe } from "../../features/task-storage/storage"
import type { Task } from "../../features/task-storage/types"
import { getAgentConfigKey } from "../../shared/agent-display-names"
import { log } from "../../shared/logger"
import { isSqliteBackend } from "../../shared/opencode-storage-detection"
import { TaskObjectSchema } from "../../tools/task/types"
import {
  BOOTSTRAP_PROMPT,
  CONTINUATION_PROMPT,
  DEFAULT_SKIP_AGENTS,
  HOOK_NAME,
} from "./constants"
import { getMessageDir } from "./message-directory"
import type { SessionStateStore } from "./session-state"
import { getIncompleteTaskCount } from "./todo"
import type { ResolvedMessageInfo } from "./types"

function hasWritePermission(tools: Record<string, ToolPermission> | undefined): boolean {
  const editPermission = tools?.edit
  const writePermission = tools?.write
  return (
    !tools ||
    (editPermission !== false && editPermission !== "deny" && writePermission !== false && writePermission !== "deny")
  )
}

export async function injectContinuation(args: {
  ctx: PluginInput
  sessionID: string
  backgroundManager?: BackgroundManager
  skipAgents?: string[]
  resolvedInfo?: ResolvedMessageInfo
  sessionStateStore: SessionStateStore
}): Promise<void> {
  const {
    ctx,
    sessionID,
    backgroundManager,
    skipAgents = DEFAULT_SKIP_AGENTS,
    resolvedInfo,
    sessionStateStore,
  } = args

  const state = sessionStateStore.getExistingState(sessionID)
  if (state?.isRecovering) {
    log(`[${HOOK_NAME}] Skipped injection: in recovery`, { sessionID })
    return
  }

  const hasRunningBgTasks = backgroundManager
    ? backgroundManager.getTasksByParentSession(sessionID).some((task: { status: string }) => task.status === "running")
    : false

  if (hasRunningBgTasks) {
    log(`[${HOOK_NAME}] Skipped injection: background tasks running`, { sessionID })
    return
  }

  const tasks: Task[] = []
  let total = 0
  let isBootstrap = false
  try {
    const taskDir = getTaskDir({}, ctx.directory)
    if (!existsSync(taskDir)) {
      const hadBgTasks = backgroundManager ? backgroundManager.getTasksByParentSession(sessionID).length > 0 : false
      if (hadBgTasks) {
        log(`[${HOOK_NAME}] Bootstrap injection: no task dir (hadBgTasks)`, { sessionID, taskDir })
        isBootstrap = true
      } else {
        log(`[${HOOK_NAME}] Skipped injection: no task dir`, { sessionID, taskDir })
        return
      }
      total = 0
    } else {
      const files = readdirSync(taskDir).filter((f) => f.startsWith("T-") && f.endsWith(".json"))
      for (const f of files) {
        const parsed = readJsonSafe(`${taskDir}/${f}`, TaskObjectSchema)
        if (parsed) tasks.push(parsed)
      }
      total = tasks.length
      if (total === 0) {
        const hadBgTasks = backgroundManager ? backgroundManager.getTasksByParentSession(sessionID).length > 0 : false
        if (hadBgTasks) {
          log(`[${HOOK_NAME}] Bootstrap injection: no tasks (hadBgTasks)`, { sessionID })
          isBootstrap = true
        } else {
          log(`[${HOOK_NAME}] Skipped injection: no tasks`, { sessionID })
          return
        }
      }
    }
  } catch (error) {
    log(`[${HOOK_NAME}] Failed to fetch tasks`, { sessionID, error: String(error) })
    return
  }

  const stateForBootstrap = sessionStateStore.getExistingState(sessionID) as unknown as Record<string, unknown> | undefined
  if (stateForBootstrap?._bootstrap) {
    isBootstrap = true
    stateForBootstrap._bootstrap = undefined
  }

  const freshIncompleteCount = isBootstrap ? 1 : getIncompleteTaskCount(tasks)
  if (!isBootstrap && freshIncompleteCount === 0) {
    log(`[${HOOK_NAME}] Skipped injection: no incomplete tasks`, { sessionID, total })
    return
  }

  let agentName = resolvedInfo?.agent
  let model = resolvedInfo?.model
  let tools = resolvedInfo?.tools

  if (!agentName || !model) {
    let previousMessage = null
    if (isSqliteBackend()) {
      previousMessage = await findNearestMessageWithFieldsFromSDK(ctx.client, sessionID)
    } else {
      const messageDir = getMessageDir(sessionID)
      previousMessage = messageDir ? findNearestMessageWithFields(messageDir) : null
    }
    agentName = agentName ?? previousMessage?.agent
    model =
      model ??
      (previousMessage?.model?.providerID && previousMessage?.model?.modelID
        ? {
            providerID: previousMessage.model.providerID,
            modelID: previousMessage.model.modelID,
            ...(previousMessage.model.variant
              ? { variant: previousMessage.model.variant }
              : {}),
          }
        : undefined)
    tools = tools ?? previousMessage?.tools
  }

  if (agentName && skipAgents.some(s => getAgentConfigKey(s) === getAgentConfigKey(agentName))) {
    log(`[${HOOK_NAME}] Skipped: agent in skipAgents list`, { sessionID, agent: agentName })
    return
  }

  if (!hasWritePermission(tools)) {
    log(`[${HOOK_NAME}] Skipped: agent lacks write permission`, { sessionID, agent: agentName })
    return
  }

  let prompt: string
  if (isBootstrap) {
    prompt = BOOTSTRAP_PROMPT
  } else {
    const byId = new Map(tasks.map((t) => [t.id, t]))
    const incompleteTasks = tasks.filter((task) => {
      if (task.status !== "pending" && task.status !== "in_progress") return false
      if (task.blockedBy.length === 0) return true
      return task.blockedBy.every((bid) => byId.get(bid)?.status === "completed")
    })
    const taskList = incompleteTasks.map((task) => `- [${task.status}] ${task.subject} (${task.id})`).join("\n")
    prompt = `${CONTINUATION_PROMPT}

[Status: ${total - freshIncompleteCount}/${total} completed, ${freshIncompleteCount} remaining]

Remaining Matrixx tasks:
${taskList}`
  }

  const injectionState = sessionStateStore.getExistingState(sessionID)
  if (injectionState) {
    injectionState.inFlight = true
  }

  try {
    log(`[${HOOK_NAME}] Injecting continuation`, {
      sessionID,
      agent: agentName,
      model,
      incompleteCount: freshIncompleteCount,
    })

    await ctx.client.session.promptAsync({
      path: { id: sessionID },
      body: {
        agent: agentName,
        ...(model !== undefined ? { model } : {}),
        parts: [{ type: "text", text: prompt }],
      },
      query: { directory: ctx.directory },
    })

    log(`[${HOOK_NAME}] Injection successful`, { sessionID })
    if (injectionState) {
      injectionState.inFlight = false
      injectionState.lastInjectedAt = Date.now()
      injectionState.consecutiveFailures = 0
    }
  } catch (error) {
    log(`[${HOOK_NAME}] Injection failed`, { sessionID, error: String(error) })
    if (injectionState) {
      injectionState.inFlight = false
      injectionState.lastInjectedAt = Date.now()
      injectionState.consecutiveFailures = (injectionState.consecutiveFailures ?? 0) + 1
    }
  }
}
