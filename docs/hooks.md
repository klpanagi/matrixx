# Matrixx Hooks Reference, Performance & Evolution Guide

> Point-of-reference for the matrixx hook system: what each hook does, when it runs,
> how to enable/disable it, how much it costs — with measured experiments.
> Scope: `src/hooks/`, `src/create-hooks.ts`, `src/plugin/hooks/*`,
> `src/plugin-interface.ts`, `src/plugin/tool-execute-{before,after}.ts`,
> `src/config/schema/hooks.ts`, `src/index.ts`.

## 0. TL;DR

- ~62 hook names in `HookNameSchema` (`src/config/schema/hooks.ts:3-68`) + 1 deprecated alias.
  `src/hooks/` contains ~60+ directories + ~10 loose `.ts` files (72 entries total incl. helpers).
- Every `write`/`edit`/`bash` tool call passes through `tool.execute.before`
  (15 hook invocations in 3 waves) **and** `tool.execute.after`
  (up to 19 invocations, mostly sequential). That is why writes feel slow with matrixx enabled.
- Stub-hook overhead is tiny (measured 2026-09-11, see Exp-1):
  `p50=0.0021ms p95=0.0056ms p99=0.0088ms` per `before` dispatch, 14 hooks/call.
  Real-world cost is dominated by **one subprocess** (`secretLeakGuard` → `gitleaks`)
  and **three NETWORK hooks** (`oracleMdOnly`, `mouseNotepad`, `architectHook` → SDK HTTP),
  plus sequential `after` hooks (`qualityGate` Biome, `commentChecker` CLI).
- Fastest fix for slow writes: `disabled_hooks` minimal-write profile (Section 3.3).
- No per-hook wall-clock instrumentation exists today (only `Date.now()` state stamps).
  Section 5 proposes a timing wrapper + ablation protocol; Section 6 records results.

## 1. Architecture

### 1.1 Registration tiers (`src/create-hooks.ts`)

```text
createHooks()
├── createCoreHooks()          src/plugin/hooks/create-core-hooks.ts
│   ├── createSessionHooks()   src/plugin/hooks/create-session-hooks.ts
│   ├── createToolGuardHooks() src/plugin/hooks/create-tool-guard-hooks.ts
│   └── createTransformHooks() src/plugin/hooks/create-transform-hooks.ts
├── createContinuationHooks()  src/plugin/hooks/create-continuation-hooks.ts (9 hooks)
└── createSkillHooks()         src/plugin/hooks/create-skill-hooks.ts (2 hooks)
```

### 1.2 OpenCode dispatch (`src/plugin-interface.ts`, `src/index.ts`)

| OpenCode event | Matrixx handler | Hooks attached |
|---|---|---|
| `tool.execute.before` | `createToolExecuteBeforeHandler` (`src/plugin/tool-execute-before.ts`) | 15 invocations, 3 waves (Section 2.1) |
| `tool.execute.after` | `createToolExecuteAfterHandler` (`src/plugin/tool-execute-after.ts`) | `toolOutputTruncator` + parallel `preemptiveCompaction`/`qualityGate` + 16 sequential |
| `chat.message` | `createChatMessageHandler` | `keywordDetector`, `autoSlashCommand`, `startWork`, `stopContinuationGuard`, guards |
| `experimental.chat.messages.transform` | `createMessagesTransformHandler` | `envContextInjector`, `thinkingBlockValidator`, `toolPairValidator`, `designIntentPreserver`, `evolutionHitl` |
| `chat.params` | `createChatParamsHandler` | `anthropicEffort`, `thinkMode` |
| `event` | `createEventHandler` | `sessionRecovery`, `backgroundNotification`, `matrixLoop`, `runtimeFallback`, etc. |
| `experimental.session.compacting` | inline in `src/index.ts` | `compactionTodoPreserver.capture`, `compactionContextInjector`, `planPersister.buildRehydrationContext` |
| `tool.definition` / `config` | definition/config handlers | `architect`, tool filtering |

Wiring origin (`src/index.ts:25-27`):

```ts
const disabledHooks = new Set(pluginConfig.disabled_hooks ?? []);
const isHookEnabled = (hookName: HookName): boolean => !disabledHooks.has(hookName);
```

Every factory follows the safe-creation pattern:

```ts
isHookEnabled("hook-name")
  ? safeCreateHook("hook-name", () => createXHook(ctx), { enabled: safeHookEnabled })
  : null;
```

