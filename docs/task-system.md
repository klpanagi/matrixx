# Task System — Engineering Specification

> **Scope:** Persistent, file-backed task management for Matrixx agent orchestration.
> **Audience:** Engineers evolving the task system — storage, tools, hooks, scheduling, and agent integration.
> **Version:** 2026-09 (branch `dev` @ `bb3bd59`) — post `d8ca206` decouple, `4e694d0` project-scoped storage, `d16dc27` edit guard, `82f9f38` global-scope fixes.

---

## 1. Purpose & Design Principles

The Task System replaces OpenCode's ephemeral session-memory todos with **file-backed tasks** that survive restarts, support explicit dependencies, and drive automatic parallelization.

### Design Principles

| Principle | Implication |
|-----------|-------------|
| **File is the source of truth** | No in-memory registry, no DB. One `T-{uuid}.json` per task in `getTaskDir()`. Stateless CRUD = easy reasoning, easy recovery. |
| **Atomicity over speed** | Every write is `write tmp + renameSync`. Lock file with `wx` + stale eviction. Correctness under concurrent agents is non-negotiable. |
| **Additive dependencies** | `addBlocks`/`addBlockedBy` append via `Set` — never replace. Prevents race when two agents update deps concurrently. |
| **One task, one owner, one transition** | `TaskUpdate(in_progress)` immediately before work, `completed` immediately after. No batch completions. Enforced by prompt + continuation hook. |
| **Blocked = schedulable** | `task_list` filters `blockedBy` to unresolved only. Scheduler can skip blocked tasks without extra query. |
| **Graceful degradation** | `experimental.task_system=false` restores `TodoWrite`/`TodoRead` everywhere — tool registry, hooks, prompts all dual-mode via `isTaskSystemEnabled()`. |
| **Drop-in upgrade** | Enabling flips tool registry + hooks + agent prompts + storage without touching agent business logic. |

---

## 2. System Overview

```
matrixx.jsonc
  experimental.task_system (default true ── isTaskSystemEnabled)
  morpheus.tasks { storage_path?, task_list_id?, scope?, claude_code_compat? }
            │
            ├─── Tool Registry (src/plugin/tool-registry.ts)
            │     if enabled → register 5 tools:
            │       task_create · task_get · task_list · task_update · task_cleanup
            │
            ├─── Hook Wiring
            │     ├─ createContinuationHooks  → taskContinuationEnforcer (event:idle, 2s countdown)
            │     ├─ createToolGuardHooks     → tasksTodowriteDisabler (tool.execute.before, BLOCKING)
            │     │                           → taskEditGuard (tool.execute.before, bash edit guard)
            │     └─ createSessionHooks       → taskResumeInfo (tool.execute.after, resume hint)
            │                                 → delegateTaskRetry, taskNotepad, emptyTaskResponseDetector
            │
            ├─── Agent Prompts (dynamic-agent-prompt-builder, morpheus/keymaker/mouse factories)
            │     useTaskSystem=true → task discipline; false → todo discipline
            │
            └─── Runtime
                  task_create  → lock → T-{uuid}.json (pending) → unlock
                  task_update  → lock → merge fields → validate → atomic write → unlock
                  task_list    → readdir → validate → filter active → resolve blockedBy
                  task_get     → readFile → validate
                  task_cleanup → readdir → filter completed + olderThan → unlink
```

### Component Map

| Component | Disabled (`task_system=false`) | Enabled (`task_system=true`) |
|-----------|-------------------------------|------------------------------|
| Tool registry | 0 task tools (todos only) | 5 task tools registered |
| `tasks-todowrite-disabler` | no-op | `tool.execute.before` throws on `TodoWrite`/`TodoRead` |
| `task-edit-guard` | always active (own patterns) | same — blocks `sed`/`echo`/`cat`/`mv` on `.matrixx/tasks` & `.matrixx/plans` |
| Tool config (`tool-config-handler`) | default | `todowrite:false`, `todoread:false` global + per-agent `deny` |
| Agent prompts | todo discipline | task discipline (`task_create`/`task_update` workflow) |
| Storage | session memory (OpenCode Todo API) | file system (`.matrixx/tasks/` or global) |
| Continuation | `todo-continuation-enforcer` only | `task-continuation-enforcer` + `todo-continuation-enforcer` independently |
| Persistence | lost on restart | survives restart, migratable |

---

## 3. Configuration

### 3.1 Master Gate — `experimental.task_system`

```jsonc
// matrixx.jsonc
{
  "experimental": {
    "task_system": true  // default true since v2.5.x; set false to restore TodoWrite
  }
}
```

- **Canonical predicate:** `isTaskSystemEnabled(config)` in `src/shared/task-system-gating.ts` — single source of truth. Returns `config?.experimental?.task_system ?? true`.
- **First-load migration:** missing field auto-set via `_migrations` marker `task_system_default_true` (no user action).
- **Wiring:** `createContinuationHooks` and `createToolGuardHooks` gate `task-continuation-enforcer` and `tasks-todowrite-disabler` on this predicate. `task-edit-guard` and `task-resume-info` are unconditional (own patterns).

### 3.2 Storage Options — `morpheus.tasks`

