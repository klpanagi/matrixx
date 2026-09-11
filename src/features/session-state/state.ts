export const subagentSessions = new Set<string>()

const subagentParentMap = new Map<string, string>() // subagentID → parentID

export function registerSubagentSession(sessionID: string, parentSessionID: string): void {
  subagentSessions.add(sessionID)
  subagentParentMap.set(sessionID, parentSessionID)
}

export function getParentSessionID(subagentSessionID: string): string | undefined {
  return subagentParentMap.get(subagentSessionID)
}

export function getSubagentSessionIDs(parentSessionID: string): string[] {
  const ids: string[] = []
  for (const [subID, parentID] of subagentParentMap) {
    if (parentID === parentSessionID) ids.push(subID)
  }
  return ids
}


let _mainSessionID: string | undefined

export function setMainSession(id: string | undefined) {
  _mainSessionID = id
}

export function getMainSessionID(): string | undefined {
  return _mainSessionID
}

/**
 * Whether a session.created payload should be tracked as the plugin's main
 * session. Top-level sessions (no parentID) qualify UNLESS they are internal
 * sessions of another plugin (e.g. opencode-mem structured-output capture
 * sessions are top-level with metadata["opencode-mem"].internal === true).
 * Foreign top-level sessions must not hijack main-session tracking.
 */
export function isMainSessionCandidate(
  sessionInfo: { id?: string; parentID?: string; metadata?: Record<string, unknown> } | undefined,
): boolean {
  if (!sessionInfo || sessionInfo.parentID) return false
  const metadata = sessionInfo.metadata
  if (!metadata) return true
  // Reject sessions flagged as plugin-internal. Plugin-created top-level
  // sessions (e.g. opencode-mem capture sessions carrying
  // `opencode-mem.internal: true`) must not hijack main-session tracking.
  return !Object.entries(metadata).some(([key, value]) => {
    if (key.toLowerCase().includes("internal") && value === true) return true
    if (typeof value === "object" && value !== null && (value as { internal?: boolean }).internal === true) return true
    return false
  })
}

const sessionAgentMap = new Map<string, string>()

const failureCounterMap = new Map<string, { count: number; lastFailedAt: number; lastSuccessAt?: number }>()

/** @internal For testing only */
export function _resetForTesting(): void {
  _mainSessionID = undefined
  subagentSessions.clear()
  subagentParentMap.clear()
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
