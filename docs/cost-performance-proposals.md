# Matrixx Cost/Performance Improvement Proposals

**Status:** Research/proposal document — no implementation
**Date:** 2026-07-09
**Scope:** Matrixx v2.0.0 + 15 comparator projects
**Authors:** Morpheus research mode

---

## Executive Summary

This document captures actionable cost-reduction and performance-improvement proposals for Matrixx, derived from analysis of Matrixx's current architecture and 15 comparable projects in the OpenCode / Claude Code / multi-agent ecosystem. Each proposal is rated by cost impact, performance impact, and implementation complexity. The **top 5 proposals** are estimated to reduce token consumption by **40–60% on typical sessions** with mostly low-complexity changes.

Total: 15 proposals across 3 tiers, plus a recommended implementation sequence and risk register.

---

## 1. Comparator Landscape

### 1.1 Two named comparators

| Project | Stars | Approach | Cost/perf focus |
|---|---|---|---|
| **code-yeongyu/oh-my-openagent** | 5K+ | 6-tier agent workflow (Explore→Plan→Build→Test→Review→Document), 11+ agents, Build/Review/Fix 3-stage cycle | Process quality, no direct cost optimization |
| **obra/superpowers** | 250K+ | Pure methodology: 14 SKILL.md files + bootstrap hook; zero runtime code | **SDO + rationalization tables + progress ledger** are the transferable insights |

### 1.2 Twelve other similar projects (curated by relevance)

**Tier 1 — Direct cost levers:**

- **rtk-ai/rtk** (69.8K ⭐) — Bash output compression proxy, 60–90% output token reduction
- **mksglu/context-mode** (18.7K ⭐) — Tool output sandboxing, 98% reduction
- **esengine/DeepSeek-Reasonix** (26.5K ⭐) — Prefix-cache stability engineering
- **OthmanAdi/planning-with-files** (25.1K ⭐) — Crash-proof persistent plans
- **Nanako0129/pilotfish** (237 ⭐) — 96% quality at 46% cost via tiered model routing (Anthropic-validated)

**Tier 2 — Orchestration patterns:**

- **open-multi-agent/open-multi-agent** (6.5K ⭐) — DAG with budget invariant
- **affaan-m/claude-swarm** (272 ⭐) — File conflict detection + budget enforcement
- **JuliusBrussee/cavekit** (1.1K ⭐) — 3-phase decomposition + cross-model review
- **barkain/claude-code-workflow-orchestration** (74 ⭐) — **6.6K token startup savings** via lazy loading

**Tier 3 — Monitoring/patterns:**

- **jarrodwatts/claude-hud** (26.3K ⭐) — Real-time context usage HUD
- **cobusgreyling/loop-engineering** (6.8K ⭐) — Includes `loop-cost` analysis tool
- **humanlayer/humanlayer** (11.1K ⭐) — Human-in-the-loop approval gates

---

## 2. What Matrixx Already Has — Don't Duplicate

| Capability | File | Notes |
|---|---|---|
| Model tiering system | `src/config/schema/` | Already covers pilotfish's tiering at agent/category level |
| Runtime model fallback | `src/hooks/runtime-fallback/` | Auto-downgrade on failure |
| Context window monitor (70% warn) | `src/hooks/context-window-monitor.ts` | Pre-empts overload |
| Preemptive compaction | `src/hooks/preemptive-compaction.ts` | Optional |
| Multi-strategy context recovery | `src/hooks/anthropic-context-window-limit-recovery/` (~2232 LOC) | Up to 22 API calls worst case — could be capped |
| Concurrency limits + circuit breakers | `src/features/background-agent/concurrency.ts` | Model-specific limits |
| 8-category delegation routing | `src/tools/delegate-task/constants.ts` (591 LOC) | Has per-category models |
| 45 built-in skills | `src/features/builtin-skills/skills/` | **Loaded eagerly** ← optimization opportunity |
| 4 MCP servers | `src/mcp/index.ts` | **Initialized at startup** ← optimization opportunity |
| `handoff` tool | `src/tools/handoff/` | Already supports file-based state |

---

## 3. Tier 1 — High-ROI Proposals (Quick Wins)

### P1. Lazy Skill & MCP Loading (barkain pattern)

> **Status:** ✅ Shipped (v2.0.0, branch `feat/lazy-skill-mcp-loading`). See `docs/features.md` § "Lazy Skill Loading" and `src/features/builtin-skills/AGENTS.md` for implementation details.


