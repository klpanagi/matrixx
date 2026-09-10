import { log } from "../shared/logger"
import { resolveTier, type TierResolverContext } from "../shared/tier-resolver"
import type { MatrixxConfig } from "./schema/matrixx-config"

interface WithTier {
  model?: string
  tier?: string
}

/**
 * Walk a merged MatrixxConfig and resolve any `tier: "..."` fields to concrete
 * `model: "..."` strings. The result is a new config object with the `tier`
 * fields cleared (so downstream code never re-resolves them).
 *
 * Precedence (per agent/category):
 *   1. Explicit `model` — kept as-is.
 *   2. Explicit `tier` — resolved against the live provider list.
 *   3. `default_tier` (top-level) — applied to any agent/category without
 *      a `model` or `tier` override, then resolved.
 *
 * If a tier cannot be resolved, the entry is left with `tier` set and `model`
 * undefined. The downstream `resolveModelPipeline` will fall through to
 * category defaults and the system default as a last resort.
 */
export function resolveTiersInConfig(
  config: MatrixxConfig,
  ctx: TierResolverContext,
): MatrixxConfig {
  const defaultTier = (config as { default_tier?: string }).default_tier

  const agents = walkAgentOverrides(config.agents, defaultTier, ctx, config)
  const categories = walkCategoryOverrides(config.categories, defaultTier, ctx, config)

  const { default_tier: _drop, ...rest } = config as MatrixxConfig & { default_tier?: string }
  void _drop

  return { ...rest, agents, categories } as MatrixxConfig
}

/**
 * Resolve tier fields in a category registry (e.g. `DEFAULT_CATEGORIES`) and
 * return a new object with `tier` cleared and `model` set where the tier
 * resolved. Entries that already have a concrete `model` are passed through.
 * Used at config load time to pre-resolve the built-in defaults so that
 * downstream code (createBuiltinAgents, buildAgent) only ever sees model
 * strings.
 */
export function resolveTiersInCategoryRegistry(
  registry: Record<string, WithTier | undefined>,
  ctx: TierResolverContext,
  config?: MatrixxConfig,
): Record<string, WithTier> {
  const result: Record<string, WithTier> = {}
  for (const [name, entry] of Object.entries(registry)) {
    if (!entry) continue
    result[name] = resolveEntry(entry, undefined, ctx, config)
  }
  return result
}

function walkAgentOverrides(
  agents: MatrixxConfig["agents"],
  defaultTier: string | undefined,
  ctx: TierResolverContext,
  config?: MatrixxConfig,
): MatrixxConfig["agents"] {
  if (!agents) return agents
  const result: Record<string, ReturnType<typeof resolveEntry>> = {}
  for (const [name, entry] of Object.entries(agents)) {
    if (!entry) {
      result[name] = entry
      continue
    }
    result[name] = resolveEntry(entry as WithTier, defaultTier, ctx, config)
  }
  return result as MatrixxConfig["agents"]
}

function walkCategoryOverrides(
  categories: MatrixxConfig["categories"],
  defaultTier: string | undefined,
  ctx: TierResolverContext,
  config?: MatrixxConfig,
  ): MatrixxConfig["categories"] {
  if (!categories) return categories
  const result: Record<string, ReturnType<typeof resolveEntry>> = {}
  for (const [name, entry] of Object.entries(categories)) {
    if (!entry) {
      result[name] = entry
      continue
    }
    result[name] = resolveEntry(entry as WithTier, defaultTier, ctx, config)
  }
  return result as MatrixxConfig["categories"]
}

function resolveEntry(
  entry: WithTier,
  defaultTier: string | undefined,
  ctx: TierResolverContext,
  config?: MatrixxConfig,
  ): WithTier {
  if (entry.model) {
    const { tier: _t, ...rest } = entry
    void _t
    return rest
  }

  const tier = entry.tier ?? defaultTier
  if (!tier) return entry

  const resolved = resolveTier(tier as never, ctx, config)
  if (!resolved) {
    log("[resolveTiersInConfig] tier could not be resolved", { tier })
    return entry
  }
  const { tier: _t, ...rest } = entry
  void _t
  return { ...rest, model: resolved.model }
}
