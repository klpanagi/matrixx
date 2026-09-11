import type { HookName, MatrixxConfig } from "../../config"
import type { BackgroundManager } from "../../features/background-agent"
import {
  createArchitectHook,
  createBackgroundNotificationHook,
  createCompactionContextInjector,
  createCompactionTodoPreserverHook,
  createEvolutionCompressorHook,
  createEvolutionHitlHook,
  createPlanPersister,
  createStopContinuationGuardHook,
  createTaskContinuationEnforcer,
  createTodoContinuationEnforcer,
} from "../../hooks"
import { safeCreateHook } from "../../shared/safe-create-hook"
import { isTaskSystemEnabled } from "../../shared/task-system-gating"
import type { PluginContext } from "../types"
import { createUnstableAgentBabysitter } from "../unstable-agent-babysitter"

export type ContinuationHooks = {
  stopContinuationGuard: ReturnType<typeof createStopContinuationGuardHook> | null
  compactionContextInjector: ReturnType<typeof createCompactionContextInjector> | null
  compactionTodoPreserver: ReturnType<typeof createCompactionTodoPreserverHook> | null
  todoContinuationEnforcer: ReturnType<typeof createTodoContinuationEnforcer> | null
  taskContinuationEnforcer: ReturnType<typeof createTaskContinuationEnforcer> | null
  unstableAgentBabysitter: ReturnType<typeof createUnstableAgentBabysitter> | null
  backgroundNotificationHook: ReturnType<typeof createBackgroundNotificationHook> | null
  architectHook: ReturnType<typeof createArchitectHook> | null
  planPersister: ReturnType<typeof createPlanPersister> | null
  evolutionCompressor: ReturnType<typeof createEvolutionCompressorHook> | null
  evolutionHitl: ReturnType<typeof createEvolutionHitlHook> | null
}

type SessionRecovery = {
  setOnAbortCallback: (callback: (sessionID: string) => void) => void
  setOnRecoveryCompleteCallback: (callback: (sessionID: string) => void) => void
} | null

export function createContinuationHooks(args: {
  ctx: PluginContext
  pluginConfig: MatrixxConfig
  isHookEnabled: (hookName: HookName) => boolean
  safeHookEnabled: boolean
  backgroundManager: BackgroundManager
  sessionRecovery: SessionRecovery
}): ContinuationHooks {
  const {
    ctx,
    pluginConfig,
    isHookEnabled,
    safeHookEnabled,
    backgroundManager,
    sessionRecovery,
  } = args

  const safeHook = <T>(hookName: HookName, factory: () => T): T | null =>
    safeCreateHook(hookName, factory, { enabled: safeHookEnabled })

  const evolutionEnabled = pluginConfig.evolution?.enabled === true

  // Lazy bridge: the stop guard consults the active continuation enforcer's
  // awaiting-user state before cancelling background tasks. The enforcer is
  // created after the guard, so resolve it at call time.
  let activeContinuationEnforcer: { isAwaitingUser: (sessionID: string) => boolean } | null = null

  const stopContinuationGuard = isHookEnabled("stop-continuation-guard")
    ? safeHook("stop-continuation-guard", () =>
        createStopContinuationGuardHook(ctx, {
          backgroundManager,
          isAwaitingUser: (sessionID: string) =>
            activeContinuationEnforcer?.isAwaitingUser(sessionID) ?? false,
        }))
    : null

  const compactionContextInjector = isHookEnabled("compaction-context-injector")
    ? safeHook("compaction-context-injector", () => createCompactionContextInjector(backgroundManager))
    : null

  const compactionTodoPreserver = isHookEnabled("compaction-todo-preserver")
    ? safeHook("compaction-todo-preserver", () => createCompactionTodoPreserverHook(ctx))
    : null

  const isTaskSystem = isTaskSystemEnabled(pluginConfig)

  const todoContinuationEnforcer = !isTaskSystem && isHookEnabled("todo-continuation-enforcer")
    ? safeHook("todo-continuation-enforcer", () => {
        const enforcer = createTodoContinuationEnforcer(ctx, {
          backgroundManager,
          isContinuationStopped: stopContinuationGuard?.isStopped,
        })
        activeContinuationEnforcer = enforcer
        return enforcer
      })
    : null

  const taskContinuationEnforcer = isTaskSystem && isHookEnabled("task-continuation-enforcer")
    ? safeHook("task-continuation-enforcer", () => {
        const enforcer = createTaskContinuationEnforcer(ctx, {
          backgroundManager,
          isContinuationStopped: stopContinuationGuard?.isStopped,
          config: pluginConfig,
        })
        activeContinuationEnforcer = enforcer
        return enforcer
      })
    : null

  const unstableAgentBabysitter = isHookEnabled("unstable-agent-babysitter")
    ? safeHook("unstable-agent-babysitter", () =>
        createUnstableAgentBabysitter({ ctx, backgroundManager, pluginConfig }))
    : null

  if (sessionRecovery) {
    const onAbortCallbacks: Array<(sessionID: string) => void> = []
    const onRecoveryCompleteCallbacks: Array<(sessionID: string) => void> = []

    if (todoContinuationEnforcer) {
      onAbortCallbacks.push(todoContinuationEnforcer.markRecovering)
      onRecoveryCompleteCallbacks.push(todoContinuationEnforcer.markRecoveryComplete)
    }

    if (taskContinuationEnforcer) {
      onAbortCallbacks.push(taskContinuationEnforcer.markRecovering)
      onRecoveryCompleteCallbacks.push(taskContinuationEnforcer.markRecoveryComplete)
    }

    if (onAbortCallbacks.length > 0) {
      sessionRecovery.setOnAbortCallback((sessionID: string) => {
        for (const callback of onAbortCallbacks) callback(sessionID)
      })
    }

    if (onRecoveryCompleteCallbacks.length > 0) {
      sessionRecovery.setOnRecoveryCompleteCallback((sessionID: string) => {
        for (const callback of onRecoveryCompleteCallbacks) callback(sessionID)
      })
    }
  }

  const backgroundNotificationHook = isHookEnabled("background-notification")
    ? safeHook("background-notification", () => createBackgroundNotificationHook(backgroundManager))
    : null

  const architectHook = isHookEnabled("architect")
    ? safeHook("architect", () =>
        createArchitectHook(ctx, {
          directory: ctx.directory,
          backgroundManager,
          isContinuationStopped: (sessionID: string) =>
            stopContinuationGuard?.isStopped(sessionID) ?? false,
          agentOverrides: pluginConfig.agents,
        }))
    : null

  const planPersister = isHookEnabled("plan-persister")
    ? safeHook("plan-persister", () =>
        createPlanPersister(ctx, { directory: ctx.directory }))
    : null

  const evolutionCompressor = evolutionEnabled && isHookEnabled("evolution-compressor")
    ? safeHook("evolution-compressor", () => createEvolutionCompressorHook(ctx, pluginConfig.evolution))
    : null

  const evolutionHitl = evolutionEnabled && isHookEnabled("evolution-hitl")
    ? safeHook("evolution-hitl", () => createEvolutionHitlHook(ctx, pluginConfig.evolution))
    : null

  return {
    stopContinuationGuard,
    compactionContextInjector,
    compactionTodoPreserver,
    todoContinuationEnforcer,
    taskContinuationEnforcer,
    unstableAgentBabysitter,
    backgroundNotificationHook,
    architectHook,
    planPersister,
    evolutionCompressor,
    evolutionHitl,
  }
}
