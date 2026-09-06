# Matrixx Features

---

## Agents: Your AI Team

Matrixx provides 14 specialized AI agents. Each has distinct expertise, optimized models, and tool permissions.

### Core Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| **Morpheus** | `anthropic/claude-opus-4-6` | **The default orchestrator.** Plans, delegates, and executes complex tasks using specialized subagents with aggressive parallel execution. Todo-driven workflow with extended thinking (32k budget). Fallback: claude-sonnet-4-6 → gpt-5.2. |
| **Keymaker** | `openai/gpt-5.3-codex` | **The Legitimate Craftsman.** Autonomous deep worker inspired by AmpCode's deep mode. Goal-oriented execution with thorough research before action. Explores codebase patterns, completes tasks end-to-end without premature stopping. Fallback: gpt-5.2. Requires openai/github-copilot/venice/opencode provider. |
| **Merovingian** | `anthropic/claude-sonnet-4-6` | Architecture decisions, code review, debugging. Read-only consultation — stellar logical reasoning and deep analysis. Fallback: claude-opus-4-6 → gpt-5.2. |
| **Operator** | `anthropic/claude-haiku-4-5` | Multi-repo analysis, documentation lookup, OSS implementation examples. Deep codebase understanding with evidence-based answers. Fallback: claude-sonnet-4-6 → gpt-5.2. |
| **Trinity** | `anthropic/claude-haiku-4-5` | Fast codebase exploration and contextual grep. Fallback: claude-sonnet-4-6 → gpt-5.2. |
| **Construct** | `anthropic/claude-sonnet-4-6` | Visual content specialist. Analyzes PDFs, images, diagrams to extract information. Fallback: claude-opus-4-6 → gpt-5.2. |
| **Sati** | `anthropic/claude-sonnet-4-6` | **The frontend specialist.** UI/UX, components, accessibility (WCAG 2.2), performance (Core Web Vitals), testing (Vitest, Playwright, Storybook). Self-contained execution with 7 frontend skills. Fallback: claude-opus-4-6@max. |

### Planning Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| **Oracle** | `anthropic/claude-sonnet-4-6` | Strategic planner with interview mode. Creates detailed work plans through iterative questioning. Fallback: claude-opus-4-6 → gpt-5.2. |
| **Seraph** | `anthropic/claude-opus-4-6` | Plan consultant — pre-planning analysis. Identifies hidden intentions, ambiguities, and AI failure points. Fallback: gpt-5.2 → claude-sonnet-4-6. |
| **Smith** | `anthropic/claude-sonnet-4-6` | Plan reviewer — validates plans against clarity, verifiability, and completeness standards. Fallback: claude-opus-4-6 → gpt-5.2. |

### Invoking Agents

The main agent invokes these automatically, but you can call them explicitly:

```
Ask @merovingian to review this design and propose an architecture
Ask @operator how this is implemented - why does the behavior keep changing?
Ask @trinity for the policy on this feature
```

### Tool Restrictions

| Agent | Restrictions |
|-------|-------------|
| merovingian | Read-only: cannot write, edit, or delegate |
| operator | Cannot write, edit, or delegate |
| trinity | Cannot write, edit, or delegate |
| construct | Allowlist only: read, glob, grep |

### Background Agents

Run agents in the background and continue working:

- Have GPT debug while Claude tries different approaches
- Gemini writes frontend while Claude handles backend
- Fire massive parallel searches, continue implementation, use results when ready

```
# Launch in background
task(subagent_type="explore", load_skills=[], prompt="Find auth implementations", run_in_background=true)

# Continue working...
# System notifies on completion

# Retrieve results when needed
background_output(task_id="bg_abc123")
```

#### Visual Multi-Agent with Tmux

Enable `tmux.enabled` to see background agents in separate tmux panes:

```json
{
  "tmux": {
    "enabled": true,
    "layout": "main-vertical"
  }
}
```

When running inside tmux:
- Background agents spawn in new panes
- Watch multiple agents work in real-time
- Each pane shows agent output live
- Auto-cleanup when agents complete

