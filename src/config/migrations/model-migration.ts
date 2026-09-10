import { log } from "../../shared/logger"
import type { MatrixxConfig } from "../schema/matrixx-config"

const MIGRATION_KEY = "model-migration"

/**
 * Normalize a single model string input.
 * - tier:<name> → unchanged, no warning
 * - contains "/" (prefixed provider/model) → emit deprecation warning, keep value
 * - bare model → unchanged, no warning
 *
 * Provider names are opaque strings — no hardcoded allow-list.
 */
export function normalizeModelInput(value: string): string {
  if (value.startsWith("tier:")) {
    return value
  }
  if (value.includes("/")) {
    log(`[migration] prefixed model '${value}' is deprecated, use 'tier:<name>' or bare '<model>'`)
  }
  return value
}

/**
 * In-memory migration for MatrixxConfig model fields.
 * Iterates global_model, tiers fallback models, modelRequirements fallbackChain models,
 * and complexityDowngrades values. Normalizes each via normalizeModelInput.
 * Only mutates in memory — never rewrites the user's config file on disk.
 * Idempotent via _migrations guard.
 */
export function migrateMatrixxConfig(raw: MatrixxConfig): MatrixxConfig {
  if (raw._migrations?.includes(MIGRATION_KEY)) {
    return raw
  }

  let migrated: MatrixxConfig = { ...raw }

  // global_model
  if (typeof migrated.global_model === "string") {
    migrated = { ...migrated, global_model: normalizeModelInput(migrated.global_model) }
  }

  // tiers: each tier's fallback[*].model
  if (migrated.tiers) {
    const nextTiers: Record<string, unknown> = {}
    for (const [tierName, spec] of Object.entries(migrated.tiers)) {
      if (!spec || typeof spec !== "object") {
        nextTiers[tierName] = spec
        continue
      }
      const typed = spec as { fallback?: Array<{ model: string; providers: string[]; variant?: string }> }
      if (!typed.fallback) {
        nextTiers[tierName] = spec
        continue
      }
      const nextFallback = typed.fallback.map((entry) => ({
        ...entry,
        model: normalizeModelInput(entry.model),
      }))
      nextTiers[tierName] = { ...spec, fallback: nextFallback }
    }
    migrated = { ...migrated, tiers: nextTiers as MatrixxConfig["tiers"] }
  }

  // modelRequirements: agents + categories fallbackChain[*].model
  if (migrated.modelRequirements) {
    const nextMR: Record<string, unknown> = { ...migrated.modelRequirements }
    for (const scope of ["agents", "categories"] as const) {
      const bucket = (migrated.modelRequirements as Record<string, unknown>)[scope] as
        | Record<string, { fallbackChain?: Array<{ model: string; providers: string[] }> }>
        | undefined
      if (!bucket) continue
      const nextBucket: Record<string, unknown> = {}
      for (const [name, req] of Object.entries(bucket)) {
        if (!req || typeof req !== "object" || !Array.isArray((req as { fallbackChain?: unknown }).fallbackChain)) {
          nextBucket[name] = req
          continue
        }
        const fc = (req as { fallbackChain: Array<{ model: string; providers: string[]; variant?: string }> })
          .fallbackChain
        const nextFc = fc.map((entry) => ({
          ...entry,
          model: normalizeModelInput(entry.model),
        }))
        nextBucket[name] = { ...req, fallbackChain: nextFc }
      }
      nextMR[scope] = nextBucket
    }
    migrated = { ...migrated, modelRequirements: nextMR as MatrixxConfig["modelRequirements"] }
  }

  // complexityDowngrades: record<category, record<level, string>>
  if (migrated.complexityDowngrades) {
    const nextCd: Record<string, Record<string, string>> = {}
    for (const [category, levels] of Object.entries(migrated.complexityDowngrades)) {
      if (!levels || typeof levels !== "object") {
        nextCd[category] = levels as Record<string, string>
        continue
      }
      const nextLevels: Record<string, string> = {}
      for (const [level, value] of Object.entries(levels as Record<string, string>)) {
        nextLevels[level] = normalizeModelInput(value)
      }
      nextCd[category] = nextLevels
    }
    migrated = { ...migrated, complexityDowngrades: nextCd as MatrixxConfig["complexityDowngrades"] }
  }

  // Record migration key to prevent re-apply
  const existing = migrated._migrations ?? []
  if (!existing.includes(MIGRATION_KEY)) {
    migrated = { ...migrated, _migrations: [...existing, MIGRATION_KEY] }
  }

  return migrated
}
