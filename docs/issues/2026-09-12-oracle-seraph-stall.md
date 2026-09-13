# Oracle Plan Agent Timeout via Seraph Stall (2x on 2026-09-12)

## Summary

The Oracle plan agent (`task(subagent_type="oracle")`, blocking mode) timed out twice
in the same session when asked to design the `plan_*`-enforcement plan. Both runs
died at the 600 s synchronous poll limit (`Poll timeout reached after 600000ms`).
Session transcripts show the same stall shape in both attempts: Oracle delegated to a
Seraph subagent for gap analysis, and the run never produced a result within budget.
Attempt 1 stalled *inside* the Seraph delegation (no return). Attempt 2 got a Seraph
result after ~3.3 min, then stalled at/after its final `plan_create` call.

No implementation was affected — the two Trinity investigators completed normally and
their findings were used to synthesize the enforcement plan manually.

## Timeline (Europe/Athens, 2026-09-12)

| Time | Event | Evidence |
|------|-------|----------|
| 07:46:23 | Two Trinity explorers launched in background (inventory + bypass table) | Task IDs `bg_edb965a2`, `bg_8c569bc7` |
| 07:46:50 | Oracle attempt 1 launched (blocking): `ses_f6b6aa89affedQW0E2Gvt5bHDp` | Session open message timestamp |
| 07:46:50–07:49:38 | Oracle gathers context (read/glob/ctx_batch_execute rounds) | Session transcript, ~3 min of tool calls |
| 07:49:38 | Oracle delegates to Seraph via `task` (gap analysis, Complex-4 change) | Last message in attempt-1 transcript: `[tool: task]` |
| ~07:56:50 | Attempt 1 poll timeout: `Poll timeout reached after 600000ms for session ses_f6b6aa89affedQW0E2Gvt5bHDp` | Tool output in main session |
| ~07:50 | Trinity explorer 1 completes (duration 3m26s) | Background-completion notification |
| ~07:50 | Trinity explorer 2 completes (duration 3m45s) | `ALL BACKGROUND TASKS COMPLETE` notification |
| 07:57:11 | Oracle attempt 2 launched (blocking): `ses_f6b612f0affeJu0eP6Q0VZdkn6` | Session open message timestamp |
| 07:57:11–07:58:44 | Oracle verifies every inventory path via `ctx_execute` (no re-investigation) | Session transcript |
| 07:58:44 | Oracle delegates to Seraph via `task` | Transcript: "consulting Seraph for gap analysis" + `[tool: task]` |
| 08:02:00 | Seraph returns (~196 s later) with 2 findings: task-edit-guard may be dead code; oracle-md-only may block plan_* tools | Transcript message timestamp |
| 08:02:11–08:03:31 | Oracle verifies both findings (guard never invoked in `tool-execute-before.ts`; oracle-md-only does not block plan_*), then calls `plan_create` | Transcript + tool calls |
| ~08:07:11 | Attempt 2 poll timeout: `Poll timeout reached after 600000ms for session ses_f6b612f0affeJu0eP6Q0VZdkn6` | Tool output in main session |

## Key observations

1. **Attempt 1 never got past Seraph.** Its transcript ends at the Seraph `task`
   call (07:49:38); ~7 min of silence followed. Either the Seraph subagent hung or
   its result was never delivered back through the nesting
   (Morpheus → Oracle → Seraph).
2. **Attempt 2 proves Seraph is slow but not always fatal.** Seraph took ~196 s
   to return 2 findings (both verified correct and load-bearing: task-edit-guard
   is created but never invoked — dead code; Read-redirect must be block+message).
   The run then died somewhere in `plan_create` + final synthesis (~3.5 min
   unaccounted between the last visible action at 08:03:31 and the ~08:07:11 timeout).
3. **Sibling Trinity agents succeeded in the same window** (3m26s, 3m45s) with no
   nested delegation — they did flat tool-call research and returned. Only the
   Oracle runs, both of which nested a Seraph delegation, timed out.
4. **Blocking invocation mode.** Both Oracle calls used the default synchronous
   poll (600 s budget). Oracle's own workflow (multi-round gathering + Seraph
   ~3.5 min + verification + plan file write + synthesis) does not fit in the
   remaining budget once Seraph consumes half of it.
5. **Possible context bloat.** Every subagent prompt in the transcripts carries a
   large injected `memory_context` block (full user profile + project knowledge).
   At 3 nesting levels this compounds per round trip and slows each inference
   step — consistent with the observed multi-minute gaps between Oracle tool calls
   (e.g. 07:58:44 → 08:02:00).

## Hypotheses (unconfirmed, for the follow-up session)

- H1: Nested `task()` delegation (Oracle → Seraph) has no independent progress
  reporting, so the outer 600 s poll expires while inner work is still running;
  the inner result may even complete server-side but is never delivered.
- H2: Seraph's own workflow (clarifying analysis + verification) is simply too
  slow (~3+ min) to nest inside a blocking Oracle call with a fixed 600 s budget.
- H3: Attempt 2's `plan_create` file write or the final synthesis round hung
  independently of Seraph (transcript ends right after `[tool: plan_create]`).
- H4: Per-round `memory_context` injection at depth 3 pushes prompts near context
  limits, degrading speed and risking stalls.

## Impact

- No code or data loss: investigation results were preserved via the completed
  Trinity sessions; the enforcement plan was synthesized manually and delivered.
- Cost: ~20 min of wall-clock spent on two timed-out Oracle runs.
- The enforcement plan itself (Waves 1–5, `plan_*`-only access) is unaffected and
  awaits user approval.

## Suggested next steps (future session)

1. Reproduce minimally: blocking `task(subagent_type="oracle")` with a prompt
   that triggers Seraph delegation; observe whether the 600 s poll is the binding
   constraint (try `run_in_background=true` + `background_output` instead).
2. Check whether the task tool's poll timeout is configurable, and whether nested
   `task()` calls share or reset the budget.
3. Check whether the orphaned Seraph/plan_create work from `ses_f6b6aa89affedQW0E2Gvt5bHDp`
   and `ses_f6b612f0affeJu0eP6Q0VZdkn6` completed server-side (session_read on
   those IDs) — if results exist, the bug is delivery, not execution.
4. Measure Seraph standalone latency vs nested latency to isolate nesting overhead.
5. Consider policy: invoke Oracle in background mode by default; reserve blocking
   calls for sub-minute agents (trinity/operator); avoid Oracle → Seraph nesting
   under a fixed poll budget, or split into two sequential top-level calls.
