# Background agents interrupted: handles lost while work lands (2026-09-11)

> Status: Mode B (stop-continuation guard) FIXED 2026-09-11. Mode A (reaper) still open.
> This file is the directive for a future session:
> read it, reproduce, then fix. Do not implement before reproducing.

## TL;DR

During the `fix/task-continuation-hijack` work session (2026-09-11 ~12:30-13:00 EEST),
every `task(run_in_background=true)` handle (`bg_*`) became unresolvable
(`background_output(task_id)` → `Task not found`, `background_cancel(all=true)` →
`No running or pending background tasks`) within minutes of launch, while the
subagents themselves kept running to completion: their side effects
(`.matrixx/notepads/.../learnings.md` appends, new `*.test.ts` files) all landed
on disk. Supervision died, execution survived. Consequence: `task_list` showed
`in_progress` forever, the plan-persister counted `0/12`, mission-continuation
re-fired already-finished waves (Wave 2 was delegated twice), and the human had
to order direct (non-delegated) implementation.

## Observed timeline (facts, this session)

| Time (EEST) | Event | Evidence |
|---|---|---|
| 12:36 | 2 trinity probes launched (`bg_c5fca056`, `bg_c5566e02`) | host acknowledged both handles |
| ~12:40 | `background_output` on both → `running`, partial transcripts | handles alive, agents working |
| ~12:45 | `background_cancel(all=true)` → cancelled 2 | registry knew them at that point |
| ~12:50 | Wave 1 launched (`bg_b3abfacd` discovery, `bg_67b92556` RED tests) | host acknowledged |
| ~12:55 | `background_output` on both → `Task not found` | handles gone, no result linkage |
| ~12:55 | Side effects present: `learnings.md` (7.6 KB audit), `awaiting-user.test.ts` x2 | agents ran to completion anyway |
| ~13:00 | Wave 2 launched (`bg_df18b0ea`, `bg_b9ba081d`), then re-fired (`bg_2e54513b`, `bg_e761a84a`) | acknowledged, then lost again |
| ~13:00 | `background_cancel(all=true)` → `No running or pending background tasks` | registry empty minutes after launch |
| 13:00+ | Direct implementation done by primary agent, GREEN 8/8, committed `b997192` + `744d792` | no background needed |

Note the asymmetry: every `task()` result used in this session arrived via
`session_id` resume or via files on disk, never via its `bg_*` handle.

## Why this smells like the continuation system (suspect, not proven)

1. Same-session coincidence: the task-continuation enforcer was actively injecting
   `promptAsync` continuations and running 2 s countdown timers during the whole
   window (the session predates the awaiting-user fix, commits `b997192`/`744d792`
   landed at the end). Countdown `setTimeout` + `promptAsync` + `cancelCountdown`
   churn overlaps the background-task lifecycle events the manager watches
   (`tool.execute.before/after`, `message.updated`, `session.idle`).
2. `stop-continuation-guard.stop()` calls `backgroundManager.cancelAllForSession()`.
   Any code path that invokes `stop()` (or a stale `isStopped` evaluation) wipes
   repo-level background tasks for the session. Check who calls `stop()`.
3. `task-continuation-enforcer` `sessionStateStore` prune (10 min TTL) and
   `cancelAllCountdowns`/`shutdown` on cleanup could coincide with manager
   lifecycle if stores share session scoping.

## Ranked hypotheses (investigate in this order)

- H1 — Host-side reaper: `src/features/background-agent/constants.ts`
  (`DEFAULT_STALE_TIMEOUT_MS=180_000`, `MIN_RUNTIME_BEFORE_STALE_MS=30_000`,
  `DEFAULT_MESSAGE_STALENESS_TIMEOUT_MS=600_000`, `PRUNE_THROTTLE_MS=30_000`,
  `TASK_TTL_MS=30min`, `TASK_CLEANUP_DELAY_MS=10min`) reaps long-polling
  subagents as stale while their processes finish independently. Our agents ran
  60-150 s each: inside stale windows but close enough that poll jitter +
  tool-call-heavy transcripts (dozens of tool calls per agent) could trip
  message-staleness or the circuit breaker
  (`DEFAULT_CIRCUIT_BREAKER_CONSECUTIVE_THRESHOLD=20`).
- H2 — Continuation interference: enforcer `promptAsync`/`cancelCountdown` churn
  perturbs the events the background manager uses for liveness; or a `stop()`
  call cancels tasks via `cancelAllForSession`. Audit all `stop()` callers and
  correlate `/tmp/matrixx.log` injection lines with handle-loss times.
- H3 — Registry scoping: handles keyed by (parent session, directory) dropped on
  branch switch (`dev` → `fix/task-continuation-hijack` happened mid-session) or
  on `plan-persister`/compaction state rewrites. Check `message-dir.ts`,
  `state.ts`, `task-history.ts` keying and whether checkout clears anything.
- H4 — Polling misuse: `background_output(task_id)` after result TTL expiry
  (`TASK_CLEANUP_DELAY_MS`). Disprove by timestamps: our losses happened within
  ~5 min, far under 10 min cleanup delay, so H4 alone cannot explain it.
