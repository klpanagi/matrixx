/**
 * Tier registry — abstract model classifications resolved against the live provider list.
 *
 * Tiers are matched by regex against "provider/model" strings, with a `providerPriority`
 * list to choose between providers when multiple match. Patterns are stored as
 * strings in `config.tiers[].modelPattern` and compiled at runtime via
 * `new RegExp` with try/catch (invalid -> never matches). No hardcoded
 * `provider` or model literals — all specs are config-driven via
 * `MatrixxConfig.tiers`. When config is empty, factories return empty/undefined
 * gracefully.
 */

export type TierName = string

export interface TierSpec {
  name: string
  /** Provider priority — first provider with a matching model wins. */
  providerPriority: string[]
  /** Regex tested against each "provider/model" string in the live provider list. */
  modelPattern: RegExp
  /** Tier to recurse into if this tier cannot be satisfied. */
  fallbackTier?: string
  /** Fallbacks used when the live provider list is empty but config provides them. */
  fallback?: { providers: string[]; model: string; variant?: string }[]
}

export type TiersConfig = Record<
  string,
  {
    providerPriority: string[]
    modelPattern: string
    fallbackTier?: string
    fallback?: { providers: string[]; model: string; variant?: string }[]
  }
>

export type TierConfigHolder = { tiers?: TiersConfig } | null | undefined

function compilePattern(pattern: string): RegExp {
  try {
    return new RegExp(pattern)
  } catch {
    return /(?!)/
  }
}

export function buildTierSpecs(config: TierConfigHolder): Record<string, TierSpec> {
  if (!config?.tiers) return {}
  const result: Record<string, TierSpec> = {}
  for (const [name, raw] of Object.entries(config.tiers)) {
    if (!raw || typeof raw !== "object") continue
    const providerPriority = Array.isArray((raw as { providerPriority?: unknown }).providerPriority)
      ? (raw.providerPriority as string[])
      : []
    const rawPattern = (raw as { modelPattern?: unknown }).modelPattern
    const patternString = typeof rawPattern === "string" ? rawPattern : ""
    result[name] = {
      name,
      providerPriority,
      modelPattern: compilePattern(patternString),
      fallbackTier: (raw as { fallbackTier?: string }).fallbackTier,
      fallback: (raw as { fallback?: { providers: string[]; model: string; variant?: string }[] }).fallback,
    }
  }
  return result
}

export function getTierSpec(tierName: string, config: TierConfigHolder): TierSpec | undefined {
  if (!tierName || !config?.tiers) return undefined
  const specs = buildTierSpecs(config)
  return specs[tierName]
}

export function getTierNames(config: TierConfigHolder): string[] {
  return Object.keys(buildTierSpecs(config))
}

const TIER_REFERENCE_RE = /^tier:(\w+)$/i

export function parseTierReference(
  value: string | undefined | null,
  config?: TierConfigHolder,
): string | null {
  if (!value) return null
  const m = TIER_REFERENCE_RE.exec(value.trim())
  if (!m) return null
  const name = m[1].toLowerCase()
  if (!config?.tiers) return null
  const specs = buildTierSpecs(config)
  return name in specs ? name : null
}
