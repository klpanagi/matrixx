import type { BackgroundManager } from "../../features/background-agent"
import type { ToolPermission } from "../../features/hook-message-injector"

export interface TaskContinuationEnforcerOptions {
  backgroundManager?: BackgroundManager
  skipAgents?: string[]
  isContinuationStopped?: (sessionID: string) => boolean
}

export interface TaskContinuationEnforcer {
  handler: (input: { event: { type: string; properties?: unknown } }) => Promise<void>
  markRecovering: (sessionID: string) => void
  markRecoveryComplete: (sessionID: string) => void
  cancelAllCountdowns: () => void
}

export type TodoContinuationEnforcerOptions = TaskContinuationEnforcerOptions
export type TodoContinuationEnforcer = TaskContinuationEnforcer

export interface Todo {
  content: string
  status: string
  priority: string
  id?: string
}

export interface SessionState {
  countdownTimer?: ReturnType<typeof setTimeout>
  countdownInterval?: ReturnType<typeof setInterval>
  isRecovering?: boolean
  countdownStartedAt?: number
  abortDetectedAt?: number
  consecutiveFailures?: number
  lastInjectedAt?: number
  inFlight?: boolean
  awaitingUser?: boolean
  awaitingUserSince?: number
}

export interface MessageInfo {
  id?: string
  role?: string
  error?: { name?: string; data?: unknown } | undefined
  agent?: string
  model?: { providerID: string; modelID: string }
  providerID?: string
  modelID?: string
  tools?: Record<string, ToolPermission>
}

export interface ResolvedMessageInfo {
  agent?: string
  model?: { providerID: string; modelID: string }
  tools?: Record<string, ToolPermission>
}
