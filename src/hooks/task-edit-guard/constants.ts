export const HOOK_NAME = "task-edit-guard"

export const BLOCKED_PATTERNS: RegExp[] = [
  /sed\s+.*\.matrixx\/plans/,
  /sed\s+.*\.matrixx\/tasks/,
  /python3?\s+.*\.matrixx\/plans/,
  /python3?\s+.*\.matrixx\/tasks/,
  /echo\s+.*\.matrixx\/plans/,
  /echo\s+.*\.matrixx\/tasks/,
  /cat\s*>.*\.matrixx\/plans/,
  /cat\s*>.*\.matrixx\/tasks/,
  /mv\s+.*\.matrixx\/plans/,
  /mv\s+.*\.matrixx\/tasks/,
  /rm\s+.*\.matrixx\/tasks\/T-.*\.json/,
  /printf\s+.*\.matrixx\/plans/,
  /printf\s+.*\.matrixx\/tasks/,
]

export const PLAN_WRITE_WARN =
  "[task-edit-guard] WARN: Use plan_* tools (plan_create/read/update/list/delete) for .matrixx/plans/*.md — generic Write/Edit will be blocked in v2.8. Prefer plan_* for atomic, hashline-validated plan edits."
