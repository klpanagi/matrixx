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
  /rm\s+.*\.matrixx\/plans/,
  /cp\s+.*\.matrixx\/plans/,
  /tee\s+.*\.matrixx\/plans/,
  /touch\s+.*\.matrixx\/plans/,
  /truncate\s+.*\.matrixx\/plans/,
  /printf\s+.*\.matrixx\/plans/,
  /printf\s+.*\.matrixx\/tasks/,
]

export const PLAN_WRITE_WARN =
  "[task-edit-guard] BLOCKED: Use plan_* tools (plan_create/read/update/list/delete) for .matrixx/plans/*.md — generic Write/Edit is blocked. Prefer plan_* for atomic, hashline-validated plan edits."

export const PLAN_READ_WARN =
  "[task-edit-guard] BLOCKED: Use plan_read for .matrixx/plans/*.md — generic Read is blocked. plan_read returns hashline-tagged output (plan_list for discovery); pair with plan_update for atomic, hashline-validated plan edits."
