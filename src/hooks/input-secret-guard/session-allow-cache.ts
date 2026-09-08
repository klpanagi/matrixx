const sessionAllow = new Map<string, Set<string>>()
const oneShotAllow = new Map<string, Set<string>>()

function keyFor(sessionID: string, hash: string): string {
  return `${sessionID}:${hash}`
}

export function isSessionAllowed(sessionID: string, hash: string): boolean {
  return sessionAllow.get(sessionID)?.has(hash) ?? false
}

export function allowOnce(sessionID: string, hash: string): void {
  const k = keyFor(sessionID, hash)
  let s = oneShotAllow.get(k)
  if (!s) {
    s = new Set<string>()
    oneShotAllow.set(k, s)
  }
  s.add(hash)
}

export function allowSession(sessionID: string, hash: string): void {
  let s = sessionAllow.get(sessionID)
  if (!s) {
    s = new Set<string>()
    sessionAllow.set(sessionID, s)
  }
  s.add(hash)
}

export function consumeOneShot(sessionID: string, hash: string): boolean {
  const k = keyFor(sessionID, hash)
  const s = oneShotAllow.get(k)
  if (!s || !s.has(hash)) return false
  s.delete(hash)
  if (s.size === 0) oneShotAllow.delete(k)
  return true
}

export function clearSession(sessionID: string): void {
  sessionAllow.delete(sessionID)
  for (const k of [...oneShotAllow.keys()]) {
    if (k.startsWith(`${sessionID}:`)) oneShotAllow.delete(k)
  }
}

export function clearAll(): void {
  sessionAllow.clear()
  oneShotAllow.clear()
}