```jsonc
{
  "morpheus": {
    "tasks": {
      "storage_path": "/custom/path",   // absolute or relative override
      "task_list_id": "my-project",     // override env/default
      "scope": "project",               // "project" | "global"
      "claude_code_compat": false
    }
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `storage_path` | `string` | — | Absolute path used verbatim; relative path `join(cwd, storage_path)`. When set, bypasses `scope`/`listId` resolution. |
| `task_list_id` | `string` | — | Explicit list ID. Alternative to `ULTRAWORK_TASK_LIST_ID` env. Sanitized to `[a-zA-Z0-9_-]`. |
| `scope` | `"project" \| "global"` | `"project"` | `project` → `.matrixx/tasks` in the project root. `global` → `~/.config/opencode/tasks/{listId}` via `getOpenCodeConfigDir()`. |
| `claude_code_compat` | `boolean` | `false` | Claude Code path compatibility flag (reserved). |

**Schema:** `MorpheusTasksConfigSchema` in `src/config/schema/morpheus.ts` (`storage_path?: string`, `task_list_id?: string`, `scope?: enum`, `claude_code_compat?: boolean`).

### 3.3 Directory Resolution

Implemented in `src/features/task-storage/storage.ts: getTaskDir()` + `resolveTaskListId()`.

**Priority for `listId`:**

1. `ULTRAWORK_TASK_LIST_ID` env
2. `CLAUDE_CODE_TASK_LIST_ID` env
3. `config.morpheus.tasks.task_list_id`
4. `basename(process.cwd())` sanitized

Sanitization: `sanitizePathSegment()` — `[^a-zA-Z0-9_-]` replaced with `-`.

**Priority for directory:**

```
if storage_path is absolute → storage_path
else if storage_path is relative → join(cwd, storage_path)
else if scope === "global" OR !directory → join(getOpenCodeConfigDir(), "tasks", sanitizedListId)
else → join(directory, ".matrixx", "tasks")   // default: project-scoped
```

`ensureDir()` (`mkdirSync -p`) is called before every read/write. `getProjectTaskDir(directory)` is the shorthand for the default branch.

### 3.4 Task List ID Verification

```bash
# Env override check
ULTRAWORK_TASK_LIST_ID=my-list opencode  # → ~/.config/opencode/tasks/my-list  (if scope=global)
                                          # or .matrixx/tasks            (if scope=project, env ignored for path but used for migration)

# Log grep (after enabling task_system)
tail -n 100 /tmp/matrixx.log | grep -E "task.*dir|getTaskDir|migrateLegacy"
```

---

## 4. Data Model

### 4.1 Two-Layer Type System

| Layer | File | Type | Fields | Notes |
|-------|------|------|--------|-------|
| **Storage** | `src/features/task-storage/types.ts` | `Task` (`TaskSchema`) | `id, subject, description, status, activeForm?, blocks, blockedBy, owner?, metadata?, projectRoot?` | Slim storage model. `strict()` — unknown keys rejected. |
| **API** | `src/tools/task/types.ts` | `TaskObject` (`TaskObjectSchema`) | same + `repoURL?, parentID?, threadID` | Superset for tool I/O. Alias `TaskSchema = TaskObjectSchema` for Claude compat. `strict()` likewise. |

**Mapping:** `TaskObject` is `Task` + `threadID` (auto `sessionID`), `repoURL`, `parentID`. When evolving, keep both in sync — add field to `TaskSchema` first, then extend `TaskObjectSchema`.

### 4.2 Schema Detail (`TaskObjectSchema`)

```typescript
TaskObjectSchema = z.object({
  id:          z.string().regex(/^T-[A-Za-z0-9-]+$/),   // T-{uuid}
  subject:     z.string(),                                // imperative: "Implement auth"
  description: z.string(),                                // default ""
  status:      z.enum(["pending","in_progress","completed","deleted"]),
  activeForm:  z.string().optional(),                     // "Implementing auth"
  blocks:      z.array(z.string()),                       // IDs this task blocks
  blockedBy:   z.array(z.string()),                       // IDs that block this task
  owner:       z.string().optional(),                     // agent name
  metadata:    z.record(z.string(), z.unknown()).optional(),
  repoURL:     z.string().optional(),
  parentID:    z.string().optional(),                     // parent task for sub-tasks
  threadID:    z.string().optional(),                     // auto-set to ctx.sessionID
  projectRoot: z.string().optional(),                     // auto-set to ctx.directory
}).strict()
```

**ID pattern:** `TASK_ID_PATTERN = /^T-[A-Za-z0-9-]+$/` (`src/tools/task/constants.ts`). `task_create` generates `T-{uuid}` via `crypto.randomUUID()` (`generateTaskId()`); `task_get`/`task_update` validate and return `{ error: "invalid_task_id" }` on mismatch.

### 4.3 Status Lifecycle

```
           task_create
               │
               ▼
          ┌─────────┐
          │ pending │◄──────────────────────────┐
          └────┬────┘                           │
               │ task_update({status:"in_progress"}) │
               ▼                                │
        ┌──────────────┐                        │
        │ in_progress  │──task_update({status:"pending"})──┘ (re-queue)
        └──────┬───────┘
               │ task_update({status:"completed"})
               ▼
         ┌───────────┐
         │ completed │ ── task_cleanup({olderThan}) ──► unlinked
         └───────────┘
               │ task_update({status:"deleted"})
               ▼
         ┌─────────┐
         │ deleted │ ── task_cleanup ──► unlinked
         └─────────┘
