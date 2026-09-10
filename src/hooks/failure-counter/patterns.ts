import { DELEGATE_TASK_ERROR_PATTERNS, detectDelegateTaskError } from "../delegate-task-retry/patterns"

export interface FailureSignature {
  pattern: string | RegExp
  kind: "task_error" | "timeout" | "abort_excluded"
}

export const FAILURE_COUNTER_PATTERNS: FailureSignature[] = [
  { pattern: /\[ERROR\]|Invalid arguments|Operation timed out|failed to start within timeout|timed out/i, kind: "task_error" },
]

const ABORT_EXCLUDED_PATTERN = /MessageAbortedError|AbortError/i

function isUserAbort(output: string): boolean {
  return ABORT_EXCLUDED_PATTERN.test(output)
}

export function isCountableFailure(output: string): boolean {
  if (!output || typeof output !== "string") return false
  if (isUserAbort(output)) return false

  // Check delegate-task-retry patterns first (reuse)
  const delegateError = detectDelegateTaskError(output)
  if (delegateError) {
    // Abort types already excluded above, so delegate error is countable
    if (delegateError.errorType === "aborted" || delegateError.errorType === "abort_error") return false
    return true
  }

  // Check our own patterns
  for (const sig of FAILURE_COUNTER_PATTERNS) {
    if (typeof sig.pattern === "string") {
      if (output.includes(sig.pattern)) return true
    } else if (sig.pattern.test(output)) {
      return true
    }
  }

  // Also check DELEGATE_TASK_ERROR_PATTERNS directly for broader coverage
  for (const p of DELEGATE_TASK_ERROR_PATTERNS) {
    if (p.errorType === "aborted" || p.errorType === "abort_error") continue
    if (output.includes(p.pattern)) return true
  }

  return false
}