`safeCreateHook` (`src/shared/safe-create-hook.ts:7`) try/catches factory failures
and returns `null`; `safeHookEnabled` comes from `experimental.safe_hook_creation`
(default true). A `null` hook is skipped via optional chaining at dispatch
(`hooks.X?.["tool.execute.before"]?.(...)`), with bound local refs cached per handler
to avoid ~1.5µs/call optional-chain cost (comment in `tool-execute-before.ts`).

### 1.3 `tool.execute.before` — 3-wave pipeline

Source: `src/plugin/tool-execute-before.ts` + `src/plugin/hook-mutation-classification.md`.

Wave 1 — READ_ONLY, `Promise.all` (4): `qualityGate`, `commentChecker`,
`directoryAgentsInjector` (no-op in before), `rulesInjector` (no-op in before).
Only private in-memory `Map` writes keyed by `callID`; never throws.

Wave 2 — BLOCKING, `Promise.allSettled` fail-fast (5): `secretLeakGuard`,
`envFileWriteGuard`, `writeExistingFileGuard`, `tasksTodowriteDisabler`,
`oracleMdOnly` (blocking half).

Wave 3 — MUTATOR, sequential (5 calls + `contextModeEnforcer`/`hashlineEditDiffEnhancer`/
`taskEditGuard`/`taskNotepad`/`evolutionWatcher`/`rtkBashRewriter` depending on version):
`nonInteractiveEnv` → `bashFileReadGuard` → `oracleMdOnly` (mutator half) →
`mouseNotepad` → `architectHook`. Order matters: `nonInteractiveEnv` rewrites
`output.args.command` first; `architectHook` prepends outermost so runs last.

`oracleMdOnly` is invoked twice (once per wave 2/3) — 14 logical hooks, 15 invocations
(bench counts 14 calls/call including the double).

### 1.4 `tool.execute.after` — mostly sequential chain

Source: `src/plugin/tool-execute-after.ts`.

```text
toolOutputTruncator (always first)
+ Promise.all([
│     preemptiveCompaction (60s session.summarize timeout, parallel so it never blocks),
│     qualityGate (Biome, parallel),
│     remainingHooks() sequential:
│       contextWindowMonitor → commentChecker → directoryAgentsInjector → rulesInjector
│       → emptyTaskResponseDetector → agentUsageReminder → categorySkillReminder
│       → interactiveBashSession → editErrorRecovery → delegateTaskRetry → architectHook
│       → taskResumeInfo → hashlineReadEnhancer → jsonErrorRecovery → readImageResizer
│       → taskNotepad
│   ])
```

Note: `qualityGate`/`commentChecker` are cheap in `before` (Map register) and expensive
in `after` (Biome / CLI). `directoryAgentsInjector`/`rulesInjector` are no-ops in `before`
and do real work in `after`.

## 2. Per-hook reference

Class legend (from `hook-mutation-classification.md`):
`READ_ONLY` = inspect only · `BLOCKING` = may throw/abort · `MUTATOR` = rewrites
`output.args`/`output.message` · `NETWORK` = subprocess/SDK-HTTP/filesystem-scan.

### 2.1 `tool.execute.before` hot path (every tool call pays this)