See [Tmux Integration](configurations.md#tmux-integration) for full configuration options.

Customize agent models, prompts, and permissions in `matrixx.json`. See [Configuration](configurations.md#agents).

---


## Skills: Specialized Knowledge

Skills provide specialized workflows with embedded MCP servers and detailed instructions.

### Built-in Skills

| Skill | Trigger | Description |
|-------|---------|-------------|
| **playwright** | Browser tasks, testing, screenshots | Browser automation via Playwright MCP. MUST USE for any browser-related tasks - verification, browsing, web scraping, testing, screenshots. |
| **frontend-ui-ux** | UI/UX tasks, styling | Designer-turned-developer persona. Crafts stunning UI/UX even without design mockups. Emphasizes bold aesthetic direction, distinctive typography, cohesive color palettes. |
| **git-master** | commit, rebase, squash, blame | MUST USE for ANY git operations. Atomic commits with automatic splitting, rebase/squash workflows, history search (blame, bisect, log -S). |
|| **ulw-research** | research, deep dive, investigate, explore codebase | Saturation research orchestrator. Spawns parallel explore/librarian swarms across code, docs, web, and OSS repos. Recursively follows EXPAND leads until convergence (novelty-based, max 5 rounds). Proves contested claims by running code. Returns cited synthesis to .matrixx/. |
|| **remove-ai-slops** | cleanup code, remove ai slop, de-ai, code cleanup | Detects and removes 7 categories of AI-generated code smells: verbose comments, redundant error handling, over-engineered patterns, generic AI phrasing, cargo-cult boilerplate, padding/verbosity, weird codegen artifacts. Hybrid analysis + guided fix mode. |

All built-in skills follow **SDO (Skill Discovery Optimization)** — descriptions use trigger-first patterns with cross-references for high-precision agent delegation.

### Lazy Skill Loading (Built-in Skills)

All 45 built-in skills use **lazy template resolution**. Skill factories (and their large markdown template bodies) are NOT evaluated at plugin init — they hydrate on first reference via a self-destructing getter pattern.

**How it works:**

- `createBuiltinSkills()` returns BuiltinSkill objects whose `.template` is an `Object.defineProperty` getter.
- On first `.template` access, the factory is invoked once; the result is cached on the skill object (replaces getter with a data property).
- Browser skills (playwright / agent-browser / playwright-cli) are loaded eagerly because the active provider is decided at init; all other 42 skills are lazy.
- `description` is populated only on first access as well (cannot call factory eagerly without defeating laziness).

**Why it matters:**

- **Faster plugin init** — module parse time for skill files is deferred.
- **Lower memory pressure at startup** — template bodies (often 5–20KB of markdown each) stay un-evaluated.
- **Zero behavioral change** — the API (`BuiltinSkill.template: string`) is unchanged. Consumers see no difference.
- **Transparent** — no config flag, no opt-in.

**Files:**

- `src/features/builtin-skills/lazy-skill-helper.ts` — `createLazyTemplateSkill()` factory + cache.
- `src/features/builtin-skills/skills.ts` — wraps all non-browser skill loaders via the helper.

**Note:** Custom (project / user) skills loaded via the opencode-skill-loader are NOT affected — they already use the async `LazyContentLoader` pattern for their markdown bodies.

### Per-Task Complexity Routing (delegate_task)

The `delegate_task` tool accepts an optional `complexity` field (1-5 or `"auto"`) that allows the resolver to downgrade the model to a cheaper tier when the task is judged simple. This is an **orthogonal, opt-in** dimension layered on top of the existing 8-category routing.

**Levels:**

| Level | Heuristic | Typical use |
|-------|-----------|-------------|
| 1 | Trivial — typo fix, single-line change, no dependencies | "Rename variable X to Y" |
| 2 | Small — few files, low coupling, well-scoped | "Add a log line to this hook" |
| 3 | Moderate (default) — typical delegate_task work | "Refactor this component" |
| 4 | Complex — multi-file, design decisions | "Add a new MCP server" |
| 5 | Architecturally significant | "Design the auth flow" |

**How it works:**

- **No complexity param (default `"auto"`):** `autoScoreComplexity()` inspects the task's `description`, `prompt`, `load_skills`, and `category` to assign a conservative level. The default is 3 (no downgrade).
- **Explicit number:** Caller overrides the auto-score (e.g., `complexity: 1` for a known-trivial task).
- **Downgrade only:** P3 NEVER upgrades a task to a more expensive tier. If the resolved model is already the cheapest available for the category, nothing happens.
- **Per-category downgrade map:** Built-in `BUILTIN_COMPLEXITY_DOWNGRADES` maps each category to a cheaper-tier model for levels 1-2. Users can override per category via `complexity_downgrades` in their `matrixx.jsonc`.
- **Logged:** Every downgrade decision is logged with `from`/`to`/`complexity` for transparency. The tool result includes `complexityApplied` and `complexityDowngraded` flags.

**Cost impact:**

- **Honest estimate: 15-25% cost reduction** on routable tasks for sessions with model headroom.
- **0% savings on `free` / `budget` tiers** — those already pin agents to the cheapest tier; P3 has nowhere to downgrade from.
- Quality impact: conservative default + explicit override + per-task logging means the pilotfish-validated 96% quality at 46% cost (Anthropic BrowseComp) is achievable in principle, but real-world Matrixx savings are lower because typical sessions have fewer routable tasks than the pilotfish benchmark.

**100% backwards compatible:** omitting `complexity` from a `delegate_task` call leaves behavior identical to before. The tool schema adds the field as optional with default `"auto"`.

**Files:**

- `src/tools/delegate-task/complexity-types.ts` — `ComplexityLevel` type + `Complexity` union (1-5 | "auto")
- `src/tools/delegate-task/complexity-constants.ts` — `BUILTIN_COMPLEXITY_DOWNGRADES` + `resolveComplexityModel()`
- `src/tools/delegate-task/complexity-scorer.ts` — `autoScoreComplexity()` heuristic (file/line counts, keywords, category modifier)
- `src/tools/delegate-task/category-resolver.ts` — full integration: auto-score → resolve → log → re-parse model
- `src/config/schema/categories.ts` — `complexity_downgrades` per-category override field
- `assets/matrixx.schema.json` — regenerated

### Skill: Browser Automation (playwright / agent-browser)

**Trigger**: Any browser-related request

Matrixx provides two browser automation providers, configurable via `browser_automation_engine.provider`:

#### Option 1: Playwright MCP (Default)

The default provider uses Playwright MCP server:

```yaml
mcp:
  playwright:
    command: npx
    args: ["@playwright/mcp@latest"]
```

**Usage**:
```
/playwright Navigate to example.com and take a screenshot
```

#### Option 2: Agent Browser CLI (Vercel)

Alternative provider using [Vercel's agent-browser CLI](https://github.com/vercel-labs/agent-browser):

```json
{
  "browser_automation_engine": {
    "provider": "agent-browser"
  }
}
```

**Requires installation**:
```bash
bun add -g agent-browser
```

**Usage**:
```
Use agent-browser to navigate to example.com and extract the main heading
```

#### Capabilities (Both Providers)

- Navigate and interact with web pages
- Take screenshots and PDFs
- Fill forms and click elements
- Wait for network requests
- Scrape content

### Skill: frontend-ui-ux

**Trigger**: UI design tasks, visual changes

A designer-turned-developer who crafts stunning interfaces:

- **Design Process**: Purpose, Tone, Constraints, Differentiation
- **Aesthetic Direction**: Choose extreme - brutalist, maximalist, retro-futuristic, luxury, playful
- **Typography**: Distinctive fonts, avoid generic (Inter, Roboto, Arial)
- **Color**: Cohesive palettes with sharp accents, avoid purple-on-white AI slop
- **Motion**: High-impact staggered reveals, scroll-triggering, surprising hover states
- **Anti-Patterns**: Generic fonts, predictable layouts, cookie-cutter design

### Skill: git-master

**Trigger**: commit, rebase, squash, "who wrote", "when was X added"

Three specializations in one:

1. **Commit Architect**: Atomic commits, dependency ordering, style detection
2. **Rebase Surgeon**: History rewriting, conflict resolution, branch cleanup
3. **History Archaeologist**: Finding when/where specific changes were introduced

**Core Principle - Multiple Commits by Default**:
```
3+ files -> MUST be 2+ commits
5+ files -> MUST be 3+ commits
10+ files -> MUST be 5+ commits
```

**Automatic Style Detection**:
- Analyzes last 30 commits for language (Korean/English) and style (semantic/plain/short)
- Matches your repo's commit conventions automatically

**Usage**:
```
/git-master commit these changes
/git-master rebase onto main
/git-master who wrote this authentication code?
```

### Skill: ulw-research (Saturation Research)

**Trigger**: research, deep dive, investigate, explore codebase, find how, saturation research

A multi-round saturation research orchestrator that explores code, docs, web, and OSS in parallel:

- **Phase 0**: Parse topic, create artifact directory, seed initial queries
- **Phase 1**: Spawn 4 parallel agents (local-code explore, docs explore, web librarian, OSS librarian)
- **Phase 2**: Check convergence via novelty detection (stop when <30% novel findings)
- **Phase 3**: Verify contested claims by running code
- **Phase 4**: Produce cited synthesis in `.matrixx/research-<topic>-<timestamp>/final-synthesis.md`

**Convergence**: Adaptive (novelty-based), max 5 rounds hard limit

**Usage**:
```
/research how does context window management work in this codebase
/research React 19 server component patterns --scope=web --max-rounds=3
```

Also accessible via the `ulw-research` built-in skill (load with `load_skills=["ulw-research"]`) or the `/research` slash command.

---

### Skill: remove-ai-slops (AI Code Smell Detection)

**Trigger**: cleanup code, remove ai slop, code cleanup, fix ai code, de-ai

Hybrid mode (analysis + guided fix) for removing AI-generated code smells across 7 categories:

1. **Verbose Comments** — `// This function does X by doing Y`, obvious self-explanatory comments
2. **Redundant Error Handling** — re-throw with no added value, null checks on already-guarded paths
3. **Over-engineered Patterns** — FactoryFactory, unnecessary abstractions, excessive indirection
4. **Generic AI Phrasing** — "It's worth noting that...", "Let's step through this...", padding phrases
5. **Cargo-cult Boilerplate** — Copy-pasted patterns without understanding, excessive defensive programming
6. **Padding/Verbosity** — Empty docstrings, redundant type annotations, unnecessary intermediate variables
7. **Weird Codegen Artifacts** — Language-mismatched conventions, inconsistent style within same file

**Workflow**:
1. **Scan** — 7 category passes using grep, AST-grep, and heuristics
2. **Report** — Grouped findings with severity table
3. **Guided Fix** — Current → Proposed diffs, user approves/rejects per finding
4. **Verify** — `lsp_diagnostics` + typecheck on modified files

Also integrated into `review-work` as Agent 6 (advisory SUP).

### Custom Skills

Load custom skills from:
- `.opencode/skills/*/SKILL.md` (project)
- `~/.config/opencode/skills/*/SKILL.md` (user)
- `.claude/skills/*/SKILL.md` (Claude Code compat)
- `~/.claude/skills/*/SKILL.md` (Claude Code user)

Disable built-in skills via `disabled_skills: ["playwright"]` in config.

---

## Commands: Slash Workflows

Commands are slash-triggered workflows that execute predefined templates.

### Built-in Commands

| Command | Description |
|---------|-------------|
| `/init-deep` | Initialize hierarchical AGENTS.md knowledge base |
| `/matrix-loop` | Start self-referential development loop until completion |
| `/ulw-loop` | Start ultrawork loop - continues with ultrawork mode |
| `/cancel-loop` | Cancel active Matrix Loop |
| `/refactor` | Intelligent refactoring with LSP, AST-grep, architecture analysis, and TDD verification |
| `/start-work` | Start Morpheus work session from Oracle plan |

| `/handoff` | Create a detailed context summary for continuing work in a new session |

| `/pickup` | Load handoff context from a previous session |
|| `/research` | Saturation research with parallel swarms and convergence — code, docs, web, and OSS repos |


### Command: /init-deep

**Purpose**: Generate hierarchical AGENTS.md files throughout your project

**Usage**:
```
/init-deep [--create-new] [--max-depth=N]
```

Creates directory-specific context files that agents automatically read:
```
project/
├── AGENTS.md              # Project-wide context
├── src/
│   ├── AGENTS.md          # src-specific context
│   └── components/
│       └── AGENTS.md      # Component-specific context
```

### Command: /matrix-loop

**Purpose**: Self-referential development loop that runs until task completion

**Usage**:
```
/matrix-loop "Build a REST API with authentication"
/matrix-loop "Refactor the payment module" --max-iterations=50
```

**Behavior**:
- Agent works continuously toward the goal
- Detects `<promise>DONE</promise>` to know when complete
- Auto-continues if agent stops without completion
- Ends when: completion detected, max iterations reached (default 100), or `/cancel-loop`

**Configure**: `{ "matrix_loop": { "enabled": true, "default_max_iterations": 100 } }`

### Command: /ulw-loop

**Purpose**: Same as matrix-loop but with ultrawork mode active

Everything runs at maximum intensity - parallel agents, background tasks, aggressive exploration.

### Command: /refactor

**Purpose**: Intelligent refactoring with full toolchain

**Usage**:
```
/refactor <target> [--scope=<file|module|project>] [--strategy=<safe|aggressive>]
```

**Features**:
- LSP-powered rename and navigation
- AST-grep for pattern matching
- Architecture analysis before changes
- TDD verification after changes
- Codemap generation

### Command: /start-work

**Purpose**: Start execution from an Oracle-generated plan

**Usage**:
```
/start-work [plan-name]
```

Uses Architect agent to execute planned tasks systematically.


### Command: /handoff



**Purpose**: Persist the current session's context so a new session can resume the work.



**Usage**:

```

/handoff [goal]

```



**What it does**:

- Gathers session context via `session_read`, `todoread`, and `git` commands

- Calls the `handoff` tool with `action="create"` and the gathered data

- Writes `.matrixx/handoff.md` (YAML frontmatter + markdown body) automatically — no manual file writing

- Returns the file path and a `topics` echo in the success message



**Important**: The handoff is **NOT auto-loaded** in a new session. Use `/pickup` to load it.



### Command: /pickup



**Purpose**: Load handoff context from a previous session.



**Usage**:

```

/pickup [task to continue with]

```



**What it does**:

- Calls the `handoff` tool with `action="read"` to load the active handoff

- Summarizes the loaded context (Goal, Work Completed, Pending Tasks)

- Calls the `handoff` tool with `action="archive"` to mark the handoff as consumed



**Important**: Archiving renames `handoff.md` → `handoff.consumed.md`, so the handoff can only be picked up once. The `consumed` file is preserved for audit but is no longer the active handoff.


### Command: /research

**Purpose**: Systematic multi-round saturation research on any topic

**Usage**:
```
/research <topic> [--scope=code|docs|web|oss|all] [--max-rounds=N]
```

**Behavior**:
1. Creates artifact directory `.matrixx/research-<topic>-<timestamp>/`
2. Spawns 4 parallel research agents (code explore, docs explore, web librarian, OSS librarian)
3. Collects findings, identifies new leads
4. Recursively follows leads until convergence (novelty-based stop, max 5 rounds)
5. Verifies contested claims by running code
6. Produces cited synthesis in `final-synthesis.md`

**Output**: All artifacts written to `.matrixx/research-<topic>-<timestamp>/`

**Examples**:
```
/research authentication middleware best practices
/research React 19 server component patterns --scope=web --max-rounds=3
```

---

### Custom Commands

Load custom commands from:
- `.opencode/command/*.md` (project)
- `~/.config/opencode/command/*.md` (user)
- `.claude/commands/*.md` (Claude Code compat)
- `~/.claude/commands/*.md` (Claude Code user)

---

## Hooks: Lifecycle Automation

Hooks intercept and modify behavior at key points in the agent lifecycle.

### Hook Events

| Event | When | Can |
|-------|------|-----|
| **PreToolUse** | Before tool execution | Block, modify input, inject context |
| **PostToolUse** | After tool execution | Add warnings, modify output, inject messages |
| **UserPromptSubmit** | When user submits prompt | Block, inject messages, transform prompt |
| **Stop** | When session goes idle | Inject follow-up prompts |

### Built-in Hooks

#### Context & Injection

| Hook | Event | Description |
|------|-------|-------------|
| **directory-agents-injector** | PostToolUse | Auto-injects AGENTS.md when reading files. Walks from file to project root, collecting all AGENTS.md files. **Deprecated for OpenCode 1.1.37+** - Auto-disabled when native AGENTS.md injection is available. |
| **directory-readme-injector** | PostToolUse | Auto-injects README.md for directory context. |
| **rules-injector** | PostToolUse | Injects rules from `.claude/rules/` when conditions match. Supports globs and alwaysApply. |
| **compaction-context-injector** | Stop | Preserves critical context during session compaction. |

#### Productivity & Control

| Hook | Event | Description |
|------|-------|-------------|
| **keyword-detector** | UserPromptSubmit | Detects keywords and activates modes: `ultrawork`/`ulw` (max performance), `search`/`find` (parallel exploration), `analyze`/`investigate` (deep analysis). |
| **think-mode** | UserPromptSubmit | Auto-detects extended thinking needs. Catches "think deeply", "ultrathink" and adjusts model settings. |
| **matrix-loop** | Stop | Manages self-referential loop continuation. |
| **start-work** | PostToolUse | Handles /start-work command execution. |
| **auto-slash-command** | UserPromptSubmit | Automatically executes slash commands from prompts. |

#### Quality & Safety

| Hook | Event | Description |
|------|-------|-------------|
| **comment-checker** | PostToolUse | Reminds agents to reduce excessive comments. Smartly ignores BDD, directives, docstrings. |
| **thinking-block-validator** | PreToolUse | Validates thinking blocks to prevent API errors. |
| **empty-message-sanitizer** | PreToolUse | Prevents API errors from empty chat messages. |
| **edit-error-recovery** | PostToolUse | Recovers from edit tool failures. |

#### Recovery & Stability

| Hook | Event | Description |
|------|-------|-------------|
| **session-recovery** | Stop | Recovers from session errors - missing tool results, thinking block issues, empty messages. |
| **anthropic-context-window-limit-recovery** | Stop | Handles Claude context window limits gracefully. |
| **background-compaction** | Stop | Auto-compacts sessions hitting token limits. |

#### Truncation & Context Management

| Hook | Event | Description |
|------|-------|-------------|
| **grep-output-truncator** | PostToolUse | Dynamically truncates grep output based on context window. Keeps 50% headroom, caps at 50k tokens. |
| **tool-output-truncator** | PostToolUse | Truncates output from Grep, Glob, LSP, AST-grep tools. |
| **context-mode-enforcer** | PreToolUse (BLOCKING when `enforce:true`) | Blocks `read`/`grep`/`glob` for analysis — forces `ctx_*` sandbox (`ctx_search`, `ctx_batch_execute`). See [Context Management](./context-management.md). |
| **rtk-bash-rewriter** | PreToolUse | Rewrites bash via `rtk <cmd>` for 60-90% token compression on git/npm/test outputs. |
| **dcp** | Opt-in | Dynamic Context Pruning tiers `economy`/`balanced`/`performance`/`ultimate` via `/dcp-profile`. See [Context Management](./context-management.md). |
| **headroom-integration** | Opt-in | Network-proxy compression (L4) via `headroom wrap opencode` — CacheAligner→ContentRouter→CCR, 60-95% JSON reduction. Matrixx bridge: `headroom: {enabled, proxyUrl?, project?, backend?}` + `hasHeadroom` discipline. |

#### Notifications & UX

| Hook | Event | Description |
|------|-------|-------------|
| **auto-update-checker** | UserPromptSubmit | Checks for new versions, shows startup toast with version and Morpheus status. |
| **background-notification** | Stop | Notifies when background agent tasks complete. |
| **session-notification** | Stop | OS notifications when agents go idle. Works on macOS, Linux, Windows. |
| **agent-usage-reminder** | PostToolUse | Reminds you to leverage specialized agents for better results. |

#### Task Management

| Hook | Event | Description |
|------|-------|-------------|
| **task-continuation-enforcer** | Stop | Auto-continues session while incomplete tasks remain (2s countdown, toast, abort/cooldown/circuit-breaker). See [Task System](./task-system.md) §8.1. |
| **tasks-todowrite-disabler** | PreToolUse (BLOCKING) | Throws on `TodoWrite`/`TodoRead` when `experimental.task_system=true` — forces `task_create`/`task_update`. Triple-layer with tool config. |
| **task-edit-guard** | PreToolUse (BLOCKING) | Blocks raw `sed`/`echo`/`cat`/`mv` on `.matrixx/tasks/T-*.json` and `.matrixx/plans/*.md` — forces `task_*` / `Edit` (hashline). |
| **task-resume-info** | PostToolUse | Provides task resume hint `task(session_id="…")` for delegate_task continuity. |
| **delegate-task-retry** | PostToolUse | Retries failed delegate_task calls on transient LLM errors. |
| **task-notepad** | UserPromptSubmit | Injects `.matrixx/tasks` context fragment on session start. |
| **empty-task-response-detector** | PostToolUse | Re-prompts on empty assistant message while tasks remain. |
#### Integration

| Hook | Event | Description |
|------|-------|-------------|
| **architect** | All | Main orchestration logic (771 lines). |
| **interactive-bash-session** | PreToolUse | Manages tmux sessions for interactive CLI. |
| **non-interactive-env** | PreToolUse | Handles non-interactive environment constraints. |

#### Persistence & Recovery

| Hook | Event | Description |
|------|-------|-------------|
| **plan-persister** | Stop | Persists active plan state (todos + metadata) to plan file on session.idle. Builds rehydration context for injection after compaction. Survives process restarts, /clear, and crashes. |

#### Specialized

| Hook | Event | Description |
|------|-------|-------------|
| **oracle-md-only** | PostToolUse | Enforces markdown-only output for Oracle planner. |

### Claude Code Hooks Integration

Run custom scripts via Claude Code's `settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [{ "type": "command", "command": "eslint --fix $FILE" }]
      }
    ]
  }
}
```

**Hook locations**:
- `~/.claude/settings.json` (user)
- `./.claude/settings.json` (project)
- `./.claude/settings.local.json` (local, git-ignored)

### Disabling Hooks

Disable specific hooks in config:

```json
{
  "disabled_hooks": [
    "comment-checker",
    "auto-update-checker",
    "startup-toast"
  ]
}
```

---

## Tools: Agent Capabilities

### LSP Tools (IDE Features for Agents)

| Tool | Description |
|------|-------------|
| **lsp_diagnostics** | Get errors/warnings before build |
| **lsp_prepare_rename** | Validate rename operation |
| **lsp_rename** | Rename symbol across workspace |
| **lsp_goto_definition** | Jump to symbol definition |
| **lsp_find_references** | Find all usages across workspace |
| **lsp_symbols** | Get file outline or workspace symbol search |

### AST-Grep Tools

| Tool | Description |
|------|-------------|
| **ast_grep_search** | AST-aware code pattern search (25 languages) |
| **ast_grep_replace** | AST-aware code replacement |

### Delegation Tools

| Tool | Description |
|------|-------------|
| **delegate_agent** | Spawn trinity/operator agents. Supports `run_in_background`. |
| **task** | Category-based task delegation. Supports categories (visual, business-logic) or direct agent targeting. |
| **background_output** | Retrieve background task results |
| **background_cancel** | Cancel running background tasks |
| **assembly** | Spawns multiple AI agents (voters) with different model providers to independently analyze a question/decision, then synthesizes their reasoning into a unified consensus. Supports 2-5 voters, 1-3 rounds, and model override. |

### Task Tools — File-Backed Task System

| Tool | Description |
|------|-------------|
| **task_create** | Create `T-{uuid}` task (`pending`, `blockedBy`/`blocks`, `metadata`). Atomic write + lock. See [Task System](./task-system.md) §6.1. |
| **task_get** | Read single task by ID. Returns `TaskObject` or `null`. Validates `T-` pattern. |
| **task_list** | List active tasks (filters `completed`/`deleted`, resolves `blockedBy` to unresolved only). Scheduler primitive for wave planning. |
| **task_update** | Update task — scalar fields + additive `addBlocks`/`addBlockedBy` (Set merge) + `metadata` merge (`null` deletes). |
| **task_cleanup** | Delete `completed` tasks by age (`olderThan: "7d"`/`"24h"`/`"30m"`). Bulk cleanup — never deletes `pending`/`in_progress`. |
| **task_list** (command) | `/task-list` → `task_list` tool. Ignores global `search-mode`. |
| **task_cleanup** (command) | `/cleanup-tasks` → `task_cleanup` tool. |

### Assembly Tool

The assembly tool spawns 3-5 parallel AI agents (voters) from different model providers to independently analyze a question or decision, then synthesizes their reasoning into a unified result.

**Arguments**:
| Arg | Type | Default | Description |
|-----|------|---------|-------------|
| `question` | string | required | The question or decision to analyze |
| `voters` | number | 3 | Number of voters (2-5) |
| `rounds` | number | 2 | Synthesis rounds (1-3) |
| `models` | string[] | auto-selected | Override auto-selected models |

**Voter selection**: Auto-selects N models from configured providers in `matrixx.jsonc` (uses `assembly.providers`). User can override with explicit model strings.

**Output**: Returns unified consensus with confidence level (high/medium/low), key disagreements, and per-voter reasoning traces.

**Examples**:
```
assembly({ question: "Should we use React Server Components or Client Components for the dashboard?", voters: 3, rounds: 2 })
assembly({ question: "What's the best architecture for the auth module?", models: ["anthropic:claude-sonnet-4-20250514", "openai:gpt-4o"] })
```

Configure providers in `matrixx.jsonc`:
```jsonc
{
  "assembly": {
    "providers": [
      { "providerID": "anthropic", "modelID": "claude-sonnet-4-20250514" },
      { "providerID": "openai", "modelID": "gpt-4o" },
      { "providerID": "google", "modelID": "gemini-2.5-pro" }
    ],
    "default_voters": 3,
    "default_rounds": 2
  }
}
```

---

### Session Tools

| Tool | Description |
|------|-------------|
| **session_list** | List all OpenCode sessions |
| **session_read** | Read messages and history from a session |
| **session_search** | Full-text search across session messages |
| **session_info** | Get session metadata and statistics |

### Interactive Terminal Tools

| Tool | Description |
|------|-------------|
| **interactive_bash** | Tmux-based terminal for TUI apps (vim, htop, pudb). Pass tmux subcommands directly without prefix. |

**Usage Examples**:
```bash
# Create a new session
interactive_bash(tmux_command="new-session -d -s dev-app")