```

- **Active** = `pending` or `in_progress`. Returned by `task_list` (others filtered).
- **Terminal** = `completed` or `deleted`. Only `task_cleanup` physically removes `completed` (respects `olderThan`); `deleted` is treated identically in filters but not yet auto-purged — use `task_cleanup` or manual `deleted` + cleanup.
- **Discipline:** `in_progress` means exactly one task at a time per agent (Morpheus prompt invariant). Mark `in_progress` before work, `completed` immediately after — no batching.

### 4.4 Example JSON (`T-*.json`)

```json
{
  "id": "T-2a200c59-1a36-4dad-a9c3-3064d180f694",
  "subject": "Implement user authentication",
  "description": "Add JWT-based auth to API endpoints",
  "status": "pending",
  "activeForm": "Implementing user authentication",
  "blocks": [],
  "blockedBy": ["T-abc12345-1a36-4dad-a9c3-3064d180f694"],
  "owner": "morpheus",
  "threadID": "ses_abc123",
  "projectRoot": "/home/user/project",
  "metadata": { "priority": "high" }
}
```

---

## 5. Storage & Persistence

### 5.1 Layout

```
# scope=project (default)
.matrixx/tasks/
  T-2a200c59-....json
  T-abc12345-....json
  .lock                         # ephemeral {id, timestamp}

# scope=global
~/.config/opencode/tasks/{sanitizedListId}/
  T-*.json
  .lock