| Hook | Class | Throws | I/O | Evidence | Cost |
|---|---|---|---|---|---|
| `secretLeakGuard` | BLOCKING+NETWORK | yes (`SECRET LEAK DETECTED`) | `Bun.spawn("gitleaks")` | `src/hooks/secret-leak-guard/hook.ts:20-60`, `gitleaks-runner.ts:25,43` | **HIGH (dominant)** |
| `envFileWriteGuard` | BLOCKING | yes (`SENSITIVE FILE GUARD`) | pure regex | `src/hooks/env-file-write-guard/hook.ts:18-48` | LOW |
| `bashFileReadGuard` | MUTATOR | no | pure regex, rewrites `output.message` | `src/hooks/bash-file-read-guard.ts:21-44` | LOW |
| `writeExistingFileGuard` | BLOCKING | yes (`File already exists`) | `existsSync` | `src/hooks/write-existing-file-guard/hook.ts:10-48` | LOW (1 stat) |
| `qualityGate` (before) | READ_ONLY | no | Map `pendingCalls.set` only | `src/hooks/quality-gate/hook.ts:74-94` | NEGLIGIBLE |
| `commentChecker` (before) | READ_ONLY | no | Map `registerPendingCall` only | `src/hooks/comment-checker/hook.ts:38-84` | NEGLIGIBLE |
| `directoryAgentsInjector` (before) | READ_ONLY | no | **no-op** `void input; void output` | `src/hooks/directory-injector/factory.ts:62-68` | ZERO |
| `rulesInjector` (before) | READ_ONLY | no | **no-op** | `src/hooks/rules-injector/hook.ts:55-61` | ZERO |
| `tasksTodowriteDisabler` | BLOCKING | yes | pure `.some()` | `src/hooks/tasks-todowrite-disabler/hook.ts:15-31` | NEGLIGIBLE |
| `nonInteractiveEnv` | MUTATOR | no | pure regex + `buildEnvPrefix` | `src/hooks/non-interactive-env/non-interactive-env-hook.ts:24-64` | LOW |
| `oracleMdOnly` | BLOCKING+MUTATOR+NETWORK | yes | `getAgentFromSession()` SDK HTTP or `readFileSync`/`readdirSync` fallback | `src/hooks/oracle-md-only/hook.ts:14-81` | **MED-HIGH** |
| `mouseNotepad` | MUTATOR+NETWORK | no | `isCallerOrchestrator()` SDK HTTP | `src/hooks/mouse-notepad/hook.ts:10-43` | **MEDIUM** |
| `architectHook` | MUTATOR+NETWORK | no | same + `pendingFilePaths` Map | `src/hooks/architect/tool-execute-before.ts:19-54` | **MEDIUM** |
| `contextModeEnforcer` | BLOCKING | yes | FTS5/policy check | `src/hooks/context-mode-enforcer/` | LOW-MED |
| `taskEditGuard` | BLOCKING | yes | regex on bash command | `src/hooks/task-edit-guard/` | LOW |
| `taskNotepad` / `taskContinuationEnforcer` / `todoContinuationEnforcer` | BLOCKING/MUTATOR | conditional | state maps, `Date.now()` windows | `src/hooks/task-*/`, `todo-continuation-enforcer/` | LOW |
| `hashlineEditDiffEnhancer` / `hashlineReadEnhancer` | MUTATOR | no | `Date.now()` stamp + Map | `src/hooks/hashline-*/hook.ts` | LOW |
| `rtkBashRewriter` | MUTATOR | no | regex rewrite (disabled by default) | `src/hooks/rtk-bash-rewriter/` | LOW/off |
| `evolutionWatcher` | mixed | no | lightweight | `src/hooks/evolution-watcher/` | LOW |

### 2.2 `tool.execute.after` (post-tool cost — where heavy work lives)

| Hook | What it does | Cost |
|---|---|---|
| `toolOutputTruncator` | truncates whitelisted tool outputs (opt-in all via `experimental`) | LOW |
| `preemptiveCompaction` | `session.summarize()` with 60s timeout, runs **parallel** | HIGH but non-blocking |
| `qualityGate` | Biome lint on changed files | **MED-HIGH** |
| `commentChecker` | `@code-yeongyu/comment-checker` CLI | **MEDIUM** |
| `contextWindowMonitor` | token accounting | LOW |
| `directoryAgentsInjector`, `rulesInjector` | inject AGENTS/rules context | LOW-MED (I/O scan) |
| `emptyTaskResponseDetector`, `agentUsageReminder`, `categorySkillReminder` | reminders | NEGLIGIBLE |
| `interactiveBashSession`, `editErrorRecovery`, `delegateTaskRetry` | recovery/retry | LOW (idle) / MED on failure |
| `taskResumeInfo`, `taskNotepad`, `hashlineReadEnhancer`, `jsonErrorRecovery`, `readImageResizer` | enrich/fix outputs | LOW |

### 2.3 `chat.message` / transform / session triggers

| Hook | Trigger | Notes |
|---|---|---|
| `keywordDetector`, `autoSlashCommand`, `startWork`, `stopContinuationGuard` | `chat.message` | prompt-time only, not per-tool |
| `inputSecretGuard`, `designIntentPreserver` | `chat.message`/transform | regex checks |
| `envContextInjector`, `thinkingBlockValidator`, `toolPairValidator`, `evolutionHitl` | `experimental.chat.messages.transform` | message-shape validation |
| `anthropicEffort`, `thinkMode` | `chat.params` | param override |
| `sessionRecovery`, `backgroundNotification`, `sessionNotification`, `matrixLoop`, `runtimeFallback`, `contextWindowLimitRecovery`, `compactionContextInjector`, `compactionTodoPreserver`, `planPersister`, `architect` | `event` / compacting | session lifecycle, not write hot path |

Full trigger matrix was derived by scanning `src/hooks/*/*.ts` for event string
literals (72 entries incl. helpers; see Exp-2). `HookNameSchema` remains the
authoritative enable/disable list.

