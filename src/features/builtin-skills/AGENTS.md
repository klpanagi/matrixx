# BUILT-IN SKILLS KNOWLEDGE BASE

## OVERVIEW

45 specialized skills loaded by default into every Matrixx session. Each skill bundles domain expertise, optional MCPs, and (sometimes) a custom model/agent assignment.

| Scope | Count | Source |
|------|-------|--------|
| **Built-in (this dir)** | 45 | `src/features/builtin-skills/skills/*.ts` |
| Opencode-project (`.opencode/skills/`) | varies | per-project |
| Opencode-user (`~/.config/opencode/skills/`) | varies | per-user |
| Claude Code compat (`.claude/skills/`) | varies | per-project |
| Claude Code user (`~/.claude/skills/`) | varies | per-user |

## STRUCTURE

```
builtin-skills/
├── index.ts                      # Barrel: createBuiltinSkills, types
├── skills.ts                     # createBuiltinSkills() factory (92 LOC)
├── types.ts                      # BuiltinSkill interface
├── lazy-skill-helper.ts          # Lazy template getter (54 LOC)
├── lazy-skill-helper.test.ts     # Helper tests
├── skills.test.ts                # Factory tests
├── skills/                       # 45 individual skill files (export Skill objects)
│   ├── playwright.ts             # Playwright MCP browser automation
│   ├── playwright-cli.ts         # CLI variant
│   ├── agent-browser.ts          # Vercel agent-browser variant
│   ├── frontend-ui-ux.ts
│   ├── docker-master.ts
│   ├── git-master.ts             # git-master (large)
│   ├── dev-browser.ts
│   ├── dsl-*.ts                  # 12 DSL skills
│   ├── frontend-*.ts             # 8 frontend skills
│   ├── bdd-*.ts                  # 4 BDD skills
│   ├── security-*.ts             # 8 security skills
│   ├── tdd-enforcer.ts, review-work.ts, quality-gate.ts, software-dev.ts
│   ├── matrixx-self-config.ts, ulw-research.ts, remove-ai-slops.ts
│   └── ...
```

## LAZY LOADING (P1 OPTIMIZATION)

Since v2.0.0, all **non-browser** skills use lazy template resolution:

- **Pattern:** `Object.defineProperty` self-destructing getter on `.template`
- **Helper:** `createLazyTemplateSkill(name, factory)` in `lazy-skill-helper.ts`
- **Cache:** module-level `Map<string, string>` keyed by skill name
- **Eager:** Only the active browser skill (playwright/agent-browser/playwright-cli) — needed at init for the skill-context filter
- **Lazy:** All other 42 skills — factory NOT called until first `.template` access

**Behavior:**
- First `.template` access invokes the factory, caches result, replaces getter with a data property
- Subsequent accesses use the data property (no getter overhead)
- `description` is also deferred — calling the factory eagerly to populate it would defeat laziness
- Transparent: zero API break, no config flag, no behavioral difference

## BUILT-IN SKILL

`BuiltinSkill` interface (`types.ts`):

```typescript
interface BuiltinSkill {
  name: string;
  description: string;
  template: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, unknown>;
  allowedTools?: string[];
  agent?: string;
  model?: string;
  subtask?: boolean;
  argumentHint?: string;
  mcpConfig?: SkillMcpConfig;
}
```

## FACTORY: `createBuiltinSkills(options)`

```typescript
interface CreateBuiltinSkillsOptions {
  browserProvider?: "playwright" | "agent-browser" | "playwright-cli";
  disabledSkills?: Set<string> | string[];
}
```

Returns `BuiltinSkill[]`. Disabled skills are filtered AFTER creation. The `disabledSkills` Set comparison is done at the array level (skill objects themselves are not lazy-wrapped differently based on disabled state — they're just filtered out).

## DISABLING SKILLS

```jsonc
// matrixx.jsonc
{
  "disabled_skills": ["playwright", "matrixx-self-config"]
}
```

## SKILL LOADING

All skills are loaded from `src/features/builtin-skills/` via `createBuiltinSkills()`. No external skill directory loading.

## HOW TO ADD A NEW BUILT-IN SKILL

1. Create `src/features/builtin-skills/skills/<name>.ts`
2. Export a `Skill` object: `export const mySkill: Skill = { name, description, template, ... }`
3. Add to the `skillLoaders` map in `src/features/builtin-skills/skills.ts` (line 7-56):
   ```typescript
   "my-name": () => require("./skills/my-name").mySkill,
   ```
4. The factory pattern means no other change is needed — the lazy wrapper handles hydration.

## HOW TO REMOVE A BUILT-IN SKILL

Remove from `skillLoaders` in `skills.ts`. Note: users with `disabled_skills: ["my-skill"]` will see a benign "not found" message.

## KNOWN HOTSPOTS

- `src/features/builtin-skills/skills/git-master.ts` — large skill with many workflow procedures
- `src/features/builtin-skills/skills/ulw-research.ts` — references the research skill
- `src/features/builtin-skills/skills.ts` `skillLoaders` map — must stay in sync with `skills/*.ts` exports

## Skill Description SDO (Skill Discovery Optimization)

All built-in skill descriptions MUST follow the SDO pattern:

**Format:**
```
Use when {trigger1}, {trigger2}, {trigger3} — {1-sentence domain context}. Related: {skill-x}, {skill-y}.
```

**Rules:**
- First sentence MUST contain a trigger pattern (`Use when`, `For ... tasks`, etc.)
- Trigger phrases MUST appear in the first 120 characters (survives `truncateDescription()`)
- Maximum 150 tokens (~500-600 chars)
- Cross-reference max 2 related skills
- No workflow content (phases, agents, step numbers)
- No directives (`MUST USE`, `STRONGLY RECOMMENDED`)

**Example:**
```
GOOD: "Use when setting up auth, configuring login, or implementing access control — authentication and authorization patterns for web APIs. Related: security-api, security-core."
BAD:  "Authentication and authorization. Covers JWT, OAuth, sessions, RBAC, ABAC. Triggers: 'auth', 'login'."
```