- H5 — Two registries confused: `bg_*` handles live host-side (OpenCode), while
  `BackgroundManager` (repo) tracks session tasks separately. Confirm which layer
  emitted `Task not found` and whether repo-level `getTasksByParentSession`
  still listed the tasks after handle loss.

## Reproduction protocol (next session must do this first)

1. On a scratch branch, launch 2 slow probes:
   `task(category="blue-pill", run_in_background=true, ...)` with a prompt that
   sleeps/reads many files (~2-3 min work), record handles H1/H2.
2. Poll `background_output(H1)` every 30 s; log exact time of first
   `Task not found`. Simultaneously `tail -f /tmp/matrixx.log` and record every
   `[task-continuation]` / `[background]` / `[stop-continuation-guard]` line.
3. After loss, check: does `task_list` still show the delegated `T-*` as
   `in_progress`? Do side effects land? Does repo `getTasksByParentSession`
   still list them? Does `stop()` appear in logs?
4. Repeat with `task-continuation-enforcer` in `disabled_hooks` (control run).
   If handles survive with the enforcer off, H2 is confirmed; if they still die
   on the same ~minute scale, H1/H3 lead.
5. Vary one knob at a time: `staleTimeoutMs`, branch switch mid-run,
   `messageStalenessTimeoutMs`, circuit breaker threshold.

## Fix direction (only after reproduction)

- Persist `bg_*` handle → task linkage outside volatile memory (file-backed like
  `.matrixx/tasks/`, which survived everything this session) so results stay
  retrievable after reaper/compaction events.
- Heartbeat from running subagents against the reaper (extend `MIN_RUNTIME_BEFORE_STALE_MS`
  semantics: tool-call activity = liveness, not staleness).
- Idempotent delegation keys: `task_list` entries reconciled against actual
  session completion instead of stuck `in_progress`; mission-continuation must
  detect already-landed side effects before re-firing a wave.
- Audit + test `stop()` callers: no path may call `cancelAllForSession` except an
  explicit user `/stop-continuation`.
- Regression test: launch slow probe, advance past stale windows with mocked
  timers, assert handle still resolves (mirror
  `src/hooks/task-continuation-enforcer/awaiting-user.test.ts` style: BDD
  comments, `tests/test-setup.ts` isolation, no `mock.module` unless added to
  `script/run-ci.sh` + both workflow isolated lists).

## Constraints for the fixing session

- Reproduce before patching; capture log excerpts as evidence in the fix commit
  message or notepad (`.matrixx/notepads/<topic>/learnings.md`, append-only).
- No schema changes to `.matrixx/tasks/T-*.json` or `matrixx.json` without
  justification; prefer in-memory + file-backed handle index.
- Verification is agent-executable only: `bun run typecheck`, `bun test <dir>`,
  `bun run lint` on touched dirs. No manual/UX acceptance criteria.
- PR targets `dev` (never `master`), merge commit only.
- Key files: `src/features/background-agent/{constants,manager,state,task-history,message-dir}.ts`,
  `src/hooks/task-continuation-enforcer/*`, `src/hooks/stop-continuation-guard/hook.ts`,
  `src/plugin/hooks/create-continuation-hooks.ts`, `src/config/schema/background-task.ts`,
  `/tmp/matrixx.log`.

## Fix log (2026-09-11) — Mode B: awaiting-user guard at stop()

Reproduced first (RED): `src/hooks/stop-continuation-guard/repro.test.ts` —
`stop()` called `cancelAllForSession` even when the session was awaiting a user
answer (subagent mid-question). 4 pass / 1 fail before the fix.

Root cause: `stop-continuation-guard/hook.ts:stop(sessionID)` cancelled all
background tasks unconditionally. The awaiting-user guard (`isAwaitingUser` from
`src/shared/awaiting-user.ts`) existed at countdown-start and inject-time but
had no parity at the stop path.

Fix (GREEN, 4 pass / 0 fail):
- `stop-continuation-guard/hook.ts`: `stop()` is now async and consults an
  `isAwaitingUser` callback (explicit state flag) plus a pending-question
  message scan before calling `cancelAllForSession`. The `stoppedSessions` flag
  is still set regardless, so `isStopped()` semantics are unchanged.
- `task-continuation-enforcer` + `todo-continuation-enforcer`: expose
  `isAwaitingUser(sessionID)` (reads the session state store).
- `create-continuation-hooks.ts`: lazy bridge wires the active enforcer's
  `isAwaitingUser` into the stop guard (enforcer is created after the guard).
- `tool-execute-before.ts`: `/stop-continuation` awaits the async `stop()`.

Verification: `bun run typecheck` clean; `bun test` on the 3 affected dirs
(30 tests) green; biome lint clean on touched files.

Remaining (Mode A / reaper + handle persistence): see hypotheses H1/H3-H5 above.
The reaper is gated on parent-session idle + staleness thresholds; the user
transcript kill happened immediately after a user message, so Mode B was the
primary suspect. Mode A still needs a live repro with mocked timers.
