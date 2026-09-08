# PROJECT KNOWLEDGE BASE

**Version:** 2.6.1 (package.json) · OpenCode plugin SDK `@opencode-ai/plugin` v1.3.15 · Bun-types 1.3.6

---

## CRITICAL: PULL REQUEST TARGET BRANCH (NEVER DELETE THIS SECTION)

> **THIS SECTION MUST NEVER BE REMOVED OR MODIFIED**

### Git Workflow

```
master (deployed/published)
   ↑
  dev (integration branch)
   ↑
feature branches (your work)
```

### Rules (MANDATORY)

| Rule | Description |
|------|-------------|
| **ALL PRs → `dev`** | Every pull request MUST target the `dev` branch |
| **NEVER PR → `master`** | PRs to `master` are **automatically rejected** by CI |
| **"Create a PR" = target `dev`** | When asked to create a new PR, it ALWAYS means targeting `dev` |
| **Merge commit ONLY** | Squash merge is **disabled** in this repo. Always use merge commit when merging PRs. |

### Why This Matters

- `master` = production/published npm package
- `dev` = integration branch where features are merged and tested
- Feature branches → `dev` → (after testing) → `master`
- Squash merge is disabled at the repository level — attempting it will fail

**If you create a PR targeting `master`, it WILL be rejected. No exceptions.**

---

## CRITICAL: OPENCODE SOURCE CODE REFERENCE (NEVER DELETE THIS SECTION)

> **THIS SECTION MUST NEVER BE REMOVED OR MODIFIED**

### This is an OpenCode Plugin

Matrixx is a **plugin for OpenCode**. You will frequently need to examine OpenCode's source code to:
- Understand plugin APIs and hooks
- Debug integration issues
- Implement features that interact with OpenCode internals
- Answer questions about how OpenCode works

### How to Access OpenCode Source Code

**When you need to examine OpenCode source:**

1. **Clone to system temp directory:**
   ```bash
   git clone https://github.com/sst/opencode /tmp/opencode-source
   ```

2. **Explore the codebase** from there (do NOT clone into the project directory)

3. **Clean up** when done (optional, temp dirs are ephemeral)

### Librarian Agent: YOUR PRIMARY TOOL for Plugin Work

**CRITICAL**: When working on plugin-related tasks or answering plugin questions:

| Scenario | Action |
|----------|--------|
| Implementing new hooks | Fire `librarian` to search OpenCode hook implementations |
| Adding new tools | Fire `librarian` to find OpenCode tool patterns |
| Understanding SDK behavior | Fire `librarian` to examine OpenCode SDK source |
| Debugging plugin issues | Fire `librarian` to find relevant OpenCode internals |
| Answering "how does OpenCode do X?" | Fire `librarian` FIRST |

**DO NOT guess or hallucinate about OpenCode internals.** Always verify by examining actual source code via `librarian` or direct clone.

---

## CRITICAL: ENGLISH-ONLY POLICY (NEVER DELETE THIS SECTION)

> **THIS SECTION MUST NEVER BE REMOVED OR MODIFIED**

### All Project Communications MUST Be in English

| Context | Language Requirement |
|---------|---------------------|
| **GitHub Issues** | English ONLY |
| **Pull Requests** | English ONLY (title, description, comments) |
| **Commit Messages** | English ONLY |
| **Code Comments** | English ONLY |
| **Documentation** | English ONLY |
| **AGENTS.md files** | English ONLY |

**If you're not comfortable writing in English, use translation tools. Broken English is fine. Non-English is not acceptable.**

---

## OVERVIEW

Matrixx is a multi-agent orchestration **plugin for OpenCode**. 14 built-in agents (Morpheus, Sati, Sentinel, Cipher, etc.) via 64 lifecycle hooks and 22 custom tools. ~960 TS source files, 246 test files.

| Aspect | Value |
|---|---|
| Package | `opencode-matrixx` (npm, v2.6.1) |
| Entry | `src/index.ts` → `MatrixxPlugin` |
| Stack | Bun 1.4.0 + TypeScript 5.7 + Zod v4 + Biome 2.5 (linter only) |
| License | SUL-1.0 |

