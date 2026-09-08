import { createSystemDirective, SystemDirectiveTypes } from "../../shared/system-directive"

export const HOOK_NAME = "task-continuation-enforcer"

export const DEFAULT_SKIP_AGENTS = ["oracle", "compaction"]

export const CONTINUATION_PROMPT = `${createSystemDirective(SystemDirectiveTypes.TASK_CONTINUATION)}

Incomplete Matrixx tasks remain. Continue working on the next pending task.

- Proceed without asking for permission
- Mark each task in_progress before starting, completed immediately after
- Respect blockedBy dependencies (skip blocked tasks)
- Do not stop until all tasks are done`

export const BOOTSTRAP_PROMPT = `${createSystemDirective(SystemDirectiveTypes.TASK_CONTINUATION)}

No Matrixx tasks exist yet. You fired explorers but haven't created a plan.

- Invoke the plan agent NOW: task(subagent_type="oracle", load_skills=[], prompt="<gathered context + user request>")
- If explorers are still running, collect with background_output then proceed
- Never stall waiting for explorers — use Promise.allSettled and proceed with partial context
- After plan agent returns, execute its waves exactly`

export const COUNTDOWN_SECONDS = 2
export const TOAST_DURATION_MS = 900
export const COUNTDOWN_GRACE_PERIOD_MS = 500

export const ABORT_WINDOW_MS = 3000
export const CONTINUATION_COOLDOWN_MS = 30_000
export const MAX_CONSECUTIVE_FAILURES = 5
export const FAILURE_RESET_WINDOW_MS = 5 * 60 * 1000