# Send keystrokes to a session
interactive_bash(tmux_command="send-keys -t dev-app 'vim main.py' Enter")

# Capture pane output
interactive_bash(tmux_command="capture-pane -p -t dev-app")
```

**Key Points**:
- Commands are tmux subcommands (no `tmux` prefix)
- Use for interactive apps that need persistent sessions
- One-shot commands should use regular `Bash` tool with `&`

### Handoff Tool



**Purpose**: Multi-action tool for persisting and retrieving session context across `/handoff` and `/pickup` commands.



The `handoff` tool stores context at `${directory}/.matrixx/handoff.md` (YAML frontmatter + markdown body). Schema-validated by Zod (`HandoffSchema`); the previous free-form format is no longer supported.



#### Actions



| Action | Args | Returns | Errors |

|--------|------|---------|--------|

| `create` | `topics` (min 1), `user_requests`, `goal`, `work_completed`, `current_state` (required); `pending_tasks`, `key_files`, `important_decisions`, `explicit_constraints`, `context_for_continuation` (optional) | `Handoff written to <path> (session: <id>, topics: <list>)` | `Error: validation failed: ...` (bad schema), `Error: failed to write handoff file at ...` (I/O) |

| `read` | none | Full file content (YAML frontmatter + markdown body) | `Error: No handoff found at ...` (missing file); `Warning: ...` + raw content (malformed frontmatter, forgiving) |

| `list` | none | `Handoff files in <dir>:` + per-file `name (tag, size, mtime)` listing + canonical paths | `No handoffs found in .matrixx/` (empty state) |

| `archive` | none | `Handoff archived: <from> -> <to>` (renames `handoff.md` → `handoff.consumed.md`) | `Error: No handoff found at ...` (nothing to archive) |



#### YAML Frontmatter Schema



```yaml