- **What:** Defer loading of 45 skills + 4 MCPs until first reference. Register lightweight stubs at init, hydrate on demand.
- **Cost impact:** **~6.6K tokens saved per session startup** (barkain-validated). Multiplied across long sessions.
- **Performance impact:** Faster plugin init, smaller first-message context.
- **Complexity:** **Low.** Already have registry pattern; just split into "registered" vs "loaded".
- **Where:** `src/features/builtin-skills/skills.ts`, `src/mcp/index.ts`, `src/create-tools.ts`
- **Source:** barkain/claude-code-workflow-orchestration

> **Status:** ✅ Shipped (v2.0.0, branch `feat/prefix-cache-stability`). Implementation: new `env-context-injector` transform hook appends `<matrixx-env>` to user messages; per-turn dynamic env context no longer in the system prompt prefix.

- **What:** Guarantee the system prompt prefix is **byte-identical** across all turns in a session. Move all variable content (timestamp, model name, etc.) to the suffix.
- **Cost impact:** **30–50% input cost reduction** on cache-supporting providers (Anthropic prompt caching, DeepSeek cache).
- **Performance impact:** Lower latency (cached tokens skip LLM).
- **Complexity:** **Low.** Architectural discipline + audit of prompt builders.
- **Where:** `src/agents/dynamic-agent-prompt-builder.ts` (431 LOC), `src/hooks/keyword-detector/` (1665 LOC)
- **Risk:** keyword-detector currently injects context that may invalidate cache; need to move injection to suffix.
- **Source:** esengine/DeepSeek-Reasonix

### P3. Per-Task Complexity Routing (pilotfish pattern)
> **Status:** ✅ Shipped (v2.0.0, branch `feat/per-task-complexity-routing`). Implementation: optional `complexity: 1-5 | "auto"` on `delegate_task`; auto-scoring heuristic on description/prompt/skills/category; downgrade-only with logged decisions. 100% backwards compat; savings on tiers with model headroom.

- **What:** Already have category-based routing; add **per-task complexity scoring** to pick cheaper model for simple subtasks within a plan. Heuristic: line count, file count, dependency depth, "trivial" flag.
- **Performance impact:** Faster execution for simple subtasks.
- **Complexity:** **Low.** Extends existing 8-category system; add a `complexity: 1-5` field.
- **Where:** `src/tools/delegate-task/constants.ts` (591 LOC), `src/agents/oracle/`
- **Source:** Nanako0129/pilotfish (Anthropic research validation)

> **Status:** ✅ Shipped (v2.0.0, branch `feat/p4-sdo-audit`). 37 skill descriptions rewritten to follow obra/superpowers SDO pattern (trigger-first, max 150 tokens, cross-references, no workflow). Lazy-skill-helper description-hydration bug fixed. SDO compliance test suite added. Docs: `docs/features.md` § "Skill Discovery Optimization" + `src/features/builtin-skills/AGENTS.md` § "Skill Description SDO".

- **What:** Audit all 45 built-in skill descriptions so each contains **ONLY triggering conditions** (no workflow summaries). This is superpowers' most counterintuitive but highest-leverage finding: workflow summaries cause agents to shortcut.

- **What:** Audit all 45 built-in skill descriptions so each contains **ONLY triggering conditions** (no workflow summaries). This is superpowers' most counterintuitive but highest-leverage finding: workflow summaries cause agents to shortcut.
- **Cost impact:** Prevents skill-misuse retries and re-explanations. **10–30% reduction in skill-related rework.**
- **Performance impact:** More reliable, faster skill activation.
- **Complexity:** **Low.** Documentation/audit task, no code change.
- **Where:** `src/features/builtin-skills/skills/*.ts` (45 files)
- **Source:** obra/superpowers (Skill Discovery Optimization)

> **Status:** ✅ Shipped (v2.0.0, branch `feat/p5-plan-as-file`). New `plan-persistence` feature module (storage + rehydration) + `plan-persister` continuation hook. Writes plan state to `.matrixx/plans/<id>.md` on every `session.idle` (atomic write, markdown checkbox sync, metadata comment). Rehydrates on compaction via `experimental.session.compacting` handler. No new file format — reuses existing mission.json + markdown checkboxes. 35 new tests, 0 new deps.

- **What:** Persist active plan to `.matrixx/plans/<id>.md` on every step. On compaction/crash, reload from disk. **Survives `/clear`, compaction, and crashes.**