## STRUCTURE

```
matrixx/
├── src/
│   ├── index.ts                    # MatrixxPlugin factory — never export functions from here
│   ├── create-hooks.ts             # Core + Continuation + Skill hook tiers
│   ├── create-managers.ts          # Tmux / Background / SkillMcp / Config managers
│   ├── create-tools.ts             # Tool registry + skill context composition
│   ├── plugin-config.ts            # Config load + Zod validation
│   ├── plugin-state.ts             # Model context-limit cache
│   ├── agents/   → 14 agents + AGENTS.md
│   ├── hooks/    → 64 hooks (HookNameSchema, 58 dirs + loose .ts) in 3 tiers
│   ├── tools/    → 22 dirs (LSP, AST-grep, delegate-task, bdd-*, handoff, etc.)
│   ├── features/ → 18 dirs (background-agent, skills, commands, handoff, CC compat)
│   ├── shared/   → 80+ utilities (logger → /tmp/matrixx.log)
│   ├── mcp/      → 4 built-in MCPs (websearch, context7, grep_app, document-reader)
│   ├── cli/      → installer, doctor, config-manager
│   ├── config/   → Zod schema
│   ├── plugin/   → hook composition (create-core/continuation/skill-hooks)
│   └── plugin-handlers/ → config-loading pipeline (6 phases)
├── bin/                            # Platform-detecting CLI wrappers
├── script/                         # build-schema, build-binaries, publish, run-ci.sh
├── packages/                       # 7 platform + 4 baseline binary packages
├── .opencode/                      # Local OpenCode config (commands, skills)
├── docs/                           # Long-form docs (configurations.md ~50k)
└── dist/                           # Build output (ESM + .d.ts + schema)
```

Per-area `AGENTS.md` in `src/`, `src/agents/`, `src/hooks/`, `src/tools/`, `src/features/`, `src/shared/`, `src/config/`, `src/plugin-handlers/`, `src/mcp/` — read when working in that area.

## QUICK COMMANDS

```bash
BUN_INSTALL_ALLOW_SCRIPTS="@ast-grep/napi" bun install  # required — postinstall hangs without it
bun run typecheck                   # tsc --noEmit
bun run lint                        # biome check src/  (formatter disabled)
bun run lint:fix                    # biome check --write src/
bun test                            # all tests — but see isolation gotcha below
bun run build                       # ESM + dts + schema (build:plugin + build:cli + tsc + build:schema)
bun run build:schema                # regenerate dist/matrixx.schema.json + assets/matrixx.schema.json
bun run rebuild                     # clean + build
bash script/run-ci.sh               # full CI locally (typecheck + lint + isolated tests + build)
```

Local-dev install: `bun run build`, then add `"plugin": ["file:///abs/path/to/matrixx/dist/index.js"]` to `~/.config/opencode/opencode.jsonc` and restart OpenCode.

## GOTCHAS

**`BUN_INSTALL_ALLOW_SCRIPTS` required** — `@ast-grep/napi` postinstall fails/hangs without `BUN_INSTALL_ALLOW_SCRIPTS="@ast-grep/napi"`.

**Bun pinned to 1.4.0** — in `.bun-version` and all `bun-version:` entries in `.github/workflows/ci.yml`, `publish.yml`, `morpheus-agent.yml`. Never use `latest`. To upgrade: bump `.bun-version` + all workflow entries, test locally.

**Mock-heavy isolation** — ~30 files use `mock.module()` and pollute Bun's module cache. CI runs them isolated (one `bun test` per file/dir). When adding a new `mock.module()` test, add it to **both** `.github/workflows/ci.yml` and `publish.yml` in the mock-heavy list **and** the `grep -v -F` exclusion in the `find | xargs bun test` catch-all. Source of truth: `script/run-ci.sh` — never duplicate the exclusion list elsewhere. Verify via `bash script/run-ci.sh` or `act pull_request -j test`.

