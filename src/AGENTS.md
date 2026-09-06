# SRC KNOWLEDGE BASE

## OVERVIEW

Main plugin entry point and orchestration layer. Plugin initialization, hook registration, tool composition, and lifecycle management.

## STRUCTURE

```
src/
├── index.ts                          # Main plugin entry (106 lines) — MatrixxPlugin factory
├── create-hooks.ts                   # Hook coordination: core, continuation, skill (62 lines)
├── create-managers.ts                # Manager initialization: Tmux, Background, SkillMcp, Config (80 lines)
├── create-tools.ts                   # Tool registry + skill context composition (54 lines)
├── plugin-interface.ts               # Plugin interface assembly — 7 OpenCode hooks (66 lines)
├── plugin-config.ts                  # Config loading orchestration (user + project merge, 180 lines)
├── plugin-state.ts                   # Model cache state (context limits, anthropic 1M flag, 12 lines)
├── agents/                           # 14 AI agents (32 files) — see agents/AGENTS.md
├── cli/                              # CLI installer, doctor (107+ files) — see cli/AGENTS.md
├── config/                           # Zod schema — see config/AGENTS.md
├── features/                         # Background agents, skills, commands (20 dirs) — see features/AGENTS.md
│   ├── hooks/                            # 64 hooks (HookNameSchema, 58 dirs + loose .ts) in 3 tiers — see hooks/AGENTS.md
├── mcp/                              # Built-in MCPs (4 MCPs) — see mcp/AGENTS.md
├── plugin/                           # Plugin interface composition (21 files)
├── plugin-handlers/                  # Config loading, plan inheritance (15 files) — see plugin-handlers/AGENTS.md
├── shared/                           # Cross-cutting utilities (~85 files) — see shared/AGENTS.md
└── tools/                            # 22 tools (16 dirs + MCP, task/*, assembly, bdd-*) — see tools/AGENTS.md
```

## PLUGIN INITIALIZATION (10 steps)

1. `injectServerAuthIntoClient(ctx.client)` — Auth injection
2. `startTmuxCheck()` — Tmux availability
3. `loadPluginConfig(ctx.directory, ctx)` — User + project config merge → Zod validation
4. `createFirstMessageVariantGate()` — First message variant override gate
5. `createModelCacheState()` — Model context limits cache
6. `createManagers(...)` → 4 managers:
   - `TmuxSessionManager` — Multi-pane tmux sessions
   - `BackgroundManager` — Parallel subagent execution
   - `ConfigHandler` — Plugin config API to OpenCode
7. `createTools(...)` → `createSkillContext()` + `createAvailableCategories()` + `createToolRegistry()`
8. `createHooks(...)` → `createCoreHooks()` + `createContinuationHooks()` + `createSkillHooks()`
9. `createPluginInterface(...)` → 7 OpenCode hook handlers
10. Return plugin with `experimental.session.compacting`

## HOOK REGISTRATION (3 tiers)

**Core Hooks** (`create-core-hooks.ts`):
- Session (20): context-window-monitor, session-recovery, think-mode, matrix-loop, anthropic-effort, ...
- Tool Guard (8): comment-checker, tool-output-truncator, rules-injector, write-existing-file-guard, ...
- Transform (3): keyword-detector, context-injector, thinking-block-validator

**Continuation Hooks** (`create-continuation-hooks.ts`):
- 9 hooks: `stop-continuation-guard`, `compaction-context-injector`, `compaction-todo-preserver`, `task-continuation-enforcer` (file-backed `.matrixx/tasks`, project-scoped), `todo-continuation-enforcer` (legacy `experimental.task_system=false`), `architect`, `task-notepad`, `task-resume-info`, `plan-persister` ...

**Skill Hooks** (`create-skill-hooks.ts`):
- 2 hooks: category-skill-reminder, auto-slash-command

## PLUGIN INTERFACE (7 OpenCode handlers)

| Handler | Source | Purpose |
|---------|--------|---------|
| `tool` | filteredTools | All registered tools |
| `chat.params` | createChatParamsHandler | Anthropic effort level |
| `chat.message` | createChatMessageHandler | First message variant, session setup |
| `experimental.chat.messages.transform` | createMessagesTransformHandler | Context injection, keyword detection |
| `config` | configHandler | Agent/MCP/command registration |
| `event` | createEventHandler | Session lifecycle |
| `tool.execute.before` | createToolExecuteBeforeHandler | Pre-tool hooks |
| `tool.execute.after` | createToolExecuteAfterHandler | Post-tool hooks |

## SAFE HOOK CREATION PATTERN

```typescript
const hook = isHookEnabled("hook-name")
  ? safeCreateHook("hook-name", () => createHookFactory(ctx), { enabled: safeHookEnabled })
  : null;
```

All hooks use this pattern for graceful degradation on failure.

## TASK SYSTEM CONVENTIONS

Plan and task progress have dedicated tools — raw bash file hacks are blocked.

- Plan progress (`.matrixx/plans/*.md` `- [ ]` -> `- [x]`) -> `Read` -> `Edit` with `LINE#ID` (hashline). Never `sed`/`python3 -c` via `bash`. `plan-persister` counts `- [x]` for `todoCompleted`, this is not `T-*.json` runtime tasks.
- Task files (`.matrixx/tasks/T-*.json`) -> `task_create`/`task_update`/`task_get`/`task_list`/`task_cleanup` via `PluginInput` directory threading. Never `bash` `echo`/`cat >`/`rm`/`sed`/`python`.
- Enforcement: `task-edit-guard` hook (`tool.execute.before` on `bash` with `BLOCKED_PATTERNS`) blocks raw bash mutations to `.matrixx/plans/*.md` and `.matrixx/tasks/T-*.json`. Use `Edit` (hashline) for plans and `task_*` tools for tasks.
- `.matrixx/` is gitignored — project tasks and plans stay local per clone (per-project isolation via `getTaskDir(config, directory)`).

## ANTI-PATTERNS

| Category | Forbidden |
|----------|-----------|
| Bash plan/task hacks | `sed`/`python`/`echo >` on `.matrixx/plans` or `.matrixx/tasks` — use `Edit` (hashline) or `task_*` tools |