- **What:** Persist active plan to `.matrixx/plans/<id>.md` on every step. On compaction/crash, reload from disk. **Survives `/clear`, compaction, and crashes.**
- **Cost impact:** Avoids re-planning waste (re-generating a complex plan can cost 5–20K tokens).
- **Performance impact:** Faster recovery; no "where was I?" turn.
- **Complexity:** **Low-Medium.** Already have `handoff` tool + `.matrixx/` directory.
- **Where:** `src/hooks/compaction-context-injector/`, `src/hooks/todo-continuation-enforcer/`, `src/features/handoff/`
- **Source:** OthmanAdi/planning-with-files

---

## 4. Tier 2 — Medium-ROI Proposals (Strategic)

### P6. Bash Output Compression Layer (RTK pattern)

- **What:** Add a filter layer between bash and the LLM. For known command patterns (`git diff`, `ls`, `npm test`, `cargo build`), truncate/filter/aggregate output. ~50 known commands cover ~80% of usage.
- **Cost impact:** **60–90% reduction in output tokens for bash** (RTK-validated).
- **Performance impact:** Smaller context, faster subsequent turns.
- **Complexity:** **Medium.** Per-command filter rules; can't break interactive output.
- **Where:** New `src/features/output-compressor/`, hook into `src/tools/agent-tools/bash.ts`
- **Source:** rtk-ai/rtk

### P7. Tool Output Sandboxing (context-mode pattern)

- **What:** Enhance existing `src/hooks/tool-output-truncator/` with **intelligent slicing** — only pass relevant portions of large outputs (e.g., for `read` on a 5000-line file, pass just the targeted lines + ±20 context).
- **Cost impact:** **Up to 98% tool output reduction** (context-mode-validated).
- **Performance impact:** Massive. Most tool outputs are dominated by irrelevant context.
- **Complexity:** **Medium-High.** Heuristics per tool; needs careful testing to avoid missing critical info.
- **Where:** `src/hooks/tool-output-truncator/`, possibly `src/hooks/hashline-read-enhancer/`
- **Source:** mksglu/context-mode

### P8. Progress Ledger Surviving Compaction (superpowers pattern)

- **What:** Write `.matrixx/sdd/progress.md` after each completed task. Read it back after compaction. This is the durable progress ledger superpowers uses to coordinate parallel subagents.
- **Cost impact:** Avoids re-discovery and re-summarization after compaction.
- **Performance impact:** Subagents start with full state instead of blind.
- **Complexity:** **Medium.** Need write/read hooks + integration with `subagent-driven-development` pattern.
- **Where:** `src/features/handoff/`, `src/agents/mouse/`, `src/features/background-agent/`
- **Source:** obra/superpowers

### P9. Subagent Task-Brief + Review-Package Pattern (superpowers)

- **What:** Replace ad-hoc subagent prompts with structured `task-brief` (extracted to file) + `review-package` (file-based handoff) for two-stage review (spec compliance, then code quality).
- **Cost impact:** Prevents context accumulation = smaller per-task prompts. Better review = fewer fix loops.
- **Performance impact:** Higher quality subagent output; easier debugging.
- **Complexity:** **Medium-High.** New scripts + protocols; touch delegation flow.
- **Where:** `src/features/background-agent/`, `src/agents/mouse/`, new `src/features/task-brief/`
- **Source:** obra/superpowers

### P10. File Conflict Detection for Parallel Agents (claude-swarm)

- **What:** Track which files each background agent intends to modify (via `claim_file` operation). Reject or queue conflicts.
- **Cost impact:** Avoids wasted work + merge conflicts (fixing conflicts is expensive).
- **Performance impact:** Enables true parallel execution without thrashing.
- **Complexity:** **Medium.** Need to extend `ConcurrencyManager`.
- **Where:** `src/features/background-agent/concurrency.ts`, `src/tools/`
- **Source:** affaan-m/claude-swarm

---

## 5. Tier 3 — Experimental / Long-Term

### P11. DAG-Based Orchestration with Budget Invariant (open-multi-agent)

- **What:** Coordinator builds a task DAG at runtime with **mathematical budget guarantee** — total cost cannot exceed declared budget. Decomposes complex tasks into dependency-ordered subtasks.
- **Cost impact:** Hard cost caps per session/task.
- **Performance impact:** Better task decomposition for complex requests.
- **Complexity:** **High.** New coordination layer; significant architectural addition.
- **Where:** `src/hooks/architect/` (1976 LOC), `src/agents/oracle/`
- **Source:** open-multi-agent/open-multi-agent

### P12. Cross-Model Peer Review (cavekit)