```

No index file. Directory listing is the index. `T-*.json` glob is the query.

### 5.2 Atomic Write Protocol

`writeJsonAtomic(path, data)` in `storage.ts`:

1. Serialize `JSON.stringify(data, null, 2)`.
2. `writeFileSync(tmpPath, content)` where `tmpPath = path + ".tmp." + Date.now()`.
3. `renameSync(tmpPath, path)` — atomic on POSIX.
4. On failure, `unlinkSync(tmpPath)` best-effort cleanup. Caller surfaces `internal_error`.

Guarantee: readers never see a half-written file.

### 5.3 File Locking

`acquireLock(dir)` / `acquireLockWithRetry(dir)` in `storage.ts`:

- **Create:** `writeFileSync(.lock, JSON.stringify({id: uuid, timestamp: Date.now()}), {flag:"wx"})` — fails with `EEXIST` if another writer holds the lock.
- **Stale eviction:** `STALE_LOCK_THRESHOLD_MS = 30_000`. On `EEXIST`, read `.lock`; if `Date.now() - timestamp > 30s`, `unlinkSync(.lock)` and retry once. Prevents deadlock on crashed agents.
- **Release:** `release()` verifies `id` matches before `unlinkSync(.lock)` — avoids deleting a successor's lock.
- **Retry:** `acquireLockWithRetry` (`task_create` path) loops with short sleep until acquired or timeout. `task_update` uses single-attempt `acquireLock` and returns `{ error: "task_lock_unavailable" }` if contended — caller should retry.

### 5.4 Legacy Migration

`migrateLegacyTasksIfNeeded(config, directory)`:

- Triggers on `task_create` / `task_list` when `getTaskDir()` is empty/non-existent and `~/.config/opencode/tasks/{listId}` contains `T-*.json`.
- Copies each `T-*.json` not already present (no overwrite). Logs `migrated N tasks`.
- One-way: global → project. No reverse. Idempotent.

### 5.5 Session-Scoped Operations

`src/features/task-storage/session-storage.ts` — helpers for session-scoped reads (used by continuation enforcer). Not a separate store; thin wrapper over `storage.ts` + `TaskObjectSchema` validation.

---

## 6. Tool API — Five Tools

All tools are `ToolDefinition` factories `createTask*Tool(config, ctx)` registered conditionally in `src/plugin/tool-registry.ts` when `isTaskSystemEnabled(config)`. Tool contexts receive `ctx.directory` (project root) and `context.sessionID` (for `threadID`).

### 6.1 `task_create`

**Input:** `TaskCreateInputSchema` — `subject: string` (required), `description?: string`, `activeForm?: string`, `blockedBy?: string[]`, `blocks?: string[]`, `metadata?: record`, `repoURL?: string`, `parentID?: string`.

**Output:** `{ task: { id: string, subject: string } }` or `{ error: "task_lock_unavailable" | "validation_error" | "internal_error" }`.

**Behavior:**

1. Validate input (`TaskCreateInputSchema`).
2. `migrateLegacyTasksIfNeeded()` if project dir empty.
3. `acquireLockWithRetry(dir)`.
4. `id = T-{randomUUID()}`; construct `TaskObject` with `status:"pending"`, `blocks:[]`, `blockedBy:[]` defaults, `threadID=context.sessionID`, `projectRoot=ctx.directory`.
5. Validate full object (`TaskObjectSchema`).
6. `writeJsonAtomic(join(dir, id+".json"), task)`.
7. `release()`.

**Invariants:** `id` unique; `status` always `pending` on create; `blockedBy`/`blocks` default `[]`; file appears atomically.

```typescript
task_create({ subject: "Build frontend" })                              // → { task: { id:"T-001", subject:"Build frontend" } }
task_create({ subject: "Integration tests", blockedBy:["T-001","T-002"] })
```

### 6.2 `task_get`

**Input:** `TaskGetInputSchema` — `id: string` (required, `TASK_ID_PATTERN`).

**Output:** `{ task: TaskObject | null }` or `{ error: "invalid_task_id" }`.

**Behavior:** Validate `id` → `readJsonSafe(join(dir, id+".json"))` → validate against `TaskObjectSchema` → return `null` if missing/malformed (not an error — caller handles `null`).

### 6.3 `task_list`

**Input:** `TaskListInputSchema` — `status?: TaskStatus`, `parentID?: string` (both optional filters).

**Output:** `{ tasks: TaskSummary[], reminder: string }` where `TaskSummary = { id, subject, status, owner?, blockedBy }` (note: not full `TaskObject`).

**Behavior:**

1. `readdirSync(dir)` → filter `T-*.json`.
2. For each file: `readJsonSafe` + `TaskObjectSchema.safeParse` — silently skip invalid.
3. Filter: exclude `status==="completed"` and `status==="deleted"` unless `input.status` explicitly asks for them; if `parentID` set, filter to matching.
4. **Resolve blockers:** for each active task, `blockedBy = blockedBy.filter(id => tasksById[id]?.status !== "completed")` — only unresolved blockers returned. This is the scheduling primitive.
5. Return summaries + reminder: `"1 task = 1 task. Maximize parallel execution…"`.

**Error:** never throws on malformed files — skips them.

### 6.4 `task_update`

**Input:** `TaskUpdateInputSchema` — `id: string` (required), `subject?, description?, status?, activeForm?, owner?, addBlocks?: string[], addBlockedBy?: string[], metadata?: record, repoURL?, parentID?`.

**Output:** `{ task: TaskObject }` or `{ error: "invalid_task_id" | "task_not_found" | "task_lock_unavailable" | "validation_error" | "internal_error" }`.

**Behavior:**

1. Validate input + `id` pattern.
2. `acquireLock(dir)` (single attempt).
3. Read existing file → validate.
4. Apply updates:
   - Scalar fields (`subject`,`description`,`status`,`activeForm`,`owner`,`repoURL`,`parentID`): direct replace if provided.
   - `addBlocks`/`addBlockedBy`: additive — `new Set([...existing, ...add])` (dedup, append-only).
   - `metadata`: shallow merge; `key: null` deletes the key; otherwise sets.
5. Re-validate against `TaskObjectSchema`.
6. `writeJsonAtomic` → `release()`.

**Critical:** Dependencies are **additive only**. There is no `removeBlockedBy` or full-replace — intentional to avoid races. To "unblock" a task, complete the blocker; `task_list` will hide it. To change deps before creation, set them in `task_create`.

```typescript
task_update({ id:"T-003", addBlockedBy:["T-001"] })          // additive
task_update({ id:"T-001", status:"completed" })               // unblocks T-003 via task_list filter
task_update({ id:"T-001", metadata:{ priority:null } })       // delete key
task_update({ id:"T-001", status:"in_progress", owner:"morpheus" })
```

### 6.5 `task_cleanup`

**Input:** `TaskDeleteInputSchema` (source: `task-cleanup.ts`) — `olderThan?: string` (pattern `^(\d+)(d|h|m)$` → ms, e.g. `"7d"`, `"24h"`, `"30m"`). No `id` — deletions are bulk by age/status.

**Output:** `{ deleted: number, remaining: number, deletedIds: string[] }`.

**Behavior:**

1. `readdirSync(dir)` → parse each `T-*.json` (validate, skip invalid).
2. Filter `status==="completed"` only (never deletes `pending`/`in_progress`/`deleted`).
3. If `olderThan` provided: `parseOlderThan(s)` → ms → for each completed task, compute `getTaskTimestamp(task)` fallback `time_updated ?? time_created ?? updatedAt ?? createdAt ?? 0` → keep only `Date.now() - ts > threshold`.
4. `unlinkSync` each selected file.
5. Return counts.

**Invariants:** Only `completed` deleted; `pending`/`in_progress` never touched; malformed files ignored; empty `olderThan` deletes all completed.

```typescript
task_cleanup({ olderThan:"7d" })   // delete completed older than 7 days
task_cleanup({})                    // delete all completed
```

### 6.6 Error Contract

| Code | Tool | Cause | Caller action |
|------|------|-------|---------------|
| `invalid_task_id` | `task_get`, `task_update` | `id` fails `TASK_ID_PATTERN` | Fix ID |
| `task_not_found` | `task_update` | file missing | Check `task_list` |
| `task_lock_unavailable` | `task_create`, `task_update` | `.lock` held, not stale | Retry after ~100ms |
| `validation_error` | all | Zod parse fails (strict) | Fix payload |
| `internal_error` | `task_create`, `task_update`, `task_cleanup` | FS error, atomic write fail | Check `/tmp/matrixx.log` |

All errors are returned as `{ error: string, message?: string }` — never thrown as exceptions to the LLM (hooks are the exception: they `throw` to block `TodoWrite`/`bash`).

---

## 7. Dependencies & Scheduling

### 7.1 Semantics

- `blocks: string[]` — IDs this task blocks (forward edge). Informational; `task_list` does not filter on it.
- `blockedBy: string[]` — IDs blocking this task (backward edge). **Scheduling edge** — `task_list` resolves to unresolved only.
- **Bidirectional sync:** `src/tools/delegate-task/sync-task-deps.ts` — when `task_create({blockedBy:[T-1]})`, caller should also update `T-1` with `addBlocks:[newId]` to keep graph consistent. Not enforced by storage — convention.

### 7.2 Additive Merge

`task_update` with `addBlocks`/`addBlockedBy` does `Set([...old, ...added])`. No removal API. Rationale: two agents adding deps concurrently would otherwise clobber each other. To evolve this, consider a `removeBlockedBy` that is also additive via a tombstone set — but current discipline is "complete the blocker."

### 7.3 Unresolved Filter (Scheduler Primitive)

`task_list` computes for each active task:

```typescript
const tasksById = Map(allTasks.map(t => [t.id, t]))
const unresolvedBlockedBy = task.blockedBy.filter(id => tasksById.get(id)?.status !== "completed")
```

Missing blocker ID (deleted file) is treated as unresolved — defend against stale IDs by completing blockers rather than deleting them before dependents finish.

### 7.4 Wave Planning (Morpheus Discipline)

Morpheus decomposes work into **waves** that maximize parallelism:

```
Wave 1 (parallel):  T-001 Build frontend    blockedBy:[]
                    T-002 Build backend     blockedBy:[]