**Task system is execution substrate** — `experimental.task_system=true` (default since v2.5) uses file-backed `.matrixx/tasks/T-{uuid}.json` (project-scoped via `getTaskDir()`, atomic `tmp+renameSync`, `task-continuation-enforcer` with 30s lock). `todo-continuation-enforcer` is legacy fallback only when `task_system=false`. Never mutate `.matrixx/tasks/` via bash/`sed`; use `task_create/update/get/list/cleanup` tools. `.matrixx/plans/*.md` checkbox `- [ ]`→`- [x]` via `Read`+`Edit` LINE#ID only (blocked by `task-edit-guard` + `compaction-todo-preserver`).

`bunfig.toml` preloads `tests/test-setup.ts` → `_resetForTesting()` before each test.

## PLUGIN INIT — `src/index.ts` (10 steps)

1. `injectServerAuthIntoClient` 2. `startTmuxCheck` 3. `loadPluginConfig` (Zod) 4. `createFirstMessageVariantGate` 5. `createModelCacheState` 6. `createManagers` (4) 7. `createTools` 8. `createHooks` (3 tiers) 9. `createPluginInterface` (8 handlers + `experimental.session.compacting`) 10. Return plugin

**Never export functions from `src/index.ts`** — OpenCode treats every export as a plugin instance. Only re-export types (see file footer).

## WHERE TO ADD NEW X

| Task | Location | Notes |
|------|----------|-------|
| New agent | `src/agents/<name>.ts` | Add to `agentSources` in `src/agents/builtin-agents.ts`; update `BuiltinAgentNameSchema` in `src/config/schema/agent-names.ts` |
| New hook | `src/hooks/<name>/` | Add to `HookNameSchema` in `src/config/schema/hooks.ts`; register in `src/plugin/hooks/create-{core,continuation,skill}-hooks.ts` |
| New tool | `src/tools/<name>/` | Register in `src/plugin/tool-registry.ts` (needs `index, types, constants, tools` structure) |
| New MCP | `src/mcp/` | Add to `createBuiltinMcps()` |
| New built-in skill | `src/features/builtin-skills/skills/` | Export from `skills/index.ts`; add to `createBuiltinSkills()` |
| New command | `src/features/builtin-commands/` | Add template + register in `commands.ts` |
| Schema field | `src/config/schema/` | Run `bun run build:schema` → regenerates `dist/` and `assets/matrixx.schema.json` |
| User-facing skill | `.opencode/skills/<name>/SKILL.md` | Loaded by OpenCode session — not the plugin |

## OPENCODE PLUGIN API (`@opencode-ai/plugin` v1.3.15)

`Plugin = async (PluginInput) => Hooks`

| Handler | Can Block | Purpose |
|---|---|---|
| `tool` | — | All registered tools |
| `chat.message` | yes | Intercept user message (variant, session setup) |
| `chat.params` | no | Modify LLM params (effort, temp, topP) |
| `tool.execute.before` | yes | Pre-tool interception |
| `tool.execute.after` | no | Post-tool processing |
| `event` | no | Session lifecycle |
| `config` | — | Register agents / MCPs / commands |
| `experimental.chat.messages.transform` | no | Context injection, keyword detection |
| `experimental.session.compacting` | no | Task/todo preservation on compaction |

Safe-creation: `isHookEnabled("name") ? safeCreateHook("name", () => createHook(ctx), { enabled: safeHookEnabled }) : null`.

## TDD

Mandatory when `tdd_enforcer.enabled=true` (now enabled in `~/.config/opencode/matrixx.jsonc`). `*.test.ts` alongside source → BDD comments `//#given` `//#when` `//#then` → fail → implement → pass → refactor. Never delete failing tests. See `tdd-enforcer` skill + `docs/tdd.md`. When disabled, skill is stripped from `availableSkills` and Oracle still generates test decision but execution is not enforced.

## CONVENTIONS

