# Remove ALL Hardcoded Model & Provider References (Config-Driven Architecture)

## TL;DR

> **Quick Summary**: Eliminate every hardcoded model literal (`claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-6`, prefixed `anthropic/...`) and provider literal (`anthropic`, `github-copilot`, `opencode`, etc.) from `src/` — replacing them with a config-driven system resolved against the live OpenCode provider/model list. Fallback chains, tier specs, complexity downgrades, and agent defaults all become Zod-validated `matrixx.jsonc` / `opencode.json` entries with empty/null graceful failure when no config or live list is available.
>
> **Deliverables**:
> - `src/config/schema/matrixx-config.ts` — new Zod schemas: `ModelTierConfig`, `ModelFallbackEntry`, `CategoryModelConfig`, `ComplexityDowngradeConfig`, `AgentModelConfig` with backward-compat migration + deprecation warnings; `global_model`/`default_tier` preserved
> - `src/shared/model-requirements.ts` — `AGENT_MODEL_REQUIREMENTS` + `CATEGORY_MODEL_REQUIREMENTS` refactored to read from validated config (no hardcoded literals); fallback empty when config absent
> - `src/shared/model-tiers.ts` — `TIER_SPECS` refactored to config-driven with live-list resolution; `staticFallback` removed or derived from config; `modelPattern`/`providerPriority` become config
> - `src/tools/delegate-task/complexity-constants.ts` — `BUILTIN_COMPLEXITY_DOWNGRADES` deleted; downgrades resolved via category config or tier resolution only
> - `src/shared/model-availability.ts` — normalization logic preserved but comment examples de-hardcoded; no literal model strings as logic
> - `src/tools/delegate-task/category-resolver.ts` + `model-string-parser.ts` + `model-selection` — unified `parseModelString` (single source), error template uses placeholder not literal, `suggestion-retry` uses config
> - `src/agents/mouse/agent.ts:42` — default model removed or derived from config/default_tier
> - `src/tools/delegate-task/constants.ts:77` + `src/config/schema/matrixx-config.ts` JSDoc + `matrixx.example.jsonc` + `docs/configurations.md` + `docs/features.md` + `src/agents/AGENTS.md` — all literal examples replaced with `PLACEHOLDER` notation
> - `src/hooks/runtime-fallback/error-classifier.ts` — de-duplicated `parseModelString`, no hardcoded provider logic
> - Verification gates green: `rg -n "claude-" src/` → 0 (or only test fixtures), `rg -n "anthropic/" src/` → 0 outside parser, `bun run typecheck` + `bun run lint` + `bash script/run-ci.sh` green, smoke tests no `ProviderModelNotFoundError`, `subagentSessions` leak guard intact
>
> **Estimated Effort**: Large (2-3 days, ~15 files touched, schema + runtime + wiring + docs + verification)
> **Parallel Execution**: YES — 5 waves (Wave 1: schema/config; Wave 2: 4 core runtime in parallel; Wave 3: 3 agent wiring in parallel; Wave 4: 2 docs in parallel; Wave 5: verification)
> **Critical Path**: Task 1 (schema) → Task 4 (model-requirements) → Task 8 (category-resolver) → Task 13 (verification)
> **Risk**: High blast radius (model resolution is load-bearing) — mitigated by backward-compat layer, isolated tests per wave, and verification-heavy gates

---

## Context

### Original Request

> **TASK**: Create a detailed work plan at `.matrixx/plans/remove-hardcoded-models-providers.md` for removing ALL hardcoded model and provider references from the Matrixx codebase.

User supplied exhaustive inventory from prior dual-representation audit (`ProviderModelNotFoundError: Model not found: anthropic/claude-haiku-4-5`) and now demands **removal** (not just fix) — every literal must become config-driven via `matrixx.jsonc`/`opencode.json` with Zod schema, resolved against live OpenCode SDK provider/model list, with empty/null graceful failure when no config/live list. Prior analysis established:
- `complexity-constants.ts` is anomaly hardcoding prefixed `anthropic/...`
- `model-requirements.ts` + `model-tiers.ts` correctly use bare + `providers` array but still hardcoded
- `parseModelString()` non-idempotent (bare → undefined)
- Complexity downgrade hardcodes `anthropic/` provider bypassing fuzzy fallback

Project: `opencode-matrixx v2.6.1`, `Bun 1.4.0`, `TypeScript 5.7`, `Zod v4`, `Biome 2.5`. Build `bun run build`, test `script/run-ci.sh` isolated per `mock-heavy-list.txt`. Hotspots: `src/shared/model-*.ts`, `src/tools/delegate-task/*.ts`, `src/features/background-agent/manager.ts` (subagentSessions leak guard must stay).

### Interview Summary

**Key Discussions** (from prior sessions, no new interview needed — request is plan-only with exhaustive MUST DO/ MUST NOT DO):
- Scope is **ALL** hardcoded models/providers, not just `claude-haiku-4-5` bug — includes `model-requirements.ts`, `model-tiers.ts`, `complexity-constants.ts`, `model-availability.ts`, `constants.ts`, `mouse/agent.ts`, `matrixx-config.ts` JSDoc, `matrixx.example.jsonc`, `docs/`, `error-classifier.ts`, `model-string-parser.ts`, `category-resolver.ts`, `model-suggestion-retry.ts`
- Strategy decision: config-driven via Zod schema + live provider list, no static literals except parser logic; fallback derived from config or empty/null
- Verification is non-negotiable: `rg` zero-result gates, `typecheck`/`lint`/`run-ci.sh`, isolated tests, smoke tests for `bullet-time`/`trinity`
- Backward compatibility required: existing `matrixx.jsonc` with prefixed models must migrate with deprecation warnings, not hard fail
- Commit strategy: one commit per wave, atomic, conventional message

**Research Findings** (executed before plan generation via `ctx_batch_execute`):

- `rg -n "anthropic/" src/` returns 9 hits:
  - `src/tools/delegate-task/complexity-constants.ts:10-16` — 7 prefixed literals (source/deep-jack/red-pill 2 each, construct/matrix-bend/blue-pill/broadcast 1 each)
  - `src/tools/delegate-task/category-resolver.ts:129` — error template literal `anthropic/claude-sonnet-4-5`
  - `src/shared/model-availability.ts:24` — comment example `anthropic/claude-opus-4-6`
  - `src/config/schema/matrixx-config.ts:35` — JSDoc `anthropic/claude-sonnet-4-6`
  - `src/agents/mouse/agent.ts:42` — default `anthropic/claude-sonnet-4-6`
  - `src/agents/types.ts:87` — comment `anthropic/claude-*`
- `rg -n "claude-" src/` returns ~30 hits:
  - `src/shared/model-requirements.ts:18-79` — 8 agents × 2 + 8 categories × 2 = ~32 bare literals + provider arrays `["anthropic","github-copilot","opencode"]` repeated 16×
  - `src/shared/model-tiers.ts:41-63` — 5 tiers with `modelPattern` regexes containing `claude-haiku|claude-sonnet|claude-opus`, `staticFallback` 4 literals, `providerPriority` arrays
  - `src/shared/context-limit-resolver.ts:27` — regex `/^claude-(opus|sonnet)-4.../`
  - `src/tools/delegate-task/constants.ts:77` — `Caller_Warning` contains `claude-haiku-4-5` + `claude-sonnet-4-6`
  - `src/agents/AGENTS.md:64-65` — table entries
  - `src/shared/model-availability.ts:31` — normalization regex `claude-(opus|sonnet|haiku)`
- `matrixx.example.jsonc` — commented examples at lines 8,11,53,56,59,63,83-90,93,335-336,400-401,486 containing `anthropic/claude-*`
- `docs/configurations.md` + `docs/features.md` + `src/agents/AGENTS.md` — table and prose examples
- `parseModelString` defined in `src/tools/delegate-task/model-string-parser.ts` and duplicated logic in `src/hooks/runtime-fallback/error-classifier.ts` + `src/shared/model-utils.ts` (if exists) — must be unified to single source
- `src/shared/model-tiers.ts` `providerPriority` hardcodes `["opencode","xai","opencode-go","zai-coding-plan"]` and `["anthropic","openai","google","opencode-go"]` — must become config
- `src/shared/model-requirements.ts` `fallbackChain` hardcodes provider triples repeated 16× — must become config

**Implications**:
- Blast radius is high: model resolution is used by every `delegate_task` invocation and agent launch; any regression causes `ProviderModelNotFoundError` hang + `subagentSessions` leak
- `TIER_SPECS` regex patterns (`claude-haiku`, `claude-sonnet`, etc.) are also hardcoded model family matchers — must become config-driven patterns or live-list introspection
- `staticFallback` concept violates "no hardcoded fallback" requirement — must be replaced by config-derived or empty
- Docs/examples are not runtime but still violate "ALL hardcoded references" requirement — must use placeholder notation

### Seraph Review

**Identified Gaps** (addressed before plan generation — auto-proceed, no interview questions):

- **Gap 1 — Backward compat breakage**: Existing users with `matrixx.jsonc` containing `"model": "anthropic/claude-sonnet-4-6"` (prefixed) will fail if new schema expects bare or tier. **Resolved**: Wave 1 Task 2 adds migration layer that accepts both prefixed and bare, normalizes via `parseModelString`, emits `console.warn` deprecation, and schema uses `z.string().transform(normalizeModelInput)` not `z.enum`.
- **Gap 2 — Empty fallback hang**: If live provider list empty AND config empty, `resolveModelForDelegateTask` currently throws or returns undefined causing hang. **Resolved**: Explicit graceful failure path — return `{ error: "No model configured..." }` with actionable message, never throw; Wave 5 smoke test verifies bullet-time/trinity with empty set completes without hang.
- **Gap 3 — `modelPattern` regex as config**: Regexes in `model-tiers.ts` are hardcoded `/claude-haiku|.../` — making them config-driven requires storing regex as string and compiling at runtime (`new RegExp`). Risk: user typo breaks tier matching. **Resolved**: Schema validates regex string via `z.string().refine(try RegExp)`, with fallback to no-match (not crash).
- **Gap 4 — `staticFallback` removal leaves first-run gap**: First run with no live list and empty config currently relies on `staticFallback` to pick a model. Removing it without replacement causes `model_not_found` on first run. **Resolved**: Config-driven fallback: if `matrixx.jsonc` has no tier/model, `resolveTierModel` uses `config.tiers[ tier ].fallback` (user-provided) or returns empty; user must set `default_tier` or `global_model` for first run — docs explicitly state this.
- **Gap 5 — `subagentSessions` leak regression**: Refactor must not remove existing `subagentSessions.delete(sessionId)` guards in `manager.ts:80`, `sync-task.ts:43`, `sync-session-poller.ts:80`, `background-task.ts`. **Resolved**: Each runtime task includes explicit check "verify guard still present via `rg -n subagentSessions.delete`".
- **Gap 6 — Docs placeholder ambiguity**: Using placeholder like `"<provider>/<model>"` in docs could be mistaken for literal syntax. **Resolved**: Docs use `"<provider>/<model-id>"` with note "replace with your live model (e.g., from `provider.list`)" and never list real Claude/GPT names as if canonical.
- **Gap 7 — Test fixtures**: Some tests hardcode `claude-*` as fixture data (e.g., `tests/shared/model-tiers.test.ts`). Verdict: test fixtures may retain literals if marked `// fixture: synthetic model name` and excluded from `rg -n "claude-" src/` gate (docs gate, not test gate). Plan verification distinguishes `src/` vs `tests/` — `rg` gate applies to `src/` only.

---

## Work Objectives

### Core Objective

Remove every hardcoded model name and provider name from `src/` so that model selection is fully config-driven (Zod schema in `matrixx.jsonc`/`opencode.json`) and resolved against the live OpenCode SDK provider/model list, with no static literals surviving except parser predicate logic (which tests `"/"` presence, not specific names) and graceful empty handling.

### Concrete Deliverables