frontmatter:

  session_id: <string>          # OpenCode session id, or "unknown"

  timestamp: <ISO-8601 string>  # captured at create time

  git_head:

    sha: <string>                # commit sha, or "unknown" if not a git repo

    branch: <string>             # optional

    detached: <boolean>          # optional

  topics:

    - <string>                   # min 1

sections:

  user_requests: <string>        # verbatim from session_read

  goal: <string>                 # single sentence

  work_completed:

    - <string>                   # first-person bullet

  current_state: <string>        # free-form description

  pending_tasks:                 # optional

    - <string>

  key_files:                     # optional, max 10

    - path: <string>

      purpose: <string>

  important_decisions:           # optional

    - decision: <string>

      rationale: <string>

  explicit_constraints:          # optional

    - <string>

  context_for_continuation: <string>  # optional

```



#### File Layout



```

<directory>/

└── .matrixx/

    ├── handoff.md          # active handoff (written by `create`, read by `read`)

    └── handoff.consumed.md # archived handoff (moved by `archive`)

```



**Key Points**:

- The `create` action auto-creates the `.matrixx/` directory if it does not exist

- `read` is forgiving: a malformed or schema-invalid handoff is returned with a `Warning:` prefix so the LLM can still recover context

- `archive` is non-idempotent — calling it with no active handoff returns an error (not a silent no-op) so bugs in template flow surface

- The single multi-action `handoff` tool replaces the older `handoff_write` tool; legacy handoff files (no frontmatter) are not supported

---

## MCPs: Built-in Servers

### websearch (Exa AI)

Real-time web search powered by [Exa AI](https://exa.ai).

### context7

Official documentation lookup for any library/framework.

### grep_app

Ultra-fast code search across public GitHub repos. Great for finding implementation examples.

### Skill-Embedded MCPs

Skills can bring their own MCP servers:

```yaml
---
description: Browser automation skill
mcp:
  playwright:
    command: npx
    args: ["-y", "@anthropic-ai/mcp-playwright"]