Wave 2 (blocked):   T-003 Integration tests blockedBy:[T-001,T-002]
Wave 3 (blocked):   T-004 Deploy            blockedBy:[T-003]
```

Rules:
1. Create independent tasks first (`blockedBy:[]`) — they can run via `delegate_task(category=…)` in parallel.
2. `blockedBy` only when the task truly needs the blocker's output.
3. Keep chains short — every edge is a serialization point.
4. Check `task_list()` after each wave; `blockedBy:[]` on a `pending` task means "runnable now."

Full example:

```typescript
// Wave 1 — parallel
const t1 = task_create({ subject:"Build frontend" })   // T-001
const t2 = task_create({ subject:"Build backend" })    // T-002
// Wave 2 — blocked
const t3 = task_create({ subject:"Integration tests", blockedBy:[t1.task.id, t2.task.id] })
// Execute wave 1 in parallel via delegate_task, then:
task_update({ id:t1.task.id, status:"completed" })
task_update({ id:t2.task.id, status:"completed" })
// task_list now shows T-003 with blockedBy:[] → runnable
task_update({ id:t3.task.id, status:"in_progress", owner:"morpheus" })
// ... work ...
task_update({ id:t3.task.id, status:"completed" })
```

---

## 8. Hooks & Continuation

### 8.1 `task-continuation-enforcer` — Auto-Continue While Tasks Remain

**Files:** `src/hooks/task-continuation-enforcer/{hook.ts, idle-event.ts, countdown.ts, session-state.ts, todo.ts, abort-detection.ts, types.ts, constants.ts}`

**Wiring:** `src/plugin/hooks/create-continuation-hooks.ts` — gated on `isTaskSystemEnabled(config) && isHookEnabled("task-continuation-enforcer")`.

**Trigger:** `event:idle` (session idle). Decoupled from `todo-continuation-enforcer` in `d8ca206` (dedicated enforcer per system).

**State per session:** `SessionStateStore` (`session-state.ts`) — `{ abortDetectedAt?, consecutiveFailures, lastFailureAt, isRecovering }`.

**Constants:**

```
HOOK_NAME                    = "task-continuation-enforcer"
DEFAULT_SKIP_AGENTS          = ["oracle", "compaction"]
COUNTDOWN_SECONDS            = 2
TOAST_DURATION_MS            = 900
COUNTDOWN_GRACE_PERIOD_MS    = 500
ABORT_WINDOW_MS              = 3000
CONTINUATION_COOLDOWN_MS     = 30_000
MAX_CONSECUTIVE_FAILURES     = 5
FAILURE_RESET_WINDOW_MS      = 300_000
CONTINUATION_PROMPT          = systemDirective(TASK_CONTINUATION)
                               + "Incomplete Matrixx tasks remain. Continue…"
                               + "- Proceed without asking for permission"
                               + "- Mark each task in_progress before starting, completed immediately after"
                               + "- Respect blockedBy dependencies (skip blocked tasks)"
                               + "- Do not stop until all tasks are done"
```

**State Machine (`handleSessionIdle` in `idle-event.ts`):**

```
event:idle
  │
  ├─ isRecovering? ──► skip (log)
  ├─ abortDetectedAt && now - abort < 3s ──► clear flag, skip
  ├─ backgroundManager.getTasksByParentSession(sessionID) has running? ──► skip
  ├─ ctx.client.session.messages → isLastAssistantMessageAborted? ──► skip (API fallback)
  ├─ isContinuationStopped(sessionID)? ──► skip
  ├─ consecutiveFailures >=5 && now - lastFailure < 5min ──► skip (circuit breaker)
  ├─ now - lastContinuation < 30s ──► skip (cooldown)
  │
  ├─ getIncompleteTaskCount(dir)  // task_list filtered count via storage
  │     count == 0 ──► done (no injection)
  │     count > 0  ──► startCountdown(2s) → injectContinuation(CONTINUATION_PROMPT)
  │
  └─ on injection failure → increment consecutiveFailures, record lastFailureAt