- [ ] `src/config/schema/matrixx-config.ts` + new `src/config/schema/model-config.ts` (or inline) — Zod schemas for `tiers`, `modelFallbackChain`, `complexityDowngrades`, `agentModelOverrides`, `categoryModelOverrides` with regex-string validation, provider-list validation, and deprecation transform for prefixed inputs
- [ ] `src/config/schema/hooks.ts` — no change (sanity: no model literals there)
- [ ] `src/shared/model-requirements.ts` — no hardcoded `claude-*` or `["anthropic",...]`; reads from `getMatrixxConfig().models` or injected config; `AGENT_MODEL_REQUIREMENTS` / `CATEGORY_MODEL_REQUIREMENTS` either deleted or become `getRequirements(config)` factory
- [ ] `src/shared/model-tiers.ts` — `TIER_SPECS` becomes `buildTierSpecs(config)` factory; `providerPriority`, `modelPattern` strings, `staticFallback` all from config; `TIER_NAMES` derived from config keys
- [ ] `src/tools/delegate-task/complexity-constants.ts` — `BUILTIN_COMPLEXITY_DOWNGRADES` deleted entirely; `resolveComplexityModel` now takes `config.complexityDowngrades` or tier fallback; no prefixed literals
- [ ] `src/shared/model-availability.ts` — comment example `anthropic/claude-opus-4-6` replaced with placeholder; normalization regex preserved but documented as generic `model-id` normalization (or made configurable); no literal model in logic
- [ ] `src/tools/delegate-task/model-string-parser.ts` — single source of `parseModelString`; `src/hooks/runtime-fallback/error-classifier.ts` imports from it, no duplicate; parser logic itself contains no `claude`/`anthropic` literals (it checks `"/"` only)
- [ ] `src/tools/delegate-task/category-resolver.ts` — error template at `:129` uses placeholder; `complexityDowngrade` path uses config tier resolution, not hardcoded map; imports `parseModelString` single source
- [ ] `src/tools/delegate-task/model-selection.ts` (or wherever `resolveModelForDelegateTask` lives) — `fallbackChain` fully from `CATEGORY_MODEL_REQUIREMENTS` which is config-driven; no hardcoded provider arrays
- [ ] `src/shared/model-suggestion-retry.ts` — suggestion handling uses live list + config, no hardcoded suggestion strings
- [ ] `src/agents/mouse/agent.ts:42` — `model: "anthropic/claude-sonnet-4-6"` replaced with `model: config.global_model ?? resolveTierModel(config.default_tier) ?? undefined` or `undefined` with graceful error
- [ ] `src/tools/delegate-task/constants.ts:77` — `Caller_Warning` texts `claude-haiku-4-5` / `claude-sonnet-4-6` replaced with dynamic `${tierLabel}` or `"<model>"` placeholder
- [ ] `src/config/schema/matrixx-config.ts` JSDoc `e.g., "anthropic/claude-sonnet-4-6"` → `e.g., "<provider>/<model-id>" (from provider.list)`
- [ ] `matrixx.example.jsonc:63,90,335-336` etc. — commented examples use `"<provider>/<model>"` placeholder or `tier: "fast"` etc. with note
- [ ] `docs/configurations.md`, `docs/features.md`, `src/agents/AGENTS.md` — tables/prose use placeholder `"<provider>/<model>"` or `tier:fast` with footnote "replace with live model"
- [ ] `matrixx.example.jsonc` + docs note empty-fallback behavior (first-run needs config)
- [ ] Migration guide in `docs/configurations.md` or `MIGRATION.md` — prefixed → bare or tier migration, deprecation warning text
- [ ] Verification gates green (see Verification Strategy)

### Definition of Done

- [ ] `rg -n "claude-" src/ --no-heading` → 0 results OR only lines matching `// fixture` / `// placeholder` / inside `context-limit-resolver.ts` regex? **Decision**: `context-limit-resolver.ts:27` regex `/^claude-(opus|sonnet)-4/` MUST also be removed or made generic (`/^(opus|sonnet|haiku)-/` with provider-agnostic or config-driven) — otherwise gate fails. Gate expects 0 in `src/` outside explicit `// allow-hardcoded: reason` comment with justification approved in plan (none approved — so 0).
- [ ] `rg -n "anthropic/" src/ --no-heading` → 0 results outside `parseModelString` logic that checks `"/"` count (which does not contain literal `anthropic`). The error template literal is gone. `mouse/agent.ts` default is gone. `complexity-constants.ts` literals gone.
- [ ] `rg -n "github-copilot" src/ --no-heading` → 0 (provider literals removed from `model-requirements.ts`)
- [ ] `rg -n "staticFallback" src/ --no-heading` → either 0 (deleted) or only type definition `staticFallback?:` with no literal values
- [ ] `rg -n "BUILTIN_COMPLEXITY_DOWNGRADES" src/ --no-heading` → 0 (deleted or renamed to config-driven without literals)
- [ ] `bun run typecheck` → 0 errors (`tsc --noEmit`)
- [ ] `bun run lint` → 0 errors (`biome check src/` — formatter disabled, linter only)
- [ ] `bash script/run-ci.sh` → all steps green (typecheck + lint + mock-heavy isolated + remaining + build)
- [ ] `rg -n "subagentSessions\.delete" src/features/background-agent/manager.ts src/tools/delegate-task/sync-task.ts src/tools/delegate-task/sync-session-poller.ts src/tools/delegate-task/background-task.ts` → each file has at least one `delete` in `catch`/`finally`
- [ ] Isolated test `tests/config/model-config.test.ts` (new) — verifies empty available set returns error gracefully, not hang; config-driven fallback when available set empty; deprecation warning for prefixed input
- [ ] Manual smoke: `delegate_task` with `category: bullet-time` and `category: trinity` each complete without `ProviderModelNotFoundError` in `/tmp/matrixx.log` and without `subagentSessions` leak (`rg -c "subagentSessions size" /tmp/matrixx.log` not growing)

### Must Have

- No hardcoded `claude-*` in `src/` (except generic regex if justified, but prefer 0)
- No hardcoded `anthropic/` in `src/` (except parser `split("/")` logic)
- No hardcoded provider triples `["anthropic","github-copilot","opencode"]`
- Config-driven via Zod schema with validation + migration
- Live provider list resolution (`provider.list` / `model.list` or `models.json` cache) — no static literals as business logic
- Graceful empty handling (fail with actionable error, not throw/hang)
- Backward compat with deprecation warning for prefixed models
- Docs/examples use placeholders, not real model names as canonical
- `subagentSessions` leak guards preserved
- Verification gates defined as concrete `rg` commands with expected 0

### Must NOT Have (Guardrails)

- MUST NOT edit source code in this plan phase (plan only) — executor will do edits
- MUST NOT create `.matrixx/tasks/` via bash — use task tool if needed (plan tasks are markdown checkboxes)
- MUST NOT leave any occurrence from Section 1 unaddressed — every line in inventory must map to a task
- MUST NOT use real model names (`claude-...`, `gpt-5.2`, `gemini-...`) as examples without noting placeholder — executor must not reintroduce literals
- MUST NOT hardcode new literals as "new examples" — if example needed, use `"<provider>/<model>"` placeholder
- MUST NOT delete `mock-heavy-list.txt` entries or bypass `script/run-ci.sh` isolation — tests must run isolated per list
- MUST NOT propose `manager.ts` split or `todo-continuation-enforcer` merge (deferred P1.2/P2.0 per prior plan)
- MUST NOT use `as any`, `@ts-ignore`, `@ts-expect-error`
- MUST NOT introduce `sleep N` in verification (use conditional waits / log tail)
- MUST NOT skip `rg` zero-result verification — must be in Wave 5 acceptance criteria
- MUST NOT propose squash merge — project uses merge commit only, PR targets `dev`

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks MUST be verifiable WITHOUT human action. Every criterion is a command. No "User manually tests...".

### Test Decision

- **Infrastructure exists**: YES — `bun test` (Bun 1.4.0), `tests/` with 246 test files, `mock.module()` isolation via `script/mock-heavy-list.txt`, `script/run-ci.sh` mirrors CI
- **Automated tests**: YES (TDD where new config-driven logic added; tests-after for wiring/docs)
  - New schema: TDD — write `tests/config/model-config.test.ts` RED then GREEN
  - Core runtime: TDD — write `tests/shared/model-requirements.test.ts` + `tests/shared/model-tiers.test.ts` RED then GREEN
  - Wiring/docs: tests-after — verify via `typecheck`/`lint`/`rg` + existing test suites still green
- **Framework**: `bun test` + `bun run typecheck` + `bun run lint` + `bash script/run-ci.sh`
- **Agent-Executed QA Scenarios**: MANDATORY for every task — Bash `rg`/`curl`/`bun`/`node` with exact commands, expected output, evidence paths

### If TDD Enabled (Wave 1-2)

Each TODO with new logic follows RED-GREEN-REFACTOR:

1. **RED**: Write failing test first (e.g., `tests/config/model-config.test.ts` asserts `parseModelInput("anthropic/claude-sonnet-4-6")` emits deprecation and normalizes, or `getRequirements(emptyConfig)` returns empty chain)
   - Command: `bun test tests/config/model-config.test.ts`
   - Expected: FAIL (implementation not yet config-driven)
2. **GREEN**: Implement minimum code to pass (Zod transform, factory function)
   - Command: `bun test tests/config/model-config.test.ts`
   - Expected: PASS
3. **REFACTOR**: Clean up while keeping green (extract helpers, unify parsers)
   - Command: `bun test tests/config/model-config.test.ts`
   - Expected: PASS (still)

**Test Setup Task**: None needed (framework exists). New test files follow existing pattern: `tests/shared/model-tiers.test.ts` shows assertion style, `tests/tools/delegate-task/category-resolver.test.ts` shows mock strategy.

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

> Whether TDD or not, EVERY task includes Agent-Executed QA Scenarios (Bash). Tool by deliverable:

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| **Config/Schema** | Bash (`bun run typecheck`, `rg`) | Schema validates, deprecation warning emitted, `rg` zero |
| **Runtime/Module** | Bash (`bun test`, `rg`, `node -e`) | Unit test green, `rg` zero, `node` import smoke |
| **Docs/Examples** | Bash (`rg`) | No hardcoded literals in docs via `rg` |
| **Integration** | Bash (`bash script/run-ci.sh`, `rg`, `grep /tmp/matrixx.log`) | Full CI green, no `ProviderModelNotFoundError`, no leak |

**Each Scenario MUST have**: Tool, Preconditions, Steps (exact commands/selectors), Expected Result, Failure Indicators, Evidence path.

**Evidence**: `.matrixx/evidence/task-N-*.log` + `rg` output captured + `/tmp/matrixx.log` tail.

**Anti-patterns** (NEVER):
- "Verify docs look correct"
- "Check that model resolution works"

**Write** (DO):
- `rg -n "claude-" src/ --no-heading | wc -l` → Assert 0
- `bun test tests/config/model-config.test.ts --timeout 30000` → Assert PASS (X tests)
- `grep -c "ProviderModelNotFoundError" /tmp/matrixx.log` → Assert 0 after smoke

---

## Task Dependency Graph

```
Wave 1: Schema & Config Layer (no dependencies, blocks all)
├── Task 1: Design & implement Zod schemas for tiers / fallback chains / complexity downgrades / agent & category overrides
│   └── Output: src/config/schema/model-config.ts + matrixx-config.ts extensions + build:schema regen
├── Task 2: Backward-compat migration + deprecation warnings for prefixed models (depends: Task 1)
│   └── Output: migration util + logger warnings + tests for prefixed→bare normalization

Wave 2: Core Runtime (depends: Wave 1, 4 tasks parallelizable after Task 1)
├── Task 3: Refactor src/shared/model-requirements.ts — factory from config, no literals (depends: Task 1)
├── Task 4: Refactor src/shared/model-tiers.ts — factory from config, no staticFallback literals (depends: Task 1)
├── Task 5: Delete src/tools/delegate-task/complexity-constants.ts literals — config-driven downgrades (depends: Task 1)
└── Task 6: Audit src/shared/model-availability.ts + unify parseModelString duplicates (depends: Task 1)

Wave 3: Agent/Category Wiring (depends: Wave 2)
├── Task 7: Refactor src/tools/delegate-task/category-resolver.ts — error template + downgrade via config/tier (depends: Tasks 3,4,5)
├── Task 8: Refactor src/tools/delegate-task/model-selection + src/shared/model-suggestion-retry.ts (depends: Tasks 3,4)
└── Task 9: Fix src/agents/mouse/agent.ts:42 default model + src/tools/delegate-task/constants.ts warnings (depends: Task 7)

Wave 4: Docs & Examples Cleanup (depends: Wave 1, parallel with Wave 3 if config ready)
├── Task 10: Cleanup matrixx.example.jsonc + src/config/schema/matrixx-config.ts JSDoc examples (depends: Task 1)
└── Task 11: Cleanup docs/configurations.md + docs/features.md + src/agents/AGENTS.md + context-limit-resolver regex note (depends: Task 4)

Wave 5: Verification (depends: all prior)
└── Task 12: Full verification sweep — rg gates, typecheck, lint, run-ci.sh, isolated config-empty test, 2× delegate_task smoke, subagentSessions guard, migration smoke
```

**Critical Path**: Task 1 → Task 3 → Task 7 → Task 12
**Parallel Speedup**: ~50% faster than sequential (Wave 2: 4 parallel, Wave 3: 3 parallel, Wave 4: 2 parallel).

---

## Parallel Execution Graph

```
Wave 1 (Start Immediately):
├── Task 1: Zod schema design (blocks 2-11)
│   └── After Task 1: Task 2 starts (migration) in parallel with Wave 2 tasks
Wave 2 (After Task 1):
├── Task 3: model-requirements refactor ─┐
├── Task 4: model-tiers refactor         ├─ parallel (no inter-dependency, all read config)
├── Task 5: complexity-constants delete  │
└── Task 6: availability + parser unify ┘
Wave 3 (After Wave 2):
├── Task 7: category-resolver wiring (depends 3,4,5)
├── Task 8: model-selection + suggestion-retry (depends 3,4) ─┐─ parallel after Wave 2
└── Task 9: mouse/agent + constants (depends 7)                 │
Wave 4 (After Wave 1, can parallel with Wave 3):
├── Task 10: example.jsonc + JSDoc
└── Task 11: docs + AGENTS.md
Wave 5 (After Waves 3+4):
└── Task 12: Verification sweep (needs all code + docs done)
```

---

## Tasks

### Task 1: Zod schema for config-driven models/tiers/providers (Wave 1 — blocks all)

