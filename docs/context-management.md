# Context Management in Matrixx

Matrixx orchestrates five complementary layers for context management, L0 Native plus L1 RTK plus L2 context-mode plus L3 DCP plus L4 Headroom, with zero overlap and less than 10ms Matrixx bridge overhead. Each layer owns a distinct slice of the context lifecycle, from bash output to tool sandboxing to pruning to network proxy compression. Together they prevent out-of-memory failures, keep per-turn context lean, and let agents work longer without losing coherence. For background and cost analysis see [cost-performance proposals](cost-performance-proposals.md) P6 (RTK), P7 (context-mode), and P16 (Headroom).

## Table of Contents

- [1. Overview — 5-Layer Complementarity](#1-overview--5-layer-complementarity)
- [2. External Plugins](#2-external-plugins)
  - [2.1 RTK — Bash Output Compression](#21-rtk--bash-output-compression)
  - [2.2 context-mode — Tool Output Sandboxing](#22-context-mode--tool-output-sandboxing)
  - [2.3 DCP — Dynamic Context Pruning](#23-dcp--dynamic-context-pruning)
  - [2.4 Headroom — Network-Proxy Compression](#24-headroom--network-proxy-compression)
- [3. Native Hooks](#3-native-hooks)
- [4. Skills and Quality Gates](#4-skills-and-quality-gates)
- [5. Configuration Reference](#5-configuration-reference)
- [6. Verification and Troubleshooting](#6-verification-and-troubleshooting)
- [7. See Also](#7-see-also)

---

## 1. Overview — 5-Layer Complementarity

Every layer handles one concern and delegates the rest. The result is orthogonal reduction, no double compression, no contention.

| Layer | Owner | Mechanism | Reduction | Config Key | Hook / Tool |
|-------|-------|-----------|-----------|------------|-------------|
| L0 Native | Matrixx | 70% warning, 78% preemptive compaction, anthropic recovery, output truncators | Prevents OOM, keeps headroom | `experimental.*`, `disabled_hooks` | `context-window-monitor`, `preemptive-compaction`, `compaction-*`, `tool-output-truncator` |
| L1 RTK | `rtk-ai/rtk` | Bash output rewrite via filtering, grouping, deduplication | 60-90% on bash | `rtk` | `rtk-bash-rewriter` (`tool.execute.before`) |
| L2 context-mode | `mksglu/context-mode` | FTS5 sandbox, `ctx_*` tools, Think-in-Code | Up to 98% tool output | `context_mode` (`enabled`/`enforce`/`blocked_tools`) + external `plugin: ["context-mode"]` | `ctx_batch_execute`, `ctx_execute`, `ctx_search`, `ctx_stats`, `compress` + `context-mode-enforcer` hook |
| L3 DCP | `@tarquinen/opencode-dcp` | Profile-tiered pruning `economy` to `ultimate` | Tiered, see profiles | `dcp` | `/dcp-profile`, `dcp_switch_profile` |
| L4 Headroom | `headroomlabs-ai/headroom` | Proxy `CacheAligner` to `ContentRouter` to `CCR` | 60-95% JSON, 15-20% coding | `headroom` | `headroom wrap opencode`, `headroom_retrieve` |

Notes: bridge overhead stays below 10ms, layers are orthogonal (RTK is bash, L2 is sandbox, L3 is pruning, L4 is proxy, L0 is warnings and compaction), and you can enable any subset. Minimal is L0 plus L2, add L1 for bash heavy sessions, L3 for long runs, L4 for proxy compression.

---

## 2. External Plugins

### 2.1 RTK — Bash Output Compression

#### What is RTK?

RTK is a Rust CLI from [rtk-ai/rtk](https://github.com/rtk-ai/rtk) (69.8k stars) that rewrites bash commands before they run. It recognizes 70 plus patterns across git, npm, cargo, test runners, linters, and build tools, then applies filtering, grouping, and deduplication so the LLM sees a compact summary instead of raw verbose output.

```bash
# Without RTK: ~2000 tokens
$ git status
On branch main
Changes not staged for commit:
  modified:   src/config.ts
  modified:   src/hooks/index.ts
  ... (50 more lines)

# With RTK: ~200 tokens
$ rtk git status
2 files changed: src/config.ts, src/hooks/index.ts
```

#### How It Works

Hook runs on `tool.execute.before` for `bash`:

1. LLM requests `git status`.
2. Hook rewrites to `rtk git status` via `Bun.spawn([binary, "rewrite", command])`.
3. Exit `0` or `3` means rewrite succeeded, other codes fall through.
4. Binary returns compressed output (60 to 90 percent smaller).

Silent on missing binary, original command passes through.

#### Performance Impact

| Metric | Value |
|--------|-------|
| Overhead | 10 to 20ms per bash command (subprocess spawn) |
| Token savings | 60 to 90% on matched bash patterns |
| Net benefit | Significant for sessions with frequent git, test, or build commands |

#### Installation

```bash
# macOS
brew install rtk-ai/tap/rtk

# Linux (curl)
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/main/install.sh | bash

# Verify
rtk --version
```

Requires the `rtk` binary on PATH or at a configured `binary_path`.

#### Configuration

RTK is disabled by default (opt in). Configure in `matrixx.jsonc`:

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/klpanagi/opencode-matrixx/refs/heads/dev/dist/matrixx.schema.json",
  "rtk": {
    "enabled": true,                          // default: false
    "binary_path": "/usr/local/bin/rtk",      // optional, defaults to "rtk" on PATH
    "timeout_ms": 5000                        // optional, 1000 to 30000, default 5000
  }
}
```

Defaults come from `src/config/schema/rtk.ts`:

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `enabled` | boolean | `false` | Opt in |
| `binary_path` | string | `undefined` | When omitted, resolves `rtk` from PATH |
| `timeout_ms` | number | `5000` | Integer, 1000 to 30000 |

#### Verification

```bash
rtk --version
# Enable in matrixx.jsonc, restart OpenCode, then run a bash tool:
# git status  -> output should arrive as the RTK compressed summary
```

If you see raw verbose output, check `binary_path` and that `rtk --version` succeeds in the same shell.

#### Complementarity

L1 RTK owns bash only. It does not touch tool outputs handled by L2, history handled by L3, or network history handled by L4. Overhead stays below 10ms on the Matrixx side.

---

### 2.2 context-mode — Tool Output Sandboxing

#### What is context-mode?

[context-mode](https://github.com/mksglu/context-mode) (18.7k stars) is an external OpenCode plugin that keeps raw tool output out of the LLM context. Instead of pasting large outputs directly, it sandboxes them in an FTS5 index and returns only the derived answer. The pattern is called Think-in-Code.

It exposes 11 `ctx_*` tools:

`ctx_batch_execute`, `ctx_execute`, `ctx_execute_file`, `ctx_fetch_and_index`, `ctx_index`, `ctx_search`, `ctx_stats`, `ctx_fetch`, `ctx_doctor`, `ctx_upgrade`, `compress`, plus helpers like `ctx_purge`.

Typical use:

```bash
# Instead of reading 5000 lines into context:
# read file -> 5000 lines in context

# With context-mode:
ctx_execute_file(path="huge.log", code="console.log(FILE_CONTENT.split('\\n').filter(l=>l.includes('ERROR')).slice(0,20).join('\\n'))")
# Only ~20 lines enter context; raw 5000 lines stay in sandbox
```

#### How It Works

- `experimental.chat.messages.transform` injects Context Discipline when detected.
- `tool.execute.after` sandboxes outputs into FTS5 and window-extracts the slice.
- Models must use `ctx_*` for analysis, Matrixx enforces via `hasContextMode` checks in Morpheus and Keymaker.
- Raw bytes never enter context, only sandbox output does, retrievable via `ctx_search`.

#### Performance Impact

| Metric | Value |
|--------|-------|
| Bridge overhead | Near zero (in process hooks) |
| Token savings | Up to 98% tool output reduction (for example, reading 5000 lines but only a 20 line slice enters context) |
| When it matters most | Large reads, logs, test output, web fetches, repeated greps |

#### Installation

context-mode is an external OpenCode plugin, not a Matrixx dependency.

```bash
# 1. Add to your OpenCode config (project or user)
# .opencode/opencode.json  or  ~/.config/opencode/opencode.json
{
  "plugin": ["context-mode"]
}

# 2. Optional: sync the discipline prompt
cp node_modules/context-mode/configs/opencode/AGENTS.md AGENTS.md

# 3. Restart OpenCode
```

Verify:

```bash
# In OpenCode, run:
ctx stats
# Expected: tool list and index stats appear
```

> **Legacy duplication trap:** If you have both `mcp.context-mode` (old MCP config) and `plugin: ["context-mode"]` (new plugin), OpenCode may expose zero `ctx_*` tools. Remove the old `mcp` entry and keep only the `plugin` entry, then run `context-mode upgrade` or reinstall and restart.

#### Configuration

Matrixx gate `context_mode` (default `enabled:true`) + external plugin `plugin: ["context-mode"]` in `opencode.jsonc`:

```jsonc
{
  // opencode.jsonc — external plugin
  "plugin": ["context-mode", "opencode-matrixx"]
}
```
```jsonc
{
  // matrixx.jsonc — discipline + enforcer gate
  "context_mode": {
    "enabled": true,                    // false = hide discipline, disable enforcer
    "enforce": false,                   // true = block grep/glob (hard), false = warn (soft)
    "blocked_tools": ["grep", "glob"]   // tools to gate (add "read"/"bash" to also cover those)
  }
}
```
```ts
const hasContextMode = availableTools.some(t => t.name.startsWith("ctx_")) && pluginConfig.context_mode?.enabled !== false
```

When `hasContextMode` is true, Matrixx injects `MUST use ctx_*` discipline and `context-mode-enforcer` hook warns/blocks raw `grep`/`glob`/`read` per `enforce`/`blocked_tools`.

#### Verification

```
ctx stats
```

You should see indexed chunks, source labels, and throttling counters. If no `ctx_*` tools appear, check `opencode.json` plugin array and restart.

#### Complementarity

L2 owns tool output sandboxing. It is orthogonal to L1 bash rewriting, L3 history pruning, and L4 proxy compression. Use L2 for any task that would otherwise paste large outputs into context.

---

### 2.3 DCP — Dynamic Context Pruning

#### What is DCP?

DCP ([@tarquinen/opencode-dcp](https://www.npmjs.com/package/@tarquinen/opencode-dcp)) is an external OpenCode plugin that prunes conversation history by tier. Matrixx provides a thin bridge: a config schema, a slash command `/dcp-profile`, and a tool `dcp_switch_profile` that writes `~/.config/opencode/dcp.jsonc`.

Four built-in tiers:

| Tier | Intent | `maxContextLimit` | `minContextLimit` | `nudgeFrequency` | `nudgeForce` | `turnProtection` |
|------|--------|-------------------|-------------------|------------------|--------------|------------------|
| `economy` | Aggressive, minimal context | 30% | 20% | 2 | strong | off |
| `balanced` | Default for most sessions | 60% | 30% | 3 | strong | 2 turns |
| `performance` | Keep more history | 80% | 35% | 4 | strong | 3 turns |
| `ultimate` | Maximum retention | 85% (protectTags) | 40% | 5 | strong | 5 turns |

#### How It Works

`BUILTIN_DCP_PROFILES` in `src/config/schema/dcp.ts` defines each tier. The `base` config applies across all tiers:

- `base.compress`: `mode` (`range` or `message`, default `range`), `permission` (`ask`, `allow`, `deny`, default `allow`), `nudgeForce`, `iterationNudgeThreshold`, `protectedTools`, `protectUserMessages`.
- `base.strategies`: `deduplication` and `purgeErrors`, each with `enabled` and `protectedTools`.
- `base.commands`, `base.manualMode`, `base.protectedFilePatterns`, `base.pruneNotificationType`, `base.autoUpdate`, `base.debug`.

Switching tiers via `/dcp-profile <tier>` or `dcp_switch_profile` writes an inline `dcp.jsonc` to `~/.config/opencode/dcp.jsonc` with the selected profile plus `base`. Matrixx bridge overhead stays below 10ms.

#### Performance Impact

| Metric | Value |
|--------|-------|
| Bridge overhead | Less than 10ms (config write) |
| Effect | Tiered pruning reduces history that reaches the model, complements L0, L2, and L4 |
| Tradeoff | `economy` saves the most tokens but keeps the least history, `ultimate` keeps the most |

#### Installation

```bash
npm install --prefix ~/.config/opencode @tarquinen/opencode-dcp

# Verify
ls ~/.config/opencode/node_modules/@tarquinen/opencode-dcp
cat ~/.config/opencode/dcp.jsonc 2>/dev/null || echo "not yet written, run /dcp-profile"
```

Matrixx checks `existsSync` for the DCP install when the feature is enabled.

#### Configuration

Configure in `matrixx.jsonc` (Matrixx bridge). Full defaults live in `src/config/schema/dcp.ts`:

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/klpanagi/opencode-matrixx/refs/heads/dev/dist/matrixx.schema.json",
  "dcp": {
    "enabled": true,                    // default: true
    "default_profile": "balanced",       // optional, default "balanced"
    "profiles": {                        // optional override, defaults to BUILTIN_DCP_PROFILES
      // "my-tier": { "compress": { "maxContextLimit": "50%" } }
    },
    "base": {
      "autoUpdate": false,               // default: false
      "debug": false,                    // default: false
      "pruneNotificationType": "chat",   // "chat" | "toast", default "chat"
      "compress": {
        "mode": "range",                 // "range" | "message", default "range"
        "permission": "allow",           // "ask" | "allow" | "deny", default "allow"
        "showCompression": true,
        "summaryBuffer": true,
        "nudgeForce": "strong",          // "strong" | "soft"
        "iterationNudgeThreshold": 5,
        "protectedTools": [],
        "protectUserMessages": false
      },
      "strategies": {
        "deduplication": { "enabled": true, "protectedTools": [] },
        "purgeErrors": { "enabled": true, "protectedTools": [] }
      },
      "commands": { "enabled": true, "protectedTools": [] },
      "manualMode": { "enabled": false, "automaticStrategies": true },
      "protectedFilePatterns": []
    }
  }
}
```

Or switch at runtime without editing config:

```bash
/dcp-profile balanced
/dcp-profile economy
/dcp-profile performance
/dcp-profile ultimate
```

The tool `dcp_switch_profile` accepts `profile: "economy" | "balanced" | "performance" | "ultimate"` and writes `~/.config/opencode/dcp.jsonc`.

#### Verification

```bash
cat ~/.config/opencode/dcp.jsonc | grep -A2 compress
/dcp-profile balanced
# Expected: dcp.jsonc now contains the balanced tier compress block
```

If `dcp.jsonc` does not appear, confirm DCP is installed under `~/.config/opencode/node_modules` and that `dcp.enabled` is not set to `false`.

#### Complementarity

L3 owns history pruning. It complements L0 compaction and recovery, L1 bash compression, L2 sandboxing, and L4 proxy compression with no overlap.

---

### 2.4 Headroom — Network-Proxy Compression

#### What is Headroom?

Headroom from [headroomlabs-ai/headroom](https://github.com/headroomlabs-ai/headroom) (68.3k stars) is a proxy plus MCP provider that compresses history before it reaches the LLM. It intercepts the OpenAI-compatible provider `headroom` via `@ai-sdk/openai-compatible` and serves retrieval via `headroom_retrieve`.

```bash
# Without headroom: 50k tokens history
# Every turn ships full JSON plus tool outputs

# With headroom wrap: 8k tokens (CCR plus retrieval)
$ headroom wrap opencode
# CCR compresses, agents retrieve via headroom_retrieve on demand
```

Headroom is ideal for JSON heavy sessions, long histories, and multi project reuse where the same compressed context (CCR) can be shared.

#### How It Works

1. User runs `headroom wrap opencode` (starts proxy at `http://127.0.0.1:8787`).
2. Headroom MCP registers `headroom_retrieve` and `headroom_stats`.
3. Matrixx detects `hasHeadroom = availableTools.some(t => t.name.startsWith("headroom_"))` and injects Headroom discipline into agent prompts.
4. Proxy `CacheAligner` to `ContentRouter` to `CCR` compresses history, agents retrieve details on demand via `headroom_retrieve`.

Matrixx does not vendor Headroom. It provides a thin config bridge in `src/config/schema/headroom.ts` plus runtime detection. Native transport `headroom-opencode` is deferred to Phase 2.

#### Configuration

Headroom is disabled by default (opt in). Enable it in `matrixx.jsonc`:

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/klpanagi/opencode-matrixx/refs/heads/dev/dist/matrixx.schema.json",
  "headroom": {
    "enabled": true,                        // default: false
    "proxyUrl": "http://127.0.0.1:8787",     // optional, defaults to http://127.0.0.1:8787
    "project": "my-project",                // optional, CCR scoping
    "backend": "openai"                     // optional, HEADROOM_BACKEND
  }
}
```

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `enabled` | boolean | `false` | Opt in |
| `proxyUrl` | string (url) | `http://127.0.0.1:8787` | Proxy URL, optional |
| `project` | string | `undefined` | CCR scoping |
| `backend` | string | `undefined` | Maps to `HEADROOM_BACKEND` |

> **Note:** Native TypeScript plugin `headroom-opencode` is deferred to Phase 2 due to [#2798](https://github.com/sst/opencode/issues/2798) global `fetch` patch collision and [#76](https://github.com/headroomlabs-ai/headroom/issues/76) compaction not yet stable. Prefer `wrap` for now.

#### Installation

Install Headroom from [headroomlabs-ai/headroom](https://github.com/headroomlabs-ai/headroom):

```bash
# Install (pick one)
uv tool install headroom-ai[all]
# or
pipx install headroom-ai[all]

# Verify
headroom --version
headroom doctor

# Run via proxy (recommended)
headroom wrap opencode

# Dashboard
headroom dashboard
```

Package versions: `npm: headroom-ai@0.37.0`, `PyPI: headroom-ai[all]`. Docs at `headroom-docs.vercel.app`.

#### Performance Impact

| Metric | Value |
|--------|-------|
| Matrixx bridge overhead | ~0ms (prompt only, proxy is out of process) |
| Proxy token savings | 60 to 95% JSON, 15 to 20% coding agents |
| Complementarity | L4 orthogonal to L1 RTK plus L2 context-mode plus L3 DCP plus L0 native (zero overlap) |
| Net benefit | Retrieval on demand reduces per-turn context, CCR shared across projects |

#### 5-Layer Complementarity

| Layer | Owner | Mechanism | Reduction |
|-------|-------|-----------|-----------|
| L0 Native | Matrixx | 70% warn, preemptive-compaction, anthropic-recovery | Prevents OOM |
| L1 RTK | RTK hook | Bash output compression | 60 to 90% bash |
| L2 context-mode | context-mode plugin | FTS5 sandbox `ctx_*` | 98% sandbox |
| L3 DCP | `@tarquinen/opencode-dcp` | Pruning tiers `economy` to `ultimate` | Tiered pruning |
| L4 Headroom | headroom proxy | `CacheAligner` to `ContentRouter` to `CCR` | 60 to 95% JSON |

---

## 3. Native Hooks

These hooks ship with Matrixx and need no external install. Each can be disabled via `disabled_hooks` in `matrixx.jsonc`.

### 3.1 context-window-monitor

| Property | Value |
|----------|-------|
| Event | `tool.execute.after` |
| Threshold | 70% of Anthropic limit (200k, 1M with `ANTHROPIC_1M_CONTEXT=true`) |
| Behavior | Injects Context Status (`used% / remaining%`) once per session, Anthropic only. |
| Config key | No dedicated key, always active unless disabled |
| Disable | `"context-window-monitor"` in `disabled_hooks` |

Source: `src/hooks/context-window-monitor.ts`.

### 3.2 preemptive-compaction

| Property | Value |
|----------|-------|
| Event | `tool.execute.after` (also listens to `message.updated` for token updates) |
| Threshold | 78% of Anthropic actual limit |
| Behavior | Triggers `session.summarize({ auto: true })` with 60s timeout and 60s cooldown, guards `compactionInProgress`, Anthropic only. |
| Config key | `experimental.preemptive_compaction` (boolean, optional). Hook is active when provider is Anthropic and not disabled |
| Disable | `"preemptive-compaction"` in `disabled_hooks`, or set `experimental.preemptive_compaction: false` |

Source: `src/hooks/preemptive-compaction.ts`.

### 3.3 compaction-context-injector

| Property | Value |
|----------|-------|
| Event | `experimental.session.compacting` (`onSummarize`) |
| Behavior | Injects MUST-include sections into the compaction summary so critical state survives across compactions: Goal, Work Completed, Remaining Work, Constraints, Key Decisions, Active Skills, and Continuity notes. |
| Config key | None, runs on every compaction |
| Disable | `"compaction-context-injector"` in `disabled_hooks` |

Source: `src/hooks/compaction-context-injector/`.

### 3.4 compaction-todo-preserver

| Property | Value |
|----------|-------|
| Event | `experimental.session.compacting` plus `event` (`session.compacted`) |
| Behavior | Captures the current todo list before compaction and restores it after via `Todo.update`. Ensures in progress work, pending tasks, and mission state are not lost when the session is summarized. |
| Config key | None, runs on every compaction |
| Disable | `"compaction-todo-preserver"` in `disabled_hooks` |

Source: `src/hooks/compaction-todo-preserver/`.

### 3.5 anthropic-context-window-limit-recovery

| Property | Value |
|----------|-------|
| Event | `event` (parses `context limit` / `token limit` errors on idle) plus `tool.execute.after` |
| Behavior | When a token limit error is detected, executes compaction with three fallback strategies in order: 1) aggressive truncation, 2) summarize and retry, 3) target token truncation. Caps attempts at 3 to avoid recovery storms (P15). |
| Config key | `experimental.aggressive_truncation` influences the first strategy |
| Disable | `"anthropic-context-window-limit-recovery"` in `disabled_hooks` |

Source: `src/hooks/anthropic-context-window-limit-recovery/` (~2232 LOC).

### 3.6 tool-output-truncator and grep-output-truncator

| Property | Value |
|----------|-------|
| Event | `tool.execute.after` |
| Behavior | Truncates whitelisted tools when output exceeds `DEFAULT_MAX_TOKENS` 50k tokens (~200k characters). `webfetch` is capped at 10k tokens. With `experimental.truncate_all_tool_outputs: true`, truncates all tool outputs instead of only the whitelist. Keeps a 50% safety margin so truncation leaves headroom. |
| Whitelist | Grep, Glob, LSP, AST-grep, and similar high volume tools. `webfetch` has a lower cap. |
| Config key | `experimental.truncate_all_tool_outputs` (boolean, optional) |
| Aliases | HookName `grep-output-truncator` is kept for backward compatibility and maps to the same truncator |
| Disable | `"tool-output-truncator"` or `"grep-output-truncator"` in `disabled_hooks` |

Source: `src/hooks/tool-output-truncator.ts`, HookNameSchema in `src/config/schema/hooks.ts`.

> **Term collision note:** `grep-output-truncator` keeps 50% headroom as a generic token budget phrase. This is not the Headroom network proxy plugin. See the Headroom section above for `headroomlabs-ai/headroom`.

### 3.7 quality-gate (context protecting)

| Property | Value |
|----------|-------|
| Event | `tool.execute.after` (post write/edit) |
| Behavior | Auto lints changed `.ts` and `.tsx` files via `biome check` with a 10 second timeout. Surfaces only actionable diagnostics. Keeps context clean by catching formatting issues immediately instead of letting them accumulate. |
| Config key | No dedicated toggle, controlled via `disabled_hooks` |
| Disable | `"quality-gate"` in `disabled_hooks` |

Source: `src/hooks/quality-gate/`.

---

## 4. Skills and Quality Gates

`quality-gate` ships as both skill and hook.

### quality-gate

- **Skill:** lint, typecheck, and review guidance, loaded via `load_skills` when needed.
- **Hook:** auto lints `.ts` and `.tsx` after `write` and `edit` via `biome check` (10s timeout), appending concise diagnostics.
- **Context benefit:** early feedback prevents long fix loops that bloat history. Lightweight and post tool, never blocks the write.

Disable only if you have a separate lint pipeline:

```jsonc
{
  "disabled_hooks": ["quality-gate"]
}
```

---

## 5. Configuration Reference

Unified `matrixx.jsonc` showing every context management key. All keys are optional and merge as project file plus user file plus defaults (project wins).

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/klpanagi/opencode-matrixx/refs/heads/dev/dist/matrixx.schema.json",

  // L1 RTK — bash output compression
  "rtk": {
    "enabled": true,                        // default: false
    "binary_path": "/usr/local/bin/rtk",    // optional, defaults to "rtk" on PATH
    "timeout_ms": 5000                      // 1000 to 30000, default 5000
  },

  // L4 Headroom — network proxy compression
  "headroom": {
    "enabled": true,                        // default: false
    "proxyUrl": "http://127.0.0.1:8787",     // optional, default http://127.0.0.1:8787
    "project": "my-project",                // optional, CCR scoping
    "backend": "openai"                     // optional, HEADROOM_BACKEND
  },

  // L3 DCP — dynamic context pruning
  "dcp": {
    "enabled": true,                        // default: true
    "default_profile": "balanced",           // optional, default "balanced"
    "profiles": {
      // override or add custom tiers, defaults to BUILTIN_DCP_PROFILES
    },
    "base": {
      "autoUpdate": false,
      "debug": false,
      "pruneNotificationType": "chat",      // "chat" | "toast"
      "compress": {
        "mode": "range",                    // "range" | "message"
        "permission": "allow",              // "ask" | "allow" | "deny"
        "showCompression": true,
        "summaryBuffer": true,
        "nudgeForce": "strong",             // "strong" | "soft"
        "iterationNudgeThreshold": 5,
        "protectedTools": [],
        "protectUserMessages": false
      },
      "strategies": {
        "deduplication": { "enabled": true, "protectedTools": [] },
        "purgeErrors": { "enabled": true, "protectedTools": [] }
      },
      "commands": { "enabled": true, "protectedTools": [] },
      "manualMode": { "enabled": false, "automaticStrategies": true },
      "protectedFilePatterns": []
    }
  },

  // L0 Native — thresholds and behavior
  "experimental": {
    "aggressive_truncation": false,         // optional, used by anthropic recovery
    "truncate_all_tool_outputs": false,     // optional, when true truncates every tool output
    "preemptive_compaction": true           // optional, controls 78% auto compaction
  },

  // Disable any hook by name
  "disabled_hooks": [
    // "context-window-monitor",
    // "preemptive-compaction",
    // "compaction-context-injector",
    // "compaction-todo-preserver",
    // "anthropic-context-window-limit-recovery",
    // "tool-output-truncator",
    // "grep-output-truncator",  // alias of tool-output-truncator
    // "quality-gate",
    // "rtk-bash-rewriter"
  ]
}
```

Notes:

- Run `bun run build:schema` after editing any file under `src/config/schema/` to regenerate `assets/matrixx.schema.json` and `dist/matrixx.schema.json`.
- `HookNameSchema` in `src/config/schema/hooks.ts` is the single source of truth for valid `disabled_hooks` entries. Invalid names fail Zod validation.
- `context-mode` has no Matrixx schema key. It is configured in `opencode.json` as `plugin: ["context-mode"]`.

---

## 6. Verification and Troubleshooting

### Verification Table

| Capability | Verify Command | Expected | If It Fails |
|------------|----------------|----------|-------------|
| RTK | `rtk --version` | Version string (for example `rtk 0.3.x`) | Check PATH and `binary_path`, reinstall |
| RTK rewrite | Enable `rtk.enabled: true`, run `git status` via bash tool | Output arrives as compressed summary | Confirm `rtk --version`, check `timeout_ms` |
| context-mode | `ctx stats` (in OpenCode) | Tools listed, chunks and index stats appear | Check `plugin: ["context-mode"]`, restart |
| context-mode tools | `ctx stats` shows `ctx_*` | At least 11 tools present | Remove legacy `mcp.context-mode` duplication |
| DCP install | `ls ~/.config/opencode/node_modules/@tarquinen/opencode-dcp` | Directory exists | Run `npm install --prefix ~/.config/opencode @tarquinen/opencode-dcp` |
| DCP profile | `cat ~/.config/opencode/dcp.jsonc \| grep compress` | Compress block for active tier | Run `/dcp-profile balanced` |
| DCP switch | `/dcp-profile economy` | `dcp.jsonc` rewritten with economy tier | Check write permissions on `~/.config/opencode/` |
| Headroom binary | `headroom --version` | Version string | Reinstall via `uv tool install headroom-ai[all]` or `pipx` |
| Headroom health | `headroom doctor` | All checks pass | Follow doctor hints, check proxy URL and project config |
| Headroom proxy | `headroom wrap opencode` then check tools | `headroom_retrieve` and `headroom_stats` appear | Check `proxyUrl`, `HEADROOM_PROXY_URL` |
| Headroom detection | In agent prompt, look for Headroom discipline | Discipline table injected | Check `headroom.enabled`, restart |
| Native hooks | `grep disabled_hooks matrixx.jsonc` | No context hooks disabled unless intended | Remove unintended entries from `disabled_hooks` |
| Truncation | Trigger a large grep, observe output length | Output capped near 50k tokens | Check `truncate_all_tool_outputs` |
| Preemptive compaction | Reach ~78% Anthropic usage | Session auto summarizes with 60s timeout | Check Anthropic provider, 1M flag, cooldown |

### Common Issues

**Legacy context-mode duplication shows zero tools.** You have both `mcp.context-mode` and `plugin: ["context-mode"]`. Remove the `mcp` entry, keep only `plugin`, then restart.

**Headroom proxy not running.** If `headroom_retrieve` does not appear, check `proxyUrl` is `http://127.0.0.1:8787`, run `headroom doctor`, and use `headroom wrap opencode`.

**`grep-output-truncator` term collision.** Keeps 50% headroom is generic token-budget phrasing, not the Headroom proxy plugin. See [features](features.md) footnote.

**DCP profile not applying.** Ensure DCP is installed and `dcp.enabled` is not `false`. Check write permission on `~/.config/opencode/`.

**RTK shows original output.** Verify `rtk --version`, `rtk.enabled: true`, and `binary_path`. Hook passes through silently when binary is missing.

---

## 7. See Also

- README sections: [RTK Integration](https://github.com/klpanagi/opencode-matrixx#rtk-integration--token-compression) and [Headroom Integration](https://github.com/klpanagi/opencode-matrixx#headroom-integration--network-proxy-compression) — 5-subsection templates this document mirrors
- [cost-performance proposals](cost-performance-proposals.md) — P6 RTK, P7 context-mode, P16 Headroom, plus the 5-layer matrix and cumulative estimates
- [configurations](configurations.md) — full `matrixx.jsonc` reference, agent overrides, hook disabling, JSONC support
- [features](features.md) — complete hook table including Truncation and Context Management and Recovery rows
- Specs: [headroomlabs-ai/headroom](https://github.com/headroomlabs-ai/headroom), [mksglu/context-mode](https://github.com/mksglu/context-mode), [rtk-ai/rtk](https://github.com/rtk-ai/rtk), [@tarquinen/opencode-dcp](https://www.npmjs.com/package/@tarquinen/opencode-dcp)