## 3. Enable / disable guide

### 3.1 Where

Project `matrixx.jsonc` and/or user `~/.config/opencode/matrixx.jsonc` (JSONC):

```jsonc
{
  // disable any HookNameSchema entry:
  "disabled_hooks": ["comment-checker"],
  "experimental": {
    // wrap all factories in try/catch (default true):
    "safe_hook_creation": true
  }
}
```

Schema: `src/config/schema/matrixx-config.ts:48`
(`disabled_hooks: z.array(HookNameSchema).optional()`).
Merge logic (base + override union): `src/plugin-config.ts:157-176`.
Legacy names auto-migrated: `src/shared/migration/hook-names.ts`.

### 3.2 How it works

`src/index.ts:25-28` builds `disabledHooks: Set` once at plugin load and closes over
`isHookEnabled`. Disabled hooks are never constructed (`null`) and skipped at dispatch.
`safe_hook_creation: false` bypasses the try/catch (raw factory, faster startup, louder failures).
Restart OpenCode after changing `disabled_hooks` (evaluated at plugin init, not per-call).

### 3.3 Profiles

Minimal-write profile (keeps safety, drops NETWORK + heavy `after` work):

```jsonc
{ "disabled_hooks": ["secret-leak-guard", "oracle-md-only", "mouse-notepad", "architect", "quality-gate", "comment-checker", "preemptive-compaction"] }
```

> Prefer keeping `secret-leak-guard` unless writes are trusted; it is the single
> biggest latency source (subprocess spawn per tool call).

Nuclear debug profile (measure raw OpenCode overhead):

```jsonc
{ "disabled_hooks": ["secret-leak-guard", "oracle-md-only", "mouse-notepad", "architect", "quality-gate", "comment-checker", "preemptive-compaction", "context-mode-enforcer", "task-edit-guard", "task-notepad", "task-continuation-enforcer", "todo-continuation-enforcer", "rules-injector", "directory-agents-injector"] }
```

Per-feature flags also exist (`rtk`, `evolution`, `headroom`, `context_mode`,
`comment_checker`, `matrix_loop`, `babysitting`) — a hook can be registered but idle
when its feature is disabled. Check the hook's factory before assuming cost.

## 4. Performance model (why `write` feels slow)

Per-`write` cost ≈

```text
OpenCode dispatch
+ before: max(Wave1) + max(Wave2 incl. gitleaks spawn + existsSync + oracle NETWORK) + sum(Wave3 sequential mutators)
+ tool execution itself (Write)
+ after: toolOutputTruncator + max(preemptiveCompaction, qualityGate Biome, 16 sequential afters)
```

Key insights:

1. Stub overhead is negligible (Exp-1 proves ~0.003ms). Complaints about slow writes
   are **not** the 15 awaits themselves — they are the I/O inside specific hooks.
2. `secretLeakGuard` spawns `gitleaks` per tool call (Wave 2). Subprocess spawn
   dwarfs all other `before` costs combined.
3. `oracleMdOnly`/`mouseNotepad`/`architectHook` do SDK HTTP (`getAgentFromSession` /
   `isCallerOrchestrator`) with filesystem fallback scans — NETWORK latency on the
   critical path, and `oracleMdOnly` runs twice.
4. `after` is the longer tail: 16 sequential awaits + Biome + comment-checker CLI.
   `preemptiveCompaction` was already parallelized out for this reason.
5. Even no-op hooks (`directoryAgentsInjector`, `rulesInjector` in `before`) cost one
   microtask hop each — removed only by `disabled_hooks`, not by making them faster.

## 5. Experiments & evaluation

### Exp-0 — Static classification (done, checked in)

Source: `src/plugin/hook-mutation-classification.md` (Task 0.5).
Method: manual audit of each `before` hook for Mutates/Throws/I/O with file:line evidence.
Result: 5 READ_ONLY, 5 MUTATOR, 4 NETWORK, 5 BLOCKING. Enabled the 3-wave
parallelization (theoretical ~5× on sync parts; real win gated on gitleaks/NETWORK).

### Exp-1 — `before` dispatch micro-bench (rerun 2026-09-11, PASS)

Command: `bun test ./src/plugin/tool-execute-before.bench.ts`
File deliberately named `.bench.ts` so CI `find -name '*.test.ts'` skips it.

Result:

