export function redactMatch(raw: string): string {
  if (raw.includes("-----BEGIN")) {
    const firstLine = raw.split("\n")[0] ?? raw.slice(0, 30)
    return `${firstLine} …[REDACTED]`
  }
  if (raw.length <= 8) return "…[REDACTED]"
  const prefix = raw.slice(0, 4)
  const suffix = raw.slice(-4)
  return `${prefix}…${suffix}`
}

export function hashFinding(ruleId: string, redacted: string): string {
  const data = `${ruleId}:${redacted}`
  let hash = 0
  for (let i = 0; i < data.length; i++) {
    hash = (hash * 31 + data.charCodeAt(i)) >>> 0
  }
  return `${ruleId}:${hash.toString(16).padStart(8, "0")}`
}
