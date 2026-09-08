# PLUGIN-HANDLERS KNOWLEDGE BASE

## OVERVIEW

Configuration orchestration layer. Runs once at plugin init — transforms raw OpenCode config into resolved agent/tool/permission structures via 6-phase sequential loading.

## STRUCTURE
```
plugin-handlers/
├── config-handler.ts                  # Main orchestrator (45 lines) — 6-phase loading
├── agent-config-handler.ts            # Agent loading pipeline (197 lines)
├── plan-model-inheritance.ts          # Plan demotion logic (28 lines)
├── oracle-agent-config-builder.ts # Oracle config builder (99 lines)
├── plugin-components-loader.ts        # OpenCode plugin component loading (stub, returns empty)
├── provider-config-handler.ts         # Provider config + model context limits cache
├── tool-config-handler.ts             # Permission migration (101 lines)
├── mcp-config-handler.ts              # Builtin + CC + plugin MCP merge
├── command-config-handler.ts          # Command/skill parallel discovery
├── category-config-resolver.ts        # Category lookup
├── agent-priority-order.ts            # Agent ordering (morpheus, keymaker, oracle, architect first)
├── plan-model-inheritance.test.ts     # 3696 lines of tests
├── config-handler.test.ts             # 1061 lines of tests
└── index.ts                           # Barrel exports
```

## CONFIG LOADING FLOW (6 phases, sequential)

1. `applyProviderConfig` → Cache model context limits, detect anthropic-beta headers
2. `loadPluginComponents` → Load OpenCode plugin components (stub, returns empty)
3. `applyAgentConfig` → Load all agents, `morpheus`/`oracle`/`plan` demotion, `tdd_enforcer` stripped from `availableSkills` if disabled, `task_system` gating for `Mouse` vs legacy todos
4. `applyToolConfig` → Agent-specific tool permissions (grep_app, task, teammate)
5. `applyMcpConfig` → Merge builtin + plugin MCPs
6. `applyCommandConfig` → Merge builtin + user + project + opencode commands/skills

## PLAN MODEL INHERITANCE

When `morpheus_agent.planner_enabled === true`:
1. Oracle config → extract model settings (model, variant, temperature, ...)
2. Apply user `agents.plan` overrides (plan override wins)
3. Set `mode: "subagent"` (plan becomes subagent, not primary)
4. Strip prompt/permission/description (only model settings inherited)

## AGENT LOADING ORDER

1. Builtin agents (morpheus, keymaker, oracle, ...)
2. Mouse (if morpheus enabled)
3. OpenCode-Builder (if `default_builder_enabled`)
4. Oracle (if `planner_enabled`)
5. User agents → Project agents → Plugin agents → Custom agents

**Reordered** by `reorderAgentsByPriority()`: morpheus, keymaker, oracle, architect first.

## TOOL PERMISSIONS

| Agent | Special Permissions |
|-------|---------------------|
| operator | grep_app_* allowed |
| architect | task, task_*, teammate allowed |
| morpheus | task, task_*, teammate, question allowed |
| keymaker | task, question allowed |
| construct | Denies task, look_at |

## INTEGRATION

Created in `create-managers.ts`, exposed as `config` hook in `plugin-interface.ts`. OpenCode calls it during session init.