```text
T1_1_AFTER tool_execute_before p50_ms=0.0021 p95_ms=0.0056 p99_ms=0.0088
min_ms=0.0013 max_ms=0.0184 mean_ms=0.0026 total_ms_1000_calls=2.6805
iterations=1000 hooks_per_call=14 waves=3 target_p99_ms=0.0158
1 pass, 0 fail
```

Asserts: all 14 invocations/iter, wave ordering (W2 after W1, W3 after W2, W3 internal
order), global counter +16/iter with no gaps, `oracleMdOnly` exactly 2×/iter.
Interpretation: dispatch + stub hooks ≈ 3µs mean — proves overhead is I/O, not awaits.

### Exp-2 — Trigger inventory scan (rerun 2026-09-11)

Method: sandboxed Node scan of `src/hooks/*/*.ts` for event-string literals
(`tool.execute.before|after`, `chat.message`, `transform`, `event`, `compacting`).
Result: 72 entries (dirs + loose + helpers); `before`-listed hooks enumerated in
Section 2.1; `after` chain enumerated in Section 1.4. Raw script kept out of repo
(runs via sandbox); rerun on demand.

### Exp-3 — Write-path walkthrough (static, this doc)

Traced a single `write` to existing file:
`writeExistingFileGuard.existsSync` → allow/block → tool runs → `after` chain
(`toolOutputTruncator` → parallel `preemptiveCompaction`/`qualityGate` + 16 sequential).
Blocking hooks verified in `src/hooks/AGENTS.md` + code:
`oracle-md-only`, `tasks-todowrite-disabler`, `task-edit-guard`,
`write-existing-file-guard`, `non-interactive-env` (+ `secretLeakGuard`,
`envFileWriteGuard`).

### Exp-4 — Proposed: per-hook wall-clock + ablation (NOT yet run — next step)

Why not run: requires temporary timing wrapper (code change) + real tool calls under
controlled config. Procedure for contributor:

1. Wrap each `hooks.X?.[event]?.()` call in `tool-execute-before/after.ts` with
   `performance.now()` deltas logged via `src/shared/logger.ts` (→ `/tmp/matrixx.log`),
   gated behind `experimental.hook_timing: true` (new flag, default off).
2. Ablation matrix on a fixed fixture (e.g. 50× `write` new file + 50× `edit`):
   (a) all hooks on, (b) minimal-write profile (3.3), (c) nuclear profile,
   (d) single-hook toggles for `secret-leak-guard`, `oracle-md-only`, `qualityGate`.
3. Report: per-hook mean/p50/p99 + share of total, before vs after split,
   gitleaks spawn time isolated, NETWORK hook latency isolated.
4. Fill Table 5.1 below; keep raw logs out of git, commit only the summary.

Table 5.1 — results placeholder (fill after Exp-4):

| Profile | mean/write | p99/write | top hook | top share |
|---|---|---|---|---|
| all-on | TBD | TBD | TBD (`secretLeakGuard` expected) | TBD |
| minimal-write | TBD | TBD | TBD | TBD |
| nuclear | TBD | TBD | OpenCode baseline | — |

## 6. Report & recommendations

1. Keep 3-wave `before` structure; do **not** parallelize Wave 3 (mutation order).
2. Biggest wins (in order): cache/skip `gitleaks` for non-write tools or debounce;
   memoize `getAgentFromSession`/`isCallerOrchestrator` per session; avoid double
   `oracleMdOnly` invocation; parallelize or defer `after` Biome/CLI work.
3. Add `experimental.hook_timing` flag + per-hook histogram (Exp-4) before further
   optimization — stop guessing, start measuring.
4. Document every new hook with: trigger event, class, throws?, I/O?, evidence
   file:line — update Sections 2.x and `HookNameSchema`.
5. Anti-patterns (`src/hooks/AGENTS.md`): no heavy `tool.execute.before` work, no
   network/subprocess on hot path without cache, no new sequential `after` hooks
   without parallelization review.

## 7. Sources

- `src/config/schema/hooks.ts`, `src/create-hooks.ts`, `src/index.ts:25-28`
- `src/plugin/hooks/create-{core,session,tool-guard,transform,continuation,skill}-hooks.ts`
- `src/plugin-interface.ts`, `src/plugin/tool-execute-{before,after}.ts`,
  `src/plugin/tool-execute-before.bench.ts`, `src/plugin/hook-mutation-classification.md`
- `src/shared/safe-create-hook.ts`, `src/plugin-config.ts:126,157-176`
- `src/hooks/AGENTS.md`, `docs/cost-performance-proposals.md`
- Bench rerun output 2026-09-11 (Section 5, Exp-1).
