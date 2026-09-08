import { BLOCKLIST_RULES, WARNLIST_HEURISTICS } from "./detection-rules"
import { hashFinding, redactMatch } from "./redactor"

export type Finding = {
  ruleId: string
  match: string
  redacted: string
  severity: "block" | "warn"
  start: number
  end: number
}

export type CompiledRule = {
  id: string
  severity: "block" | "warn"
  regex: RegExp
}

export function shannonEntropy(token: string): number {
  if (token.length === 0) return 0
  const freq = new Map<string, number>()
  for (const ch of token) freq.set(ch, (freq.get(ch) ?? 0) + 1)
  let entropy = 0
  for (const count of freq.values()) {
    const p = count / token.length
    entropy -= p * Math.log2(p)
  }
  return entropy
}

export function compileRules(): CompiledRule[] {
  const rules: CompiledRule[] = []
  for (const r of BLOCKLIST_RULES) {
    try {
      rules.push({ id: r.id, severity: r.severity, regex: new RegExp(r.pattern, "g") })
    } catch {
    }
  }
  for (const r of WARNLIST_HEURISTICS) {
    if (r.id === "generic-secret-assignment") {
      try {
        rules.push({ id: r.id, severity: r.severity, regex: new RegExp(r.pattern, "gi") })
      } catch {
      }
    }
  }
  return rules
}

const COMPILED_BLOCKLIST = (() => {
  const list: CompiledRule[] = []
  for (const r of BLOCKLIST_RULES) {
    try {
      list.push({ id: r.id, severity: "block", regex: new RegExp(r.pattern, "g") })
    } catch {
    }
  }
  return list
})()

const WARN_KEYWORD_REGEX = (() => {
  try {
    const heuristic = WARNLIST_HEURISTICS.find((r) => r.id === "generic-secret-assignment")
    return heuristic ? new RegExp(heuristic.pattern, "gi") : null
  } catch {
    return null
  }
})()

const ENTROPY_TOKEN_REGEX = /[A-Za-z0-9+/=]{20,64}|[a-f0-9]{32,64}/g

export function detectSecrets(
  text: string,
  opts: { maxScanBytes?: number; allowlist?: string[]; entropyThreshold?: number } = {},
): Finding[] {
  if (!text || text.length < 8) return []
  const maxBytes = opts.maxScanBytes ?? 64 * 1024
  const slice = text.length > maxBytes ? text.slice(0, maxBytes) : text
  const entropyThreshold = opts.entropyThreshold ?? 4.5

  const allowlistRegexes: RegExp[] = []
  for (const p of opts.allowlist ?? []) {
    try {
      allowlistRegexes.push(new RegExp(p))
    } catch {
    }
  }

  const isAllowlisted = (match: string): boolean => {
    for (const re of allowlistRegexes) {
      try {
        if (re.test(match)) return true
      } catch {
      }
    }
    return false
  }

  const findings: Finding[] = []
  const seen = new Set<string>()

  for (const rule of COMPILED_BLOCKLIST) {
    rule.regex.lastIndex = 0
    let m: RegExpExecArray | null
    // biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop
    while ((m = rule.regex.exec(slice)) !== null) {
      const raw = m[0]
      if (!raw || raw.length < 4) continue
      if (isAllowlisted(raw)) continue
      const key = `${rule.id}:${m.index}`
      if (seen.has(key)) continue
      seen.add(key)
      findings.push({
        ruleId: rule.id,
        match: raw,
        redacted: redactMatch(raw),
        severity: "block",
        start: m.index,
        end: m.index + raw.length,
      })
      if (m[0].length === 0) rule.regex.lastIndex++
    }
  }

  if (findings.length === 0 && WARN_KEYWORD_REGEX) {
    WARN_KEYWORD_REGEX.lastIndex = 0
    let m: RegExpExecArray | null
    // biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop
    while ((m = WARN_KEYWORD_REGEX.exec(slice)) !== null) {
      const raw = m[0]
      if (!raw || raw.length < 8) continue
      const candidate = m[2] ?? raw
      if (candidate.length < 8 || candidate.length > 64) continue
      if (isAllowlisted(raw)) continue
      const key = `warn:${m.index}`
      if (seen.has(key)) continue
      seen.add(key)
      findings.push({
        ruleId: "generic-secret-assignment",
        match: raw,
        redacted: redactMatch(raw),
        severity: "warn",
        start: m.index,
        end: m.index + raw.length,
      })
      if (m[0].length === 0) WARN_KEYWORD_REGEX.lastIndex++
    }
  }

  if (findings.length === 0) {
    ENTROPY_TOKEN_REGEX.lastIndex = 0
    let m: RegExpExecArray | null
    // biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop
    while ((m = ENTROPY_TOKEN_REGEX.exec(slice)) !== null) {
      const raw = m[0]
      if (raw.length < 20) continue
      if (isAllowlisted(raw)) continue
      const entropy = shannonEntropy(raw)
      if (entropy < entropyThreshold) continue
      const key = `entropy:${m.index}`
      if (seen.has(key)) continue
      seen.add(key)
      findings.push({
        ruleId: "high-entropy-token",
        match: raw,
        redacted: redactMatch(raw),
        severity: "warn",
        start: m.index,
        end: m.index + raw.length,
      })
      if (findings.length >= 10) break
      if (m[0].length === 0) ENTROPY_TOKEN_REGEX.lastIndex++
    }
  }

  return findings
}

export { hashFinding, redactMatch }