```

**Countdown:** `startCountdown(2s)` in `countdown.ts` — 2-second toast countdown with 500ms grace. Cancels if new tool activity arrives.

**Recovery integration:** `sessionRecovery.setOnAbortCallback/markRecovering` and `setOnRecoveryCompleteCallback` in `create-continuation-hooks.ts` — abort detection via `onAbortCallbacks`, recovery flag via `onRecoveryCompleteCallbacks`.

### 8.2 `tasks-todowrite-disabler` — Enforce Task System

**Files:** `src/hooks/tasks-todowrite-disabler/{hook.ts, constants.ts}`

**Hook type:** `tool.execute.before` — **BLOCKING** (`throw new Error(REPLACEMENT_MESSAGE)`).

**Trigger:** `tool in ["TodoWrite","TodoRead"]` when `isTaskSystemEnabled(config)`.

**Triple-Layer Enforcement:**

| Layer | Mechanism | Location |
|-------|-----------|----------|
| 1. Hook | `throw` on `TodoWrite`/`TodoRead` | `hooks/tasks-todowrite-disabler/hook.ts` |
| 2. Global tool config | `todowrite:false`, `todoread:false` | `plugin-handlers/tool-config-handler.ts` |
| 3. Per-agent config | `todowrite:"deny"`, `todoread:"deny"` on morpheus/keymaker/architect/oracle/mouse | same handler, 5 agents |

**Error message (4-step workflow):**

> Use `TaskCreate` → `TaskUpdate(in_progress)` → do work → `TaskUpdate(completed)`. "DO NOT retry TodoWrite. Convert to TaskCreate NOW. Even trivial tasks MUST be registered."

### 8.3 `task-edit-guard` — Block Raw Bash Edits

**Files:** `src/hooks/task-edit-guard/{hook.ts, constants.ts}`

**Hook type:** `tool.execute.before` for `bash`. **Unconditional** (not gated on `task_system`).

**Patterns:** `BLOCKED_PATTERNS` regex — `sed|python|echo|cat|mv` operating on `.matrixx/plans` or `.matrixx/tasks` paths. Throws — instructs to use `Edit` (hashline IDs) for `.matrixx/plans/*.md` and `task_create`/`task_update`/`task_cleanup` for `.matrixx/tasks/T-*.json`. `grep` read-only is allowed via `isOnlyGrep` check.

**Duplicate hook name:** `HookNameSchema` in `src/config/schema/hooks.ts` lists `task-edit-guard` twice (lines 66/67) — harmless but should be deduped.

### 8.4 `task-notepad` & `task-resume-info`

| Hook | Trigger | Behavior |
|------|---------|----------|
| `task-notepad` (`src/hooks/task-notepad/`) | session start | Injects `.matrixx/tasks` context fragment (task counts) into prompt |
| `task-resume-info` (`src/hooks/task-resume-info/`) | `tool.execute.after` for delegate targets | Extracts `session_id` via `SESSION_ID_PATTERNS` and appends `to continue: task(session_id="…")` if not already present; ignores `Error:` outputs. Always registered (`create-session-hooks.ts`). |
| `empty-task-response-detector` (`src/hooks/empty-task-response-detector.ts`) | response analysis | Detects empty assistant message while tasks remain — triggers re-prompt |
| `delegate-task-retry` (`src/hooks/delegate-task-retry/`) | `delegate_task` failure | Retries on transient LLM failures via pattern matching in `patterns.ts` |
| `task-toast-manager` (`src/features/task-toast-manager/`) | `task_create`/`task_update` | Toast UI — created on `task_create`, removed on `task_update(completed)` |

### 8.5 Sibling — `todo-continuation-enforcer`

Parallel system for `SessionTodo` (`src/hooks/todo-continuation-enforcer/`). Same countdown mechanics but counts `Todo` not tasks. Both enforcers run independently when enabled; gated separately by `task_system` vs `todo` config. Decoupled in `d8ca206` (previously mirrored tasks to todos via `todo-sync.ts` dual-write — removed in `928440c`).

---

## 9. Agent Integration

### 9.1 Morpheus — Orchestrator

`buildTaskManagementSection(useTaskSystem)` in `src/agents/morpheus.ts` (and `dynamic-agent-prompt-builder.ts`).

When enabled:
- Workflow: `TaskCreate` → `TaskUpdate(in_progress)` → work → `TaskUpdate(completed)` with "Why Non-Negotiable" (visibility, drift prevention, recovery, accountability).
- Hook note switches from `TODO CONTINUATION` to `TASK CONTINUATION`.
- Decomposition: creates waves with `blockedBy` to maximize parallelism; launches `delegate_task(category=…)` for each parallel wave.

### 9.2 Mouse — Leaf Executor

5 model variants (`src/agents/mouse/{default,gpt,deepseek,mimo,qwen}.ts`) + shared utils (`shared.ts`):

- `buildConstraintsSection(useTaskSystem)`: allowed tools list switches to `task_create`/`task_update`/`task_list`/`task_get`/`task_cleanup`.
- `buildTodoDisciplineSection(useTaskSystem)`: task vs todo discipline.
- `buildVerificationTable(useTaskSystem)`: verification references `TaskUpdate` vs `todowrite`.
- Invariant: Mouse cannot spawn sub-agents (`task` tool blocked) — implementation in-house only.

### 9.3 `delegate_task` Integration

`src/tools/delegate-task/{background-task.ts, sync-task.ts, sync-task-deps.ts, unstable-agent-task.ts}`:

- **Background path:** `executeBackgroundTask` → `BackgroundManager.launch(...)` with `parentSessionID/messageID/model/agent/tools`. Waits up to `WAIT_FOR_SESSION_TIMEOUT_MS` for `sessionID` to materialize, then stores `sessionId` in `ctx.metadata` for TUI `Task` tool UI (`props.metadata.sessionId` lookup).
- **Sync path:** `executeSyncTask` → ephemeral session, runs agent, aborts session after to prevent `todo-continuation` re-awakening.
- **Dep sync:** `sync-task-deps.ts` — after `task_create({blockedBy:[T-1]})`, syncs reverse edge via `task_update({id:T-1, addBlocks:[newId]})`. Bidirectional graph maintenance.
- **Task metadata:** `task(session_id="ses_…")` continuation hint injected via `task-resume-info` hook.

---

## 10. Commands & TUI

| Command | Template | Tool Called | Behavior |
|---------|----------|-------------|----------|
| `/task-list` | `src/features/builtin-commands/templates/task-list.ts` | `task_list` | Renders `TaskList` summaries. Ignores global `search-mode` (fixed in `b7fbcf6`, `cc9e70d`). |
| `/cleanup-tasks` | `src/features/builtin-commands/templates/cleanup-tasks.ts` | `task_cleanup` | Deletes completed tasks. Also ignores global `search-mode`. |

**Toast manager:** `src/features/task-toast-manager/manager.ts` — `createTaskToastManager` shows toast on `task_create`, removes on `task_update(completed)` (also in `sync-task.ts` finally block: `toastManager.removeTask(taskId)`).

**TUI fix:** `3d44108` hid completed tasks from TUI; only active tasks display.

---

## 11. Cross-Cutting Concerns

### 11.1 Gating — Single Predicate

`src/shared/task-system-gating.ts`:

```typescript
export const TASK_SYSTEM_DEFAULT = true as const
export function isTaskSystemEnabled(config: Partial<MatrixxConfig> | undefined | null): boolean {
  return config?.experimental?.task_system ?? TASK_SYSTEM_DEFAULT
}
```

Used by: `create-continuation-hooks`, `create-tool-guard-hooks`, `tasks-todowrite-disabler`. Never check `config.experimental.task_system` directly — always via `isTaskSystemEnabled`.

### 11.2 Compatibility Notes

- **Claude Code alignment:** Field names (`subject`, `blockedBy`, `blocks`) follow Claude Code's Task tool signatures. Anthropic has not published official docs for these tools — Matrixx's `TaskObject` is a superset (adds `activeForm`, `repoURL`, `parentID`, atomic storage, additive deps, metadata merge, `task_cleanup`).
- **No `morpheus.tasks.enabled`:** Despite legacy docs mention, `MorpheusTasksConfigSchema` has no `enabled` field. The toggle is `experimental.task_system` only. Do not add `enabled` under `morpheus.tasks`.
- **Pre-existing `todo-sync.ts` removed:** Bulk sync `syncAllTasksToTodos` / `syncTaskTodoUpdate` existed in `src/tools/task/todo-sync.ts` (205 lines) for Todo API mirroring (`d004d84`–`0798df4`). Removed in `928440c`/`d8ca206` when enforcers decoupled. Do not reintroduce dual-write without revisiting the decouple rationale (debounce, direct DB fallback, host-blessed `SessionTodo.Service` writer).

---

## 12. Implementation Map

| File | Purpose | Lines |
|------|---------|-------|
| `src/tools/task/task-create.ts` | `task_create` — lock + `T-{uuid}` + atomic write | 113 |
| `src/tools/task/task-get.ts` | `task_get` — read single JSON + validate | 46 |
| `src/tools/task/task-list.ts` | `task_list` — readdir + filter active + resolve blockedBy | 77 |
| `src/tools/task/task-update.ts` | `task_update` — additive deps + metadata merge + atomic write | 151 |
| `src/tools/task/task-cleanup.ts` | `task_cleanup` — delete completed + `olderThan` age filter | ~120 |
| `src/tools/task/types.ts` | Zod schemas (`TaskObjectSchema`, `TaskCreate/Update/Get/ListInputSchema`) | 77 |
| `src/tools/task/constants.ts` | `TASK_ID_PATTERN = /^T-[A-Za-z0-9-]+$/` | — |
| `src/tools/task/index.ts` | Barrel re-exports | — |
| `src/features/task-storage/storage.ts` | `getTaskDir`, `resolveTaskListId`, `writeJsonAtomic`, `acquireLock`, `migrateLegacy` | 169 |
| `src/features/task-storage/types.ts` | Storage `TaskSchema` / `Task` type | — |
| `src/features/task-storage/session-storage.ts` | Session-scoped helpers | — |
| `src/features/task-toast-manager/manager.ts` | Toast lifecycle | — |
| `src/features/background-agent/task-history.ts` | Background-task history persisted alongside tasks | — |
| `src/hooks/task-continuation-enforcer/hook.ts` | Enforcer factory + `CONTINUATION_PROMPT` | — |
| `src/hooks/task-continuation-enforcer/idle-event.ts` | `handleSessionIdle` state machine | — |
| `src/hooks/task-continuation-enforcer/countdown.ts` | 2s countdown + grace | — |
| `src/hooks/task-continuation-enforcer/session-state.ts` | Per-session `{abortDetectedAt, consecutiveFailures, lastFailureAt, isRecovering}` | — |
| `src/hooks/task-continuation-enforcer/constants.ts` | `COUNTDOWN_SECONDS`, `ABORT_WINDOW_MS`, etc. | — |
| `src/hooks/tasks-todowrite-disabler/hook.ts` | BLOCKING hook on `TodoWrite`/`TodoRead` | 33 |
| `src/hooks/tasks-todowrite-disabler/constants.ts` | `REPLACEMENT_MESSAGE` (4-step workflow) | 30 |
| `src/hooks/task-edit-guard/hook.ts` | Bash edit guard for `.matrixx/tasks` & `.matrixx/plans` | — |
| `src/hooks/task-notepad/hook.ts` | Task notepad fragment injection | — |
| `src/hooks/task-resume-info/hook.ts` | Resume hint `task(session_id="…")` | — |
| `src/hooks/todo-continuation-enforcer/` | Sibling Todo enforcer (independent) | — |
| `src/tools/delegate-task/background-task.ts` | `delegate_task` background path | — |
| `src/tools/delegate-task/sync-task-deps.ts` | Bidirectional dep sync | — |
| `src/config/schema/experimental.ts` | `task_system?: boolean = true` | — |
| `src/config/schema/morpheus.ts` | `morpheus.tasks.{storage_path, task_list_id, scope, claude_code_compat}` | — |
| `src/config/schema/hooks.ts` | `HookNameSchema` (includes `task-continuation-enforcer`, `tasks-todowrite-disabler`, `task-edit-guard`, etc.) | — |
| `src/plugin/tool-registry.ts` | Conditional registration of 5 task tools | — |
| `src/plugin/hooks/create-continuation-hooks.ts` | Gates `taskContinuationEnforcer` | — |
| `src/plugin/hooks/create-tool-guard-hooks.ts` | Gates `tasksTodowriteDisabler` | — |
| `src/plugin/hooks/create-session-hooks.ts` | Registers `taskResumeInfo` (always) | — |
| `src/shared/task-system-gating.ts` | `isTaskSystemEnabled` canonical predicate | — |
| `src/features/builtin-commands/templates/task-list.ts` | `/task-list` command | — |
| `src/features/builtin-commands/templates/cleanup-tasks.ts` | `/cleanup-tasks` command | — |

**Key Dependencies:** `zod@4` (schemas), `@opencode-ai/plugin` (tool framework, `PluginInput`), `node:crypto` (`randomUUID`), `node:fs` (atomic ops), `node:path`.

---

## 13. Evolution Guide

### Adding a Field to `Task`

1. Add to `src/features/task-storage/types.ts: TaskSchema` (storage layer).
2. Add to `src/tools/task/types.ts: TaskObjectSchema` (API layer) — keep them in sync.
3. Update `task_create` defaults and `task_update` apply-logic if the field is mutable.
4. Update `task_list` / `task_get` return mapping if it should appear in summaries.
5. Run `bun run typecheck && bun run lint && bun test`.
6. Update this doc (§4.2, §6, §12) and `matrixx.example.jsonc` if config-adjacent.

### Adding a New Tool or Hook

- **Tool:** New file `src/tools/task/task-*.ts` + Zod input schema in `types.ts` + barrel in `index.ts` + registration in `src/plugin/tool-registry.ts` + hook wiring if needed + tests alongside source (`*.test.ts` with `//#given` `//#when` `//#then`).
- **Hook:** New dir `src/hooks/<name>/` + entry in `HookNameSchema` (`src/config/schema/hooks.ts`) + factory `createXxxHook` + registration in appropriate `src/plugin/hooks/create-*-hooks.ts` + `isTaskSystemEnabled` gate if task-related.

### Invariants to Preserve

- **Strict schemas:** `TaskSchema` and `TaskObjectSchema` are `.strict()` — unknown keys rejected. Do not loosen.
- **Additive deps only:** `addBlocks`/`addBlockedBy` via `Set`. No full-replace, no inline removal.
- **Atomic writes:** Always `writeJsonAtomic` (tmp + rename). Never `writeFileSync` directly to `T-*.json`.
- **Lock verification:** `release()` checks `id` before unlink. Never delete `.lock` unconditionally.
- **Single owner:** One `in_progress` task per agent at a time (prompt invariant + `task-continuation-enforcer` expects this).
- **Unresolved filter is the scheduler:** `task_list` must filter `blockedBy` to unresolved; changing this breaks wave planning.
- **Gating via predicate:** Always `isTaskSystemEnabled(config)` — never read `config.experimental.task_system` inline.
- **No bash edits:** `.matrixx/tasks/T-*.json` guarded by `task-edit-guard` — use tools, not `sed`/`echo`.

### Testing

- **Mock-heavy isolation:** Tests with `mock.module()` run isolated — add new such files to both `.github/workflows/ci.yml` + `publish.yml` mock-heavy list and the `grep -v -F` exclusion in `script/run-ci.sh`. Source of truth: `script/run-ci.sh`.
- **Preload:** `tests/test-setup.ts` calls `_resetForTesting()` before each test.
- **Existing suites:** `src/tools/task/*.test.ts`, `src/features/task-storage/*.test.ts`, `src/hooks/task-continuation-enforcer/*.test.ts`, `src/shared/task-system-gating.test.ts`, `tests/e2e-smoke-task-system.test.ts`.

---

## 14. Appendix — History & Decisions

| Date / Commit | Change | Rationale |
|---------------|--------|-----------|
| `d004d84` feat(hooks): mirror Task→Todo | Initial file→Todo API mirror | Tasks visible in OpenCode TUI |
| `72abccb` / `401f336` | Direct DB fallback + debounce | Reliability under TUI load |
| `0798df4` host-blessed `SessionTodo.Service` dual-write | Correct writer via `PluginInput` | Align with OpenCode SDK |
| `4e694d0` migrate to project-scoped storage | `.matrixx/tasks` default; global only if `scope=global` | Project isolation, no cross-project leakage |
| `0682bce` isolation suite (11 tests) | Verify project isolation | — |
| `d16dc27` `task-edit-guard` | Block raw bash on `.matrixx/tasks` & `.matrixx/plans` | Prevent bypass of locking/validation |
| `3d44108` hide completed from TUI | TUI shows only active tasks | Reduce noise |
| `d8ca206` decouple `task-continuation-enforcer` from `todo-continuation-enforcer` | Dedicated enforcer per system; remove `todo-sync.ts` dual-write | Enforcers independent; no coupling debt |
| `62e7061` wire enforcer to event bus & correct injection | `handleSessionIdle` via `onAbort`/`onRecoveryComplete` callbacks | Abort-aware, background-task-aware continuation |
| `5459ef9` merge `feat/task-system-no-todowrite` | Remove stale specs, repair compaction | — |
| `75fedac` default `task_system=true` + canonical gating | `isTaskSystemEnabled` + `_migrations` marker | Zero-config for fresh clones |
| `8509b84`–`82f9f38` `/task-list` & `/cleanup-tasks` search-mode fixes | Ignore global `search-mode` | Commands must not leak into global search |

**Known tech debt:**

- Duplicate `task-edit-guard` in `HookNameSchema` (lines 66/67) — dedup pending.
- No dedicated `TaskManager` class — CRUD is stateless I/O + `.lock`. Intentional simplicity; do not introduce a manager unless contention profiling justifies it.

---

*End of Task System Engineering Specification. For config reference see `docs/configurations.md`; for orchestration see `docs/orchestration-guide.md` and `docs/agent-architecture.md`.*
