import type { MatrixxConfig } from "../../config"
import {
  contextCollector,
  createContextInjectorMessagesTransformHook,
} from "../../features/context-injector"

import {
  createDesignIntentPreserverHook,
  createEnvContextInjectorHook,
  createKeywordDetectorHook,
  createThinkingBlockValidatorHook,
  createToolPairValidatorHook,
} from "../../hooks"
import { createInputSecretGuardHook } from "../../hooks/input-secret-guard"
import { safeCreateHook } from "../../shared/safe-create-hook"
import type { PluginContext } from "../types"

export type TransformHooks = {
  inputSecretGuard: ReturnType<typeof createInputSecretGuardHook> | null
  keywordDetector: ReturnType<typeof createKeywordDetectorHook> | null
  contextInjectorMessagesTransform: ReturnType<typeof createContextInjectorMessagesTransformHook>
  envContextInjector: ReturnType<typeof createEnvContextInjectorHook> | null
  thinkingBlockValidator: ReturnType<typeof createThinkingBlockValidatorHook> | null
  toolPairValidator: ReturnType<typeof createToolPairValidatorHook> | null
  designIntentPreserver: ReturnType<typeof createDesignIntentPreserverHook> | null
}

export function createTransformHooks(args: {
  ctx: PluginContext
  pluginConfig: MatrixxConfig
  isHookEnabled: (hookName: string) => boolean
  safeHookEnabled?: boolean
}): TransformHooks {
  const { ctx, pluginConfig, isHookEnabled } = args
  const safeHookEnabled = args.safeHookEnabled ?? true

  const inputSecretGuard = isHookEnabled("input-secret-guard")
    ? safeCreateHook(
        "input-secret-guard",
        () => createInputSecretGuardHook(ctx, pluginConfig.security?.input_secret_guard),
        { enabled: safeHookEnabled },
      )
    : null

  const keywordDetector = isHookEnabled("keyword-detector")
    ? safeCreateHook(
        "keyword-detector",
        () => createKeywordDetectorHook(ctx, contextCollector),
        { enabled: safeHookEnabled },
      )
    : null

  const contextInjectorMessagesTransform =
    createContextInjectorMessagesTransformHook(contextCollector)

  const envContextInjector = isHookEnabled("env-context-injector")
    ? safeCreateHook(
        "env-context-injector",
        () => createEnvContextInjectorHook(),
        { enabled: safeHookEnabled },
      )
    : null

  const thinkingBlockValidator = isHookEnabled("thinking-block-validator")
    ? safeCreateHook(
        "thinking-block-validator",
        () => createThinkingBlockValidatorHook(),
        { enabled: safeHookEnabled },
      )
    : null

  const toolPairValidator = isHookEnabled("tool-pair-validator")
    ? safeCreateHook(
        "tool-pair-validator",
        () => createToolPairValidatorHook(),
        { enabled: safeHookEnabled },
      )
    : null

  const designIntentPreserver = isHookEnabled("design-intent-preserver")
    ? safeCreateHook(
        "design-intent-preserver",
        () => createDesignIntentPreserverHook(ctx),
        { enabled: safeHookEnabled },
      )
    : null

  return {
    inputSecretGuard,
    keywordDetector,
    contextInjectorMessagesTransform,
    envContextInjector,
    thinkingBlockValidator,
    toolPairValidator,
    designIntentPreserver,
  }
}