- **What:** Different models review each other's work (e.g., Opus code → Sonnet review → Opus fix). Catches blind spots.
- **Cost impact:** Catches errors early, reducing expensive late-stage fixes.
- **Performance impact:** Higher first-time quality.
- **Complexity:** **High.** Need review orchestration protocol.
- **Where:** `src/agents/sentinel.ts` (security review), `src/agents/merovingian.ts` (consultation)
- **Source:** JuliusBrussee/cavekit

### P13. Real-Time Cost Dashboard (claude-hud)

- **What:** TUI/notification panel showing per-agent/per-tool token consumption in real-time. Shows exactly where tokens are going.
- **Cost impact:** Visibility enables optimization. No direct savings.
- **Performance impact:** Faster debugging, more informed user decisions.
- **Complexity:** **Medium.** New TUI component.
- **Where:** New `src/features/cost-dashboard/`
- **Source:** jarrodwatts/claude-hud

### P14. Approval Gates for Expensive Operations (humanlayer)

- **What:** For operations exceeding cost threshold (e.g., >50K tokens, full refactor), pause and request human approval before continuing.
- **Cost impact:** Prevents runaway spend on bad requests.
- **Performance impact:** Forces user awareness.
- **Complexity:** **High.** New UI/UX; changes agent flow.
- **Where:** `src/tools/delegate-task/`, `src/hooks/`
- **Source:** humanlayer/humanlayer

### P15. Cap Context Recovery at 3 Strategies (internal optimization)

- **What:** Current worst case is 22+ API calls in `anthropic-context-window-limit-recovery`. Add an early-termination cap + escalation to user.
- **Cost impact:** Avoids pathological recovery storms.
- **Performance impact:** Faster failure path.
- **Complexity:** **Low.** Tune existing thresholds.
- **Where:** `src/hooks/anthropic-context-window-limit-recovery/` (~2232 LOC)
- **Source:** Internal hotspot analysis

### P16. Headroom Network-Proxy Compression (headroomlabs-ai/headroom)

