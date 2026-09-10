export const subagentSessions = new Set<string>()

let _mainSessionID: string | undefined

export function setMainSession(id: string | undefined) {
  _mainSessionID = id
}

export function getMainSessionID(): string | undefined {
  return _mainSessionID
}

const sessionAgentMap = new Map<string, string>()

const failureCounterMap = new Map<string, { count: number; lastFailedAt: number; lastSuccessAt?: number }>()

/** @internal For testing only */
export function _resetForTesting(): void {
  _mainSessionID = undefined
  subagentSessions.clear()
  sessionAgentMap.clear()
  failureCounterMap.clear()
}

export function setSessionAgent(sessionID: string, agent: string): void {
  if (!sessionAgentMap.has(sessionID)) {
    sessionAgentMap.set(sessionID, agent)
  }
}

export function updateSessionAgent(sessionID: string, agent: string): void {
  sessionAgentMap.set(sessionID, agent)
}

export function getSessionAgent(sessionID: string): string | undefined {
  return sessionAgentMap.get(sessionID)
}

export function clearSessionAgent(sessionID: string): void {
  sessionAgentMap.delete(sessionID)
}

export function incFailureCounter(sessionID: string): number {
  const existing = failureCounterMap.get(sessionID)
  const now = Date.now()
  const next = (existing?.count ?? 0) + 1
  failureCounterMap.set(sessionID, { count: next, lastFailedAt: now, lastSuccessAt: existing?.lastSuccessAt })
  return next
}

export function resetFailureCounter(sessionID: string): void {
  failureCounterMap.set(sessionID, { count: 0, lastFailedAt: 0, lastSuccessAt: Date.now() })
}

export function getFailureCount(sessionID: string): number {
  return failureCounterMap.get(sessionID)?.count ?? 0
}

export function getFailureState(sessionID: string): { count: number; lastFailedAt: number } | undefined {
  const entry = failureCounterMap.get(sessionID)
  if (!entry) return undefined
  return { count: entry.count, lastFailedAt: entry.lastFailedAt }
}

export function clearFailureCounter(sessionID: string): void {
  failureCounterMap.delete(sessionID)
}

/** @internal For testing only */
export function _resetFailureCountersForTesting(): void {
  failureCounterMap.clear()
}

export function isThresholdReached(sessionID: string, threshold: number): boolean {
  return getFailureCount(sessionID) >= threshold
}
