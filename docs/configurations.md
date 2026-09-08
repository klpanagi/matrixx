# Matrixx Configuration

> **Full reference:** [`matrixx.example.jsonc`](../matrixx.example.jsonc) — exhaustive, commented example covering every `matrixx.jsonc` key (headroom, context-mode, DCP, RTK, all top-level and nested options) with defaults and descriptions. Use it as a starting point: copy sections you need.

Highly opinionated, but adjustable to taste.

## Quick Start

**Most users don't need to configure anything manually.** Run the interactive installer:

```bash
bunx opencode-matrixx install
```

It asks about your providers (Claude, OpenAI, Gemini, etc.) and generates optimal config automatically.

**Want to customize?** Here's the common patterns:

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/klpanagi/opencode-matrixx/master/assets/matrixx.schema.json",
  
  // Override specific agent models
  "agents": {
    "oracle": { "model": "openai/gpt-5.2" },                // Use GPT for debugging
    "operator": { "model": "anthropic/claude-haiku-4-5" },   // Cheap & fast for research
    "trinity": { "model": "anthropic/claude-haiku-4-5" }     // Cheap & fast for grep
  },
  
  // Override category models (used by task)
  "categories": {
    "bullet-time": { "model": "anthropic/claude-haiku-4-5" } // Fast/cheap for trivial tasks
  }
}
```

**Find available models:** Run `opencode models` to see all models in your environment.

## Config File Locations

Config file locations (priority order):
1. `.opencode/matrixx.jsonc` or `.opencode/matrixx.json` (project; prefers `.jsonc` when both exist)
2. User config (platform-specific; prefers `.jsonc` when both exist):

| Platform        | User Config Path                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Windows**     | `~/.config/opencode/matrixx.jsonc` (preferred) or `~/.config/opencode/matrixx.json` (fallback); `%APPDATA%\opencode\matrixx.jsonc` / `%APPDATA%\opencode\matrixx.json` (fallback) |
| **macOS/Linux** | `~/.config/opencode/matrixx.jsonc` (preferred) or `~/.config/opencode/matrixx.json` (fallback)                |

Schema autocomplete supported:

```json
{
  "$schema": "https://raw.githubusercontent.com/klpanagi/opencode-matrixx/master/assets/matrixx.schema.json"
}
```

## JSONC Support

The `matrixx` configuration file supports JSONC (JSON with Comments):
- Line comments: `// comment`
- Block comments: `/* comment */`
- Trailing commas: `{ "key": "value", }`

When both `matrixx.jsonc` and `matrixx.json` files exist, `.jsonc` takes priority.

**Example with comments:**

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/klpanagi/opencode-matrixx/master/assets/matrixx.schema.json",

  /* Agent overrides - customize models for specific tasks */
  "agents": {
    "oracle": {
      "model": "openai/gpt-5.2"  // GPT for strategic reasoning
    },
    "trinity": {
      "model": "anthropic/claude-haiku-4-5"  // Fast for exploration
    },
  },
}
```

## Google Auth

**Recommended**: For Google Gemini authentication, install the [`opencode-antigravity-auth`](https://github.com/NoeFabris/opencode-antigravity-auth) plugin (`@latest`). It provides multi-account load balancing, variant-based thinking levels, dual quota system (Antigravity + Gemini CLI), and active maintenance. See [Installation > Google Gemini](docs/guide/installation.md#google-gemini-antigravity-oauth).

## Ollama Provider

**IMPORTANT**: When using Ollama as a provider, you **must** disable streaming to avoid JSON parsing errors.

### Required Configuration

```json
{
  "agents": {
    "trinity": {
      "model": "ollama/qwen3-coder",
      "stream": false
    }
  }
}
```

### Why `stream: false` is Required

Ollama returns NDJSON (newline-delimited JSON) when streaming is enabled, but Claude Code SDK expects a single JSON object. This causes `JSON Parse error: Unexpected EOF` when agents attempt tool calls.

**Example of the problem**:
```json
// Ollama streaming response (NDJSON - multiple lines)
{"message":{"tool_calls":[...]}, "done":false}
{"message":{"content":""}, "done":true}

// Claude Code SDK expects (single JSON object)
{"message":{"tool_calls":[...], "content":""}, "done":true}
```

### Supported Models

Common Ollama models that work with matrixx:

| Model | Best For | Configuration |
|-------|----------|---------------|
| `ollama/qwen3-coder` | Code generation, build fixes | `{"model": "ollama/qwen3-coder", "stream": false}` |
| `ollama/ministral-3:14b` | Exploration, codebase search | `{"model": "ollama/ministral-3:14b", "stream": false}` |
| `ollama/lfm2.5-thinking` | Documentation, writing | `{"model": "ollama/lfm2.5-thinking", "stream": false}` |

### Troubleshooting

If you encounter `JSON Parse error: Unexpected EOF`:

1. **Verify `stream: false` is set** in your agent configuration
2. **Check Ollama is running**: `curl http://localhost:11434/api/tags`
3. **Test with curl**:
   ```bash
   curl -s http://localhost:11434/api/chat \
     -d '{"model": "qwen3-coder", "messages": [{"role": "user", "content": "Hello"}], "stream": false}'
   ```
4. **See detailed troubleshooting**: [docs/troubleshooting/ollama-streaming-issue.md](troubleshooting/ollama-streaming-issue.md)

### Future SDK Fix

The proper long-term fix requires Claude Code SDK to parse NDJSON responses correctly. Until then, use `stream: false` as a workaround.

**Tracking**: https://github.com/klpanagi/opencode-matrixx/issues/1124

## Agents

Override built-in agent settings:

```json
{
  "agents": {
    "trinity": {
      "model": "anthropic/claude-haiku-4-5",
      "temperature": 0.5
    },
    "construct": {
      "disable": true
    }
  }
}
```

Each agent supports: `model`, `temperature`, `top_p`, `prompt`, `prompt_append`, `tools`, `disable`, `description`, `mode`, `color`, `permission`, `category`, `variant`, `maxTokens`, `thinking`, `reasoningEffort`, `textVerbosity`, `providerOptions`.