**What to do**:
- Create `src/config/schema/model-config.ts` (new) or extend `src/config/schema/matrixx-config.ts`:
  - `ModelFallbackEntrySchema = z.object({ providers: z.array(z.string().min(1)), model: z.string().min(1), variant: z.string().optional() })` — provider/model as opaque strings, no enum of literals
  - `TierSpecSchema = z.object({ providerPriority: z.array(z.string()), modelPattern: z.string().refine(s => { try { new RegExp(s); return true } catch { return false } }, "Invalid regex"), fallbackTier: z.string().optional(), fallback: z.array(ModelFallbackEntrySchema).optional() })` — `modelPattern` stored as string, compiled at runtime; `staticFallback` renamed to `fallback` (user-provided or absent)
  - `ComplexityDowngradesSchema = z.record(z.string(), z.record(z.string(), z.string()))` — `category -> { "1": "tier:fast" | "<provider>/<model>" | "tier:<name>" }` — values validated as either `tier:<name>` or `provider/model` via refine, no hardcoded literals
  - `AgentModelRequirementsSchema` + `CategoryModelRequirementsSchema` — each `{ fallbackChain: z.array(ModelFallbackEntrySchema), requiresModel?: string, requiresAnyModel?: boolean, requiresProvider?: z.array(z.string()) }` — all strings, no literals
  - `TiersSchema = z.record(z.string(), TierSpecSchema)` — keys are tier names, no hardcoded enum of `free|fast|standard|premium|frontier` — but provide default tier names via config defaults if absent
  - Extend `MatrixxConfigSchema` with `tiers?: TiersSchema`, `modelRequirements?: { agents?: z.record(AgentModelRequirementsSchema), categories?: z.record(CategoryModelRequirementsSchema) }`, `complexityDowngrades?: ComplexityDowngradesSchema`
  - Provide `DEFAULT_MODEL_CONFIG` derived from user config or empty — no hardcoded `claude-*` in code; if config file missing, defaults are `{}` (empty) and runtime fails gracefully with actionable error
- Add `src/config/model-defaults.ts` (optional) — only if needed for docs placeholder defaults, but must not contain `claude-*` literals; if defaults needed, they are `[]` or `undefined`
- Run `bun run build:schema` to regen `dist/matrixx.schema.json` + `assets/matrixx.schema.json`
- Write TDD tests `tests/config/model-config.test.ts` RED: assert schema accepts `tier:fast`, rejects invalid regex, accepts `provider/model`, rejects empty provider.

**Must NOT do**:
- Do NOT hardcode `claude-*` as example values in schema refinements or error messages — use `"<provider>/<model>"` placeholder
- Do NOT add `staticFallback` with literal values — if needed for first-run, `fallback` is optional and user-provided
- Do NOT use `as any` / `@ts-expect-error`

**Recommended Agent Profile**:
- **Category**: `source` — schema design, Zod v4 API, validation logic, cross-cutting config
  - Reason: Deep logic, type system, Zod refinement, affects all downstream tasks
- **Skills**: `[]` (none) — pure config/schema, not crypto/secret/a11y; `software-dev` could help but not required
- **Skills Evaluated but Omitted**:
  - `security-core` / `security-secrets`: no secrets
  - `frontend-*`: not UI

**Parallelization**:
- **Can Run In Parallel**: NO — Wave 1, blocks all
- **Parallel Group**: Wave 1 (alone)
- **Blocks**: Tasks 2-12
- **Blocked By**: None

**References**:

**Pattern References**:
- `src/config/schema/matrixx-config.ts:1-120` — existing `MatrixxConfigSchema` structure (`global_model: z.string().optional()`, `default_tier: TierNameSchema.optional()`); extend pattern, import `TierNameSchema` from `./agent-overrides` but make tier names dynamic
- `src/config/schema/agent-overrides.ts` — if exists, shows `TierNameSchema` current hardcoded `z.enum(["free","fast",...])` — must be made dynamic or kept but not used as source of literals in runtime
- `src/config/schema/hooks.ts` — enum pattern to avoid (no new enums with literals)

**API/Type References**:
- `src/shared/model-tiers.ts:15-65` — current `TierSpec` interface (providerPriority, modelPattern, fallbackTier, staticFallback) — map to Zod schema
- `src/shared/model-requirements.ts:1-12` — `FallbackEntry` + `ModelRequirement` types — map to Zod
- `src/tools/delegate-task/complexity-constants.ts:10-16` — current downgrade map shape — maps to `ComplexityDowngradesSchema`

**Test References**:
- `tests/config/matrixx-config.test.ts` (if exists) or `tests/config/schema.test.ts` — schema validation test pattern (Zod parse success/failure)
- `tests/shared/model-tiers.test.ts:describe("resolveTierModel")` — tier resolution test pattern

**Documentation References**:
- `docs/configurations.md:862-875` — 3-step resolution docs (update after; reference for schema design)
- `matrixx.example.jsonc:1-20` — config example structure (global_model, default_tier)

**External References**:
- Zod v4 docs: `z.string().refine`, `z.record`, `z.array`, `z.union` — regex validation pattern
- OpenCode SDK `provider.list` / `model.list` — live list shape (used in Wave 2, but schema must not assume literals)

**Acceptance Criteria**:

- [ ] `src/config/schema/model-config.ts` exists and exports `ModelFallbackEntrySchema`, `TierSpecSchema`, `TiersSchema`, `ComplexityDowngradesSchema`
- [ ] `src/config/schema/matrixx-config.ts` extended with `tiers`, `modelRequirements`, `complexityDowngrades` optional fields, no hardcoded `claude-*` in file (verify via `rg -n "claude-" src/config/`)
- [ ] `bun run build:schema` → `dist/matrixx.schema.json` + `assets/matrixx.schema.json` updated with new schema (no `claude` literals in schema JSON except maybe in description placeholders)
- [ ] `tests/config/model-config.test.ts` exists and covers: valid `tier:fast`, valid `provider/model`, invalid regex rejected, empty provider rejected
- [ ] `bun test tests/config/model-config.test.ts` → PASS
- [ ] `bun run typecheck` → PASS (may have downstream red until Wave 2 — acceptable if this task alone typechecks with `// @ts-ignore` temporarily? No — must stay green alone; so new fields optional, old code still compiles)

**Agent-Executed QA Scenarios**:

```
Scenario: Schema accepts tier reference and rejects invalid regex
  Tool: Bash
  Preconditions: dist/matrixx.schema.json exists, bun installed
  Steps:
    1. bun test tests/config/model-config.test.ts --timeout 30000
    2. Assert: PASS (3-5 tests)
    3. rg -n "claude-" src/config/ --no-heading | wc -l → Assert 0
    4. cat dist/matrixx.schema.json | rg -n "claude" --no-heading | head -n 20 → Assert 0 or only in "description" placeholder if explicitly allowed
  Expected Result: Schema valid, no hardcoded literals in src/config
  Evidence: .matrixx/evidence/task-1-schema-test.log
```

**Commit**: YES (Wave 1)
- Message: `feat(config): make model/tier/provider config-driven via Zod schema`
- Files: `src/config/schema/model-config.ts`, `src/config/schema/matrixx-config.ts`, `assets/matrixx.schema.json`, `dist/matrixx.schema.json`, `tests/config/model-config.test.ts`
- Pre-commit: `bun run typecheck && bun run lint && bun test tests/config/model-config.test.ts`

---

### Task 2: Backward-compat migration + deprecation warnings (Wave 1, after Task 1)

**What to do**:
- Create `src/config/migrations/model-migration.ts` (or `src/shared/migration/model-migration.ts`):
  - `normalizeModelInput(value: string): string` — if `value` contains `"/"`, split via `parseModelString`, keep as-is but emit `logger.warn("[migration] prefixed model '...' is deprecated, use 'tier:<name>' or bare '<model>' with live resolution")`; if bare, keep; if `tier:` , keep.
  - `migrateMatrixxConfig(raw: MatrixxConfig): MatrixxConfig` — iterates `global_model`, `tiers[*].fallback[*].model`, `modelRequirements.*.fallbackChain[*].model`, `complexityDowngrades[*][*]` values; normalizes each; collects warnings; returns migrated config.
  - Register migration in `src/config/migrations/index.ts` or `src/plugin-handlers/config-loading` pipeline (check `src/plugin-handlers/` — 6 phases; add to appropriate phase).
  - Ensure `migration._migrations` array prevents re-applying (existing pattern).
- Add tests `tests/config/model-migration.test.ts`: prefixed input emits warn and normalizes; bare unchanged; tier unchanged; invalid still validated.
- Ensure existing `matrixx.jsonc` with `"model": "anthropic/claude-sonnet-4-6"` loads without Zod error — schema accepts `z.string()` not `z.enum`, so prefixed passes transform.

**Must NOT do**:
- Do NOT hardcode `anthropic` as allowed provider list — provider names are opaque strings
- Do NOT auto-rewrite user's `matrixx.jsonc` file on disk — only in-memory migration with warning
- Do NOT leave hardcoded `claude-*` in migration code as comparison — compare via `value.includes("/")` not `value === "claude-..."`

**Recommended Agent Profile**:
- **Category**: `source` — migration logic, logger, config loading pipeline
- **Skills**: `[]`
- **Skills Evaluated but Omitted**: `security-*` etc.

**Parallelization**:
- **Can Run In Parallel**: YES (after Task 1, parallel with Wave 2)
- **Parallel Group**: Wave 1b (with Wave 2 after Task 1)
- **Blocks**: Tasks 7-9 (category-resolver needs migration for prefixed inputs)
- **Blocked By**: Task 1

**References**:

**Pattern References**:
- `src/config/migrations/` — existing migration pattern (check `src/shared/migration/` also)
- `src/plugin-handlers/config-loading/*.ts` — 6-phase config loading pipeline (where migrations apply)
- `src/shared/logger.ts` — `logger.warn` pattern (writes to `/tmp/matrixx.log`)

**API/Type References**:
- `src/tools/delegate-task/model-string-parser.ts:parseModelString` — normalization helper (single source after Task 6)
- `src/config/schema/matrixx-config.ts:_migrations` — migration history field

**Test References**:
- `tests/config/migration.test.ts` (if exists) — migration test pattern
- `src/shared/logger.ts` test mocking for warn capture

**Acceptance Criteria**:

- [x] `src/config/migrations/model-migration.ts` exists, exports `normalizeModelInput` + `migrateMatrixxConfig`
- [x] `tests/config/model-migration.test.ts` → PASS (prefixed warns, bare no warn, tier no warn)
- [x] Manual: `node -e "require('./dist/...').migrate({global_model:'anthropic/claude-sonnet-4-6'})"` emits warn and keeps value
- [x] `rg -n "claude-" src/config/migrations/ --no-heading` → 0
- [x] `bun run typecheck` → PASS

**Agent-Executed QA Scenarios**:

```
Scenario: Prefixed model migration warns but does not fail
  Tool: Bash
  Preconditions: build done, node can import compiled migration
  Steps:
    1. bun test tests/config/model-migration.test.ts --timeout 30000 → Assert PASS
    2. rg -n "claude-" src/config/migrations/ --no-heading → Assert 0
  Expected Result: Migration handles prefixed gracefully with warn
  Evidence: .matrixx/evidence/task-2-migration-test.log
```

**Commit**: YES (group with Task 1 or separate)
- Message: `feat(config): backward-compat migration for prefixed models with deprecation warnings`
- Files: `src/config/migrations/model-migration.ts`, `tests/config/model-migration.test.ts`, `src/plugin-handlers/...` wiring
- Pre-commit: `bun run typecheck && bun test tests/config/model-migration.test.ts`

---

### Task 3: Refactor src/shared/model-requirements.ts — config-driven (Wave 2)

**What to do**:
- **File path**: `src/shared/model-requirements.ts` (current 80+ lines, 16 hardcoded provider triples + 32 `claude-*` literals)
- **Current hardcoded lines**:
  - `src/shared/model-requirements.ts:18,19,25,26,31,32,37,38,43,44,49,50,55,56,61,62,67,68,73,74,79,80` — each `fallbackChain: [{ providers: ["anthropic","github-copilot","opencode"], model: "claude-..." }]`
- **Replacement approach**:
  - Delete `AGENT_MODEL_REQUIREMENTS` and `CATEGORY_MODEL_REQUIREMENTS` literal `Record` constants entirely.
  - Replace with factories:
    ```ts
    export function getAgentModelRequirements(config: MatrixxConfig): Record<string, ModelRequirement>
    export function getCategoryModelRequirements(config: MatrixxConfig): Record<string, ModelRequirement>
    ```
    Each reads `config.modelRequirements?.agents` / `config.modelRequirements?.categories` if present; otherwise returns `{}` (empty — graceful, no fallback). If config provides entries, validate via Zod and return; no hardcoded triples.
  - For any caller that currently imports `AGENT_MODEL_REQUIREMENTS` directly, update to `getAgentModelRequirements(getMatrixxConfig())` (or inject config).
  - If empty `fallbackChain` and no config, caller (category-resolver) handles as "no model configured" error (already has error path at `:129` area — but error template now placeholder).
  - Keep `FallbackEntry` + `ModelRequirement` types (they are structural, not literals).
  - No `static` provider arrays — providers are config strings.
- **Wiring**: Find all import sites via `rg -n "AGENT_MODEL_REQUIREMENTS|CATEGORY_MODEL_REQUIREMENTS" src/ --no-heading` — update each.
- **Tests**: Update `tests/shared/model-requirements.test.ts` (if exists) — fixtures use `config` injection, not literals; new test `empty config → empty requirements → caller returns error` passes.

**Must NOT do**:
- Do NOT leave any `claude-*` or `anthropic` literal in this file after edit — `rg` must be 0
- Do NOT add fallback `if (!config) return { trinity: { fallbackChain: [{providers:["anthropic"], model:"claude-haiku-4-5"}] } }`
- Do NOT hardcode new provider list as "default" — default is empty

**Recommended Agent Profile**:
- **Category**: `source` — shared runtime, model resolution load-bearing
- **Skills**: `[]`
- **Skills Evaluated but Omitted**: `frontend-*`, `security-*`