---
```

The `skill_mcp` tool invokes these operations with full schema discovery.


---

## Context Injection

### Directory AGENTS.md

Auto-injects AGENTS.md when reading files. Walks from file directory to project root:

```
project/
├── AGENTS.md              # Injected first
├── src/
│   ├── AGENTS.md          # Injected second
│   └── components/
│       ├── AGENTS.md      # Injected third
│       └── Button.tsx     # Reading this injects all 3
```

### Conditional Rules

Inject rules from `.claude/rules/` when conditions match:

```markdown
---
globs: ["*.ts", "src/**/*.js"]
description: "TypeScript/JavaScript coding rules"
---
- Use PascalCase for interface names
- Use camelCase for function names
```

Supports:
- `.md` and `.mdc` files
- `globs` field for pattern matching
- `alwaysApply: true` for unconditional rules
- Walks upward from file to project root, plus `~/.claude/rules/`

---

## Claude Code Compatibility

Full compatibility layer for Claude Code configurations.

### Config Loaders

| Type | Locations |
|------|-----------|
| **Commands** | `~/.claude/commands/`, `.claude/commands/` |
| **Skills** | `~/.claude/skills/*/SKILL.md`, `.claude/skills/*/SKILL.md` |
| **Agents** | `~/.claude/agents/*.md`, `.claude/agents/*.md` |
| **MCPs** | `~/.claude/.mcp.json`, `.mcp.json`, `.claude/.mcp.json` |

MCP configs support environment variable expansion: `${VAR}`.

### Data Storage

| Data | Location | Format |
|------|----------|--------|
| Todos | `~/.claude/todos/` | Claude Code compatible |
| Transcripts | `~/.claude/transcripts/` | JSONL |

### Compatibility Toggles

Disable specific features:

```json
{
  "claude_code": {
    "mcp": false,
    "commands": false,
    "skills": false,
    "agents": false,
    "hooks": false,
    "plugins": false
  }
}
```

| Toggle | Disables |
|--------|----------|
| `mcp` | `.mcp.json` files (keeps built-in MCPs) |
| `commands` | `~/.claude/commands/`, `.claude/commands/` |
| `skills` | `~/.claude/skills/`, `.claude/skills/` |
| `agents` | `~/.claude/agents/` (keeps built-in agents) |
| `hooks` | settings.json hooks |
| `plugins` | Claude Code marketplace plugins |

Disable specific plugins:

```json
{
  "claude_code": {
    "plugins_override": {
      "claude-mem@thedotmack": false
    }
  }
}
```