- **Bun only** — `npm`/`yarn` forbidden. `bun-types` 1.3.6, never `@types/node`.
- **Biome 2.5** — linter on, formatter off. Only `src/**/*.ts` (`biome.json`).
- **Build** — `bun build` (ESM, target bun) + `tsc --emitDeclarationOnly` + `build:schema`.
- **Exports** — barrel via `index.ts`, type-only re-exports preferred.
- **Naming** — kebab-case dirs, `createXXXHook` / `createXXXTool` factories.
- **File size** — 200 LOC hard limit (prompt strings exempt).
- **Temperature** — 0.1 for code agents, max 0.3.
- **Parallelism** — never sequential `task()` calls; use `run_in_background=true` and collect via `background_output`.
- **Git** — no `git add -i`, `rebase -i`, `--no-verify`, no force push without request.

## ANTI-PATTERNS

| Category | Forbidden |
|---|---|
| Type safety | `as any`, `@ts-ignore`, `@ts-expect-error` |
| Error handling | Empty `catch(e) {}` |
| Testing | Deleting failing tests, impl before test |
| Hooks | Heavy `PreToolUse` — runs on every tool call |
| File ops in code | `mkdir`/`touch`/`rm`/`cp`/`mv` in TS — use bash tool |
| Catch-all files | `utils.ts`/`helpers.ts` |
| Bash | `sleep N` (use conditional waits); `cd dir && cmd` (use `workdir`) |
| Publishing | `bun publish` directly — CI only, never bump version locally |

## AGENTS (14 via `BuiltinAgentNameSchema`)

`agentSources` in `src/agents/builtin-agents.ts` lists 13; `oracle` built dynamically in `plugin-handlers/agent-config-handler.ts`. `mouse` via `createMouseAgentWithOverrides`; `OpenCode-Builder` when `morpheus_agent.default_builder_enabled`. See `src/agents/AGENTS.md` for model/temperature/fallback chains.

## DEPLOYMENT

1. Feature branch → PR to `dev` (CI: typecheck + lint + isolated tests + build)
2. Merge to `dev` → `draft-release` creates `next` draft
3. Release: `gh workflow run publish -f bump=patch|minor|major` (`skip_platform=true` skips natives)
4. `master` auto-updated by publish workflow; schema auto-committed to `assets/matrixx.schema.json`

Never `bun publish` or bump `package.json` version locally.

## CONFIG

- Zod schema in `src/config/schema/` → project `matrixx.json`/`.jsonc` → user `~/.config/opencode/matrixx.json` → defaults
- JSONC via `jsonc-parser` — use `src/shared/jsonc-parser.ts`, not `JSON.parse`
- Legacy auto-migrated by `src/shared/migration/`

## MCP (2 tiers)

1. Built-in `src/mcp/`: `websearch`, `context7`, `grep_app`, `document-reader`
2. Plugin-config / user-configured MCPs

## HOTSPOTS

`background-agent/manager.ts` + `features/task-storage/` + `task-continuation-enforcer/` (file-backed `.matrixx/tasks/T-{uuid}.json`, atomic write, 30s stale lock) · `todo-continuation-enforcer/` (legacy, gated by `experimental.task_system=false`) · `context-window-limit-recovery/` · `architect/` · `matrix-loop/` · `keyword-detector/` · `rules-injector/` · `think-mode/` · `session-recovery/` · `task-edit-guard`

## NOTES

- OpenCode SDK `>= 1.0.150`
- Trusted deps: `@ast-grep/cli`, `@ast-grep/napi`, `@code-yeongyu/comment-checker`
- Platform packages: 7 + 4 baseline (glibc x86_64)
- Logger: `src/shared/logger.ts` → `/tmp/matrixx.log`
- Local dev state: `.matrixx/` (handoff, notepads), `UNIQUE_BRANCH_MARKER.md` — gitignored
- Flaky: `matrix-loop` (timeout), `session-state` (parallel pollution)
- Project skills: `github-issue-triage`, `github-pr-triage`
- Sati skills: `frontend-ui-ux`, `dev-browser`, `playwright`, `software-dev`, `quality-gate`
