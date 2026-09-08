>
> [![Matrixx](./.github/assets/orchestrator-architect.png?v=3)](https://github.com/klpanagi/opencode-matrixx)
>
> Matrixx is **highly inspired by** [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) — the project that pioneered the "oh-my-zsh for OpenCode" concept.
> Full credit to [code-yeongyu](https://github.com/code-yeongyu) for the original vision.
>

<div align="center">

<h1>Matrixx</h1>

[![npm](https://img.shields.io/npm/v/opencode-matrixx.svg)](https://www.npmjs.com/package/opencode-matrixx)
[![License: SUL-1.0](https://img.shields.io/badge/license-SUL--1.0-blue.svg)](https://github.com/klpanagi/opencode-matrixx/blob/master/LICENSE)

**Multi-model agent orchestration for [OpenCode](https://github.com/sst/opencode).**<br/>
**14 specialized agents. 64 lifecycle hooks. 22 tools. 36 skills. One plugin.**

</div>

---

## What is Matrixx?

OpenCode is a powerful open-source AI coding agent. Matrixx makes it **smarter**.

Instead of one model doing everything, Matrixx coordinates a **team of specialists** — each model doing what it does best, in parallel, with full context awareness. The right model for the right job, automatically.

```
You: "Add OAuth2 with PKCE to the API"
     ↓
Morpheus (Claude Opus)     → Plans the implementation
  ├─ Keymaker (GPT 5.3)    → Builds auth middleware + routes
  ├─ Oracle (Claude Sonnet 4.6)  → Reviews architecture in parallel
  └─ Sentinel (Sonnet 4.6) → Audits for security vulnerabilities
     ↓
     Done. Tested. Secure.
```

---

## Why Matrixx?

| Problem | Matrixx Solution |
|---------|------------------|
| One model does everything poorly | **14 specialists** — right model for the right job |
| Agent forgets what it was doing | **Task Continuation** — `task-continuation-enforcer` (file-backed `.matrixx/tasks`, survives `/clear`, project-scoped) — forces completion |
| Slow sequential tool calls | **Parallel background agents** — 5+ running simultaneously |
| AI-generated code looks like AI | **Comment Checker** — code indistinguishable from human-written |
| Context window fills up fast | **Aggressive delegation** — subagents carry the load |
| Fragile refactoring | **LSP + AST-Grep** — deterministic, safe, surgical |

---

## The Magic Word

**Don't want to read docs? Just type `ultrawork` (or `ulw`) in your prompt.**

That's it. Parallel agents, background tasks, deep exploration, relentless execution until completion. The agent figures out the rest.

---

## Quick Start

### Prerequisites

- **Bun** 1.4.0 — `curl -fsSL https://bun.sh/install | bash`
- **OpenCode** ≥ 1.0.150 — https://opencode.ai/docs
- Verify: `bun --version && opencode --version`

### Install (Recommended)

```bash
bunx opencode-matrixx install
```

Or for non-interactive setup (CI/agents):

```bash
bunx opencode-matrixx install --no-tui --claude=yes --openai=yes --gemini=no --copilot=no
```

### Verify Installation

```bash
bunx opencode-matrixx doctor
# No "fail" = good. "warn" for missing optional providers is expected.
# If doctor reports auth failures after login, update to latest: bunx opencode-matrixx@latest doctor
```

Troubleshooting installation issues? See [Installation guide →](docs/guide/installation.md#troubleshooting).

### Configure

Create `matrixx.jsonc` in your project root:

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/klpanagi/opencode-matrixx/refs/heads/dev/dist/matrixx.schema.json",
  "agents": {}
}
```

> **Full example:** See [`matrixx.example.jsonc`](./matrixx.example.jsonc) — a fully annotated reference covering every configuration parameter (agents, categories, **headroom**, **context-mode** (external), DCP, RTK, security, tmux, assembly, evolution, and more) with inline comments and defaults. Copy the sections you need into your project `.opencode/matrixx.jsonc` or user `~/.config/opencode/matrixx.jsonc` (both support JSONC comments).
> Full guide: [Configuration →](docs/configurations.md) · [Context Management (5 layers) →](docs/context-management.md)

### Authenticate

```bash
opencode auth login   # follow prompts for each provider you have
bunx opencode-matrixx doctor --category authentication  # verify
```

### Use

Open OpenCode and start coding. Matrixx activates automatically.

**For LLM agents** — paste this into Claude Code, AmpCode, Cursor, or any LLM agent:

```
Install and configure matrixx by following the instructions here:
https://raw.githubusercontent.com/klpanagi/opencode-matrixx/refs/heads/dev/docs/guide/installation.md
```

[Installation guide →](docs/guide/installation.md) . [Uninstall →](docs/guide/uninstallation.md) . [CLI reference →](docs/cli-guide.md)

---

## CLI Reference

Matrixx includes a built-in CLI accessible via `bunx opencode-matrixx <command>`:

| Command | Description |
|---------|-------------|
| `install` | Interactive setup wizard (or `--no-tui` for CI/CD) |
| `doctor` | Environment diagnostics and health checks |
| `version` | Display version information |

### Doctor Checks

| Category | What It Checks |
|----------|----------------|
| installation | Plugin registration, OpenCode version |
| configuration | Config file validity (matrixx.jsonc) |
| authentication | Provider API key status (Anthropic, OpenAI, Google) |
| dependencies | Runtime deps: Bun, Node.js, Git, Python3 |
| tools | Optional: ast-grep, Gitleaks, PyMuPDF, Playwright |

Use `--json` for machine-readable output or `--category <name>` for a specific check.

---
## The Agent Team

### 01. Morpheus — *The Orchestrator*

<img src=".github/assets/morpheus.png" width="200" align="right"/>

*The one who sees the code for what it truly is.*

**Role:** Master orchestrator and strategic coordinator

**Model:** Claude Opus 4.6 · `temperature: 0.1`

Plans, delegates, and executes. Fires background agents in parallel, leverages LSP and AST-Grep for surgical refactoring, and never stops until the task list is empty. Morpheus sees the code for what it truly is — and routes every task to the agent best suited for it.

---

### 02. Keymaker — *The Craftsman*

<img src=".github/assets/keymaker.png" width="200" align="right"/>

*Give him a goal, not a recipe.*

**Role:** Autonomous deep worker

**Model:** GPT 5.3 Codex · `temperature: 0.1`

Explores the codebase, matches your patterns, and delivers end-to-end. Keymaker doesn't need step-by-step instructions — give him a destination and he'll find the path, writing production-quality code along the way.

---

### 03. Cipher — *The Language Architect*

<img src=".github/assets/cipher.png" width="200" align="right"/>

*Grammars, parsers, and the art of formal languages.*

**Role:** DSL engineering specialist

**Model:** Claude Sonnet 4.6 · `temperature: 0.1`

Grammars, parsers, type systems, code generators, metamodels. 11 composable skills covering textX, ANTLR4, tree-sitter, PyEcore, and more. If it involves defining a language or transforming code, Cipher is your specialist.

---

### 04. Sentinel — *The Security Auditor*

<img src=".github/assets/sentinel.png" width="200" align="right"/>

*Reads every line. Changes nothing. Reports everything.*

**Role:** Read-only security specialist

**Model:** Claude Sonnet 4.6 · `temperature: 0.1`

Scans for vulnerabilities but never touches code. OWASP Top 10, SAST, DAST, dependency CVEs, secret detection, crypto audit, infrastructure hardening. 9 composable security skills. Sentinel reports findings with CWE IDs, exact locations, and actionable remediation.

---

### 05. Sati — *The Frontend Specialist*

<img src=".github/assets/sati.png" width="200" align="right"/>

*Crafts stunning UI/UX, even without design mockups.*

**Role:** Frontend specialist

**Model:** Claude Sonnet 4.6 · `temperature: 0.1`

React/Next.js, Svelte/SvelteKit, accessibility, performance, design tokens, component architecture, build tooling. Sati ships production-grade UI work with browser verification via Playwright. Invoke directly with `@sati/` or `task(subagent_type="sati")` for any non-trivial frontend task.

---

### 06. Oracle — *The Plan Builder*

<img src=".github/assets/oracle.png" width="200" align="right"/>

*Architecture demands precision. Oracle delivers it.*

**Role:** Strategic planning, architecture decisions, work plan generation

**Model:** Claude Sonnet 4.6 · `temperature: 0.1`

Creates detailed, structured work plans from complex requests. Decomposes ambiguous requirements into atomic, verifiable steps with clear success criteria. Oracle builds the plan — Morpheus executes it.

---

### 07. Merovingian — *The Consultant*

<img src=".github/assets/merovingian.png" width="200" align="right"/>

*High-IQ reasoning for problems that refuse to yield.*

**Role:** High-IQ consultation, hard debugging, architecture design

**Model:** Claude Sonnet 4.6 · `temperature: 0.1`

Read-only consultation for hard debugging (after 2+ failed attempts), multi-system tradeoffs, and architecture decisions requiring deep reasoning. Merovingian analyzes — never implements.

---

### 08. Architect — *The Master Orchestrator*

<img src=".github/assets/orchestrator-architect.png" width="200" align="right"/>

*Where plans become reality.*

**Role:** Plan execution orchestrator, session coordination

**Model:** Claude Sonnet 4.6 · `temperature: 0.1`

Executes Oracle's work plans, coordinates session state, manages task dependencies, and ensures every phase completes before moving to the next. The Architect is the bridge between planning and shipping.

---

### 09. Seraph — *The Pre-Planner*

<img src=".github/assets/seraph.png" width="200" align="right"/>

*Sees what others miss before work begins.*

**Role:** Pre-planning analysis, ambiguity detection, AI failure prevention

**Model:** Claude Opus 4.6 · `temperature: 0.3`

Analyzes requests to identify hidden intentions, ambiguities, scope creep, and AI failure points. Seraph intervenes before planning starts — preventing costly mistakes downstream.

---

### 10. Smith — *The Validator*

<img src=".github/assets/smith.png" width="200" align="right"/>

*Every plan meets Smith's standards — or gets rewritten.*

**Role:** Plan validation, completeness review, gap detection

**Model:** Claude Sonnet 4.6 · `temperature: 0.1`

Evaluates work plans against rigorous clarity, verifiability, and completeness standards. Catches gaps, ambiguities, and missing context before implementation begins. Smith is the last line of defense.

---

### 11. Operator — *The Researcher*

<img src=".github/assets/operator.png" width="200" align="right"/>

*Finds what you need, where it lives.*

**Role:** External documentation, OSS search, library research

**Model:** Claude Haiku 4.5 · `temperature: 0.1`

Specialized codebase understanding agent for multi-repository analysis, searching remote codebases, retrieving official documentation, and finding implementation examples using GitHub CLI, Context7, and Web Search.

---

### 12. Trinity — *The Search Engine*

<img src=".github/assets/trinity.png" width="200" align="right"/>

*Finds anything, anywhere, instantly.*

**Role:** Blazing fast codebase grep, pattern discovery

**Model:** Claude Haiku 4.5 · `temperature: 0.1`

Contextual grep for codebases. Answers "Where is X?", "Which file has Y?", "Find the code that does Z". Fires multiple in parallel for broad searches. Quick, medium, or very thorough — you choose.

---

### 13. Construct — *The Media Analyst*

<img src=".github/assets/construct.png" width="200" align="right"/>

*Sees what's inside — images, PDFs, diagrams.*

**Role:** PDF, image & diagram analysis

**Model:** Claude Sonnet 4.6 · `temperature: 0.1`

Analyzes media files that require interpretation beyond raw text. Extracts specific information or summaries from documents, describes visual content. Use when you need analyzed/extracted data rather than literal file contents.

---

### 14. Mouse — *The Task Executor*

*Small, fast, and disposable — the hands that do the work.*

**Role:** Category-spawned delegated executor

**Model:** Claude Sonnet 4.6 · `temperature: 0.1`

Mouse is the worker layer in Matrixx's 3-tier architecture. Spawned automatically when you
use `task(category="...")`, Mouse executes the task directly without delegating further.
It cannot spawn sub-agents (`task` tool blocked) — implementation is always done in-house.
Model-specific prompt variants optimize behavior for Claude, GPT, DeepSeek, Mimo, and Qwen.

---

Every agent, model, temperature, and permission is fully customizable. [**Meet the full team →**](docs/agents.md)

---

## Features

| | |
|---|---|
| **Agent Orchestration** | 14 agents (incl. **Mouse** task executor, **Sati** frontend specialist, **Sentinel** security auditor, **Cipher** DSL expert), parallel background execution, category-based routing (`source`/`deep-jack`/…), session continuity, file-backed tasks |
| **Developer Tools** | LSP (goto def, rename, diagnostics), AST-Grep (search & replace), Tmux terminal |
| **64 Lifecycle Hooks** | Context injection, think mode, comment checking, task/todo continuation enforcement, error recovery, quality gate, preemptive compaction, session recovery |
| **36 Built-in Skills** | DSL engineering (11), security (9), browser, git, frontend (7 via **Sati**), BDD (4: `bdd-contract`/`backend`/`frontend`/`tests` + pipeline), saturation research, AI slop detection, TDD (`tdd-enforcer` opt-in), software dev pipeline |
| **Curated MCPs** | Exa (web search), Context7 (official docs), Grep.app (GitHub code search), Document Reader |
| **Software Dev Pipeline** | 6-phase TDD workflow (PLAN→BUILD→VERIFY→REVIEW→SECURE→SHIP), 5 team roles, adaptive phases |
||| **Assembly Tool** | Multi-model debate that spawns 3-5 parallel voters from different providers, collects independent reasoning, and synthesizes unified decisions with confidence scoring |
|| **Saturation Research** | Multi-round (/research) spawning parallel explore/librarian swarms across code, docs, web, and OSS with adaptive novelty-based convergence (max 5 rounds) |
| **AI Slop Detection** | remove-ai-slops skill detects and removes 7 categories of AI-generated code smells — verbose comments, redundant error handling, over-engineered patterns, generic AI phrasing, cargo-cult boilerplate |
| **Context Management (L0-L4)** | 5-layer stack: Native + [RTK](https://github.com/rtk-ai/rtk) + [context-mode](https://github.com/tarquinen/context-mode) + [DCP](https://github.com/tarquinen/opencode-dcp) + [Headroom](https://github.com/headroomlabs-ai/headroom) — zero overlap, <10ms Matrixx bridge, 60-95% JSON via `CacheAligner→CCR` |

[**Full feature list →**](docs/features.md) · [**Configuration guide →**](docs/configurations.md) · [**Architecture diagram →**](docs/agent-architecture.md)

---

## Software Development Pipeline

Matrixx includes a structured **6-phase development pipeline** that coordinates specialized roles through PLAN → BUILD → VERIFY → REVIEW → SECURE → SHIP. Each phase has clear entry/exit criteria and is enforced by dedicated agents.

### Team Roles

| Role | Agent | Skills | Purpose |
|------|-------|--------|---------|
| **Architect** | Oracle (`claude-sonnet-4-6`) | — | System design, architecture decisions, plan (`/.matrixx/plans/*.md`) breakdown |
| **Developer** | `category="source"` (Mouse) | `git-master`, `tdd-enforcer` (opt-in `tdd_enforcer.enabled=true`) | Implementation — RED→GREEN→REFACTOR per task |
| **Tester** | `category="source"` (Mouse) | `tdd-enforcer`, `quality-gate` | Test authoring (`src/**/*.test.ts`, `//#given//#when//#then`), coverage |
| **Quality Evaluator** | Red-pill category | `quality-gate`, `review-work` | Lint, typecheck, 5-agent code review |
| **Security Expert** | Sentinel (Claude Opus) | `security-core`, `security-sast`, `security-api`, `security-dependencies` | Vulnerability scanning, CVE checks |

### Pipeline Phases

| Phase | Skip? | Role | Exit Criteria |
|-------|-------|------|---------------|
| **PLAN** | Small tasks | Architect (Oracle) | Approach defined, files listed, edge cases + test decision (`TDD/tests-after/none`) documented |
| **BUILD** | Never | Developer | TDD (RED→GREEN→REFACTOR), `bun test` passes |
| **VERIFY** | Never | Quality | `lint` + `typecheck` + `test` + `build` — all pass |
| **REVIEW** | Small tasks | Quality (5-agent) | All reviewers PASS, no CRITICAL/MAJOR issues |
| **SECURE** | Small + non-security | Security | No CRITICAL/HIGH findings, dependencies checked |
| **SHIP** | Never | Developer | Atomic commits, PR to dev, CI passes |

### Task Size Adaptivity

| Size | Files | Phases Used |
|------|-------|-------------|
| **Small** | 1-2 | BUILD → VERIFY → SHIP |
| **Medium** | 3-10 | PLAN → BUILD → VERIFY → REVIEW → SHIP |
| **Large** | 10+ | ALL 6 PHASES |
| **Security-related** | Any | Always includes SECURE |

Load the `software-dev` skill to activate the pipeline. The orchestrator automatically selects the right roles and phases based on task scope.

---

## Security

Matrixx includes a three-tier security layer: reactive hooks, configurable policies, and a dedicated security auditing agent.

### Enforcement Hooks

Built-in hooks protect against accidental secret exposure — no setup required.

| Hook | What it does |
|------|-------------|
| **Secret Leak Guard** | Intercepts `git commit` and `git push`, runs [gitleaks](https://github.com/gitleaks/gitleaks) on staged changes, and **blocks the operation** if secrets are detected. |
| **Env File Write Guard** | Blocks agents from writing to sensitive files (`.env`, `*.pem`, `*.key`, `credentials.json`, `id_rsa`, and 16 other patterns). |

Both hooks are **enabled by default** and run before all other hooks in the execution pipeline. Configure via `matrixx.jsonc`:

```jsonc
{
  "security": {
    "secret_scanning": { "enabled": true, "block_on_detection": true },
    "env_file_guard": { "enabled": true, "allowed_paths": [".env.example"] }
  }
}
```

> **Note:** Secret scanning requires [gitleaks](https://github.com/gitleaks/gitleaks) installed in your PATH. Without it, the hook silently degrades.

### Sentinel — Security Auditing Agent

**Sentinel** is a read-only security specialist with 9 composable skills covering the full application security stack:

| Skill | Domain |
|-------|--------|
| `security-core` | OWASP Top 10, CWE classification, threat modeling (STRIDE) |
| `security-secrets` | Secret detection, credential scanning, pre-commit hooks |
| `security-sast` | Static analysis, code vulnerability patterns, taint tracking |
| `security-dast` | Dynamic analysis, runtime testing, fuzzing, penetration testing |
| `security-dependencies` | CVE scanning, SBOM generation, supply chain security |
| `security-api` | Authentication, authorization, CORS/CSRF, input validation |
| `security-crypto` | Encryption audit, key management, TLS, password hashing |
| `security-infra` | Container scanning, Dockerfile hardening, IaC audit, K8s security |
| `security-review` | Structured audit reports, severity classification, remediation guidance |

Sentinel never modifies code — it reports findings with CWE IDs, exact locations, and actionable remediation. Any agent can load individual security skills via `load_skills`.

---

## RTK Integration — Token Compression

Matrixx integrates [RTK](https://github.com/rtk-ai/rtk) for automatic bash command compression, reducing LLM token consumption by **60-90%** on tool outputs.

### What is RTK?

RTK is a Rust CLI binary that intelligently rewrites bash commands to compress their output before it reaches the LLM. It recognizes 70+ command patterns (git, npm, cargo, test runners, linters, build tools) and applies smart filtering, grouping, and deduplication strategies.

```
# Without RTK: 2000 tokens
$ git status
On branch main
Changes not staged for commit:
  modified:   src/config.ts
  modified:   src/hooks/index.ts
  ... (50 more lines)

# With RTK: 200 tokens
$ rtk git status
2 files changed: src/config.ts, src/hooks/index.ts
```

### How It Works

The RTK hook intercepts bash commands **before execution** and rewrites them to use RTK's compression:

1. LLM requests: `git status`
2. RTK hook rewrites to: `rtk git status`
3. RTK binary executes and compresses output
4. Compressed output (60-90% smaller) reaches the LLM

The hook runs **silently** — no configuration needed beyond enabling it. RTK's pattern matching handles the rest.

### Configuration

RTK is **disabled by default** (opt-in). Enable it in `matrixx.jsonc`:

```jsonc
{
  "rtk": {
    "enabled": true,
    "binary_path": "/usr/local/bin/rtk",  // optional — defaults to "rtk" in PATH
    "timeout_ms": 5000                     // optional — subprocess timeout
  }
}
```

### Installation

Install RTK from [rtk-ai/rtk](https://github.com/rtk-ai/rtk):

```bash
# macOS
brew install rtk-ai/tap/rtk

# Linux (curl)
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/main/install.sh | bash

# Verify installation
rtk --version
```

### Performance Impact

| Metric | Value |
|--------|-------|
| **Overhead** | ~10-20ms per bash command |
| **Token savings** | 60-90% reduction on compressed commands |
| **Net benefit** | Significant for projects with frequent bash commands |

The 10-20ms subprocess overhead is negligible compared to command execution time and LLM context savings.


---

## Headroom Integration — Network-Proxy Compression

> **Deep dive:** [Context Management → 2.4 Headroom](docs/context-management.md#24-headroom--network-proxy-compression) — full 5-layer guide with config reference, verification and troubleshooting.

Matrixx integrates [Headroom](https://github.com/headroomlabs-ai/headroom) for network-proxy-level token compression, reducing context by **60-95%** on JSON, **15-20%** on coding agents via `CacheAligner→ContentRouter→CCR` pipeline.

### What is Headroom?

Headroom is a proxy + MCP provider that compresses history before it reaches the LLM. It intercepts the OpenAI-compatible provider `headroom` via `@ai-sdk/openai-compatible` and serves retrieval via `headroom_retrieve`.

```
# Without headroom: 50k tokens history
# Every turn ships full JSON + tool outputs

# With headroom wrap: 8k tokens (CCR + retrieval)
$ headroom wrap opencode
# CCR compresses; agents retrieve via headroom_retrieve on demand
```

Headroom is ideal for JSON-heavy sessions, long histories, and multi-project reuse where the same compressed context (CCR) can be shared.

### How It Works

1. User runs `headroom wrap opencode` (starts proxy at `http://127.0.0.1:8787`)
2. Headroom MCP registers `headroom_retrieve` / `headroom_stats`
3. Matrixx detects `hasHeadroom = availableTools.some(t => t.name.startsWith("headroom_"))` and injects Headroom discipline into agent prompts
4. Proxy's `CacheAligner→ContentRouter→CCR` compresses; agents retrieve via `headroom_retrieve` on demand

Matrixx does not vendor Headroom. It provides a thin config bridge in `src/config/schema/headroom.ts` plus runtime detection. Native transport `headroom-opencode` is deferred to Phase 2.

### Configuration

Headroom is **disabled by default** (opt-in). Enable it in `matrixx.jsonc`:

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/klpanagi/opencode-matrixx/refs/heads/dev/dist/matrixx.schema.json",
  "headroom": {
    "enabled": true,                        // default: false — opt-in
    "proxyUrl": "http://127.0.0.1:8787",     // optional — defaults to proxy default
    "project": "my-project",                // optional — CCR scoping
    "backend": "openai"                     // optional — HEADROOM_BACKEND
  }
}
```

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `enabled` | boolean | `false` | Opt-in — no proxy/discipline unless `true` |
| `proxyUrl` | string (url) | `http://127.0.0.1:8787` | Proxy URL (`HEADROOM_PROXY_URL` override) |
| `project` | string | `undefined` | CCR scoping per project |
| `backend` | string | `undefined` | Maps to `HEADROOM_BACKEND` |

### Installation

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
# alternative — env wrapping
# HEADROOM_WRAP=1 headroom wrap -- opencode

# Dashboard
headroom dashboard
```

Package versions: `npm: headroom-ai@0.37.0`, `PyPI: headroom-ai[all]`. Docs at [headroom-docs.vercel.app](https://headroom-docs.vercel.app).

> **Note:** Native TypeScript plugin `headroom-opencode` is deferred to **Phase 2** due to [#2798](https://github.com/sst/opencode/issues/2798) global `fetch` patch collision and [#76](https://github.com/headroomlabs-ai/headroom/issues/76) compaction not yet stable. Prefer `wrap` for now.

### Verification

After install, confirm Matrixx sees Headroom:

```bash
headroom doctor          # proxy health
headroom wrap opencode # should show: proxy http://127.0.0.1:8787
```

- In OpenCode TUI, run `headroom_stats` (or `headroom dashboard`) — if the tool is listed, Matrixx injected Headroom discipline into Morpheus/Keymaker prompts.
- Agents will use `headroom_retrieve` / `headroom_search` automatically — you don't call them manually. If `headroom_*` tools are absent, check `matrixx.jsonc` has `headroom.enabled: true` and restart OpenCode.

### Usage

No code changes needed. Once `headroom wrap opencode` is running and `headroom.enabled: true`:

- **You** keep using OpenCode normally (`ultrawork`, etc.).
- **Proxy** compresses history out-of-process via `CacheAligner→ContentRouter→CCR` before it reaches the LLM.
- **Agents** retrieve compressed slices on demand via `headroom_retrieve` (never re-read full history) and check stats via `headroom_stats`.
- **CCR** is shared across projects — ideal for repeated JSON-heavy sessions.

To disable, set `headroom.enabled: false` or run OpenCode without `headroom wrap`.

### Performance Impact

| Metric | Value |
|--------|-------|
| **Matrixx bridge overhead** | ~0ms (prompt-only; proxy out-of-process) |
| **Proxy token savings** | 60-95% JSON, 15-20% coding agents |
| **Complementarity** | L4 orthogonal to L1 RTK + L2 context-mode + L3 DCP + L0 native (zero overlap) |
| **Net benefit** | Retrieval-on-demand reduces per-turn context; CCR shared across projects |

### 5-Layer Complementarity

| Layer | Owner | Mechanism | Reduction |
|-------|-------|-----------|-----------|
| L0 Native | Matrixx | 70% warn, preemptive-compaction, anthropic-recovery | Prevents OOM |
| L1 RTK | RTK hook | Bash output compression | 60-90% bash |
| L2 context-mode | context-mode plugin | FTS5 sandbox `ctx_*` | 98% sandbox |
| L3 DCP | `@tarquinen/opencode-dcp` | Pruning tiers `economy→ultimate` | Tiered pruning |
| L4 Headroom | headroom proxy | `CacheAligner→ContentRouter→CCR` | 60-95% JSON |
---

## Documentation

| | |
|---|---|
| [Overview](docs/guide/overview.md) | What Matrixx does, workflows, getting started |
| [Agents Deep Dive](docs/agents.md) | Full agent descriptions, skills, workflows, example prompts |
| [Architecture](docs/agent-architecture.md) | System diagrams, delegation flows, model routing |
| [Features](docs/features.md) | Complete feature reference |
| [Configuration](docs/configurations.md) | All config options, agent overrides, hooks, categories |
| [Orchestration](docs/orchestration-guide.md) | How agents coordinate, delegate, and recover |
| [Categories & Skills](docs/category-skill-guide.md) | Task categories, skill injection, delegation patterns |
| [Context Management](docs/context-management.md) | 5-layer context stack (Native, RTK, context-mode, DCP, Headroom) — setup, config, verification |
| [Task System](docs/task-system.md) | File-backed execution substrate (`.matrixx/tasks/T-{uuid}.json`), dependency graph, `task-continuation-enforcer` |
| [TDD](docs/tdd.md) | RED→GREEN→REFACTOR planning (Oracle) + enforcement (`tdd-enforcer` opt-in) |

---


If this saves you time, a ⭐ goes a long way.

<sub>Productivity might spike too hard. Don't let your coworker notice. Actually — let's see who wins.</sub>
