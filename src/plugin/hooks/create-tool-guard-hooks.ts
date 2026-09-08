import type { HookName, MatrixxConfig } from "../../config"
import {
  createBashFileReadGuardHook,
  createCommentCheckerHooks,
  createContextModeEnforcerHook,
  createDirectoryAgentsInjectorHook,
  createEmptyTaskResponseDetectorHook,
  createEnvFileWriteGuardHook,
  createEvolutionWatcherHook,
  createHashlineEditDiffEnhancerHook,
  createHashlineReadEnhancerHook,
  createJsonErrorRecoveryHook,
  createQualityGateHook,
  createReadImageResizerHook,
  createRulesInjectorHook,
  createSecretLeakGuardHook,
  createTaskEditGuardHook,
  createTaskNotepadHook,
  createTasksTodowriteDisablerHook,
  createToolOutputTruncatorHook,
  createWebFetchRedirectGuardHook,
  createWriteExistingFileGuardHook,
} from "../../hooks"
import {
  getOpenCodeVersion,
  isOpenCodeVersionAtLeast,
  log,
  OPENCODE_NATIVE_AGENTS_INJECTION_VERSION,
} from "../../shared"
import { safeCreateHook } from "../../shared/safe-create-hook"
import type { PluginContext } from "../types"

export type ToolGuardHooks = {
  commentChecker: ReturnType<typeof createCommentCheckerHooks> | null
  toolOutputTruncator: ReturnType<typeof createToolOutputTruncatorHook> | null
  directoryAgentsInjector: ReturnType<typeof createDirectoryAgentsInjectorHook> | null
  emptyTaskResponseDetector: ReturnType<typeof createEmptyTaskResponseDetectorHook> | null
  rulesInjector: ReturnType<typeof createRulesInjectorHook> | null
  tasksTodowriteDisabler: ReturnType<typeof createTasksTodowriteDisablerHook> | null
  writeExistingFileGuard: ReturnType<typeof createWriteExistingFileGuardHook> | null
  hashlineReadEnhancer: ReturnType<typeof createHashlineReadEnhancerHook> | null
  secretLeakGuard: ReturnType<typeof createSecretLeakGuardHook> | null
  envFileWriteGuard: ReturnType<typeof createEnvFileWriteGuardHook> | null
  jsonErrorRecovery: ReturnType<typeof createJsonErrorRecoveryHook> | null
  bashFileReadGuard: ReturnType<typeof createBashFileReadGuardHook> | null
  contextModeEnforcer: ReturnType<typeof createContextModeEnforcerHook> | null
  readImageResizer: ReturnType<typeof createReadImageResizerHook> | null
  webfetchRedirectGuard: ReturnType<typeof createWebFetchRedirectGuardHook> | null
  hashlineEditDiffEnhancer: ReturnType<typeof createHashlineEditDiffEnhancerHook> | null
  qualityGate: ReturnType<typeof createQualityGateHook> | null
  taskNotepad: ReturnType<typeof createTaskNotepadHook> | null
  taskEditGuard: ReturnType<typeof createTaskEditGuardHook> | null
  evolutionWatcher: ReturnType<typeof createEvolutionWatcherHook> | null
}