- **What:** Network-proxy-level token compression via `headroom wrap opencode` with CacheAligner→ContentRouter→CCR pipeline. Provider `headroom` via @ai-sdk/openai-compatible, MCP `headroom_retrieve`, proxy default `http://127.0.0.1:8787`.
- **Cost impact:** **60–95% on JSON, 15–20% on coding agents** (Headroom benchmarks); orthogonal to L1 RTK, L2 context-mode, L3 DCP.
- **Performance impact:** Minimal per-turn overhead (proxy out-of-process; retrieval on-demand); complements prefix-cache and RTK.
- **Complexity:** **Low** (Matrixx bridge: ~120 LOC) — minimal opt-in schema + detection + prompt discipline; proxy owns compression. No Matrixx hook/tool in Phase 1.
- **Where:** `src/config/schema/headroom.ts`, `src/agents/dynamic-agent-prompt-builder.ts`, `src/agents/morpheus.ts`, `docs/` + `README`
- **Source:** headroomlabs-ai/headroom (wrap path recommended; native `headroom-opencode` deferred due to #2798 fetch patch + #76 compaction not stable)
- **Complementarity:** 5-layer matrix L0 native (70% warn/preemptive/anthropic-recovery) + L1 RTK + L2 context-mode + L3 DCP + L4 Headroom — zero overlap, <10ms bridge overhead

---

## 6. Quick-Win Matrix (Recommended Order)

| # | Proposal | Source | Cost Impact | Perf Impact | Complexity | ROI |
|---|---|---|---|---|---|---|
| 1 | P1: Lazy Skill/MCP Loading | barkain | Medium | High | Low | ⭐⭐⭐⭐⭐ |
| 2 | P2: Prefix-Cache Stability | DeepSeek-Reasonix | High | Medium | Low | ⭐⭐⭐⭐⭐ |
| 3 | P3: Per-Task Complexity Routing | pilotfish | High | Medium | Low | ⭐⭐⭐⭐⭐ |
| 4 | P4: SDO Audit | superpowers | Low-Med | Medium | Low | ⭐⭐⭐⭐ |
| 5 | P5: Plan-as-File | planning-with-files | Medium | Medium | Low-Med | ⭐⭐⭐⭐ |
| 6 | P15: Cap Recovery API Calls | internal | Medium | Low | Low | ⭐⭐⭐⭐ |
| 7 | P6: Bash Output Compression | rtk | High | High | Medium | ⭐⭐⭐⭐ |
| 8 | P7: Tool Output Sandboxing | context-mode | High | High | Medium-High | ⭐⭐⭐⭐ |
| 9 | P8: Progress Ledger | superpowers | Medium | Medium | Medium | ⭐⭐⭐ |
| 10 | P10: File Conflict Detection | claude-swarm | Medium | Medium | Medium | ⭐⭐⭐ |
| 11 | P9: Task-Brief Pattern | superpowers | Medium | Medium | Medium-High | ⭐⭐⭐ |
| 12 | P11: DAG + Budget Invariant | open-multi-agent | High | Medium | High | ⭐⭐ |
| 13 | P13: Cost Dashboard | claude-hud | Low | Medium | Medium | ⭐⭐ |
| 14 | P12: Cross-Model Review | cavekit | Medium | Low | High | ⭐ |
| 15 | P14: Approval Gates | humanlayer | Medium | Low | High | ⭐ |
| 16 | P16: Headroom | headroom | High | Medium | Low | ⭐⭐⭐⭐ |

---

## 7. Cumulative Effect Estimate

If Tier 1 (P1–P5) and P15 are implemented:

| Lever | Estimated reduction |
|---|---|
| Lazy loading (P1) | -6.6K startup tokens |
| Prefix-cache (P2) | -30–50% input tokens |
| Per-task routing (P3) | -40–54% on routable tasks |
| SDO audit (P4) | -10–30% on skill-related work |
| Plan-as-file (P5) | -5–20K per recovery |
| Recovery cap (P15) | eliminates worst-case 22+ calls |
| **Combined (no double-count)** | **~40–60% token reduction on typical sessions** |

If Tier 2 (P6–P8, P10) is also added: **~60–80% reduction on tool-heavy sessions.**

---

## 8. Recommended Implementation Sequence

1. **Sprint 1 (low risk, immediate):** P1 (lazy load), P2 (prefix-cache), P4 (SDO audit), P15 (recovery cap)
2. **Sprint 2 (medium effort):** P3 (per-task routing), P5 (plan-as-file)
3. **Sprint 3 (architectural):** P6 (output compression), P16 (Headroom proxy — Sprint 1 if `headroom wrap` already installed), P8 (progress ledger), P10 (conflict detection)
4. **Sprint 4 (deeper):** P7 (output sandboxing), P9 (task-brief)
5. **Backlog:** P11–P14 (experimental, validate with real usage data first)

---

## 9. Open Questions / Risks

1. **Cache-stability vs dynamic injection conflict:** keyword-detector injects context that mutates the prefix. Resolving this is non-trivial; may require a "suffix injection zone" pattern.
2. **Per-task routing accuracy:** Picking the wrong model tier degrades quality more than it saves cost. Needs evaluation harness (superpowers has `superpowers-evals` for this; could mirror).
3. **Output compression safety:** Aggressive filtering could hide critical errors. RTK's approach: never compress `set -x`, never compress error output.
4. **File conflict detection in TMUX sessions:** If two agents share a tmux pane, the conflict graph is different. Need careful integration.
5. **Approval gates UX:** Users may reject them; could increase friction. A/B test before committing.

---

## 10. Appendix: Comparator Project Links

| Project | URL | Stars |
|---|---|---|
| code-yeongyu/oh-my-openagent | https://github.com/code-yeongyu/oh-my-openagent | 5K+ |
| obra/superpowers | https://github.com/obra/superpowers | 250K+ |
| rtk-ai/rtk | https://github.com/rtk-ai/rtk | 69.8K |
| mksglu/context-mode | https://github.com/mksglu/context-mode | 18.7K |
| esengine/DeepSeek-Reasonix | https://github.com/esengine/DeepSeek-Reasonix | 26.5K |
| OthmanAdi/planning-with-files | https://github.com/OthmanAdi/planning-with-files | 25.1K |
| Nanako0129/pilotfish | https://github.com/Nanako0129/pilotfish | 237 |
| open-multi-agent/open-multi-agent | https://github.com/open-multi-agent/open-multi-agent | 6.5K |
| affaan-m/claude-swarm | https://github.com/affaan-m/claude-swarm | 272 |
| JuliusBrussee/cavekit | https://github.com/JuliusBrussee/cavekit | 1.1K |
| barkain/claude-code-workflow-orchestration | https://github.com/barkain/claude-code-workflow-orchestration | 74 |
| jarrodwatts/claude-hud | https://github.com/jarrodwatts/claude-hud | 26.3K |
| cobusgreyling/loop-engineering | https://github.com/cobusgreyling/loop-engineering | 6.8K |
| humanlayer/humanlayer | https://github.com/humanlayer/humanlayer | 11.1K |

---

*Research complete. No code modified. All proposals are recommendations for future implementation, prioritized by ROI. Citations link specific features from each comparator project.*