### Additional Agent Options
| Option              | Type    | Description                                                                                     |
| ------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| `category`          | string  | Category name to inherit model and other settings from category defaults                             |
| `variant`           | string  | Model variant (e.g., `max`, `high`, `medium`, `low`, `xhigh`)                                 |
| `maxTokens`         | number  | Maximum tokens for response. Passed directly to OpenCode SDK.                                      |
| `thinking`          | object  | Extended thinking configuration for Anthropic models. See [Thinking Options](#thinking-options) below. |
| `reasoningEffort`   | string  | OpenAI reasoning effort level. Values: `low`, `medium`, `high`, `xhigh`.                         |
| `textVerbosity`      | string  | Text verbosity level. Values: `low`, `medium`, `high`.                                        |
| `providerOptions`    | object  | Provider-specific options passed directly to OpenCode SDK.                                      |
| `fallbackChain`      | array   | Fallback provider/model chain: `[{ providers: string[], model: string, variant?: string }]`      |
#### Thinking Options (Anthropic)

```json
{
  "agents": {
    "oracle": {
      "thinking": {
        "type": "enabled",
        "budgetTokens": 200000
      }
    }
  }
}
```

| Option        | Type    | Default | Description                                  |
| ------------- | ------- | ------- | -------------------------------------------- |
| `type`        | string  | -       | `enabled` or `disabled`                      |
| `budgetTokens`| number  | -       | Maximum budget tokens for extended thinking  |

Use `prompt_append` to add extra instructions without replacing the default system prompt:

```json
{
  "agents": {
    "operator": {
      "prompt_append": "Always use the elisp-dev-mcp for Emacs Lisp documentation lookups."
    }
  }
}
```

You can also override settings for `Morpheus` (the main orchestrator) and `build` (the default agent) using the same options.

### Permission Options

Fine-grained control over what agents can do:

```json
{
  "agents": {
    "trinity": {
      "permission": {
        "edit": "deny",
        "bash": "ask",
        "webfetch": "allow"
      }
    }
  }
}
```

| Permission           | Description                            | Values                                                                      |
| -------------------- | -------------------------------------- | --------------------------------------------------------------------------- |
| `edit`               | File editing permission                | `ask` / `allow` / `deny`                                                    |
| `bash`               | Bash command execution                 | `ask` / `allow` / `deny` or per-command: `{ "git": "allow", "rm": "deny" }` |
| `webfetch`           | Web request permission                 | `ask` / `allow` / `deny`                                                    |
| `task`               | Task tool (`task_create`/`task_update` etc.) | `ask` / `allow` / `deny`                                                    |
| `doom_loop`          | Allow infinite loop detection override | `ask` / `allow` / `deny`                                                    |
| `external_directory` | Access files outside project root      | `ask` / `allow` / `deny`                                                    |
Or disable via `disabled_agents` in `~/.config/opencode/matrixx.json` or `.opencode/matrixx.json`:

```json
{
  "disabled_agents": ["oracle", "construct"]
}
```

Available agents: `morpheus`, `oracle`, `merovingian`, `operator`, `trinity`, `construct`, `seraph`, `smith`, `architect`, `cipher`, `sati`, `sentinel`, `keymaker`, `bdd-contract` (+ aliases `build`, `plan`, `mouse`, `OpenCode-Builder` via `agent_definitions` overrides)

## Built-in Skills

Matrixx includes built-in skills that provide additional capabilities:

- **playwright** (default) / **agent-browser**: Browser automation for web scraping, testing, screenshots, and browser interactions. See [Browser Automation](#browser-automation) for switching between providers.
- **git-master**: Git expert for atomic commits, rebase/squash, and history search (blame, bisect, log -S). STRONGLY RECOMMENDED: Use with `task(category='quick', load_skills=['git-master'], ...)` to save context.

Disable built-in skills via `disabled_skills` in `~/.config/opencode/matrixx.json` or `.opencode/matrixx.json`:

```json
{
  "disabled_skills": ["playwright"]
}
```

Available built-in skills: `playwright`, `agent-browser`, `git-master`

## Skills Configuration

Configure advanced skills settings including custom skill sources, enabling/disabling specific skills, and defining custom skills.

```json
{
  "skills": {
    "sources": [
      { "path": "./custom-skills", "recursive": true },
      "https://example.com/skill.yaml"
    ],
    "enable": ["my-custom-skill"],
    "disable": ["other-skill"],
    "my-skill": {
      "description": "Custom skill description",
      "template": "Custom prompt template",
      "from": "source-file.ts",
      "model": "custom/model",
      "agent": "custom-agent",
      "subtask": true,
      "argument-hint": "usage hint",
      "license": "MIT",
      "compatibility": ">= 3.0.0",
      "metadata": {
        "author": "Your Name"
      },
      "allowed-tools": ["tool1", "tool2"]
    }
  }
}
```

### Sources

Load skills from local directories or remote URLs:

```json
{
  "skills": {
    "sources": [
      { "path": "./custom-skills", "recursive": true },
      { "path": "./single-skill.yaml" },
      "https://example.com/skill.yaml",
      "https://raw.githubusercontent.com/user/repo/main/skills/*"
    ]
  }
}
```

| Option      | Default | Description                                    |
| ----------- | ------- | ---------------------------------------------- |
| `path`      | -       | Local file/directory path or remote URL            |
| `recursive`  | `false`  | Recursively load from directory                 |
| `glob`      | -       | Glob pattern for file selection                 |

### Enable/Disable Skills

```json
{
  "skills": {
    "enable": ["skill-1", "skill-2"],
    "disable": ["disabled-skill"]
  }
}
```

### Custom Skill Definition

Define custom skills directly in your config:

| Option           | Default | Description                                                                          |
| ---------------- | ------- | ------------------------------------------------------------------------------------ |
| `description`     | -       | Human-readable description of the skill                                                 |
| `template`        | -       | Custom prompt template for the skill                                                    |
| `from`           | -       | Source file to load template from                                                     |
| `model`           | -       | Override model for this skill                                                         |
| `agent`           | -       | Override agent for this skill                                                         |
| `subtask`         | `false`  | Whether to run as a subtask                                                           |
| `argument-hint`   | -       | Hint for how to use the skill                                                        |
| `license`          | -       | Skill license                                                                       |
| `compatibility`    | -       | Required matrixx version compatibility                                           |
| `metadata`         | -       | Additional metadata as key-value pairs                                                |
| `allowed-tools`    | -       | Array of tools this skill is allowed to use                                            |

**Example: Custom skill**

```json
{
  "skills": {
    "data-analyst": {
      "description": "Specialized for data analysis tasks",
      "template": "You are a data analyst. Focus on statistical analysis, visualization, and data interpretation.",
      "model": "openai/gpt-5.2",
      "allowed-tools": ["read", "bash", "lsp_diagnostics"]
    }
  }
}
```

## Browser Automation

Choose between four browser automation providers:

| Provider | Interface | Features | Installation |
|----------|-----------|----------|--------------|
| **playwright** (default) | MCP tools | Playwright MCP server with structured tool calls | Auto-installed via npx |
| **agent-browser** | Bash CLI | Vercel's CLI with session management, parallel browsers | Requires `bun add -g agent-browser` |
| **dev-browser** | MCP tools | Dev browser MCP with enhanced debugging | Via MCP config |
| **playwright-cli** | Bash CLI | Playwright CLI alternative | Requires `npx playwright` |
**Switch providers** via `browser_automation_engine` in `matrixx.json`:

```json
{
  "browser_automation_engine": {
    "provider": "agent-browser"
  }
}
```

### Playwright (Default)

Uses the official Playwright MCP server (`@playwright/mcp`). Browser automation happens through structured MCP tool calls.

### agent-browser

Uses [Vercel's agent-browser CLI](https://github.com/vercel-labs/agent-browser). Key advantages:
- **Session management**: Run multiple isolated browser instances with `--session` flag
- **Persistent profiles**: Keep browser state across restarts with `--profile`
- **Snapshot-based workflow**: Get element refs via `snapshot -i`, interact with `@e1`, `@e2`, etc.
- **CLI-first**: All commands via Bash - great for scripting

**Installation required**:
```bash
bun add -g agent-browser
agent-browser install  # Download Chromium
```

**Example workflow**:
```bash
agent-browser open https://example.com
agent-browser snapshot -i  # Get interactive elements with refs
agent-browser fill @e1 "user@example.com"
agent-browser click @e2
agent-browser screenshot result.png
agent-browser close
```

## Tmux Integration

Run background subagents in separate tmux panes for **visual multi-agent execution**. See your agents working in parallel, each in their own terminal pane.

**Enable tmux integration** via `tmux` in `matrixx.json`:

```json
{
  "tmux": {
    "enabled": true,
    "layout": "main-vertical",
    "main_pane_size": 60,
    "main_pane_min_width": 120,
    "agent_pane_min_width": 40
  }
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `false` | Enable tmux subagent pane spawning. Only works when running inside an existing tmux session. |
| `layout` | `main-vertical` | Tmux layout for agent panes. See [Layout Options](#layout-options) below. |
| `main_pane_size` | `60` | Main pane size as percentage (20-80). |
| `main_pane_min_width` | `120` | Minimum width for main pane in columns. |
| `agent_pane_min_width` | `40` | Minimum width for each agent pane in columns. |

### Layout Options

| Layout | Description |
|--------|-------------|
| `main-vertical` | Main pane left, agent panes stacked on right (default) |
| `main-horizontal` | Main pane top, agent panes stacked bottom |
| `tiled` | All panes in equal-sized grid |
| `even-horizontal` | All panes in horizontal row |
| `even-vertical` | All panes in vertical stack |

### Requirements

1. **Must run inside tmux**: The feature only activates when OpenCode is already running inside a tmux session
2. **Tmux installed**: Requires tmux to be available in PATH
3. **Server mode**: OpenCode must run with `--port` flag to enable subagent pane spawning

### How It Works

When `tmux.enabled` is `true` and you're inside a tmux session:
- Background agents (via `task(run_in_background=true)`) spawn in new tmux panes
- Each pane shows the subagent's real-time output
- Panes are automatically closed when the subagent completes
- Layout is automatically adjusted based on your configuration

### Running OpenCode with Tmux Subagent Support

To enable tmux subagent panes, OpenCode must run in **server mode** with the `--port` flag. This starts an HTTP server that subagent panes connect to via `opencode attach`.

**Basic setup**:
```bash
# Start tmux session
tmux new -s dev

# Run OpenCode with server mode (port 4096)
opencode --port 4096

# Now background agents will appear in separate panes
```

**Recommended: Shell Function**

For convenience, create a shell function that automatically handles tmux sessions and port allocation. Here's an example for Fish shell:

```fish
# ~/.config/fish/config.fish
function oc
    set base_name (basename (pwd))
    set path_hash (echo (pwd) | md5 | cut -c1-4)
    set session_name "$base_name-$path_hash"
    
    # Find available port starting from 4096
    function __oc_find_port
        set port 4096
        while test $port -lt 5096
            if not lsof -i :$port >/dev/null 2>&1
                echo $port
                return 0
            end
            set port (math $port + 1)
        end
        echo 4096
    end
    
    set oc_port (__oc_find_port)
    set -x OPENCODE_PORT $oc_port
    
    if set -q TMUX
        # Already inside tmux - just run with port
        opencode --port $oc_port $argv
    else
        # Create tmux session and run opencode
        set oc_cmd "OPENCODE_PORT=$oc_port opencode --port $oc_port $argv; exec fish"
        if tmux has-session -t "$session_name" 2>/dev/null
            tmux new-window -t "$session_name" -c (pwd) "$oc_cmd"
            tmux attach-session -t "$session_name"
        else
            tmux new-session -s "$session_name" -c (pwd) "$oc_cmd"
        end
    end
    
    functions -e __oc_find_port
end
```

**Bash/Zsh equivalent**:

```bash
# ~/.bashrc or ~/.zshrc
oc() {
    local base_name=$(basename "$PWD")
    local path_hash=$(echo "$PWD" | md5sum | cut -c1-4)
    local session_name="${base_name}-${path_hash}"
    
    # Find available port
    local port=4096
    while [ $port -lt 5096 ]; do
        if ! lsof -i :$port >/dev/null 2>&1; then
            break
        fi
        port=$((port + 1))
    done
    
    export OPENCODE_PORT=$port
    
    if [ -n "$TMUX" ]; then
        opencode --port $port "$@"
    else
        local oc_cmd="OPENCODE_PORT=$port opencode --port $port $*; exec $SHELL"
        if tmux has-session -t "$session_name" 2>/dev/null; then
            tmux new-window -t "$session_name" -c "$PWD" "$oc_cmd"
            tmux attach-session -t "$session_name"
        else
            tmux new-session -s "$session_name" -c "$PWD" "$oc_cmd"
        fi
    fi
}
```

**How subagent panes work**:

1. Main OpenCode starts HTTP server on specified port (e.g., `http://localhost:4096`)
2. When a background agent spawns, Matrixx creates a new tmux pane
3. The pane runs: `opencode attach http://localhost:4096 --session <session-id>`
4. Each subagent pane shows real-time streaming output
5. Panes are automatically closed when the subagent completes

**Environment variables**:

| Variable | Description |
|----------|-------------|
| `OPENCODE_PORT` | Default port for the HTTP server (used if `--port` not specified) |

### Server Mode Reference

OpenCode's server mode exposes an HTTP API for programmatic interaction:

```bash
# Standalone server (no TUI)
opencode serve --port 4096

# TUI with server (recommended for tmux integration)
opencode --port 4096
```

| Flag | Default | Description |
|------|---------|-------------|
| `--port` | `4096` | Port for HTTP server |
| `--hostname` | `127.0.0.1` | Hostname to listen on |

For more details, see the [OpenCode Server documentation](https://opencode.ai/docs/server/).

## Git Master

Configure git-master skill behavior:

```json
{
  "git_master": {
    "commit_footer": true,
    "include_co_authored_by": true
  }
}
```

| Option                   | Default | Description                                                                      |
| ------------------------ | ------- | -------------------------------------------------------------------------------- |
| `commit_footer`          | `true`  | Adds "Ultraworked with Morpheus" footer to commit messages.                      |
| `include_co_authored_by` | `true`  | Adds `Co-authored-by: Morpheus <morpheus@matrixx.ai>` trailer to commits. |

## Morpheus Agent

When enabled (default), Morpheus provides a powerful orchestrator with optional specialized agents:

- **Morpheus**: Primary orchestrator agent (Claude Opus 4.6)
- **OpenCode-Builder**: OpenCode's default build agent, renamed due to SDK limitations (disabled by default)
- **Oracle (Planner)**: OpenCode's default plan agent with work-planner methodology (enabled by default)
- **Seraph (Plan Consultant)**: Pre-planning analysis agent that identifies hidden requirements and AI failure points

**Configuration Options:**

```json
{
  "morpheus_agent": {
    "disabled": false,
    "default_builder_enabled": false,
    "planner_enabled": true,
    "replace_plan": true
  }
}
```

**Example: Enable OpenCode-Builder:**

```json
{
  "morpheus_agent": {
    "default_builder_enabled": true
  }
}
```

This enables OpenCode-Builder agent alongside Morpheus. The default build agent is always demoted to subagent mode when Morpheus is enabled.

**Example: Disable all Morpheus orchestration:**

```json
{
  "morpheus_agent": {
    "disabled": true
  }
}
```

You can also customize Morpheus agents like other agents:

```json
{
  "agents": {
    "Morpheus": {
      "model": "anthropic/claude-opus-4-6",
      "temperature": 0.1
    },
    "OpenCode-Builder": {
      "model": "anthropic/claude-opus-4"
    },
    "Oracle (Planner)": {
      "model": "openai/gpt-5.2"
    },
    "Seraph (Plan Consultant)": {
      "model": "anthropic/claude-sonnet-4-6"
    }
  }
}
```

| Option                    | Default | Description                                                                                                                            |
| ------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `disabled`                | `false` | When `true`, disables all Morpheus orchestration and restores original build/plan as primary.                                          |
| `default_builder_enabled` | `false` | When `true`, enables OpenCode-Builder agent (same as OpenCode build, renamed due to SDK limitations). Disabled by default.             |
| `planner_enabled`         | `true`  | When `true`, enables Oracle (Planner) agent with work-planner methodology. Enabled by default.                                     |
| `replace_plan`            | `true`  | When `true`, demotes default plan agent to subagent mode. Set to `false` to keep both Oracle (Planner) and default plan available. |

## Background Tasks

Configure concurrency limits for background agent tasks. This controls how many parallel background agents can run simultaneously.

```json
{
  "background_task": {
    "defaultConcurrency": 5,
    "staleTimeoutMs": 180000,
    "providerConcurrency": {
      "anthropic": 3,
      "openai": 5,
      "google": 10
    },
    "modelConcurrency": {
      "anthropic/claude-opus-4-6": 2,
      "anthropic/claude-haiku-4-5": 10
    }
  }
}
```

| Option                | Default | Description                                                                                                             |
| --------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| `defaultConcurrency`  | -       | Default maximum concurrent background tasks for all providers/models                                                    |
| `staleTimeoutMs`      | `180000` | Stale timeout in milliseconds - interrupt tasks with no activity for this duration (minimum: 60000 = 1 minute)             |
| `messageStalenessTimeoutMs` | `120000` | Timeout for message staleness detection (minimum: 60000)                                                         |
| `maxToolCalls`        | `75`    | Maximum tool calls per background task (minimum: 10)                                                                    |
| `providerConcurrency` | -       | Per-provider concurrency limits. Keys are provider names (e.g., `anthropic`, `openai`, `google`)                        |
| `modelConcurrency`    | -       | Per-model concurrency limits. Keys are full model names (e.g., `anthropic/claude-opus-4-6`). Overrides provider limits. |
| `circuitBreaker.enabled` | `false` | Enable circuit breaker for failing tasks                                                                            |
| `circuitBreaker.maxToolCalls` | `50` | Max tool calls before circuit breaker trips                                                                       |
| `circuitBreaker.consecutiveThreshold` | `3` | Consecutive failures before circuit breaker opens                                                              |
**Priority Order**: `modelConcurrency` > `providerConcurrency` > `defaultConcurrency`

**Use Cases**:
- Limit expensive models (e.g., Opus) to prevent cost spikes
- Allow more concurrent tasks for fast/cheap models (e.g., Gemini Flash)
- Respect provider rate limits by setting provider-level caps

## Categories

Categories enable domain-specific task delegation via the `task` tool. Each category applies runtime presets (model, temperature, prompt additions) when calling the `Mouse` agent.

### Built-in Categories

All 8 categories come with optimal model defaults, but **you must configure them to use those defaults**:

| Category             | Built-in Default Model             | Description                                                          |
| -------------------- | ---------------------------------- | -------------------------------------------------------------------- |
| `construct`          | `anthropic/claude-sonnet-4-6`       | Frontend, UI/UX, design, styling, animation                          |
| `source`             | `anthropic/claude-opus-4-6`        | Deep logical reasoning, complex architecture decisions               |
| `deep-jack`          | `anthropic/claude-sonnet-4-6`       | Goal-oriented autonomous problem-solving, thorough research          |
| `matrix-bend`        | `anthropic/claude-sonnet-4-6`       | Complex problem-solving with creative approaches                     |
| `bullet-time`        | `anthropic/claude-haiku-4-5`       | Trivial tasks - single file changes, typo fixes, simple modifications|
| `blue-pill`          | `anthropic/claude-sonnet-4-6`      | Tasks that don't fit other categories, low effort required           |
| `red-pill`           | `anthropic/claude-opus-4-6` (max)  | Tasks that don't fit other categories, high effort required          |
| `broadcast`          | `anthropic/claude-sonnet-4-6`       | Documentation, prose, technical writing                              |

### ⚠️ Critical: Model Resolution Priority

**Categories DO NOT use their built-in defaults unless configured.** Model resolution follows this priority:

```
1. User-configured model (in matrixx.json)
2. Category's built-in default (if you add category to config)
3. System default model (from opencode.json)
```

**Example Problem:**

```json
// opencode.json
{ "model": "anthropic/claude-sonnet-4-6" }

// matrixx.json (empty categories section)
{}

// Result: ALL categories use claude-sonnet-4-6 (wasteful!)
// - bullet-time tasks use Sonnet instead of Haiku (expensive)
// - source tasks use Sonnet instead of Opus (inferior reasoning)
// - construct tasks use Sonnet instead of dedicated model (suboptimal)
```

### Recommended Configuration

**To use optimal models for each category, add them to your config:**

```json
{
  "categories": {
    "source": { 
      "model": "anthropic/claude-opus-4-6"     // Deep reasoning & architecture
    },
    "deep-jack": { 
      "model": "anthropic/claude-sonnet-4-6",  // Goal-oriented problem solving
      "variant": "medium"
    },
    "matrix-bend": { 
      "model": "anthropic/claude-sonnet-4-6"   // Creative problem solving
    },
    "construct": { 
      "model": "anthropic/claude-sonnet-4-6"   // Frontend, UI/UX, design
    },
    "red-pill": { 
      "model": "anthropic/claude-opus-4-6",    // High effort, complex
      "variant": "max"
    },
    "blue-pill": { 
      "model": "anthropic/claude-sonnet-4-6"   // Low effort, general
    },
    "broadcast": { 
      "model": "anthropic/claude-sonnet-4-6"   // Documentation, prose
    },
    "bullet-time": { 
      "model": "anthropic/claude-haiku-4-5"    // Fast + cheap for trivial tasks
    }
  }
}
```

**Only configure categories you have access to.** Unconfigured categories fall back to your system default model.

### Usage

```javascript
// Via task tool
task(category="construct", prompt="Create a responsive dashboard component")
task(category="source", prompt="Design the payment processing flow")

// Or target a specific agent directly (bypasses categories)
task(agent="oracle", prompt="Review this architecture")
```

### Custom Categories

Add your own categories or override built-in ones:

```json
{
  "categories": {
    "data-science": {
      "model": "anthropic/claude-sonnet-4-6",
      "temperature": 0.2,
      "prompt_append": "Focus on data analysis, ML pipelines, and statistical methods."
    },
    "construct": {
      "model": "anthropic/claude-sonnet-4-6",
      "prompt_append": "Use shadcn/ui components and Tailwind CSS."
    }
  }
}
```

Each category supports: `model`, `temperature`, `top_p`, `maxTokens`, `thinking`, `reasoningEffort`, `textVerbosity`, `tools`, `prompt_append`, `variant`, `description`, `is_unstable_agent`.

#### Category Temperature

Each category can define a `temperature` that overrides the agent's default temperature for tasks routed through that category. This allows fine-grained control: use low temperature (0.1) for deterministic code generation, higher temperature (0.7) for creative tasks like documentation or brainstorming.

```json
{
  "categories": {
    "source": {
      "model": "anthropic/claude-opus-4-6",
      "temperature": 0.1
    },
    "broadcast": {
      "model": "anthropic/claude-sonnet-4-6",
      "temperature": 0.5
    }
  }
}
```

| Option             | Type    | Default | Description                                                                                         |
| ------------------ | ------- | ------- | --------------------------------------------------------------------------------------------------- |
| `description`       | string  | -       | Human-readable description of the category's purpose. Shown in task prompt.                     |
| `is_unstable_agent`| boolean | `false`  | Mark agent as unstable - forces background mode for monitoring. Auto-enabled for gemini models. |
| `fallback_models`   | string\|string[] | - | Fallback model(s) for this category. Overrides provider chain.                            |
| `complexity_downgrades` | object | -   | Map complexity level to model downgrade: `{ "2": "haiku" }`                              |
| `disable`           | boolean | `false` | When `true`, disables this category.                                                        |
## Model Resolution System

At runtime, Matrixx uses a 3-step resolution process to determine which model to use for each agent and category. This happens dynamically based on your configuration and available models.

### Overview

**Problem**: Users have different provider configurations. The system needs to select the best available model for each task at runtime.

**Solution**: A simple 3-step resolution flow:
1. **Step 1: User Override** — If you specify a model in `matrixx.json`, use exactly that
2. **Step 2: Provider Fallback** — Try each provider in the requirement's priority order until one is available
3. **Step 3: System Default** — Fall back to OpenCode's configured default model

### Resolution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     MODEL RESOLUTION FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Step 1: USER OVERRIDE                                         │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ User specified model in matrixx.json?            │   │
│   │         YES → Use exactly as specified                  │   │
│   │         NO  → Continue to Step 2                        │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│   Step 2: PROVIDER PRIORITY FALLBACK                            │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ For each provider in requirement.providers order:       │   │
│   │                                                         │   │
│   │ Example for Morpheus:                                    │   │
│   │ anthropic → github-copilot → opencode → antigravity     │   │
│   │     │            │              │            │          │   │
│   │     ▼            ▼              ▼            ▼          │   │
│   │ Try: anthropic/claude-opus-4-6                          │   │
│   │ Try: github-copilot/claude-opus-4-6                     │   │
│   │ Try: opencode/claude-opus-4-6                           │   │
│   │ ...                                                     │   │
│   │                                                         │   │
│   │ Found in available models? → Return matched model       │   │
│   │ Not found? → Try next provider                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼ (all providers exhausted)        │
│   Step 3: SYSTEM DEFAULT                                        │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Return systemDefaultModel (from opencode.json)          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Agent Provider Chains

Each agent has a defined provider priority chain. The system tries providers in order until it finds an available model:

| Agent | Model (no prefix) | Provider Priority Chain |
|-------|-------------------|-------------------------|
| **Morpheus** | `claude-opus-4-6` | anthropic → opencode (kimi-k2.5-free) → zai-coding-plan (glm-5) → opencode (big-pickle) |
| **Keymaker** | `gpt-5.3-codex` | openai/venice → github-copilot (gpt-5.2) |
| **Merovingian** | `claude-sonnet-4-6` | anthropic → openai (gpt-5.2) → google (gemini-3.1-pro) |
| **Operator** | `glm-4.7` | zai-coding-plan → opencode (glm-4.7-free) → opencode (minimax-m2.5-free) → anthropic (claude-sonnet-4-6) |
| **Trinity** | `grok-code-fast-1` | github-copilot → opencode (minimax-m2.5-free) → anthropic (claude-haiku-4-5) → opencode (gpt-5-nano) |
| **Construct** | `claude-sonnet-4-6` | anthropic → openai (gpt-5.2) → opencode (kimi-k2.5-free) → zai-coding-plan (glm-4.6v) |
| **Oracle (Planner)** | `claude-sonnet-4-6` | anthropic → openai (gpt-5.2) → opencode (kimi-k2.5-free) → google (gemini-3.1-pro) |
| **Seraph (Plan Consultant)** | `claude-opus-4-6` | anthropic → opencode (kimi-k2.5-free) → openai (gpt-5.2) → google (gemini-3.1-pro) |
| **Smith (Plan Reviewer)** | `gpt-5.2` | openai → anthropic (claude-opus-4-6) → google (gemini-3.1-pro) |
| **Architect** | `claude-sonnet-4-6` | anthropic → openai (gpt-5.2) → opencode (kimi-k2.5-free) |
| **Cipher** | `claude-sonnet-4-6` | anthropic → google-vertex-anthropic → openai (gpt-5.2) → opencode (kimi-k2.5-free) → google (gemini-3.1-pro) |

### Category Provider Chains

Categories follow the same resolution logic:

| Category | Model (no prefix) | Provider Priority Chain |
|----------|-------------------|-------------------------|
| **construct** | `claude-sonnet-4-6` | anthropic → google (gemini-3.1-pro) → openai (gpt-5.2) |
| **source** | `claude-opus-4-6` | anthropic → openai (gpt-5.3-codex) → google (gemini-3.1-pro) |
| **deep-jack** | `claude-sonnet-4-6` | anthropic → openai (gpt-5.3-codex) → google (gemini-3.1-pro) |
| **matrix-bend** | `claude-sonnet-4-6` | anthropic → google (gemini-3.1-pro) → openai (gpt-5.2) |
| **bullet-time** | `claude-haiku-4-5` | anthropic → opencode (gpt-5-nano) → opencode (minimax-m2.5-free) |
| **blue-pill** | `claude-sonnet-4-6` | anthropic → openai (gpt-5.3-codex) → google (gemini-3.1-pro) |
| **red-pill** | `claude-opus-4-6` | anthropic → openai (gpt-5.2) → google (gemini-3.1-pro) |
| **broadcast** | `claude-sonnet-4-6` | anthropic → opencode (kimi-k2.5-free) → google (gemini-3.1-pro) → openai (gpt-5.2) |

### Checking Your Configuration

Use the `doctor` command to see how models resolve with your current configuration:

```bash
bunx opencode-matrixx doctor --verbose
```

The "Model Resolution" check shows:
- Each agent/category's model requirement
- Provider fallback chain
- User overrides (if configured)
- Effective resolution path

### Manual Override

Override any agent or category model in `matrixx.json`:

```json
{
  "agents": {
    "Morpheus": {
      "model": "anthropic/claude-sonnet-4-6"
    },
    "oracle": {
      "model": "openai/o3"
    }
  },
  "categories": {
    "source": {
      "model": "anthropic/claude-opus-4-6"
    }
  }
}
```

When you specify a model override, it takes precedence (Step 1) and the provider fallback chain is skipped entirely.

## Hooks

Disable specific built-in hooks via `disabled_hooks` in `~/.config/opencode/matrixx.json` or `.opencode/matrixx.json`:

```json
{
  "disabled_hooks": ["comment-checker", "agent-usage-reminder"]
}
```

Available hooks (61 — see `src/config/schema/hooks.ts`): `agent-usage-reminder`, `anthropic-context-window-limit-recovery`, `anthropic-effort`, `architect`, `auto-slash-command`, `auto-update-checker`, `background-notification`, `bash-file-read-guard`, `category-skill-reminder`, `comment-checker`, `compaction-context-injector`, `compaction-todo-preserver`, `construct-notepad`, `context-mode-enforcer`, `context-window-monitor`, `delegate-task-retry`, `design-intent-preserver`, `directory-agents-injector`, `edit-error-recovery`, `empty-task-response-detector`, `env-context-injector`, `env-file-write-guard`, `input-secret-guard`, `evolution-compressor`, `evolution-hitl`, `evolution-quality-gate`, `evolution-watcher`, `hashline-edit-diff-enhancer`, `hashline-read-enhancer`, `interactive-bash-session`, `json-error-recovery`, `keyword-detector`, `matrix-loop`, `mouse-notepad`, `non-interactive-env`, `oracle-md-only`, `plan-persister`, `preemptive-compaction`, `read-image-resizer`, `rtk-bash-rewriter`, `rules-injector`, `runtime-fallback`, `secret-leak-guard`, `session-notification`, `session-recovery`, `start-work`, `startup-toast`, `stop-continuation-guard`, `task-continuation-enforcer`, `task-edit-guard`, `task-notepad`, `task-resume-info`, `tasks-todowrite-disabler`, `think-mode`, `thinking-block-validator`, `todo-continuation-enforcer`, `tool-output-truncator`, `tool-pair-validator`, `unstable-agent-babysitter`, `webfetch-redirect-guard`, `write-existing-file-guard`
**Note on `directory-agents-injector`**: This hook is **automatically disabled** when running on OpenCode 1.1.37+ because OpenCode now has native support for dynamically resolving AGENTS.md files from subdirectories (PR #10678). This prevents duplicate AGENTS.md injection. For older OpenCode versions, the hook remains active to provide the same functionality.

**Note on `auto-update-checker` and `startup-toast`**: The `startup-toast` hook is a sub-feature of `auto-update-checker`. To disable only the startup toast notification while keeping update checking enabled, add `"startup-toast"` to `disabled_hooks`. To disable all update checking features (including the toast), add `"auto-update-checker"` to `disabled_hooks`.

**Note on `quality-gate`**: The quality-gate hook auto-lints `.ts` files after write/edit tool calls using Biome. It runs as a post-tool hook and can be disabled via `disabled_hooks` if you prefer to lint separately.

## Disabled Commands

Disable specific built-in commands via `disabled_commands` in `~/.config/opencode/matrixx.json` or `.opencode/matrixx.json`:

```json
{
  "disabled_commands": ["init-deep", "start-work"]
}
```

Available commands (19): `init-deep`, `start-work`, `handoff`, `pickup`, `task-list`, `cleanup-tasks`, `dcp-profile`, `research`, `assembly`, `ultrawork`, `end-ultrawork`, `matrix-loop`, `cancel-loop`, `refactor`, `remove-deadcode`, `profile`, `bdd-contract`, `bdd-frontend`, `bdd-backend` (+ `ultrawork`/`ulw` keyword triggers)
## Comment Checker

Configure comment-checker hook behavior. The comment checker warns when excessive comments are added to code.

```json
{
  "comment_checker": {
    "custom_prompt": "Your custom warning message. Use {{comments}} placeholder for detected comments XML."
  }
}
```

| Option        | Default | Description                                                                |
| ------------- | ------- | -------------------------------------------------------------------------- |
| `custom_prompt` | -       | Custom warning message to replace the default. Use `{{comments}}` placeholder. |

## Notification

Configure notification behavior for background task completion.

```json
{
  "notification": {
    "force_enable": true
  }
}
```

| Option         | Default | Description                                                                                   |
| -------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `force_enable` | - (absent = `false`) | Force enable session-notification even if external notification plugins are detected. |

## Morpheus Tasks

Configure task storage for the Task System. The system is gated by `experimental.task_system` (default `true`) — see [Experimental](#experimental) and [Task System](./task-system.md).

```json
{
  "morpheus": {
    "tasks": {
      "storage_path": ".matrixx/tasks",
      "task_list_id": "my-project",
      "scope": "project",
      "claude_code_compat": false
    }
  }
}
```

### Tasks Configuration

| Option               | Type     | Default            | Description                                                               |
| -------------------- | -------- | ------------------ | ------------------------------------------------------------------------- |
| `storage_path`       | `string` | — (runtime default: `.matrixx/tasks` when `scope=project`) | Absolute or relative path override. When set, bypasses `scope`/`listId` resolution. |
| `task_list_id`       | `string` | — (falls back to `basename(cwd)` sanitized) | Force task list ID (alternative to `ULTRAWORK_TASK_LIST_ID` / `CLAUDE_CODE_TASK_LIST_ID` env). Sanitized to `[a-zA-Z0-9_-]`. |
| `scope`              | `"global" \| "project"` | `"project"` | `project` → `.matrixx/tasks` per project (default). `global` → `~/.config/opencode/tasks/{listId}`. |
| `claude_code_compat` | `boolean` | `false`            | Enable Claude Code path compatibility mode.                                |

## MCPs

Exa, Context7 and grep.app MCP enabled by default.

- **websearch**: Real-time web search powered by [Exa AI](https://exa.ai) - searches the web and returns relevant content
- **context7**: Fetches up-to-date official documentation for libraries
- **grep_app**: Ultra-fast code search across millions of public GitHub repositories via [grep.app](https://grep.app)

Don't want them? Disable via `disabled_mcps` in `~/.config/opencode/matrixx.json` or `.opencode/matrixx.json`:

```json
{
  "disabled_mcps": ["websearch", "context7", "grep_app"]
}
```

## Handoff Tool

The built-in **handoff** tool preserves session state across OpenCode sessions by writing structured context to `.matrixx/handoff.md`. It supports four actions:

- **create**: Write a structured handoff with YAML frontmatter (topics, goals, key files, decisions) and a markdown body
- **read**: Load the current handoff content for context pickup in a new session
- **archive**: Mark the active handoff as consumed (renames to `handoff.consumed.md`)
- **list**: Show all handoff files in the `.matrixx/` directory

No configuration is required — the tool is always available. Use the `/handoff` slash command to create a handoff, or `/pickup` to resume from one.

## LSP

OpenCode provides LSP tools for analysis.
Matrixx adds refactoring tools (rename, code actions).
All OpenCode LSP configs and custom settings (from `opencode.jsonc` / `opencode.json`) are supported, plus additional Matrixx-specific settings.
For config discovery, `.jsonc` takes precedence over `.json` when both exist (applies to both `opencode.*` and `matrixx.*`).

Add LSP servers via the `lsp` option in `~/.config/opencode/matrixx.jsonc` / `~/.config/opencode/matrixx.json` or `.opencode/matrixx.jsonc` / `.opencode/matrixx.json`:

```json
{
  "lsp": {
    "typescript-language-server": {
      "command": ["typescript-language-server", "--stdio"],
      "extensions": [".ts", ".tsx"],
      "priority": 10
    },
    "pylsp": {
      "disabled": true
    }
  }
}
```

Each server supports: `command`, `extensions`, `priority`, `env`, `initialization`, `disabled`.

| Option         | Type     | Default | Description                                                            |
| -------------- | -------- | ------- | ---------------------------------------------------------------------- |
| `command`       | array    | -       | Command to start the LSP server (executable + args)                          |
| `extensions`    | array    | -       | File extensions this server handles (e.g., `[".ts", ".tsx"]`)               |
| `priority`      | number   | -       | Server priority when multiple servers match a file                               |
| `env`           | object   | -       | Environment variables for the LSP server (key-value pairs)                     |
| `initialization`| object   | -       | Custom initialization options passed to the LSP server                        |
| `disabled`      | boolean  | `false`  | Whether to disable this LSP server                                         |

**Example with advanced options:**

```json
{
  "lsp": {
    "typescript-language-server": {
      "command": ["typescript-language-server", "--stdio"],
      "extensions": [".ts", ".tsx"],
      "priority": 10,
      "env": {
        "NODE_OPTIONS": "--max-old-space-size=4096"
      },
      "initialization": {
        "preferences": {
          "includeInlayParameterNameHints": "all",
          "includeInlayFunctionParameterTypeHints": true
        }
      }
    }
  }
}
```

## Experimental

Opt-in experimental features that may change or be removed in future versions. Use with caution.

```json
{
  "experimental": {
    "task_system": true,
    "truncate_all_tool_outputs": true,
    "aggressive_truncation": true,
    "auto_resume": true,
    "preemptive_compaction": true,
    "hashline_edit": true
  }
}
```

| Option                      | Default | Description                                                                                                                                                                                   |
| --------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `task_system`               | `true`  | Enable Task System (`task_create`/`task_update` etc.) and `tasks-todowrite-disabler` hook. When `false`, restores `TodoWrite`/`TodoRead`. See [Task System](./task-system.md). |
| `truncate_all_tool_outputs` | `false` | Truncates ALL tool outputs instead of just whitelisted tools (Grep, Glob, LSP, AST-grep). Tool output truncator is enabled by default - disable via `disabled_hooks`.                         |
| `aggressive_truncation`     | `false` | When token limit is exceeded, aggressively truncates tool outputs to fit within limits. More aggressive than the default truncation behavior. Falls back to summarize/revert if insufficient. |
| `auto_resume`               | `false` | Automatically resumes session after successful recovery from thinking block errors or thinking disabled violations. Extracts last user message and continues.                             |
| `preemptive_compaction`     | `false` | Proactively compact context before hitting limits.                                                                                                                                          |
| `plugin_load_timeout_ms`    | `10000` | Timeout in ms for `loadAllPluginComponents` during config handler init (min: 1000).                                                             |
| `safe_hook_creation`        | `true` (at call site) | Wrap hook creation in try/catch to prevent one failing hook from crashing the plugin.                                                  |
| `hashline_edit`             | `true` (at call site) | Enable hashline-anchored `Edit` tool for `.matrixx/plans/*.md` (line#hash IDs).                                                     |
## Context Mode

Enforce sandbox-based `ctx_*` tools (`ctx_read`, `ctx_grep`, `ctx_batch_execute`, `ctx_search`, `ctx_execute`) over raw `Read`/`Grep`/`Glob` for analysis. See [Context Management](./context-management.md) for the full 5-layer stack.

```jsonc
{
  "context_mode": {
    "enabled": true,      // default true — inject ctx_* discipline into prompts
    "enforce": false,     // when true, blocks raw grep/glob/read via hook
    "blocked_tools": ["read", "grep", "glob"]  // tools blocked when enforce:true
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Inject context-mode discipline into agent prompts. |
| `enforce` | `boolean` | `false` | When `true`, `context-mode-enforcer` hook blocks `read`/`grep`/`glob` for analysis — forces `ctx_*` sandbox (see `ctx_search(queries: [...])`). |
| `blocked_tools` | `string[]` | `["read","grep","glob"]` | Tools blocked when `enforce:true`. |

> Schema: `src/config/schema/context-mode.ts` (`ContextModeConfigSchema`). Example: `matrixx.example.jsonc` § context_mode.

## Headroom

Network-proxy compression via [Headroom](https://github.com/headroomlabs-ai/headroom) (`CacheAligner→ContentRouter→CCR`). Opt-in `headroom wrap opencode` proxy. See [Context Management §2.4](./context-management.md#24-headroom--network-proxy-compression).

```jsonc
{
  "headroom": {
    "enabled": false,                         // opt-in
    "proxyUrl": "http://127.0.0.1:8787",     // HEADROOM_PROXY_URL override
    "project": "my-project",                 // CCR scoping
    "backend": "openai"                      // HEADROOM_BACKEND
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable Headroom proxy + `headroom_retrieve`/`headroom_stats` discipline. |
| `proxyUrl` | `string` (url) | `http://127.0.0.1:8787` | Proxy URL. |
| `project` | `string` | — | CCR scoping per project. |
| `backend` | `string` | — | Maps to `HEADROOM_BACKEND`. |

> Schema: `src/config/schema/headroom.ts`. Requires `headroom wrap opencode` — see [Context Management](./context-management.md).

## RTK

Bash output compression via [RTK](https://github.com/rtk-ai/rtk) (`rtk <cmd>` rewriting hook). 60-90% token savings on `git`/`npm`/`cargo`/test outputs.

```jsonc
{
  "rtk": {
    "enabled": false,
    "binary_path": "rtk",      // optional — resolves via PATH
    "timeout_ms": 5000           // 1000–30000
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable RTK bash-rewriter hook. |
| `binary_path` | `string` | `rtk` | Path to `rtk` binary. |
| `timeout_ms` | `number` | `5000` | Subprocess timeout (1000–30000). |

> Schema: `src/config/schema/rtk.ts`. Install: `brew install rtk-ai/tap/rtk`.

## DCP

Dynamic Context Pruning — tiered pruning (`economy`/`balanced`/`performance`/`ultimate`) via [`@tarquinen/opencode-dcp`](https://github.com/tarquinen/opencode-dcp). Switch tiers with `/dcp-profile`.

```jsonc
{
  "dcp": {
    "enabled": true,
    "default_profile": "balanced",   // economy | balanced | performance | ultimate
    "profiles": { /* 4 built-in; override per tier */ },
    "base": { "pruneNotificationType": "chat", "autoUpdate": false }
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable DCP plugin bridge. Requires `@tarquinen/opencode-dcp` installed. |
| `default_profile` | `string` | — | Default DCP tier. |
| `profiles` | `object` | 4 built-in (`economy`/`balanced`/`performance`/`ultimate`) | Per-tier overrides for `compress`/`strategies`/`commands`/`manualMode`. |
| `base` | `object` | — | Base overrides (`pruneNotificationType`, `autoUpdate`, `debug`, `compress`, `strategies`, `commands`, `manualMode`, `protectedFilePatterns`). |

> Schema: `src/config/schema/dcp.ts` (~9.5k). Switch: `/dcp-profile <tier>` (`src/tools/dcp-switch-profile/`). Docs: [Context Management](./context-management.md).

## Assembly

Multi-model debate — 3-5 parallel voters from different providers, synthesis via reciprocal rank fusion.

```jsonc
{
  "assembly": {
    "enabled": false,           // default false — opt-in per call via assembly tool
    "default_voters": 3,        // 2–5
    "default_rounds": 2,        // 1–3
    "timeout_ms": 60000,        // 10000–300000
    "providers": [{ "providerID": "anthropic", "modelID": "claude-sonnet-4-6" }]
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable assembly tool globally. |
| `providers` | `array` | — | Provider-model pairs for auto-selection. |
| `default_voters` | `number` | — | Default voters (2–5). |
| `default_rounds` | `number` | — | Default synthesis rounds (1–3). |
| `timeout_ms` | `number` | — | Max wait per voter (10000–300000). |

> Schema: `src/config/schema/assembly.ts` (`AssemblyConfigSchema`). Tool: `src/tools/assembly/`.

## Security

Three-tier security: reactive hooks + policies + Sentinel agent. Hooks run first in pipeline (`position: pre`).

```jsonc
{
  "security": {
    "secret_scanning": { "enabled": true, "tool": "gitleaks", "block_on_detection": true },
    "env_file_guard": { "enabled": true },
    "dependency_audit": { "enabled": false },
    "input_secret_guard": {
      "enabled": true,
      "mode": "prompt",
      "blocklist_mode": "prompt",
      "warnlist_mode": "prompt",
      "allowlist_patterns": ["sk-test-.*"],
      "detection": { "entropy_threshold": 4.5, "max_scan_bytes": 65536 }
    }
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `secret_scanning.enabled` | `boolean` | `true` | Intercept `git commit`/`push`, run gitleaks, block on secrets. |
| `secret_scanning.tool` | `string` | `gitleaks` | Scanner binary. |
| `secret_scanning.block_on_detection` | `boolean` | `true` | Block commit/push when secrets found. |
| `env_file_guard.enabled` | `boolean` | `true` | Block agent writes to `.env`/`*.pem`/`*.key`/`credentials.json`/`id_rsa` (+14 patterns). |
| `dependency_audit.enabled` | `boolean` | `false` | Enable CVE/SBOM dependency audit (Sentinel). |
| `input_secret_guard.enabled` | `boolean` | `true` | Detect secrets in `chat.message` before LLM send (local-only, RE2). Secure-by-default. |
| `input_secret_guard.mode` | `"prompt" \| "block" \| "off"` | `"prompt"` | Global behaviour: `prompt`=require_approval (default, secure), `block`=hard block (no Allow Once), `off`=always continue (warn only, opt-in). |
| `input_secret_guard.blocklist_mode` | `"prompt" \| "block"` | `"prompt"` | Action for deterministic blocklist (30 gitleaks rules: `sk-proj-`, `ghp_`, `AKIA`, PEM, JWT). Never `off`. |
| `input_secret_guard.warnlist_mode` | `"prompt" \| "off"` | `"prompt"` | Action for heuristic warnlist (keyword proximity + entropy>4.5). |
| `input_secret_guard.allowlist_patterns` | `string[]` | — | RE2 patterns suppressing detection for that span (e.g. `"sk-test-.*"`). |
| `input_secret_guard.detection.entropy_threshold` | `number` | `4.5` | Shannon entropy gate (0-8) for high-entropy token heuristic. |
| `input_secret_guard.detection.max_scan_bytes` | `number` | `65536` | Cap scan slice (1024-262144, default 64KB). |

> Schema: `src/config/schema/security.ts`. Auditor: Sentinel agent (`security-*` skills). Hook: `secret-leak-guard` + `env-file-write-guard` + `input-secret-guard` (`chat.message`, local-only).

### Input Secret Guard (`chat.message`)

Guards **accidental paste** of API keys / passwords / private keys before they reach the LLM provider (irreversible sink, CWE-359). Like GitHub push protection: `Found 1 secret (openai-api-key: sk-proj…XXXX). Remove or confirm to send.`

* **Hook**: `input-secret-guard` — runs **first** in `chat.message` chain, before `keyword-detector`. Throw blocks delivery to LLM.
* **Detection** (local-only, <50 ms, RE2, zero network): tiered blocklist (~30 vendored gitleaks rules, near-zero FP) + warnlist (`local_heuristic`: keyword proximity `api_key|secret|password\s*[:=]` + Shannon entropy>4.5). `llm_judgement` is **rejected** (circular disclosure) — `local_heuristic` is the safe replacement.
* **Redaction**: Toast / log / chat injection show `AKIA…XXXX` (4-char prefix/suffix, PEM replaced), never raw secret. `hashFinding` keys cache, never raw value. No persistence to tasks/handoff/logs.
* **Allow flows**: `Allow Once` (one-shot `sessionID:hash`), `Allow Session` (session-scoped `Map`), `Block & Redact` (recommended). User replies `allow once` / `allow session` after block; confirmed via `session-allow-cache.ts` (in-memory `Map`, no disk, cleared on restart).
* **Ordering**: `inputSecretGuard` → `stopContinuationGuard` → `keywordDetector` → `autoSlashCommand` → `startWork`.

| `mode` | Behaviour | Warnlist |
|--------|-----------|----------|
| `prompt` (default) |  Block + redacted toast; require `allow once`/`allow session` or redact | Respects `warnlist_mode` |
| `block` | Hard block, no Allow Once (only redact & resend) | Blocklist `block` only |
| `off` | **Always continue** — detect but do not interrupt. ⚠️ **Warning**: disables protection; opt-in only, shows toast warning in docs. Not default. | `warnlist_mode: off` silences heuristic |

> ⚠️ `mode: "off"` disables prompting for warnlist findings and should only be used if you accept the risk and rely on external review. Blocklist findings still prompt unless `enabled: false` (global kill-switch). Rotate any key that was sent without approval — the guard mitigates *future* disclosure, not past.

To opt out per hook:

```jsonc
{
  "disabled_hooks": ["input-secret-guard"]
}
```

Redacted preview example: `openai-api-key: sk-proj…XXXX`, `aws-access-key: AKIA…XXXX`, `private-key-generic: -----BEGIN PRIVATE KEY----- …[REDACTED]`. Logs: `{sessionID, findingCount, redactedPreview, elapsedMs}` — no raw secret.


## Evolution (Self-Evolution)

Opt-in trace-driven skill evolution — watcher captures traces, compressor synthesizes, writer generates skills, governance approves, retention/budget gate.

```jsonc
{
  "evolution": {
    "enabled": false,
    "watcher": { "maxArgChars": 4000, "maxOutputChars": 8000 },
    "compressor": { "provider": "llm" },
    "writer": { "outputDir": ".matrixx/evolution/skills" },
    "governance": { "requireApproval": true },
    "retention": { "maxTraces": 1000 },
    "budget": { "maxCostPerRun": 1.0 }
  }
}
```

| Sub-config | Key fields | Default | Description |
|------------|------------|---------|-------------|
| `enabled` | `boolean` | `false` | Master toggle for self-evolution loop. |
| `watcher` | `maxArgChars`, `maxOutputChars`, `skipTools` | `4000`, `8000`, `["evolution-watcher","evolution-compressor"]` | Trace capture. |
| `compressor` | `provider` (`llm`\|`dspy-gepa`), `minTraces`, `maxInputTokens` | `llm`, `5`, `32000` | Trace synthesis. |
| `writer` | `outputDir`, `globalSkills`, `allowToolGeneration`, `allowAgentGeneration` | `.matrixx/evolution/skills`, `false`, `false`, `false` | Skill generation. |
| `governance` | `requireApproval` | `true` | Human approval before promotion. |
| `retention` | `maxTraces`, `maxPending` | `1000` | Trace/proposal retention. |
| `budget` | `maxCostPerRun` | `1.0` | Compression cost throttle. |

> Schema: `src/config/schema/evolution.ts` (6 sub-schemas). Full docs: [Evolution](./evolution.md). Commands: `/evolution` (approve/reject/list/audit).

## Matrix Loop

Self-referential development loop — agent iterates until completion criteria met.

```jsonc
{
  "matrix_loop": {
    "enabled": false,
    "default_max_iterations": 10,
    "state_dir": ".matrixx/matrix-loop"
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable matrix-loop hook. |
| `default_max_iterations` | `number` | `10` | Default max iterations per loop. |
| `state_dir` | `string` | `.matrixx/matrix-loop` | State directory. |

> Schema: `src/config/schema/matrix-loop.ts`.

## Babysitting

Unstable-agent monitoring — forces background mode for flaky providers (auto-enabled for Gemini).

```jsonc
{
  "babysitting": {
    "timeout_ms": 30000
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeout_ms` | `number` | `30000` | Monitoring timeout for unstable agents. |

> Schema: `src/config/schema/babysitting.ts`.

## TDD Enforcer

Enforce test-driven development — `*.test.ts` alongside source, BDD comments, fail→implement→pass→refactor.

```jsonc
{
  "tdd_enforcer": {
    "enabled": false
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable TDD enforcer hook. |

> Schema: `src/config/schema/tdd-enforcer.ts`. Skill: `tdd-enforcer`.

## Runtime Fallback

Provider fallback on transient errors — retry with next provider in chain.

```jsonc
{
  "runtime_fallback": {
    "enabled": true,
    "retry_on_errors": ["rate_limit", "timeout"],
    "max_fallback_attempts": 3
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable runtime fallback. |
| `retry_on_errors` | `string[]` | `["rate_limit","timeout"]` | Error types to retry. |
| `max_fallback_attempts` | `number` | `3` | Max fallback attempts per call. |

> Schema: `src/config/schema/runtime-fallback.ts`.

## Environment Variables


| Variable              | Description                                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENCODE_CONFIG_DIR` | Override the OpenCode configuration directory. Useful for profile isolation with tools like [OCX](https://github.com/kdcokenny/ocx) ghost mode. |
