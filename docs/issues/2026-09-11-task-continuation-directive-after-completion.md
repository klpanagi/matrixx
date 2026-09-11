# Task-continuation directive fired after task completion — investigation (2026-09-11)

> Status: INVESTIGATED — directive was CORRECT (2 tasks genuinely pending). Task-hygiene + cross-session observation documented for a future session.

## TL;DR

After the live-verification work was completed and several tasks were marked `completed` (18:56:40-41), a `[SYSTEM DIRECTIVE: MATRIXX - TASK CONTINUATION]` fired (m0457) listing `[Status: 181/183 completed, 2 remaining]`:

- `T-110c99f5-9e99-4817-a593-845c60de3eb1` — Verify Mode A: pending-question subagent not reaped
- `T-d2f09bb1-cfe6-46e5-9534-751b853961c9` — Verify task-continuation directives fire

**The directive was CORRECT.** Both tasks were created at 16:38:23/16:38:25 (start of the verification session) and were **never marked completed** — their work was superseded by the mainSessionID-hijack investigation (which produced the actual fix), but the two original verification tasks were orphaned. The task updates the user observed (18:56:40-41) were for *different* tasks (`T-a25c4e0d`, `T-5a80e314`, `T-cd6a0815`).

## Evidence

### Task file states (`.matrixx/tasks/`, project-scoped, file-backed)

| Task | Status | mtime (UTC) | Subject |
|------|--------|-------------|---------|
| `T-110c99f5-9e99-4817-a593-845c60de3eb1` | **pending** | 2026-09-11T16:38:23.225Z | Verify Mode A: pending-question subagent not reaped |
| `T-d2f09bb1-cfe6-46e5-9534-751b853961c9` | **pending** | 2026-09-11T16:38:25.606Z | Verify task-continuation directives fire |
| `T-a25c4e0d-e631-4bf0-b522-1f0c670eec4a` | completed | 2026-09-11T18:56:40.330Z | Fix mainSessionID hijack in src/plugin/event.ts |
| `T-5a80e314-6670-44d2-aeee-6088ba3a5cf6` | completed | 2026-09-11T18:56:40.813Z | Verify Mode B: bg subagent survives user message |
| `T-cd6a0815-ae1f-4d88-9dfb-a95e52a2afce` | completed | 2026-09-11T18:56:41.399Z | Verify merged fixes in live OpenCode session |
| `T-25c9c16e-e54b-4e66-bf20-14dd07f05c64` | **in_progress** | 2026-09-11T18:15:26.035Z | Fix interactive-bash-session session.deleted mass-abort |

`task_get` on both pending tasks confirms `status: "pending"` at investigation time (21:59 local).

### Directive injection log (`/tmp/matrixx.log`, session `ses_f6f5e889ffferpxFOJM0Ds77yo`)

The enforcer fired repeatedly on `session.idle` — each time starting a 2s countdown then injecting:

```
17:32:02.054Z Injecting continuation {"sessionID":"ses_f6f5e889ffferpxFOJM0Ds77yo","agent":"morpheus","model":{"providerID":"opencode-go","modelID":"deepseek-v4-flash"},"incompleteCount":5}
17:52:15.736Z Countdown started {"sessionID":"ses_f6f5e889ffferpxFOJM0Ds77yo","seconds":2,"incompleteCount":4}
17:52:18.033Z Injecting continuation {"sessionID":"ses_f6f5e889ffferpxFOJM0Ds77yo","incompleteCount":4}
17:58:01.325Z Countdown started {"sessionID":"ses_f6f5e889ffferpxFOJM0Ds77yo","seconds":2,"incompleteCount":4}
17:58:03.588Z Injecting continuation {"sessionID":"ses_f6f5e889ffferpxFOJM0Ds77yo","incompleteCount":4}
```

The count went 5 → 4 as tasks were completed (T-9efc7153 at 18:47, then T-a25c4e0d/T-5a80e314/T-cd6a0815 at 18:56). The directive at m0457 (after 18:56) correctly reported the 2 remaining pending tasks.

## Analysis

1. **Directive behavior is correct.** The task-continuation enforcer counts incomplete tasks from the file-backed `.matrixx/tasks/` dir on `session.idle`. Two tasks were genuinely `pending`, so the directive fired. No stale-read bug.

2. **Root cause of the confusion: orphaned verification tasks.** The two verification tasks (Mode A, directives) were created at the start of the live-verification session but their work was absorbed into the mainSessionID-hijack investigation. They were never closed. The enforcer has no notion of "superseded" — a pending task is a pending task.

3. **Cross-session task sharing (observation).** `T-25c9c16e` ("Fix interactive-bash-session session.deleted mass-abort", `in_progress`, `blockedBy: ["T-"]` — malformed) appeared in the shared task list but was **not created by this session**. The file-backed task system is project-wide (`.matrixx/tasks/`), so tasks created in the user's own OpenCode session (run=26925130) are visible to, and can trigger directives in, other sessions of the same project. This is by design (project-scoped `getTaskDir()`) but means a directive in one session can be caused by tasks from another.

## Recommendations for a future session

- **Task hygiene**: when a task's work is superseded by a different investigation, mark the original task `completed` (or `deleted`) explicitly — do not leave it `pending`. The enforcer will keep firing directives for any pending task.
- **Consider**: whether the enforcer should distinguish "pending but stale" tasks (e.g., no activity for N hours) from genuinely active ones, to reduce directive noise on long-running sessions.
- **Cross-session**: if multiple OpenCode sessions share a project, expect directives to reflect the union of all sessions' tasks. Document this in the task-system docs if not already.
- **Malformed `blockedBy: ["T-"]`**: the interactive-bash-session task has a truncated blocker id — worth checking `task_create`/`task_update` validation for partial-id acceptance.

## Key files

- `.matrixx/tasks/T-{uuid}.json` — file-backed task state (project-scoped)
- `src/hooks/task-continuation-enforcer/` — countdown + injection logic
- `src/features/task-storage/` — task read path (`getTaskDir`, `readJsonSafe`)
- `/tmp/matrixx.log` — directive injection evidence