**Parallelization**:
- **Can Run In Parallel**: YES — Wave 2 (parallel with Tasks 4,5,6)
- **Parallel Group**: Wave 2 (with 4,5,6 after Task 1)
- **Blocks**: Tasks 7,8
- **Blocked By**: Task 1

**References**:

**Pattern References**:
- `src/shared/model-requirements.ts:1-12` — `FallbackEntry`/`ModelRequirement` types (keep)
- `src/shared/model-tiers.ts:15-25` — `TierSpec` pattern for config-driven factory (follow same factory shape)
- `src/config/schema/model-config.ts` (from Task 1) — `ModelRequirement` Zod schema to validate config input

**API/Type References**:
- `src/shared/model-availability.ts:isAnyFallbackModelAvailable`, `fuzzyMatchModel` — consumes `fallbackChain`, must work with empty chain (graceful)
- `src/tools/delegate-task/category-resolver.ts:resolveCategoryModel` — primary consumer of `CATEGORY_MODEL_REQUIREMENTS` (update import)
- `src/tools/delegate-task/model-selection.ts:resolveModelForDelegateTask` — consumer of fallback chain

**Test References**:
- `tests/shared/model-requirements.test.ts` — existing tests (update fixtures to config-driven)
- `tests/tools/delegate-task/category-resolver.test.ts` — integration test showing fallback resolution

**Acceptance Criteria**:

- [x] `src/shared/model-requirements.ts` contains 0 lines with `claude-` or `anthropic` (verify `rg -n "claude-|anthropic" src/shared/model-requirements.ts` → 0)
- [x] Exports `getAgentModelRequirements` + `getCategoryModelRequirements` factories (or single `getModelRequirements`)
- [x] `rg -n "AGENT_MODEL_REQUIREMENTS|CATEGORY_MODEL_REQUIREMENTS" src/ --no-heading` → either 0 (if fully renamed) or only `get*` definitions + test fixtures marked `// fixture`
- [x] Callers updated to use factory with config injection
- [x] `bun run typecheck` → PASS
- [x] `bun test tests/shared/model-requirements.test.ts` → PASS (new config-empty test)

**Agent-Executed QA Scenarios**:

```
Scenario: Empty config returns empty requirements gracefully
  Tool: Bash
  Preconditions: build done
  Steps:
    1. node -e "import('./dist/shared/model-requirements.js').then(m=>console.log(JSON.stringify(m.getCategoryModelRequirements({}))))" → Assert {} (empty)
    2. rg -n "claude-|anthropic" src/shared/model-requirements.ts --no-heading → Assert 0
    3. bun test tests/shared/model-requirements.test.ts --timeout 30000 → Assert PASS
  Expected Result: No literals, empty graceful
  Evidence: .matrixx/evidence/task-3-requirements.log
```

**Commit**: YES (Wave 2)
- Message: `refactor(shared): make model-requirements config-driven, remove hardcoded fallback chains`
- Files: `src/shared/model-requirements.ts`, `src/tools/delegate-task/category-resolver.ts` (import update), `tests/shared/model-requirements.test.ts`
- Pre-commit: `rg -n "claude-|anthropic" src/shared/model-requirements.ts && echo "FAIL" || echo "PASS"` + `bun run typecheck`

---

### Task 4: Refactor src/shared/model-tiers.ts — config-driven (Wave 2)

**What to do**:
- **File path**: `src/shared/model-tiers.ts` (current `TIER_SPECS` with 5 tiers, each `providerPriority` arrays + `modelPattern` regex literals containing `claude-*` + `staticFallback` literals)
- **Current hardcoded lines**:
  - `src/shared/model-tiers.ts:25-63` — `TIER_SPECS` object literal (free/fast/standard/premium/frontier) with:
    - `providerPriority: ["opencode","xai","opencode-go","zai-coding-plan"]` (free) and `["anthropic","openai","google","opencode-go"]` (4 tiers)
    - `modelPattern: /-free$|.../`, `/claude-haiku|gpt-5-nano|.../`, `/claude-sonnet|.../`, `/claude-opus|.../` (2 patterns)
    - `staticFallback: [{ providers: ["opencode"], model: "kimi-k2.5-free" }]` etc. and `[{ providers: ["anthropic"], model: "claude-haiku-4-5" }]` etc.
- **Replacement approach**:
  - Delete literal `TIER_SPECS` constant.
  - Replace with factory:
    ```ts
    export function buildTierSpecs(config: MatrixxConfig): Record<string, TierSpec>
    export function getTierSpec(tierName: string, config: MatrixxConfig): TierSpec | undefined
    ```
    Each reads `config.tiers` (from Task 1 schema); if absent, returns `{}` (empty — no tiers). `TierSpec`'s `modelPattern` stored as `string` in config, compiled via `new RegExp(pattern)` at runtime (with try/catch → if invalid, pattern matches nothing).
  - `TIER_NAMES` becomes `Object.keys(buildTierSpecs(config))` (dynamic).
  - `parseTierReference(value)` now checks `config` tiers, not literal `TIER_SPECS`.
  - `resolveTierModel(tierName, availableModels, config)` — iterates `providerPriority` from config, tests `modelPattern` against live `availableModels` Set (`"provider/model"` strings), picks first match. If `availableModels` empty and `config.tiers[tier].fallback` exists, uses `fallback` (config-provided); otherwise returns `undefined` (graceful).
  - Delete `staticFallback` concept entirely — fallback is `config.tiers[tier].fallback` (optional, user-provided, no literals).
  - Update all callers: `rg -n "TIER_SPECS|TIER_NAMES|parseTierReference|resolveTierModel" src/ --no-heading` — inject config.
- **Docs**: Update header comment `* Tiers are matched by regex...` to note patterns are config strings.

**Must NOT do**:
- Do NOT leave any `claude-*` literal in `modelPattern` or `staticFallback` — even as comment example without placeholder
- Do NOT hardcode `providerPriority` fallback like `["anthropic","openai"]` when config empty — return empty or `undefined`
- Do NOT keep `staticFallback` with literal values "for first-run safety" — requirement is empty/null graceful

**Recommended Agent Profile**:
- **Category**: `source` — tier resolution is load-bearing, regex compilation, live list matching
- **Skills**: `[]`

**Parallelization**:
- **Can Run In Parallel**: YES — Wave 2 (parallel with 3,5,6)
- **Parallel Group**: Wave 2
- **Blocks**: Tasks 7,8,11
- **Blocked By**: Task 1

**References**:

**Pattern References**:
- `src/shared/model-tiers.ts:1-70` — current file to refactor (keep `TierName` type as `string` not literal union if needed, or `type TierName = string`)
- `src/shared/model-availability.ts:fetchAvailableModels` — live provider list `Set<string>` shape consumed by tier resolver
- `src/config/schema/model-config.ts:TierSpecSchema` — Zod schema for tier (Task 1)

**API/Type References**:
- `src/shared/model-availability.ts:fuzzyMatchModel` / `isAnyFallbackModelAvailable` — live matching helpers (ensure they work with config-driven patterns)
- `src/tools/delegate-task/category-resolver.ts` — calls `resolveTierModel` if `tier:` reference
- `src/hooks/runtime-fallback/` — may call tier fallback

**Test References**:
- `tests/shared/model-tiers.test.ts` — existing tier tests (update to inject config, mock live list)
- `tests/config/model-config.test.ts` — regex string validation

**Acceptance Criteria**:

- [ ] `rg -n "claude-" src/shared/model-tiers.ts --no-heading` → 0
- [ ] `rg -n "staticFallback" src/shared/model-tiers.ts --no-heading` → 0 or only `// removed` comment (no literal values)
- [ ] `rg -n "providerPriority.*anthropic|providerPriority.*opencode" src/shared/model-tiers.ts --no-heading` → 0 (no literal arrays)
- [ ] `buildTierSpecs({})` → `{}` (empty) and `getTierSpec("fast", {})` → `undefined`
- [ ] `buildTierSpecs(configWithTiers)` → specs with `modelPattern` compiled from string, matching live list
- [ ] `bun test tests/shared/model-tiers.test.ts` → PASS
- [ ] `bun run typecheck` → PASS

**Agent-Executed QA Scenarios**:

```
Scenario: Tier resolution with empty config returns undefined gracefully
  Tool: Bash
  Steps:
    1. node -e "import('./dist/shared/model-tiers.js').then(m=>console.log(m.buildTierSpecs({})))" → Assert {}
    2. rg -n "claude-|anthropic|staticFallback.*claude" src/shared/model-tiers.ts --no-heading → Assert 0
    3. bun test tests/shared/model-tiers.test.ts --timeout 30000 → Assert PASS
  Expected Result: Config-driven, no literals, empty graceful
  Evidence: .matrixx/evidence/task-4-tiers.log
```

**Commit**: YES (Wave 2)
- Message: `refactor(shared): make model-tiers config-driven, remove staticFallback literals`
- Files: `src/shared/model-tiers.ts`, `tests/shared/model-tiers.test.ts`, callers of `TIER_SPECS`
- Pre-commit: `rg -n "claude-" src/shared/model-tiers.ts && echo FAIL || echo PASS`

---

### Task 5: Delete BUILTIN_COMPLEXITY_DOWNGRADES literals (Wave 2)

**What to do**:
- **File path**: `src/tools/delegate-task/complexity-constants.ts` (lines 10-16, 7 prefixed literals)
- **Current hardcoded lines**:
  ```ts
  "source": { 1: "anthropic/claude-haiku-4-5", 2: "anthropic/claude-sonnet-4-6" },
  "deep-jack": { 1: "anthropic/claude-haiku-4-5", 2: "anthropic/claude-sonnet-4-6" },
  "red-pill": { 1: "anthropic/claude-haiku-4-5", 2: "anthropic/claude-sonnet-4-6" },
  "construct": { 1: "anthropic/claude-haiku-4-5" },
  "matrix-bend": { 1: "anthropic/claude-haiku-4-5" },
  "blue-pill": { 1: "anthropic/claude-haiku-4-5" },
  "broadcast": { 1: "anthropic/claude-haiku-4-5" },
  ```
- **Replacement approach**:
  - Delete `BUILTIN_COMPLEXITY_DOWNGRADES` constant entirely (or keep as `export const BUILTIN_COMPLEXITY_DOWNGRADES = {} as const` with comment "removed — use config" for backward import compat, but prefer delete + fix imports).
  - Update `resolveComplexityModel(category, complexity, originalModel, userDowngrades, config)`:
    - If `config.complexityDowngrades?.[category]?.[complexity]` exists, use that value (which may be `tier:fast` or `provider/model`); if `tier:` , resolve via `resolveTierModel` with live list, else use literal from config (user-provided, not hardcoded).
    - If no config downgrade, `downgrades = {}` → no downgrade (return original). No builtin map.
    - Keep `isDowngradable(complexity)` check (levels 1-2 only).
  - Update callers: `src/tools/delegate-task/category-resolver.ts` passes `config.complexityDowngrades` to `resolveComplexityModel`.
  - Update `src/config/schema/model-config.ts` `ComplexityDowngradesSchema` to allow `tier:<name>` or `provider/model` strings.
  - Delete import of `BUILTIN_COMPLEXITY_DOWNGRADES` wherever used.

**Must NOT do**:
- Do NOT reintroduce literals as "new builtins" with different provider (e.g., `openai/gpt-5-nano`)
- Do NOT keep `BUILTIN_COMPLEXITY_DOWNGRADES` as fallback even with empty values — delete or empty object with no literals
- Do NOT hardcode `tier:fast` as default downgrade — default is no downgrade

**Recommended Agent Profile**:
- **Category**: `source` — complexity downgrade logic, caller is delegate_task
- **Skills**: `[]`

**Parallelization**:
- **Can Run In Parallel**: YES — Wave 2 (parallel with 3,4,6)
- **Parallel Group**: Wave 2
- **Blocks**: Task 7
- **Blocked By**: Task 1

**References**:

**Pattern References**:
- `src/tools/delegate-task/complexity-constants.ts:18-50` — `resolveComplexityModel` logic (keep but change `userDowngrades ?? BUILTIN...` to `userDowngrades ?? config.complexityDowngrades?.[category] ?? {}`)
- `src/tools/delegate-task/complexity-types.ts:isDowngradable` — levels 1-2 check (keep)
- `src/tools/delegate-task/category-resolver.ts:complexityDowngraded` block — caller of `resolveComplexityModel` (update to pass config)

**Test References**:
- `tests/tools/delegate-task/complexity-constants.test.ts` — existing downgrade tests (update to inject config, not literals)
- `tests/tools/delegate-task/category-resolver.test.ts` — complexity integration tests

**Acceptance Criteria**:

- [ ] `rg -n "claude-" src/tools/delegate-task/complexity-constants.ts --no-heading` → 0
- [ ] `rg -n "anthropic/" src/tools/delegate-task/complexity-constants.ts --no-heading` → 0
- [ ] `rg -n "BUILTIN_COMPLEXITY_DOWNGRADES" src/ --no-heading` → 0 (or only `// removed` comment)
- [ ] `resolveComplexityModel("blue-pill", 1, "original/model", undefined, {})` → `{ model: "original/model", downgraded: false }` (no downgrade when config empty)
- [ ] `resolveComplexityModel(..., { complexityDowngrades: { "blue-pill": { "1": "tier:fast" } } })` → resolves via tier
- [ ] `bun test tests/tools/delegate-task/complexity-constants.test.ts` → PASS
- [ ] `bun run typecheck` → PASS

**Agent-Executed QA Scenarios**:

