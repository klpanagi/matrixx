import { describe, expect, test } from "bun:test"
import type { HookName, MatrixxConfig } from "../../src/config"
import { EvolutionConfigSchema } from "../../src/config/schema/evolution"
import { HookNameSchema } from "../../src/config/schema/hooks"
import type { BackgroundManager } from "../../src/features/background-agent"
import { createContinuationHooks } from "../../src/plugin/hooks/create-continuation-hooks"
import { createToolGuardHooks } from "../../src/plugin/hooks/create-tool-guard-hooks"
import type { PluginContext } from "../../src/plugin/types"

function makeBaseArgs(pluginConfig: MatrixxConfig) {
  return {
    ctx: { directory: "/tmp/evolution-gating-test" } as unknown as PluginContext,
    pluginConfig,
    isHookEnabled: (_name: HookName) => true,
    safeHookEnabled: true,
  }
}

function makeContinuationArgs(pluginConfig: MatrixxConfig) {
  return {
    ...makeBaseArgs(pluginConfig),
    backgroundManager: {} as unknown as BackgroundManager,
    sessionRecovery: null,
  }
}

function configWithEvolution(enabled: boolean): MatrixxConfig {
  return { evolution: EvolutionConfigSchema.parse({ enabled }) } as MatrixxConfig
}

describe("P2.3 evolution gating", () => {
  test("phantom evolution-quality-gate is absent from schema, keepers present", () => {
    //#given a HookNameSchema at 60 entries
    //#when parsing evolution names
    const phantom = HookNameSchema.safeParse("evolution-quality-gate")
    //#then phantom fails, keepers and real quality-gate pass
    expect(phantom.success).toBe(false)
    expect(HookNameSchema.safeParse("evolution-watcher").success).toBe(true)
    expect(HookNameSchema.safeParse("evolution-compressor").success).toBe(true)
    expect(HookNameSchema.safeParse("evolution-hitl").success).toBe(true)
    expect(HookNameSchema.safeParse("quality-gate").success).toBe(true)
  })

  test("tool-guard watcher is null unless evolution.enabled is true", () => {
    //#given configs with evolution unset, disabled, and enabled
    const unset = makeBaseArgs({} as MatrixxConfig)
    const disabled = makeBaseArgs(configWithEvolution(false))
    const enabled = makeBaseArgs(configWithEvolution(true))
    //#when creating tool-guard hooks
    const unsetHooks = createToolGuardHooks(unset)
    const disabledHooks = createToolGuardHooks(disabled)
    const enabledHooks = createToolGuardHooks(enabled)
    //#then watcher gated, real quality-gate unaffected
    expect(unsetHooks.evolutionWatcher).toBeNull()
    expect(disabledHooks.evolutionWatcher).toBeNull()
    expect(enabledHooks.evolutionWatcher).not.toBeNull()
    expect(unsetHooks.qualityGate).not.toBeNull()
    expect(enabledHooks.qualityGate).not.toBeNull()
  })

  test("continuation compressor+hitl are null unless evolution.enabled is true", () => {
    //#given configs with evolution unset, disabled, and enabled
    const unset = makeContinuationArgs({} as MatrixxConfig)
    const disabled = makeContinuationArgs(configWithEvolution(false))
    const enabled = makeContinuationArgs(configWithEvolution(true))
    //#when creating continuation hooks
    const unsetHooks = createContinuationHooks(unset)
    const disabledHooks = createContinuationHooks(disabled)
    const enabledHooks = createContinuationHooks(enabled)
    //#then compressor and hitl gated
    expect(unsetHooks.evolutionCompressor).toBeNull()
    expect(disabledHooks.evolutionCompressor).toBeNull()
    expect(unsetHooks.evolutionHitl).toBeNull()
    expect(disabledHooks.evolutionHitl).toBeNull()
    expect(enabledHooks.evolutionCompressor).not.toBeNull()
    expect(enabledHooks.evolutionHitl).not.toBeNull()
  })
})
