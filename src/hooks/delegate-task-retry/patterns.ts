export interface DelegateTaskErrorPattern {
  pattern: string
  errorType: string
  fixHint: string
}

export const DELEGATE_TASK_ERROR_PATTERNS: DelegateTaskErrorPattern[] = [
  {
    pattern: "run_in_background",
    errorType: "missing_run_in_background",
    fixHint:
      "Add run_in_background=false (for delegation) or run_in_background=true (for parallel exploration)",
  },
  {
    pattern: "load_skills",
    errorType: "missing_load_skills",
    fixHint:
      "Add load_skills=[] parameter (empty array if no skills needed). Note: Calling Skill tool does NOT populate this.",
  },
  {
    pattern: "category OR subagent_type",
    errorType: "mutual_exclusion",
    fixHint:
      "Provide ONLY one of: category (e.g., 'general', 'quick') OR subagent_type (e.g., 'oracle', 'explore')",
  },
  {
    pattern: "Must provide either category or subagent_type",
    errorType: "missing_category_or_agent",
    fixHint: "Add either category='general' OR subagent_type='explore'",
  },
  {
    pattern: "Unknown category",
    errorType: "unknown_category",
    fixHint: "Use a valid category from the Available list in the error message",
  },
  {
    pattern: "Agent name cannot be empty",
    errorType: "empty_agent",
    fixHint: "Provide a non-empty subagent_type value",
  },
  {
    pattern: "Unknown agent",
    errorType: "unknown_agent",
    fixHint: "Use a valid agent from the Available agents list in the error message",
  },
  {
    pattern: "Cannot call primary agent",
    errorType: "primary_agent",
    fixHint:
      "Primary agents cannot be called via task. Use a subagent like 'explore', 'oracle', or 'librarian'",
  },
  {
    pattern: "Operation timed out",
    errorType: "timeout",
    fixHint: "Increase timeout or retry with same args — transient provider timeout. Use withTimeout(30000) + Promise.allSettled around explorer batch.",
  },
  {
    pattern: "MessageAbortedError",
    errorType: "aborted",
    fixHint: "Provider aborted — retry once. Ensure explorer prompts are not too large and provider fallback chain is configured.",
  },
  {
    pattern: "AbortError",
    errorType: "abort_error",
    fixHint: "AbortError — retry. Check preemptive-compaction not triggering at same time.",
  },
  {
    pattern: "failed to start within timeout",
    errorType: "background_start_timeout",
    fixHint: "Background task failed to start — retry task() call. Check BackgroundManager concurrency and stale timeout.",
  },
  {
    pattern: "timed out",
    errorType: "generic_timeout",
    fixHint: "Generic timeout — retry with backoff. Wrap explorer batch in Promise.allSettled with per-task withTimeout.",
  },
  {
    pattern: "Skills not found",
    errorType: "unknown_skills",
    fixHint: "Use valid skill names from the Available list in the error message",
  },
]

export interface DetectedError {
  errorType: string
  originalOutput: string
}

export function detectDelegateTaskError(output: string): DetectedError | null {
  const isTimeoutOrAbort = output.includes("timed out") || output.includes("MessageAbortedError") || output.includes("AbortError") || output.includes("failed to start within timeout")
  if (!output.includes("[ERROR]") && !output.includes("Invalid arguments") && !isTimeoutOrAbort) return null

  for (const errorPattern of DELEGATE_TASK_ERROR_PATTERNS) {
    if (output.includes(errorPattern.pattern)) {
      return {
        errorType: errorPattern.errorType,
        originalOutput: output,
      }
    }
  }

  return null
}