export function createToolGuardHooks(args: {
  ctx: PluginContext
  pluginConfig: MatrixxConfig
  isHookEnabled: (hookName: HookName) => boolean
  safeHookEnabled: boolean
}): ToolGuardHooks {
  const { ctx, pluginConfig, isHookEnabled, safeHookEnabled } = args
  const evolutionEnabled = pluginConfig.evolution?.enabled === true
  const safeHook = <T>(hookName: HookName, factory: () => T): T | null =>
    safeCreateHook(hookName, factory, { enabled: safeHookEnabled })

  const commentChecker = isHookEnabled("comment-checker")
    ? safeHook("comment-checker", () => createCommentCheckerHooks(pluginConfig.comment_checker))
    : null

  const toolOutputTruncator = isHookEnabled("tool-output-truncator")
    ? safeHook("tool-output-truncator", () =>
        createToolOutputTruncatorHook(ctx, { experimental: pluginConfig.experimental }))
    : null

  let directoryAgentsInjector: ReturnType<typeof createDirectoryAgentsInjectorHook> | null = null
  if (isHookEnabled("directory-agents-injector")) {
    const currentVersion = getOpenCodeVersion()
    const hasNativeSupport =
      currentVersion !== null && isOpenCodeVersionAtLeast(OPENCODE_NATIVE_AGENTS_INJECTION_VERSION)
    if (hasNativeSupport) {
      log("directory-agents-injector auto-disabled due to native OpenCode support", {
        currentVersion,
        nativeVersion: OPENCODE_NATIVE_AGENTS_INJECTION_VERSION,
      })
    } else {
      directoryAgentsInjector = safeHook("directory-agents-injector", () => createDirectoryAgentsInjectorHook(ctx))
    }
  }


  const emptyTaskResponseDetector = isHookEnabled("empty-task-response-detector")
    ? safeHook("empty-task-response-detector", () => createEmptyTaskResponseDetectorHook(ctx))
    : null

  const rulesInjector = isHookEnabled("rules-injector")
    ? safeHook("rules-injector", () => createRulesInjectorHook(ctx))
    : null

  const tasksTodowriteDisabler = isHookEnabled("tasks-todowrite-disabler")
    ? safeHook("tasks-todowrite-disabler", () =>
        createTasksTodowriteDisablerHook({ experimental: pluginConfig.experimental }))
    : null

  const writeExistingFileGuard = isHookEnabled("write-existing-file-guard")
    ? safeHook("write-existing-file-guard", () => createWriteExistingFileGuardHook(ctx))
    : null

  const hashlineReadEnhancer = isHookEnabled("hashline-read-enhancer")
    ? safeHook("hashline-read-enhancer", () => createHashlineReadEnhancerHook(ctx, { hashline_edit: { enabled: pluginConfig.experimental?.hashline_edit ?? false } }))
    : null

  const secretLeakGuard = isHookEnabled("secret-leak-guard")
    ? safeHook("secret-leak-guard", () => createSecretLeakGuardHook(ctx, pluginConfig.security?.secret_scanning))
    : null

  const envFileWriteGuard = isHookEnabled("env-file-write-guard")
    ? safeHook("env-file-write-guard", () => createEnvFileWriteGuardHook(pluginConfig.security?.env_file_guard))
    : null

  const jsonErrorRecovery = isHookEnabled("json-error-recovery")
    ? safeHook("json-error-recovery", () => createJsonErrorRecoveryHook(ctx))
    : null

  const bashFileReadGuard = isHookEnabled("bash-file-read-guard")
    ? safeHook("bash-file-read-guard", () => createBashFileReadGuardHook())
    : null

  const contextModeEnforcer = isHookEnabled("context-mode-enforcer")
    ? safeHook("context-mode-enforcer", () => createContextModeEnforcerHook(pluginConfig))
    : null

  const readImageResizer = isHookEnabled("read-image-resizer")
    ? safeHook("read-image-resizer", () => createReadImageResizerHook(ctx))
    : null

  const webfetchRedirectGuard = isHookEnabled("webfetch-redirect-guard")
    ? safeHook("webfetch-redirect-guard", () => createWebFetchRedirectGuardHook(ctx))
    : null

  const hashlineEditDiffEnhancer = isHookEnabled("hashline-edit-diff-enhancer")
    ? safeHook("hashline-edit-diff-enhancer", () =>
        createHashlineEditDiffEnhancerHook({ hashline_edit: { enabled: pluginConfig.experimental?.hashline_edit ?? false } }))
    : null

  const qualityGate = isHookEnabled("quality-gate")
    ? safeHook("quality-gate", () => createQualityGateHook())
    : null

  const taskNotepad = isHookEnabled("task-notepad")
    ? safeHook("task-notepad", () => createTaskNotepadHook(ctx))
    : null

  const taskEditGuard = isHookEnabled("task-edit-guard")
    ? safeHook("task-edit-guard", () => createTaskEditGuardHook(ctx))
    : null

  const evolutionWatcher = evolutionEnabled && isHookEnabled("evolution-watcher")
    ? safeHook("evolution-watcher", () => createEvolutionWatcherHook(ctx, pluginConfig.evolution))
    : null

  return {
    commentChecker,
    toolOutputTruncator,
    directoryAgentsInjector,
    emptyTaskResponseDetector,
    rulesInjector,
    tasksTodowriteDisabler,
    writeExistingFileGuard,
    hashlineReadEnhancer,
    secretLeakGuard,
    envFileWriteGuard,
    jsonErrorRecovery,
    bashFileReadGuard,
    contextModeEnforcer,
    readImageResizer,
    webfetchRedirectGuard,
    hashlineEditDiffEnhancer,
    qualityGate,
    taskNotepad,
    taskEditGuard,
    evolutionWatcher,
  }
}