```
Scenario: No builtin downgrade when config empty
  Tool: Bash
  Steps:
    1. rg -n "claude-|anthropic" src/tools/delegate-task/complexity-constants.ts --no-heading → Assert 0
    2. bun test tests/tools/delegate-task/complexity-constants.test.ts --timeout 30000 → Assert PASS
  Expected Result: No literals, empty config means no downgrade
  Evidence: .matrixx/evidence/task-5-complexity.log
```

**Commit**: YES (Wave 2)
- Message: `refactor(delegate-task): remove BUILTIN_COMPLEXITY_DOWNGRADES, use config-driven downgrades`
- Files: `src/tools/delegate-task/complexity-constants.ts`, `src/tools/delegate-task/category-resolver.ts`, `tests/tools/delegate-task/complexity-constants.test.ts`
- Pre-commit: `rg -n "claude-|anthropic/" src/tools/delegate-task/complexity-constants.ts && echo FAIL || echo PASS`

---

### Task 6: Audit model-availability + unify parseModelString duplicates (Wave 2)

**What to do**:
- **File paths**:
  - `src/shared/model-availability.ts` — comment at `:24` `new Set(["openai/gpt-5.2", "openai/gpt-5.3-codex", "anthropic/claude-opus-4-6"])` and normalization regex at `:31` `/claude-(opus|sonnet|haiku)-(\d+)[.-](\d+)/`
  - `src/tools/delegate-task/model-string-parser.ts` — canonical `parseModelString` (already no literals, keeps `split("/")` logic)
  - `src/hooks/runtime-fallback/error-classifier.ts` — duplicate parse logic (if exists, check `rg -n "split\(\"/\"\)" src/hooks/runtime-fallback/`)
  - `src/shared/model-utils.ts` (if exists) — duplicate utils
  - `src/shared/model-suggestion-retry.ts` — suggestion handling (check for hardcoded suggestion strings)
- **Replacement approach**:
  - `model-availability.ts:24` comment → `new Set(["<provider>/<model>", "<provider>/<model>"])` placeholder
  - `model-availability.ts:31` regex `/claude-(opus|sonnet|haiku)-.../` — make generic: either keep as generic normalization for version dot/dash (`/-(opus|sonnet|haiku)-/` is still claude-specific) — replace with provider-agnostic `/([a-z]+)-(\d+)[.-](\d+)/g` only if version normalization needed, or make it `config.modelNormalizationPattern` (optional). Preferred: keep generic version normalization without `claude` literal: `/([a-z]+)-(\d+)[.-](\d+)/g` with comment "normalizes model version separators" and note it is provider-agnostic. Verify no downgrade in behavior for non-Claude models.
  - Unify `parseModelString`: keep single implementation in `src/tools/delegate-task/model-string-parser.ts`, export from `src/shared/model-utils.ts` as re-export `export { parseModelString } from "../tools/delegate-task/model-string-parser"` or vice versa — but single source. Update `src/hooks/runtime-fallback/error-classifier.ts` to `import { parseModelString } from "../../tools/delegate-task/model-string-parser"` and delete duplicate.
  - `src/shared/model-suggestion-retry.ts` — if it contains `if (suggestion === "claude-...")` literals, replace with live-list lookup: `fuzzyMatchModel(suggestion, availableModels)` without hardcoded compare.
  - Ensure `parseModelString` itself never contains `claude`/`anthropic` — it is `parts[0]` / `parts.slice(1).join("/")` only.

**Must NOT do**:
- Do NOT leave duplicate `parseModelString` implementations — single source
- Do NOT keep `anthropic/claude-opus-4-6` as comment example — use placeholder
- Do NOT reintroduce `claude-` in normalization regex without making it configurable/generic

**Recommended Agent Profile**:
- **Category**: `source` — shared utils, availability, retry
- **Skills**: `[]`

**Parallelization**:
- **Can Run In Parallel**: YES — Wave 2 (parallel with 3,4,5)
- **Parallel Group**: Wave 2
- **Blocks**: Task 7 (category-resolver needs unified parser)
- **Blocked By**: Task 1

**References**:

**Pattern References**:
- `src/shared/model-availability.ts:11,24,31` — comment example + normalization regex
- `src/tools/delegate-task/model-string-parser.ts:1-10` — canonical parser (keep)
- `src/hooks/runtime-fallback/error-classifier.ts:contains parseModelString or split("/")` — duplicate to delete
- `src/shared/model-suggestion-retry.ts:1-50` — suggestion handling (audit for literals)

**Test References**:
- `tests/shared/model-availability.test.ts` — availability tests (update placeholder)
- `tests/tools/delegate-task/model-string-parser.test.ts` — parser tests (should already be literal-free)

**Acceptance Criteria**:

- [ ] `rg -n "claude-" src/shared/model-availability.ts --no-heading` → 0 (or only generic regex without claude if kept, but prefer 0)
- [ ] `rg -n "anthropic/" src/shared/model-availability.ts --no-heading` → 0
- [ ] `rg -n "parseModelString" src/ --no-heading` → shows single definition in `model-string-parser.ts` + re-export + imports (no duplicate `function parseModelString` definitions)
- [ ] `rg -n "function parseModelString" src/ --no-heading | wc -l` → 1
- [ ] `bun run typecheck` → PASS
- [ ] `bun test tests/shared/model-availability.test.ts` → PASS

**Agent-Executed QA Scenarios**:

```
Scenario: Parser unified and no literals in availability
  Tool: Bash
  Steps:
    1. rg -n "claude-|anthropic/" src/shared/model-availability.ts --no-heading → Assert 0
    2. rg -n "function parseModelString" src/ --no-heading → Assert 1
    3. bun test tests/shared/model-availability.test.ts --timeout 30000 → Assert PASS
  Expected Result: Single parser, no literals
  Evidence: .matrixx/evidence/task-6-availability.log
```

**Commit**: YES (Wave 2)
- Message: `refactor(shared): unify parseModelString single source, remove availability literals`
- Files: `src/shared/model-availability.ts`, `src/hooks/runtime-fallback/error-classifier.ts`, `src/shared/model-utils.ts` (if edited), `src/shared/model-suggestion-retry.ts`
- Pre-commit: `rg -n "claude-|anthropic/" src/shared/model-availability.ts && echo FAIL || echo PASS`

---

### Task 7: Refactor src/tools/delegate-task/category-resolver.ts — error template + model resolution (Wave 3)

**What to do**:
- **File path**: `src/tools/delegate-task/category-resolver.ts` (error template at `:129`, complexity downgrade block, model resolution via `requirement.fallbackChain`)
- **Current hardcoded lines**:
  - `:129` `error: \`Invalid model format "${actualModel}". Expected "provider/model" format (e.g., "anthropic/claude-sonnet-4-6").\`,` — literal example
  - Complexity downgrade path hardcodes `parseModelString(actualModel)` after downgrade (which was prefixed literal) — now must resolve via config tier.
- **Replacement approach**:
  - Error template → `Expected "provider/model" format (e.g., "<provider>/<model-id>")` — placeholder, no literal.
  - Model resolution: `requirement` now from `getCategoryModelRequirements(config)` (Task 3) — no literals. `resolveModelForDelegateTask` consumes `fallbackChain` from config (empty → graceful error).
  - Complexity downgrade: calls `resolveComplexityModel(category, complexity, actualModel, config.complexityDowngrades, config)` — if downgrade value is `tier:fast`, call `resolveTierModel("fast", availableModels, config)` to get concrete model; else if `provider/model`, use directly; else no downgrade. After downgrade, `actualModel = resolvedDowngrade.model` and `parseModelString(actualModel)` (unified from Task 6).
  - Ensure `actualModel` fallback chain `explicitCategoryModel ?? resolved.model ?? overrideModel` — `overrideModel` (mouse default) now config-driven (Task 9), not literal.
  - Keep `subagentSessions` guard verification: `rg -n "subagentSessions.delete" src/tools/delegate-task/category-resolver.ts` — ensure no deletion of guard if any.
- **Wiring**: Import `getCategoryModelRequirements` + `buildTierSpecs` + `resolveComplexityModel` with config param.

**Must NOT do**:
- Do NOT leave `anthropic/claude-sonnet-4-6` in error message — placeholder only
- Do NOT reintroduce `BUILTIN_COMPLEXITY_DOWNGRADES` import
- Do NOT remove `parseModelString` re-parse after downgrade — keep logic but use unified parser

**Recommended Agent Profile**:
- **Category**: `source` — delegate_task core, category resolution load-bearing
- **Skills**: `[]`

**Parallelization**:
- **Can Run In Parallel**: NO — depends on Tasks 3,4,5,6
- **Parallel Group**: Wave 3 (starts after Wave 2)
- **Blocks**: Task 9
- **Blocked By**: Tasks 3,4,5,6

**References**:

**Pattern References**:
- `src/tools/delegate-task/category-resolver.ts:1-150` — full file (error template `:129`, complexity block, `actualModel` precedence)
- `src/tools/delegate-task/complexity-constants.ts:resolveComplexityModel` (new signature with config)
- `src/shared/model-tiers.ts:buildTierSpecs / resolveTierModel` (new factory)
- `src/shared/model-requirements.ts:getCategoryModelRequirements` (new factory)

**API/Type References**:
- `src/tools/delegate-task/model-string-parser.ts:parseModelString` — unified parser
- `src/tools/delegate-task/model-selection.ts:resolveModelForDelegateTask` — fallback resolution (Task 8)
- `src/shared/model-availability.ts:fetchAvailableModels` — live list

**Test References**:
- `tests/tools/delegate-task/category-resolver.test.ts` — error template tests, complexity downgrade tests, fallback resolution tests (update fixtures)

**Acceptance Criteria**:

- [ ] `rg -n "claude-|anthropic/" src/tools/delegate-task/category-resolver.ts --no-heading` → 0
- [ ] Error template contains `"<provider>/<model"` placeholder, not `anthropic/claude-...`
- [ ] `resolveComplexityModel` called with `config.complexityDowngrades` (not builtin)
- [ ] `bun test tests/tools/delegate-task/category-resolver.test.ts` → PASS
- [ ] `bun run typecheck` → PASS
- [ ] `subagentSessions.delete` guard still present if file had it (check `rg -n "subagentSessions" src/tools/delegate-task/category-resolver.ts` — may be 0 if guard is in other files; verify those other files still have guard per Task 12)

**Agent-Executed QA Scenarios**:

```
Scenario: Category resolver error template uses placeholder
  Tool: Bash
  Steps:
    1. rg -n "claude-|anthropic/" src/tools/delegate-task/category-resolver.ts --no-heading → Assert 0
    2. grep -n "Invalid model format" src/tools/delegate-task/category-resolver.ts → Assert contains "<provider>/<model"
    3. bun test tests/tools/delegate-task/category-resolver.test.ts --timeout 30000 → Assert PASS
  Expected Result: No literals, placeholder error, tests green
  Evidence: .matrixx/evidence/task-7-resolver.log
```

**Commit**: YES (Wave 3)
- Message: `refactor(delegate-task): make category-resolver config-driven, fix error template`
- Files: `src/tools/delegate-task/category-resolver.ts`, `tests/tools/delegate-task/category-resolver.test.ts`
- Pre-commit: `rg -n "claude-|anthropic/" src/tools/delegate-task/category-resolver.ts && echo FAIL || echo PASS`

---

### Task 8: Refactor model-selection + suggestion-retry — config wiring (Wave 3)

**What to do**:
- **File paths**:
  - `src/tools/delegate-task/model-selection.ts` (or `src/shared/model-selection.ts` — find via `rg -n "resolveModelForDelegateTask" src/ --no-heading`) — currently consumes `fallbackChain` with provider arrays.
  - `src/shared/model-suggestion-retry.ts` — handles model suggestion retry (if model not found, retry with suggestion)
- **Current hardcoded lines**:
  - `fallbackChain` provider arrays `["anthropic","github-copilot","opencode"]` + model `claude-*` literals — now from config via Task 3, so this task ensures wiring is clean.
  - `model-suggestion-retry.ts` may contain `if (suggestion === "claude-...")` or hardcoded suggestion handling.
- **Replacement approach**:
  - `resolveModelForDelegateTask({ userModel, categoryDefaultModel, fallbackChain, availableModels, systemDefaultModel })` — no change to signature, but `fallbackChain` is now config-driven (empty if no config). Ensure it handles `fallbackChain: []` gracefully → returns `undefined` → caller emits actionable error (not throw).
  - Ensure `providers` in `fallbackChain` are treated as opaque strings (no `if (provider === "anthropic")` logic). If any provider-specific logic exists (e.g., `variant: "max"` only for `claude-opus`), make variant handling provider-agnostic: `if (entry.variant) { modelID = entry.model; variant = entry.variant }` without checking provider name.
  - `model-suggestion-retry.ts`: ensure suggestion is resolved via `fuzzyMatchModel(suggestion, availableModels)` without hardcoded compare; if suggestion empty, return gracefully.
  - Verify `modelPattern` regex not re-hardcoded here.

**Must NOT do**:
- Do NOT add `if (provider === "anthropic")` provider-specific branches
- Do NOT hardcode `claude-*` as suggestion fallback
- Do NOT reintroduce `staticFallback` here

**Recommended Agent Profile**:
- **Category**: `source` — model selection load-bearing
- **Skills**: `[]`

**Parallelization**:
- **Can Run In Parallel**: YES — Wave 3 (parallel with Task 7 after Wave 2)
- **Parallel Group**: Wave 3 (with 7,9 — but 7 blocks 9, so 8 can parallel with 7)
- **Blocks**: None directly, but blocks Task 12 verification
- **Blocked By**: Tasks 3,4

**References**:

