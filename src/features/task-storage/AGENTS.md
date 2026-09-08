# CLAUDE TASKS KNOWLEDGE BASE

## OVERVIEW

Claude Code compatible task schema and storage. Core task management with file-based persistence, atomic writes, and OpenCode todo sync.

## STORAGE SCOPE

Hybrid layout selected by `morpheus.tasks.scope` (default `project`) and resolved via `getTaskDir(config, directory?)`.

| scope | Path | Example |
|-------|------|---------|
| `project` (default) | `.matrixx/tasks` per project | `<project>/.matrixx/tasks/T-*.json` |
| `global` | `~/.config/opencode/tasks/{listId}` fallback | `~/.config/opencode/tasks/matrixx/T-*.json` |

- `storage_path` absolute → used as-is; relative → resolves against `directory` (project root) when provided, else `process.cwd()`.
- `migrateLegacyTasksIfNeeded(config, directory)` lazy copies (not moves) legacy `T-*.json` to project dir on first `task_create`, logs `[task-storage] Migrated N legacy tasks from <legacy> to <project>`, retains legacy 30d. Delete manually or via prune.
- Rollback: set `scope: "global"` in `matrixx.jsonc` to restore global layout.
- `.matrixx/` gitignored per `.gitignore` — project tasks stay local per clone.
## STRUCTURE
```
task-storage/
├── types.ts               # Task schema (Zod)
├── types.test.ts          # Schema validation tests
├── storage.ts             # File operations (atomic write, locking)
├── storage.test.ts        # Storage tests (30 tests, 543 lines)
├── session-storage.ts     # Session-scoped task storage
├── session-storage.test.ts
└── index.ts               # Barrel exports
```

## TASK SCHEMA

```typescript
type TaskStatus = "pending" | "in_progress" | "completed" | "deleted"
interface Task {
  id: string                    // T-{uuid}
  subject: string               // Imperative: "Run tests"
  description: string
  status: TaskStatus
  activeForm?: string           // Present continuous: "Running tests"
  blocks: string[]              // Task IDs this task blocks
  blockedBy: string[]           // Task IDs blocking this task
  owner?: string                // Agent name
  metadata?: Record<string, unknown>
  repoURL?: string
  parentID?: string
  threadID?: string
  projectRoot?: string          // originating project directory
}
```

## STORAGE UTILITIES

| Function | Purpose |
|----------|---------|
| `getTaskDir(config, directory?)` | Task storage dir — `directory` optional, `storage_path` relative resolves against `directory`, `scope: "project"` → `.matrixx/tasks`, `global` → `~/.config/opencode/tasks/{listId}` |
| `getProjectTaskDir(directory)` | `join(directory, ".matrixx/tasks")` — project task dir |
| `migrateLegacyTasksIfNeeded(config, directory)` | Lazy copy-not-move legacy `T-*.json` → project dir, logs `[task-storage] Migrated N ...`, retains legacy 30d |
| `resolveTaskListId(config)` | Task list ID (env → config → cwd) |
| `readJsonSafe(path, schema)` | Parse + validate, null on failure |
| `writeJsonAtomic(path, data)` | Atomic write via temp + rename |
| `acquireLock(dirPath)` | File lock with 30s stale threshold |
| `generateTaskId()` | `T-{uuid}` format |
| `findTaskAcrossSessions(config, taskId)` | Locate task in any session |

## TODO SYNC

Automatic bidirectional sync between tasks and OpenCode's todo system.

| Task Status | Todo Status |
|-------------|-------------|
| `pending` | `pending` |
| `in_progress` | `in_progress` |
| `completed` | `completed` |
| `deleted` | `null` (removed) |

Sync triggers: `task_create`, `task_update`.

## ANTI-PATTERNS

- Direct fs operations (use storage utilities)
- Skipping lock acquisition for writes
- Using old field names (title → subject, dependsOn → blockedBy)
- Deleting or committing `.matrixx/tasks` — `.matrixx/` is gitignored for per-project isolation, do not track task files
- Raw bash `sed`/`python` on `.matrixx/plans/*.md` checkboxes (`- [ ]` -> `- [x]`) -> use `Read` -> `Edit` with hashline `LINE#ID`; `plan-persister` tracks `todoCompleted` via `- [x]` count, not `T-*.json` tasks
- Raw bash `echo`/`cat >`/`rm`/`sed`/`python` on `.matrixx/tasks/T-*.json` -> use `task_create`/`task_update`/`task_get`/`task_list`/`task_cleanup` (project-scoped via `getTaskDir(config, directory)`); `task-edit-guard` (`tool.execute.before` on `bash` with `BLOCKED_PATTERNS`) blocks bypass
