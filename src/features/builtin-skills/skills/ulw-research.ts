import type { BuiltinSkill } from "../types"

const ULW_RESEARCH_SKILL_NAME = "ulw-research"

const ULW_RESEARCH_SKILL_DESCRIPTION =
  "Use when conducting deep research, investigating complex topics, or exploring codebases across multiple sources — spawns parallel search agents across code, docs, web, and OSS repos with recursive convergence. Related: dev-browser, document-reader."

export const ulwResearchSkill: BuiltinSkill = {
  name: ULW_RESEARCH_SKILL_NAME,
  description: ULW_RESEARCH_SKILL_DESCRIPTION,
  agent: "oracle",
  allowedTools: [
    "read",
    "write",
    "edit",
    "bash",
    "grep",
    "glob",
    "look_at",
    "delegate_agent",
    "websearch_web_search_exa",
    "white_rabbit_searchGitHub",
    "context7_resolve-library-id",
    "context7_query-docs",
  ],
  template: `# ULW-Research — Saturation Research Orchestrator

Run a systematic, multi-round research process that converges on comprehensive coverage.

## Inputs

- **TOPIC**: The research question or topic (from user message)
- **SCOPE**: Optional scope narrowing (--scope=code|docs|web|oss|all, default: all)
- **MAX_ROUNDS**: Optional (--max-rounds=N, default: 5, hard limit: 5)

## Artifact Directory

Create \`.matrixx/research-<slug>-<timestamp>/\` for all outputs:
- \`meta.md\` — Research metadata (topic, scope, start time, max rounds)
- \`round-<N>-findings.md\` — Per-round combined findings
- \`leads.md\` — Tracked EXPAND leads across rounds (status: pending/explored/exhausted)
- \`contested-claims.md\` — Claims that need code verification
- \`convergence-log.md\` — Novelty scores and decisions per round
- \`final-synthesis.md\` — Cited synthesis (final deliverable)

All artifacts are written via the \`write\` tool. The next session can resume from artifacts if interrupted.

## Phase 0: Parse and Seed

1. Create artifact directory: \`.matrixx/research-<topic-slug>-<YYYYMMDD-HHmmss>/\`
2. Write \`meta.md\` with topic, timestamp, scope, max rounds
3. Initialize \`leads.md\` with seed queries extracted from the topic:
   - 1-3 code-local search terms
   - 1-3 documentation/Context7 search terms
   - 1-3 web search terms
   - 1-3 OSS repository search terms
4. Write round 0 to \`convergence-log.md\`

## Phase 1: Parallel Swarm (per round)

For each round, spawn 4 parallel background agents. Each agent gets ONLY its direction-specific query (not the full research state).

### Direction 1: Local Code (trinity agent)

\`\`\`
task(
  subagent_type="trinity",
  run_in_background=true,
  description="Research code: <lead>",
  prompt="""
Search the local codebase for implementations, patterns, and references related to: <CURRENT_LEAD>

Use grep, glob, and read tools. Find:
- Relevant source files and their key functions
- Architectural patterns used
- Configuration and usage examples
- Related tests that reveal intended behavior

OUTPUT: List of findings with file paths, line numbers, and brief descriptions.
Flag any claims that seem contested or unverifiable by reading alone.
""")
\`\`\`

### Direction 2: Documentation (trinity agent)

\`\`\`
task(
  subagent_type="trinity",
  run_in_background=true,
  description="Research docs: <lead>",
  prompt="""
Research documentation and knowledge base files related to: <CURRENT_LEAD>

Read AGENTS.md files, README.md, doc/ directories, and inline documentation.
Use context7_resolve-library-id and context7_query-docs for library/framework docs.

OUTPUT: Structured findings from docs with source attribution.
Flag any claims that contradict other sources.
""")
\`\`\`

### Direction 3: Web (operator agent)

\`\`\`
task(
  subagent_type="operator",
  run_in_background=true,
  description="Research web: <lead>",
  prompt="""
Research the web for information about: <CURRENT_LEAD>

Use websearch_web_search_exa and context7 tools. Find:
- Official documentation and blog posts
- Technical articles and tutorials
- Implementation patterns and best practices
- Real-world usage examples

OUTPUT: Cited findings with URLs, publication dates, and reliability assessment.
Flag any contested claims or conflicting information.
""")
\`\`\`

### Direction 4: OSS Repos (operator agent)

\`\`\`
task(
  subagent_type="operator",
  run_in_background=true,
  description="Research OSS: <lead>",
  prompt="""
Search open source repositories for implementations related to: <CURRENT_LEAD>

Use white_rabbit_searchGitHub to find real-world code patterns.
Focus on:
- Production implementations in similar projects
- Reference implementations or canonical examples
- Common patterns and anti-patterns
- Version-specific changes or migrations

OUTPUT: Code patterns with repo URLs, file paths, and usage context.
Flag any patterns that seem contested or deprecated.
""")
\`\`\`

### Collect Results

After all 4 agents complete, collect via \`background_output(task_id="...")\`:
1. Merge findings into \`round-<N>-findings.md\`
2. Extract new EXPAND leads → append to \`leads.md\`
3. Extract contested claims → append to \`contested-claims.md\`

## Phase 2: Convergence Check (after each round)

Evaluate novelty by comparing this round's findings against ALL previous rounds:

1. **Total items this round**: Count of unique file paths, URLs, code patterns, concepts, library names
2. **Novel items**: Items not present in ANY prior round
3. **Novelty ratio**: novel_items / total_items_this_round

**Decision:**
- \`novelty_ratio > 0.3\` AND \`round < MAX_ROUNDS\` → **EXPAND**: Pick top 3 new leads, go to Phase 1
- \`novelty_ratio <= 0.3\` → **STOP**: Natural convergence, proceed to Phase 4
- \`round == MAX_ROUNDS\` → **STOP**: Forced convergence
- \`total_items_this_round == 0\` → **STOP**: No findings

Record convergence state in \`convergence-log.md\` with round number and novelty score.

**Lead selection for next round**: Pick top 3 leads prioritizing:
- Specificity (concrete file paths or URLs > vague concepts)
- Freshness (leads from current round > old leads)
- Diversity (one per direction preferred)

## Phase 3: Contested Claim Verification (if needed)

If \`contested-claims.md\` is non-empty after convergence, verify each claim:

\`\`\`
task(
  subagent_type="trinity",
  run_in_background=true,
  description="Verify claim: <summary>",
  prompt="""
Verify this contested claim by examining code:

CLAIM: <claim_text>
EVIDENCE FOR: <supporting_evidence>
EVIDENCE AGAINST: <opposing_evidence>

Verification steps:
1. Find the relevant source files
2. Read the implementation
3. If runnable: write a minimal test script and execute it
4. Determine verdict

OUTPUT:
<verdict>CONFIRMED / REFUTED / INCONCLUSIVE</verdict>
<evidence>Specific code or outputs supporting the verdict</evidence>
""")
\`\`\`

Max 10 contested claims verified. If none, skip Phase 3.

## Phase 4: Final Synthesis

Produce \`final-synthesis.md\`:

\`\`\`markdown
# Research Synthesis: <TOPIC>

**Date**: <timestamp>
**Rounds**: <N> (converged at round <M>)
**Sources**: <count> unique sources

## Executive Summary
2-3 paragraphs synthesizing the most important findings.

## Key Findings

### Finding 1: <title>
- **Status**: CONFIRMED / CONTESTED / INCONCLUSIVE
- **Confidence**: HIGH / MEDIUM / LOW
- **Summary**: 2-3 sentence synthesis
- **Evidence**: Details with citations
- **Sources**: [1] path, [2] URL, [3] repo

(Repeat for all significant findings)

## Contested Claims Resolution
| Claim | Verdict | Evidence |
|-------|---------|----------|

## Research Gaps
- Areas not fully covered
- Questions remaining unanswered

## Source Index
| # | Type | Source | Key Insight |
|---|------|--------|-------------|
\`\`\`

## Rules

- NEVER fabricate citations — every claim must reference a real source found during research
- ALWAYS write intermediate artifacts — preserves partial results if interrupted
- MAX 5 rounds regardless of novelty
- Each background agent gets a FOCUSED prompt — never dump the entire research state
- Contested claims MUST be verified by code execution when possible
- The final synthesis must be self-contained without intermediate artifacts
- If a round produces zero findings, STOP immediately`,
}