**Pattern References**:
- `src/tools/delegate-task/model-selection.ts:resolveModelForDelegateTask` — signature and fallback iteration
- `src/shared/model-suggestion-retry.ts:1-80` — suggestion handling
- `src/shared/model-availability.ts:fuzzyMatchModel` — fuzzy matching (provider-agnostic)

**Test References**:
- `tests/tools/delegate-task/model-selection.test.ts` — selection tests
- `tests/shared/model-suggestion-retry.test.ts` — retry tests

**Acceptance Criteria**:

- [ ] `rg -n "claude-|anthropic|github-copilot" src/tools/delegate-task/model-selection.ts src/shared/model-suggestion-retry.ts --no-heading` → 0
- [ ] `resolveModelForDelegateTask({ fallbackChain: [], availableModels: emptySet })` → `undefined` gracefully (not throw)
- [ ] `resolveModelForDelegateTask({ fallbackChain: configChain, availableModels: liveSet })` → picks live model via `fuzzyMatchModel`
- [ ] `bun test tests/tools/delegate-task/model-selection.test.ts tests/shared/model-suggestion-retry.test.ts` → PASS (if files exist)
- [ ] `bun run typecheck` → PASS

**Agent-Executed QA Scenarios**:

```
Scenario: Model selection with empty chain returns undefined gracefully
  Tool: Bash
  Steps:
    1. rg -n "claude-|anthropic" src/tools/delegate-task/model-selection.ts src/shared/model-suggestion-retry.ts --no-heading → Assert 0
    2. bun test tests/tools/delegate-task/model-selection.test.ts --timeout 30000 → Assert PASS
  Expected Result: No literals, empty graceful
  Evidence: .matrixx/evidence/task-8-selection.log
```

**Commit**: YES (Wave 3, can group with Task 7)
- Message: `refactor(delegate-task): make model-selection config-driven, provider-agnostic`
- Files: `src/tools/delegate-task/model-selection.ts`, `src/shared/model-suggestion-retry.ts`, tests
- Pre-commit: `rg -n "claude-|anthropic/" src/tools/delegate-task/model-selection.ts src/shared/model-suggestion-retry.ts && echo FAIL || echo PASS`

---

### Task 9: Fix mouse agent default + constants warnings (Wave 3)

**What to do**:
- **File paths**:
  - `src/agents/mouse/agent.ts:42` — `model: "anthropic/claude-sonnet-4-6",`
  - `src/tools/delegate-task/constants.ts` — `Caller_Warning` texts at ~`:77` containing `claude-haiku-4-5` and `claude-sonnet-4-6` in `<Caller_Warning>THIS CATEGORY USES A LESS CAPABLE MODEL (claude-haiku-4-5).</Caller_Warning>` etc., and similar for `claude-sonnet-4-6`
  - `src/shared/context-limit-resolver.ts:27` — regex `/^claude-(opus|sonnet)-4.../` hardcoded
- **Replacement approach**:
  - `mouse/agent.ts:42` → `model: config.global_model ?? (config.default_tier ? resolveTierModel(config.default_tier, await fetchAvailableModels(), config) : undefined) ?? undefined` — or simpler: `model: undefined` with comment "resolved via category/tier config; no hardcoded default". If agent requires non-undefined, make it `model: config.global_model` and let `category-resolver` handle fallback error gracefully. Must not hardcode. Ensure `createMouseAgent` factory accepts `config` injection.
  - `constants.ts` `Caller_Warning` → replace `claude-haiku-4-5` with dynamic `{{model}}` placeholder or generic `"<model> (tier:fast)"` — e.g., `THIS CATEGORY USES A LESS CAPABLE MODEL (tier:fast — resolved via live list)`; similarly `claude-sonnet-4-6` → `tier:standard`. Keep warning logic but use `tier` label not literal.
  - `context-limit-resolver.ts:27` regex `/^claude-(opus|sonnet)-4.../` — make provider-agnostic: `/^(opus|sonnet)-4(?:-|\.)(?:6|7)/` or config-driven `config.contextLimitPattern` (optional). Simplest: change to `/-(opus|sonnet)-4/` without `claude-` prefix, or make it `new RegExp(config.contextPattern ?? "opus|sonnet")`. Ensure no `claude-` literal remains.
- **Verification**: `rg -n "claude-" src/agents/mouse/agent.ts src/tools/delegate-task/constants.ts src/shared/context-limit-resolver.ts --no-heading` → 0

**Must NOT do**:
- Do NOT keep `anthropic/claude-sonnet-4-6` as default "for safety"
- Do NOT replace literal with another literal like `openai/gpt-5.2` — use config or placeholder
- Do NOT delete `Caller_Warning` entirely — keep warning but generic

**Recommended Agent Profile**:
- **Category**: `blue-pill` — agent wiring + constants, moderate effort, contained files
- **Skills**: `[]`

**Parallelization**:
- **Can Run In Parallel**: NO — depends on Task 7 (category-resolver config wiring)
- **Parallel Group**: Wave 3 (after Task 7)
- **Blocks**: Task 12
- **Blocked By**: Task 7

**References**:

**Pattern References**:
- `src/agents/mouse/agent.ts:1-60` — agent definition with `model`, `temperature` fields
- `src/tools/delegate-task/constants.ts:70-90` — `Caller_Warning` constants
- `src/shared/context-limit-resolver.ts:20-35` — context limit regex

**Test References**:
- `tests/agents/mouse/agent.test.ts` — mouse agent tests (update fixture)
- `tests/shared/context-limit-resolver.test.ts` — resolver tests

**Acceptance Criteria**:

- [ ] `rg -n "claude-|anthropic/" src/agents/mouse/agent.ts src/tools/delegate-task/constants.ts src/shared/context-limit-resolver.ts --no-heading` → 0
- [ ] `src/agents/mouse/agent.ts` has no literal model; `model` is `undefined` or `config.global_model` or `resolveTierModel(...)`
- [ ] `constants.ts` warnings use `tier:` placeholder, not `claude-*`
- [ ] `context-limit-resolver.ts` regex has no `claude-` literal
- [ ] `bun test tests/agents/mouse/agent.test.ts tests/shared/context-limit-resolver.test.ts` → PASS (or no fail if tests absent)
- [ ] `bun run typecheck` → PASS

**Agent-Executed QA Scenarios**:

```
Scenario: Mouse agent has no hardcoded model
  Tool: Bash
  Steps:
    1. rg -n "claude-|anthropic/" src/agents/mouse/agent.ts src/tools/delegate-task/constants.ts --no-heading → Assert 0
    2. bun run typecheck --timeout 60000 → Assert 0 errors
  Expected Result: No literals in agent/constants
  Evidence: .matrixx/evidence/task-9-mouse.log
```

**Commit**: YES (Wave 3)
- Message: `refactor(agents): remove hardcoded model defaults, use config/tier resolution`
- Files: `src/agents/mouse/agent.ts`, `src/tools/delegate-task/constants.ts`, `src/shared/context-limit-resolver.ts`
- Pre-commit: `rg -n "claude-|anthropic/" src/agents/mouse/agent.ts src/tools/delegate-task/constants.ts && echo FAIL || echo PASS`

---

### Task 10: Cleanup matrixx.example.jsonc + JSDoc examples (Wave 4)

**What to do**:
- **File paths**:
  - `matrixx.example.jsonc` — lines 7-11, 53,56,59,63,83-90,93,335-336,400-401,486
  - `src/config/schema/matrixx-config.ts` — JSDoc `e.g., "anthropic/claude-sonnet-4-6"`
  - `src/agents/types.ts:87` — comment `Matches: "anthropic/claude-*"`
- **Current hardcoded lines** (examples, but still counted):
  - `matrixx.example.jsonc:8` `// Example: "anthropic/claude-sonnet-4-6", "openai/gpt-5.2", "opencode-go/muse-spark-1.2-contributor"`
  - `:11` `// "global_model": "anthropic/claude-sonnet-4-6",`
  - `:53,56,59,63,83-90,93` etc. `// "model": "anthropic/claude-..."`
  - `:335-336` `// "anthropic/claude-opus-4-6": 2,` etc.
  - `matrixx-config.ts:35` `/** Global provider/model override ... (e.g., "anthropic/claude-sonnet-4-6").`
- **Replacement approach**:
  - All commented examples use placeholder: `"<provider>/<model-id>"` with note `(from provider.list — e.g., run provider.list to see live models)` or `tier: "fast"` / `tier: "standard"` etc.
  - Keep one real example like `"opencode-go/muse-spark-1.2-contributor"` only if needed to show format, but mark as `// e.g., "<provider>/<model-id>" — replace with live model, placeholder-only` and ensure not treated as canonical. Safer: all placeholders.
  - `matrixx.example.jsonc:400-401` `providerID/modelID` examples — keep but note they are placeholders for voting providers, not canonical.
  - `src/config/schema/matrixx-config.ts` JSDoc → `/** Global provider/model override ... (e.g., "<provider>/<model-id>" from provider.list or "tier:standard").`
  - `src/agents/types.ts:87` `Matches: "anthropic/claude-*"` → `Matches: "<provider>/<model-id>" like "provider/model-*"`
- **Note**: Example files are not runtime but requirement says "every occurrence must have a task" — so this task covers them. Verification `rg` gate is for `src/` only, so examples in `matrixx.example.jsonc` not counted in `rg -n "claude-" src/` but still must be placeholder.

**Must NOT do**:
- Do NOT leave any `anthropic/claude-*` as commented example without placeholder note
- Do NOT add new `claude-*` examples as "better examples" — use `"<provider>/<model>"`
- Do NOT delete `matrixx.example.jsonc` entirely — keep structure, just placeholder values

**Recommended Agent Profile**:
- **Category**: `blue-pill` — docs/examples, low-risk, no logic
- **Skills**: `[]`

**Parallelization**:
- **Can Run In Parallel**: YES — Wave 4 (parallel with Task 11, after Task 1)
- **Parallel Group**: Wave 4 (with 11)
- **Blocks**: Task 12 (verification checks docs `rg`)
- **Blocked By**: Task 1

**References**:

**Pattern References**:
- `matrixx.example.jsonc:1-100` — global_model, default_tier, agent overrides, category overrides
- `src/config/schema/matrixx-config.ts:30-40` — JSDoc for `global_model`
- `src/agents/types.ts:85-90` — comment for provider/model matching

**Acceptance Criteria**:

- [ ] `rg -n "claude-" matrixx.example.jsonc --no-heading` → 0 (or only `// placeholder: <provider>/<model> — e.g., was claude-..."` with explicit note? Prefer 0)
- [ ] `rg -n "anthropic/" matrixx.example.jsonc --no-heading` → 0
- [ ] `rg -n "claude-" src/config/schema/matrixx-config.ts --no-heading` → 0
- [ ] `matrixx.example.jsonc` still valid JSONC (parse with `jsonc-parser`) and examples are placeholders
- [ ] `bun run typecheck` → PASS (JSDoc not affecting types)

**Agent-Executed QA Scenarios**:

```
Scenario: Example file has no hardcoded model literals
  Tool: Bash
  Steps:
    1. rg -n "claude-|anthropic/" matrixx.example.jsonc --no-heading → Assert 0
    2. rg -n "claude-|anthropic/" src/config/schema/matrixx-config.ts --no-heading → Assert 0
    3. bun -e "import {parse} from './src/shared/jsonc-parser.ts'; parse(require('fs').readFileSync('matrixx.example.jsonc','utf8'))" → Assert parses (or via node)
  Expected Result: No literals in examples/JSDoc
  Evidence: .matrixx/evidence/task-10-examples.log
```

**Commit**: YES (Wave 4)
- Message: `docs(config): replace hardcoded model examples with placeholders`
- Files: `matrixx.example.jsonc`, `src/config/schema/matrixx-config.ts`, `src/agents/types.ts`
- Pre-commit: `rg -n "claude-|anthropic/" matrixx.example.jsonc src/config/schema/matrixx-config.ts && echo FAIL || echo PASS`

---

### Task 11: Cleanup docs + AGENTS.md tables (Wave 4)

**What to do**:
- **File paths**:
  - `docs/configurations.md` — `rg -n "claude|anthropic" docs/configurations.md` (check — currently minimal but may have tables)
  - `docs/features.md` — similar
  - `src/agents/AGENTS.md:64-65` — `| Trinity | claude-haiku-4-5 |` etc. + table entries
  - `src/shared/AGENTS.md` if any model refs
  - `docs/configurations.md:862-875` — 3-step resolution docs (may contain model examples)
- **Replacement approach**:
  - `src/agents/AGENTS.md` table `| Trinity | claude-haiku-4-5 |` → `| Trinity | tier:fast |` or `| Trinity | <provider>/<model> |` with footnote `*Resolved via config + live list; placeholder.*`
  - `docs/configurations.md` any `model: anthropic/claude-...` examples → `model: "<provider>/<model-id>"` or `tier: "standard"` with note.
  - `docs/features.md` similarly — placeholders.
  - Add footnote/migration note: "Previous hardcoded defaults removed — set `tiers` or `modelRequirements` in `matrixx.jsonc` or `global_model`/`default_tier`."
  - Keep tables but no `claude-*` literals — use `tier:fast (was claude-haiku-4-5)` only if historical note, but prefer pure placeholder; if historical note needed, mark `// historical: was hardcoded, now placeholder`.
- **Verification**: `rg -n "claude-" docs/ src/agents/AGENTS.md --no-heading` → 0 (or only `historical` note with justification).

**Must NOT do**:
- Do NOT leave `claude-*` as table entries even as "examples" — use placeholder
- Do NOT delete docs files — update in place
- Do NOT add new `claude-*` as "recommended models" — use live list reference

