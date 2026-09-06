export const HOOK_NAME = "context-mode-enforcer"

export const WARN_MESSAGE_READ =
  "Use ctx_search / ctx_batch_execute / ctx_execute for analysis — raw read/grep/glob bypasses FTS5 sandbox and pollutes context. Use Read only with hashline IDs for Edit."

export const BLOCK_MESSAGE_GREP_GLOB =
  "Blocked: raw grep/glob is forbidden when context-mode is enforced. Use ctx_search (indexed) → grep/glob fallback only when ctx_* unavailable, or ctx_batch_execute / ctx_execute for multi-file analysis."

export const WARN_MESSAGE_BASH_READ =
  "Use ctx_* / Read tool instead of `cat`/`head`/`tail`/`grep` via bash for analysis. Raw bash file reads bypass sandbox."

export const DEFAULT_BLOCKED_TOOLS = ["grep", "glob"] as const
export const WARN_ONLY_TOOLS = ["read"] as const
