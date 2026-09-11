
// Awaiting-user guard shared by task-continuation-enforcer and
// todo-continuation-enforcer. No schema change: operates on in-memory
// SessionState only. Suppression is bounded by SESSION_STATE_TTL_MS
// (10min prune in session-state.ts); an explicit timestamp expires stale
// markers even sooner so abandoned questions still resume enforcement.
export const AWAITING_USER_SUPPRESS_MS = 10 * 60 * 1000

export interface AwaitingUserState {
  awaitingUser?: boolean
  awaitingUserSince?: number
}

export function isAwaitingUserState(state: unknown): boolean {
  const record = state as AwaitingUserState | undefined
  if (record?.awaitingUser !== true) return false
  if (typeof record.awaitingUserSince === "number") {
    if (Date.now() - record.awaitingUserSince > AWAITING_USER_SUPPRESS_MS) return false
  }
  return true
}

export function markAwaitingUser(state: unknown, now = Date.now()): void {
  const record = state as AwaitingUserState
  record.awaitingUser = true
  record.awaitingUserSince = now
}

export function clearAwaitingUser(state: unknown): void {
  const record = state as AwaitingUserState | undefined
  if (!record) return
  record.awaitingUser = false
  record.awaitingUserSince = undefined
}

interface QuestionMessagePart {
  type?: string
  tool?: string
  name?: string
  question?: unknown
}

interface QuestionMessage {
  info?: { role?: string }
  parts?: Array<QuestionMessagePart>
}

// True when the trailing message is an unanswered assistant question
// (question tool call or question part with no subsequent user message).
// Plain assistant text is NOT treated as awaiting: asking must go through
// the question tool (or an explicit state marker) to suppress continuation.
export function hasPendingQuestionMessage(messages: Array<unknown>): boolean {
  if (!messages || messages.length === 0) return false
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as QuestionMessage | undefined
    const role = message?.info?.role
    if (role === "user") return false
    if (role !== "assistant") continue
    const parts = message?.parts
    if (!parts) return false
    return parts.some((part) => {
      const type = part?.type ?? ""
      if (typeof type === "string" && type.toLowerCase().includes("question")) return true
      const tool = part?.tool ?? part?.name
      if (typeof tool === "string" && tool.toLowerCase().includes("question")) return true
      return part?.question !== undefined
    })
  }
  return false
}

export function isAwaitingUser(state: unknown, messages?: Array<unknown>): boolean {
  if (isAwaitingUserState(state)) return true
  if (messages && hasPendingQuestionMessage(messages)) return true
  return false
}

// Best-effort extraction of a tool name from tool.execute.before/after
// properties. Returns undefined when the shape is unknown: callers must
// not change behavior in that case.
export function getToolName(properties: Record<string, unknown> | undefined): string | undefined {
  if (!properties) return undefined
  const direct = properties.toolName ?? properties.name
  if (typeof direct === "string") return direct
  const tool = properties.tool as Record<string, unknown> | string | undefined
  if (typeof tool === "string") return tool
  if (tool && typeof tool === "object") {
    const nested = tool.name ?? tool.id
    if (typeof nested === "string") return nested
  }
  return undefined
}

export function isQuestionTool(properties: Record<string, unknown> | undefined): boolean {
  const name = getToolName(properties)
  return typeof name === "string" && name.toLowerCase().includes("question")
}