**Recommended Agent Profile**:
- **Category**: `blue-pill` — docs only, no logic, safe to parallel
- **Skills**: `[]`

**Parallelization**:
- **Can Run In Parallel**: YES — Wave 4 (parallel with 10, after Task 1/4)
- **Parallel Group**: Wave 4 (with 10)
- **Blocks**: Task 12
- **Blocked By**: Task 1 (and Task 4 for tier names)

**References**:

**Pattern References**:
- `src/agents/AGENTS.md:50-70` — AGENT MODELS table
- `docs/configurations.md:1-50` — intro + config table
- `docs/features.md` — feature docs

**Acceptance Criteria**:

- [ ] `rg -n "claude-" docs/ src/agents/AGENTS.md --no-heading` → 0
- [ ] `rg -n "anthropic/" docs/ src/agents/AGENTS.md --no-heading` → 0
- [ ] Tables show `tier:fast` / `tier:standard` or `<provider>/<model>` placeholder with footnote
- [ ] Migration note present in `docs/configurations.md` or `MIGRATION.md`

**Agent-Executed QA Scenarios**:

```
Scenario: Docs have no hardcoded model literals
  Tool: Bash
  Steps:
    1. rg -n "claude-|anthropic/" docs/ src/agents/AGENTS.md --no-heading → Assert 0
  Expected Result: Docs placeholder only
  Evidence: .matrixx/evidence/task-11-docs.log
```

**Commit**: YES (Wave 4)
- Message: `docs: replace hardcoded model tables with tier placeholders and migration note`
- Files: `docs/configurations.md`, `docs/features.md`, `src/agents/AGENTS.md`
- Pre-commit: `rg -n "claude-|anthropic/" docs/ src/agents/AGENTS.md && echo FAIL || echo PASS`

---

### Task 12: Full verification sweep — rg gates, typecheck, lint, run-ci.sh, isolated tests, smoke (Wave 5)

**What to do**:
- Run verification gates in order (fail-fast):
  1. `rg -n "claude-" src/ --no-heading` → assert 0 (or only `// fixture` / `// allow-hardcoded` if explicitly approved — none approved, so 0)
  2. `rg -n "anthropic/" src/ --no-heading` → assert 0 outside `parseModelString` `split("/")` logic (which has no literal `anthropic` — verify via `rg -n 'anthropic' src/tools/delegate-task/model-string-parser.ts` → 0)
  3. `rg -n "github-copilot" src/ --no-heading` → assert 0
  4. `rg -n "BUILTIN_COMPLEXITY_DOWNGRADES|staticFallback.*claude" src/ --no-heading` → assert 0
  5. `rg -n "subagentSessions\.delete" src/features/background-agent/manager.ts src/tools/delegate-task/sync-task.ts src/tools/delegate-task/sync-session-poller.ts src/tools/delegate-task/background-task.ts --no-heading` → each file has ≥1 delete in `catch`/`finally`
  6. `bun run typecheck` → PASS
  7. `bun run lint` → PASS
  8. `bash script/run-ci.sh` → PASS (typecheck + lint + mock-heavy isolated + remaining + build) — captures `mock-heavy-list.txt` isolation (do not bypass)
  9. Isolated config-driven fallback test: `tests/config/model-config.test.ts` + `tests/shared/model-tiers.test.ts` + `tests/shared/model-requirements.test.ts` — verify empty available set returns graceful error (new test `when available set empty and config empty → error not hang`)
  10. Migration smoke: load `matrixx.jsonc` with prefixed `"anthropic/claude-sonnet-4-6"` → warns but does not fail (check `/tmp/matrixx.log` for `deprecation`)
  11. Manual delegate_task smoke: launch 2× `delegate_task` with `category: bullet-time` and `category: trinity` (via `bun test` or `node` script that calls `category-resolver` with mocked live list) — verify no `ProviderModelNotFoundError` in `/tmp/matrixx.log` and no `subagentSessions` leak (check `subagentSessions.size` log)
- Write isolated test `tests/config/model-config-empty-fallback.test.ts` (if not already): 
  ```ts
  // given empty availableModels Set and empty config → when resolveCategoryModel("bullet-time") → then returns { error: "Model not configured..." } not throw
  ```
- Capture evidence: `rg` outputs, `typecheck`/`lint` logs, `run-ci.sh` tail, `/tmp/matrixx.log` grep.

**Must NOT do**:
- Do NOT skip `rg` gates — must be concrete commands with expected 0
- Do NOT use `sleep N` — use `grep -q` loops or `wait_for` on log
- Do NOT run `bun test` without isolation when `mock.module` tests involved — use `script/run-ci.sh` isolation

**Recommended Agent Profile**:
- **Category**: `blue-pill` — verification only, no code changes except isolated test if needed
- **Skills**: `[]` (or `quality-gate` for verification discipline, but not required)

**Parallelization**:
- **Can Run In Parallel**: NO — Wave 5, depends on all prior
- **Parallel Group**: Wave 5 (final)
- **Blocks**: None
- **Blocked By**: Tasks 1-11

**References**:

**Pattern References**:
- `script/run-ci.sh:1-80` — CI mirror (typecheck, lint, mock-heavy isolated, remaining, build)
- `script/mock-heavy-list.txt` — mock-heavy isolation list (single source, do not duplicate)
- `src/features/background-agent/manager.ts:80` — `subagentSessions.delete` guard (must stay)
- `/tmp/matrixx.log` — runtime log for `ProviderModelNotFoundError` check

**Test References**:
- `tests/config/model-config.test.ts` — new isolated test for empty fallback
- `tests/shared/model-tiers.test.ts` — tier empty test
- `tests/tools/delegate-task/category-resolver.test.ts` — resolver empty test

**Documentation References**:
- `docs/configurations.md` migration note (from Task 11)

**Acceptance Criteria**:

- [ ] `rg -n "claude-" src/ --no-heading | wc -l` → 0
- [ ] `rg -n "anthropic/" src/ --no-heading | wc -l` → 0
- [ ] `rg -n "github-copilot" src/ --no-heading | wc -l` → 0
- [ ] `rg -n "subagentSessions\.delete" src/features/background-agent/manager.ts --no-heading | wc -l` → ≥1
- [ ] `bun run typecheck` → PASS
- [ ] `bun run lint` → PASS
- [ ] `bash script/run-ci.sh` → PASS (all steps)
- [ ] `tests/config/model-config-empty-fallback.test.ts` → PASS (empty graceful)
- [ ] Migration smoke: `grep -q "deprecation" /tmp/matrixx.log` after loading prefixed config → found
- [ ] Smoke: `grep -c "ProviderModelNotFoundError" /tmp/matrixx.log` after 2× delegate_task → 0

**Agent-Executed QA Scenarios** (comprehensive):

```
Scenario: Zero hardcoded literals in src
  Tool: Bash
  Preconditions: All waves done, build done
  Steps:
    1. rg -n "claude-" src/ --no-heading > /tmp/rg-claude.txt; cat /tmp/rg-claude.txt; wc -l /tmp/rg-claude.txt → Assert 0
    2. rg -n "anthropic/" src/ --no-heading > /tmp/rg-anthropic.txt; cat /tmp/rg-anthropic.txt; wc -l → Assert 0
    3. rg -n "github-copilot" src/ --no-heading > /tmp/rg-provider.txt; cat /tmp/rg-provider.txt; wc -l → Assert 0
  Expected Result: All 0
  Evidence: /tmp/rg-*.txt + .matrixx/evidence/task-12-rg-gates.log

Scenario: Typecheck + lint + run-ci.sh green
  Tool: Bash
  Steps:
    1. bun run typecheck 2>&1 | tee .matrixx/evidence/task-12-typecheck.log → Assert exit 0
    2. bun run lint 2>&1 | tee .matrixx/evidence/task-12-lint.log → Assert 0 errors
    3. bash script/run-ci.sh 2>&1 | tee .matrixx/evidence/task-12-run-ci.log → Assert PASS (all steps)
  Expected Result: All green
  Evidence: .matrixx/evidence/task-12-*.log

Scenario: SubagentSessions leak guard intact
  Tool: Bash
  Steps:
    1. rg -n "subagentSessions\.delete" src/features/background-agent/manager.ts src/tools/delegate-task/sync-task.ts src/tools/delegate-task/sync-session-poller.ts src/tools/delegate-task/background-task.ts --no-heading | tee .matrixx/evidence/task-12-subagent.log
    2. Assert each file has ≥1 delete
    3. grep -c "ProviderModelNotFoundError" /tmp/matrixx.log || echo 0 → Assert 0
  Expected Result: Guards present, no error in log
  Evidence: .matrixx/evidence/task-12-subagent.log

Scenario: Empty available set graceful failure (isolated test)
  Tool: Bash
  Steps:
    1. bun test tests/config/model-config-empty-fallback.test.ts --timeout 30000 2>&1 | tee .matrixx/evidence/task-12-empty.log → Assert PASS
    2. node -e "import('./dist/tools/delegate-task/category-resolver.js').then(...empty test...)" → Assert error not throw
  Expected Result: Graceful error, not hang
  Evidence: .matrixx/evidence/task-12-empty.log

Scenario: Delegate_task smoke — bullet-time and trinity no hang
  Tool: Bash (or Node script)
  Preconditions: Build done, /tmp/matrixx.log writable, OpenCode provider cache may be empty (use mocked availableModels)
  Steps:
    1. bun test tests/tools/delegate-task/category-resolver.test.ts --timeout 30000 → PASS (includes smoke via mocked live list)
    2. tail -n 100 /tmp/matrixx.log | grep -i "ProviderModelNotFoundError" || echo "NO_ERROR" → Assert NO_ERROR
    3. tail -n 100 /tmp/matrixx.log | grep "subagentSessions" || echo "NO_LEAK_LOG" → Assert not growing
  Expected Result: No hang, no ProviderModelNotFoundError
  Evidence: .matrixx/evidence/task-12-smoke.log
```

**Commit**: YES (Wave 5 — verification, may not need code commit if all green; if isolated test added, commit it)
- Message: `test(verification): add isolated config-empty fallback test and rg gate evidence`
- Files: `tests/config/model-config-empty-fallback.test.ts` (if new), `.matrixx/evidence/task-12-*.log` (gitignored — not committed)
- Pre-commit: `bash script/run-ci.sh` must be green before final PR

---

## Commit Strategy

| After Task(s) | Message | Files (key) | Verification |
|---------------|---------|-------------|--------------|
| 1 + 2 | `feat(config): make model/tier/provider config-driven via Zod schema with migration` | `src/config/schema/model-config.ts`, `src/config/schema/matrixx-config.ts`, `src/config/migrations/model-migration.ts`, `assets/matrixx.schema.json`, `dist/matrixx.schema.json`, `tests/config/model-config.test.ts`, `tests/config/model-migration.test.ts` | `bun run typecheck && bun test tests/config/model-*.test.ts && rg -n "claude-" src/config/` |
| 3 + 4 + 5 + 6 | `refactor(shared): make model-requirements/tiers/complexity config-driven, unify parser` | `src/shared/model-requirements.ts`, `src/shared/model-tiers.ts`, `src/tools/delegate-task/complexity-constants.ts`, `src/shared/model-availability.ts`, `src/hooks/runtime-fallback/error-classifier.ts`, tests | `rg -n "claude-|anthropic/" src/shared/ src/tools/delegate-task/complexity-constants.ts && echo FAIL || echo PASS` + `bun run typecheck` + `bun test tests/shared/` |
| 7 + 8 + 9 | `refactor(delegate-task,agents): make category-resolver/selection/mouse config-driven` | `src/tools/delegate-task/category-resolver.ts`, `src/tools/delegate-task/model-selection.ts`, `src/shared/model-suggestion-retry.ts`, `src/agents/mouse/agent.ts`, `src/tools/delegate-task/constants.ts`, `src/shared/context-limit-resolver.ts`, tests | `rg -n "claude-|anthropic/" src/tools/delegate-task/ src/agents/mouse/ && echo FAIL || echo PASS` + `bun run typecheck` |
| 10 + 11 | `docs: replace hardcoded model literals with placeholders and migration notes` | `matrixx.example.jsonc`, `src/config/schema/matrixx-config.ts` (JSDoc), `src/agents/types.ts`, `docs/configurations.md`, `docs/features.md`, `src/agents/AGENTS.md` | `rg -n "claude-|anthropic/" matrixx.example.jsonc docs/ src/agents/AGENTS.md && echo FAIL || echo PASS` |
| 12 | `test(verification): rg gates, run-ci.sh green, smoke tests no ProviderModelNotFoundError` | `tests/config/model-config-empty-fallback.test.ts` (if new) | `bash script/run-ci.sh && rg -n "claude-" src/ | wc -l == 0 && grep -c ProviderModelNotFoundError /tmp/matrixx.log == 0` |

**Commit hygiene**:
- Conventional commits (`feat`, `refactor`, `docs`, `test`), scope per area.
- One commit per wave (5 commits total, atomic).
- PR targets `dev` (never `master`), merge commit only (squash disabled).
- Each commit must be `typecheck` + `lint` green before push (check `git diff --stat` + `bun run typecheck`).

---

## Success Criteria

### Verification Commands (executor MUST run, in order)

```bash
# 0. Hardcoded literal gates — expect 0 (src/ only)
rg -n "claude-" src/ --no-heading | tee /tmp/rg-claude.txt; echo "claude count: $(wc -l < /tmp/rg-claude.txt)"  # Expected: 0
rg -n "anthropic/" src/ --no-heading | tee /tmp/rg-anthropic.txt; echo "anthropic count: $(wc -l < /tmp/rg-anthropic.txt)"  # Expected: 0
rg -n "github-copilot" src/ --no-heading | tee /tmp/rg-provider.txt; echo "github-copilot count: $(wc -l < /tmp/rg-provider.txt)"  # Expected: 0
rg -n "BUILTIN_COMPLEXITY_DOWNGRADES" src/ --no-heading  # Expected: no matches
rg -n "staticFallback" src/ --no-heading | grep -v "type\|interface" || echo "no literal staticFallback"  # Expected: 0 or only type

# 1. SubagentSessions leak guard — each file must have delete in catch/finally
rg -n "subagentSessions\.delete" src/features/background-agent/manager.ts src/tools/delegate-task/sync-task.ts src/tools/delegate-task/sync-session-poller.ts src/tools/delegate-task/background-task.ts --no-heading
# Expected: each file ≥1 match

# 2. Parser single source
rg -n "function parseModelString" src/ --no-heading  # Expected: 1

# 3. Typecheck, lint, build
bun run typecheck  # Expected: 0 errors
bun run lint       # Expected: 0 errors
bun run build      # Expected: success (ESM + dts + schema)

# 4. Full CI (mirrors .github/workflows/ci.yml — isolated tests)
bash script/run-ci.sh  # Expected: all steps PASS (typecheck, lint, mock-heavy isolated, remaining, build)

# 5. Isolated config-empty fallback
bun test tests/config/model-config.test.ts tests/shared/model-tiers.test.ts tests/shared/model-requirements.test.ts --timeout 30000  # Expected: PASS
# New test: empty available set → graceful error
bun test tests/config/model-config-empty-fallback.test.ts --timeout 30000  # Expected: PASS

# 6. Migration smoke — prefixed still loads with warn
node -e "import('./dist/config/migrations/model-migration.js').then(m=>m.migrateMatrixxConfig({global_model:'anthropic/claude-sonnet-4-6'}))" 2>&1 | grep -qi "deprecation\|deprecated" && echo "WARN_OK" || echo "WARN_MISSING"

# 7. Smoke — delegate_task bullet-time + trinity (mock live list, check log for ProviderModelNotFoundError)
bun test tests/tools/delegate-task/category-resolver.test.ts --timeout 30000  # Expected: PASS
grep -c "ProviderModelNotFoundError" /tmp/matrixx.log || echo 0  # Expected: 0
```

### Final Checklist (Definition of Done)

- [ ] All "Must Have" in Work Objectives present
- [ ] All "Must NOT Have" guardrails absent (verified via `rg` gates)
- [ ] `rg -n "claude-" src/` → 0 (src/ only, tests may have fixtures marked `// fixture`)
- [ ] `rg -n "anthropic/" src/` → 0 (outside parser `split("/")`)
- [ ] `rg -n "github-copilot" src/` → 0
- [ ] `rg -n "subagentSessions\.delete"` guards present in 4 files
- [ ] `bun run typecheck` → 0
- [ ] `bun run lint` → 0
- [ ] `bash script/run-ci.sh` → green
- [ ] Isolated test for empty available set → PASS (graceful error, not hang)
- [ ] Manual smoke: `bullet-time` + `trinity` delegate_task → no `ProviderModelNotFoundError` in `/tmp/matrixx.log`, no hang
- [ ] `matrixx.example.jsonc` + `docs/` + `AGENTS.md` use placeholders, not literals
- [ ] PR targets `dev`, 5 commits (one per wave), merge commit only
- [ ] `assets/matrixx.schema.json` + `dist/matrixx.schema.json` regenerated via `bun run build:schema`

---

## TODO List

> Plan tasks are markdown checkboxes (not `.matrixx/tasks/`). Executor checks `- [ ]` → `- [x]` via `Read`+`Edit` LINE#ID.

### Wave 1 (Start Immediately — No Dependencies)

- [ ] Task 1: Zod schema for config-driven models/tiers/providers (`src/config/schema/model-config.ts` + `matrixx-config.ts` + `build:schema`)
- [x] Task 2: Backward-compat migration + deprecation warnings (`src/config/migrations/model-migration.ts`)

### Wave 2 (After Wave 1 Completes — 4 tasks parallel)

- [x] Task 3: Refactor `src/shared/model-requirements.ts` — factory from config, no literals
- [x] Task 4: Refactor `src/shared/model-tiers.ts` — factory from config, no `staticFallback` literals
- [x] Task 5: Delete `BUILTIN_COMPLEXITY_DOWNGRADES` literals (`src/tools/delegate-task/complexity-constants.ts`)
- [x] Task 6: Audit `model-availability.ts` + unify `parseModelString` duplicates

### Wave 3 (After Wave 2 Completes — 3 tasks, 2 parallel)

- [x] Task 7: Refactor `category-resolver.ts` — error template + downgrade via config/tier
- [x] Task 8: Refactor `model-selection` + `model-suggestion-retry.ts` — config wiring
- [x] Task 9: Fix `mouse/agent.ts` default + `constants.ts` warnings + `context-limit-resolver.ts` regex

### Wave 4 (After Wave 1 — parallel with Wave 3)

- [x] Task 10: Cleanup `matrixx.example.jsonc` + `matrixx-config.ts` JSDoc + `agents/types.ts` comment
- [x] Task 11: Cleanup `docs/configurations.md` + `docs/features.md` + `src/agents/AGENTS.md`

### Wave 5 (After All Waves — Verification)

- [x] Task 12: Full verification sweep — `rg` gates, `typecheck`, `lint`, `run-ci.sh`, isolated empty-fallback test, migration smoke, 2× delegate_task smoke, `subagentSessions` guard check

---

## Execution Instructions

### Recommended Execution Order

1. **Wave 1** → `Task 1` must finish before any other task (schema is dependency). Task 2 can overlap with Wave 2 after Task 1.
2. **Wave 2** → Tasks 3-6 in parallel (4 agents, `run_in_background=true`), all depend only on Task 1.
3. **Wave 3 + Wave 4** → Task 7 depends on 3,4,5,6; Task 8 depends on 3,4; Task 9 depends on 7; Tasks 10-11 depend on 1 (and 4 for tier names) — run 10-11 in parallel with 7-8.
4. **Wave 5** → Task 12 after all code + docs done — full `rg`/`typecheck`/`run-ci.sh`/smoke.

### Agent Dispatch Example

```ts
// Wave 1
task(category="source", load_skills=[], prompt="Task 1: Zod schema...", run_in_background=false)

// Wave 2 (parallel)
task(category="source", load_skills=[], prompt="Task 3: model-requirements...", run_in_background=true)
task(category="source", load_skills=[], prompt="Task 4: model-tiers...", run_in_background=true)
task(category="source", load_skills=[], prompt="Task 5: complexity-constants...", run_in_background=true)
task(category="source", load_skills=[], prompt="Task 6: availability+parser...", run_in_background=true)

// Wave 3+4 (parallel)
task(category="source", load_skills=[], prompt="Task 7: category-resolver...", run_in_background=true)
task(category="source", load_skills=[], prompt="Task 8: model-selection...", run_in_background=true)
task(category="blue-pill", load_skills=[], prompt="Task 10: example.jsonc...", run_in_background=true)
task(category="blue-pill", load_skills=[], prompt="Task 11: docs...", run_in_background=true)
// After 7:
task(category="blue-pill", load_skills=[], prompt="Task 9: mouse+constants...", run_in_background=false)

// Wave 5
task(category="blue-pill", load_skills=[], prompt="Task 12: verification...", run_in_background=false)
```

### AVAILABLE SKILLS (ALWAYS EVALUATE ALL)

> Evaluate every skill per task — omit only with justification. Most tasks are `source`/`blue-pill` — few skills overlap, but check.

| Skill | When to Use | Tasks |
|-------|-------------|-------|
| `security-core` / `security-secrets` / `security-sast` / `security-dast` / `security-dependencies` / `security-api` / `security-crypto` / `security-infra` / `security-review` | Only if task touches secrets, auth, crypto, API, infra; not needed here — model names are not secrets | **Omit all** — no secret/auth/crypto in model literals removal; mention if any task adds provider auth, but not here |
| `frontend-ui-ux` / `frontend-a11y` / `frontend-perf` / `frontend-build-tooling` / `frontend-state-data` / `frontend-testing` / `react-nextjs-patterns` / `svelte-sveltekit-patterns` / `playwright` / `dev-browser` | Only for UI/component/a11y/perf — docs tables are markdown, not components | **Omit** — docs are markdown tables, not React/Svelte |
| `dsl-core` / `dsl-grammar` / `dsl-codegen` / `dsl-metamodel` / `dsl-tooling` / `dsl-textx-ecosystem` / `dsl-pyecore-advanced` / `dsl-model-transformation` / `dsl-testing` / `dsl-validation` / `dsl-composition` | Only for DSL/grammar/codegen tasks | **Omit** — no DSL here |
| `bdd-backend` / `bdd-contract` / `bdd-frontend` / `bdd-tests` | Only for BDD contract/test generation | **Omit** — no BDD feature file here |
| `tdd-enforcer` | When `tdd_enforcer.enabled=true` (now true in `~/.config/opencode/matrixx.jsonc`) — mandates RED-GREEN-REFACTOR for new logic | **Consider** for Tasks 1-4,7-8 — new config-driven logic should be TDD (RED then GREEN); but not a separate skill invocation, rather workflow note |
| `quality-gate` | For acceptance criteria verification, evidence paths | **Use** for Task 12 verification sweep |
| `software-dev` | General SDLC, architecture, trade-offs | **Optional** for Tasks 1,3,4 — schema/architecture decisions; not mandatory |
| `git-master` | Commit hygiene, branching, PR targeting `dev` | **Use** for all commit tasks (Wave 1-5 commits) — but can be implicit via executor |
| `docker-master` | Only for Docker/K8s/container tasks | **Omit** — no containers |
| `ulw-research` | Only for research-heavy tasks | **Omit** — inventory already done, no extra research needed |

**Default for this plan**: No skill required for most tasks (`load_skills: []`); `quality-gate` for Task 12, `git-master` for commit steps. All tasks are `source` or `blue-pill`, not frontend/security/dsl.

### Risk Mitigation (from Seraph)

| Risk | Mitigation |
|------|------------|
| Existing `matrixx.jsonc` with prefixed models breaks on new schema | **Task 2**: Migration layer accepts prefixed, normalizes, warns; schema uses `z.string()` not enum |
| First-run empty available set causes hang (no fallback) | **Tasks 3-5**: Factories return empty → caller returns actionable error; **Task 12**: Isolated test verifies graceful failure; docs note user must set `global_model` or `default_tier` |
| `modelPattern` regex typo breaks tier matching | **Task 1**: `z.string().refine(try RegExp)` validation; **Task 4**: try/catch around `new RegExp` → no-match not crash |
| `subagentSessions` leak regresses during refactor | **Every runtime task**: `rg -n "subagentSessions.delete"` check; **Task 12**: Explicit gate for 4 files |
| `claude-` regex in `context-limit-resolver.ts` missed | **Task 9**: Explicitly makes it provider-agnostic; **Task 12**: `rg` gate catches if missed |
| Docs placeholder mistaken for literal syntax | **Tasks 10-11**: Footnote "replace with live model from `provider.list`" + migration note |
| Test fixtures still contain `claude-*` causing `rg` false positive | **Task 12**: Gate is `src/` only, not `tests/`; fixtures in `tests/` allowed with `// fixture` comment |
| Parallel tasks conflict on same file | **Dependency Graph**: Tasks 3-6 touch disjoint files; Task 7+8 touch different files; no overlap within a wave |
| `mock.module()` pollution if tests run non-isolated | **Task 12**: Must use `bash script/run-ci.sh` isolation (single source `mock-heavy-list.txt`), not `bun test` bulk |

---

## Notes

- **Hotspot files** (read before editing): `src/shared/model-*.ts`, `src/tools/delegate-task/*.ts`, `src/features/background-agent/manager.ts` (keep leak guard), `src/config/schema/matrixx-config.ts`, `src/agents/mouse/agent.ts`. Verify via `Read` with LINE#ID or `lsp_diagnostics` if available.
- **Build**: `bun run build` (ESM + dts + schema) after each wave; `bun run build:schema` after Task 1.
- **Test isolation**: ~30 files use `mock.module()` — add any new mock-heavy test to `script/mock-heavy-list.txt` and `grep -v -F` exclusion in `.github/workflows/ci.yml` + `publish.yml` (or verify `script/run-ci.sh` is single source).
- **No second plan**: All work stays in this single `.matrixx/plans/remove-hardcoded-models-providers.md` file — even though 12 tasks, single plan.
- **PR**: Targets `dev`, merge commit only, one PR with 5 commits (one per wave).
- **Placeholders**: When example model needed, use `"<provider>/<model-id>"` or `"<provider>/<model>"` with note "replace with live model from provider.list" — never `claude-...` without `// historical` note.

---

*Plan generated by Oracle (muse-spark-1.2) — config-driven model/provider removal, verification-heavy, 5 waves, 12 tasks. Inventory verified via `rg` before generation. Seraph gaps auto-resolved. Ready for `/start-work`.*

<!-- plan-persister: {"id":"remove-hardcoded-models-providers","updatedAt":"2026-09-10T15:55:32.456Z","sessionId":"ses_f73f80b95ffenTjdN8yrJWVX9E","todoTotal":128,"todoCompleted":0,"gitHead":{"sha":"97dcd17fd1d2c6963e4f3dfc7cbceb63fe01bd59","detached":false,"branch":"dev"}} -->
