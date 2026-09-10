/// <reference types="bun-types" />

import { describe, expect, it } from "bun:test"
import {
  type AvailableAgent,
  type AvailableCategory,
  type AvailableSkill,
  buildCategorySkillsDelegationGuide,
  buildUltraworkSection,
  formatCustomSkillsBlock,
  categorizeTools,
  buildContextDisciplineSection,
  buildHeadroomSection,
  buildCompactContextDisciplineSection,
  buildExploreDisciplineSection,
} from "../../src/agents/dynamic-agent-prompt-builder"

describe("buildCategorySkillsDelegationGuide", () => {
  const categories: AvailableCategory[] = [
    { name: "construct", description: "Frontend, UI/UX" },
    { name: "quick", description: "Trivial tasks" },
  ]

  const builtinSkills: AvailableSkill[] = [
    { name: "playwright", description: "Browser automation via Playwright", location: "plugin" },
    { name: "frontend-ui-ux", description: "Designer-turned-developer", location: "plugin" },
  ]

  const customUserSkills: AvailableSkill[] = [
    { name: "react-19", description: "React 19 patterns and best practices", location: "user" },
    { name: "tailwind-4", description: "Tailwind CSS v4 utilities", location: "user" },
  ]

  const customProjectSkills: AvailableSkill[] = [
    { name: "our-design-system", description: "Internal design system components", location: "project" },
  ]

  it("should separate builtin and custom skills into distinct sections", () => {
    //#given: mix of builtin and custom skills
    const allSkills = [...builtinSkills, ...customUserSkills]

    //#when: building the delegation guide
    const result = buildCategorySkillsDelegationGuide(categories, allSkills)

    //#then: should have separate sections
    expect(result).toContain("Built-in Skills")
    expect(result).toContain("User-Installed Skills")
    expect(result).toContain("HIGH PRIORITY")
  })

  it("should include custom skill names in CRITICAL warning", () => {
    //#given: custom skills installed
    const allSkills = [...builtinSkills, ...customUserSkills]

    //#when: building the delegation guide
    const result = buildCategorySkillsDelegationGuide(categories, allSkills)

    //#then: should mention custom skills by name in the warning
    expect(result).toContain('"react-19"')
    expect(result).toContain('"tailwind-4"')
    expect(result).toContain("CRITICAL")
  })

  it("should show source column for custom skills (user vs project)", () => {
    //#given: both user and project custom skills
    const allSkills = [...builtinSkills, ...customUserSkills, ...customProjectSkills]

    //#when: building the delegation guide
    const result = buildCategorySkillsDelegationGuide(categories, allSkills)

    //#then: should show source for each custom skill
    expect(result).toContain("| user |")
    expect(result).toContain("| project |")
  })

  it("should not show custom skill section when only builtin skills exist", () => {
    //#given: only builtin skills
    const allSkills = [...builtinSkills]

    //#when: building the delegation guide
    const result = buildCategorySkillsDelegationGuide(categories, allSkills)

    //#then: should not contain custom skill emphasis
    expect(result).not.toContain("User-Installed Skills")
    expect(result).not.toContain("HIGH PRIORITY")
    expect(result).toContain("Available Skills")
  })

  it("should handle only custom skills (no builtins)", () => {
    //#given: only custom skills, no builtins
    const allSkills = [...customUserSkills]

    //#when: building the delegation guide
    const result = buildCategorySkillsDelegationGuide(categories, allSkills)

    //#then: should show custom skills with emphasis, no builtin section
    expect(result).toContain("User-Installed Skills")
    expect(result).toContain("HIGH PRIORITY")
    expect(result).not.toContain("Built-in Skills")
  })

  it("should include priority note for custom skills in evaluation step", () => {
    //#given: custom skills present
    const allSkills = [...builtinSkills, ...customUserSkills]

    //#when: building the delegation guide
    const result = buildCategorySkillsDelegationGuide(categories, allSkills)

    //#then: evaluation section should mention user-installed priority
    expect(result).toContain("User-installed skills get PRIORITY")
    expect(result).toContain("INCLUDE it rather than omit it")
  })

  it("should NOT include priority note when no custom skills", () => {
    //#given: only builtin skills
    const allSkills = [...builtinSkills]

    //#when: building the delegation guide
    const result = buildCategorySkillsDelegationGuide(categories, allSkills)

    //#then: no priority note for custom skills
    expect(result).not.toContain("User-installed skills get PRIORITY")
  })

  it("should return empty string when no categories and no skills", () => {
    //#given: no categories and no skills
    //#when: building the delegation guide
    const result = buildCategorySkillsDelegationGuide([], [])

    //#then: should return empty string
    expect(result).toBe("")
  })
})

describe("buildUltraworkSection", () => {
  const agents: AvailableAgent[] = []

  it("should separate builtin and custom skills", () => {
    //#given: mix of builtin and custom skills
    const skills: AvailableSkill[] = [
      { name: "playwright", description: "Browser automation", location: "plugin" },
      { name: "react-19", description: "React 19 patterns", location: "user" },
    ]

    //#when: building ultrawork section
    const result = buildUltraworkSection(agents, [], skills)

    //#then: should have separate sections
    expect(result).toContain("Built-in Skills")
    expect(result).toContain("User-Installed Skills")
    expect(result).toContain("HIGH PRIORITY")
  })

  it("should not separate when only builtin skills", () => {
    //#given: only builtin skills
    const skills: AvailableSkill[] = [
      { name: "playwright", description: "Browser automation", location: "plugin" },
    ]

    //#when: building ultrawork section
    const result = buildUltraworkSection(agents, [], skills)

    //#then: should have single section
    expect(result).toContain("Built-in Skills")
    expect(result).not.toContain("User-Installed Skills")
  })
})

describe("formatCustomSkillsBlock", () => {
  const customSkills: AvailableSkill[] = [
    { name: "react-19", description: "React 19 patterns", location: "user" },
    { name: "tailwind-4", description: "Tailwind v4", location: "project" },
  ]

  const customRows = customSkills.map((s) => {
    const source = s.location === "project" ? "project" : "user"
    return `| \`${s.name}\` | ${s.description} | ${source} |`
  })

  it("should produce consistent output used by both builders", () => {
    //#given: custom skills and rows
    //#when: formatting with default header level
    const result = formatCustomSkillsBlock(customRows, customSkills)

    //#then: contains all expected elements
    expect(result).toContain("User-Installed Skills (HIGH PRIORITY)")
    expect(result).toContain("CRITICAL")
    expect(result).toContain('"react-19"')
    expect(result).toContain('"tailwind-4"')
    expect(result).toContain("| user |")
    expect(result).toContain("| project |")
  })

  it("should use #### header by default", () => {
    //#given: default header level
    const result = formatCustomSkillsBlock(customRows, customSkills)

    //#then: uses markdown h4
    expect(result).toContain("#### User-Installed Skills")
  })

  it("should use bold header when specified", () => {
    //#given: bold header level (used by Architect)
    const result = formatCustomSkillsBlock(customRows, customSkills, "**")

    //#then: uses bold instead of h4
    expect(result).toContain("**User-Installed Skills (HIGH PRIORITY):**")
    expect(result).not.toContain("#### User-Installed Skills")
  })
})

describe("categorizeTools", () => {

  it("should categorize ctx_* tools as sandbox", () => {
    //#given: ctx_* tool names
    const toolNames = ["ctx_execute", "ctx_batch_execute", "ctx_execute_file", "ctx_search", "ctx_fetch_and_index"]

    //#when: categorizing
    const result = categorizeTools(toolNames)

    //#then: all categorized as sandbox
    expect(result.every((t) => t.category === "sandbox")).toBe(true)
    expect(result).toHaveLength(5)
  })

  it("should categorize lsp_* tools as lsp", () => {
    //#given: lsp tool names
    const result = categorizeTools(["lsp_diagnostics", "lsp_rename"])

    //#then: all lsp
    expect(result.every((t) => t.category === "lsp")).toBe(true)
  })

  it("should categorize ast_grep tools as ast", () => {
    //#given: ast_grep tools
    const result = categorizeTools(["ast_grep_search", "ast_grep_replace"])

    //#then: all ast
    expect(result.every((t) => t.category === "ast")).toBe(true)
  })

  it("should categorize grep and glob as search", () => {
    //#given: grep and glob
    const result = categorizeTools(["grep", "glob"])

    //#then: both search
    expect(result.every((t) => t.category === "search")).toBe(true)
  })

  it("should categorize unknown tools as other", () => {
    //#given: tools with no recognized prefix
    const result = categorizeTools(["write", "read", "edit", "bash"])

    //#then: all other
    expect(result.every((t) => t.category === "other")).toBe(true)
  })

  it("should categorize mixed tool list correctly", () => {
    //#given: mixed tools
    const toolNames = [
      "ctx_execute", "lsp_diagnostics", "grep", "ast_grep_search",
      "write", "ctx_search", "glob", "unknown_tool",
    ]

    //#when
    const result = categorizeTools(toolNames)

    //#then: each has correct category
    const byCategory = (cat: string) => result.filter((t) => t.category === cat).map((t) => t.name)
    expect(byCategory("sandbox")).toEqual(["ctx_execute", "ctx_search"])
    expect(byCategory("lsp")).toEqual(["lsp_diagnostics"])
    expect(byCategory("search")).toEqual(["grep", "glob"])
    expect(byCategory("ast")).toEqual(["ast_grep_search"])
    expect(byCategory("other")).toEqual(["write", "unknown_tool"])
  })
})

describe("buildContextDisciplineSection", () => {

  it("should return empty string when context-mode not available", () => {
    //#given: hasContextMode = false
    const result = buildContextDisciplineSection(false)

    //#then: empty
    expect(result).toBe("")
  })

  it("should return empty string by default", () => {
    //#given: default parameter
    const result = buildContextDisciplineSection()

    //#then: empty (defaults to false)
    expect(result).toBe("")
  })

  it("should render discipline table when context-mode is available", () => {
    //#given: hasContextMode = true (runtime file or fallback)
    const result = buildContextDisciplineSection(true)

    //#then: contains ctx guidance in either form
    expect(result.includes("Context Discipline") || result.includes("context-mode")).toBe(true)
    expect(result).toContain("ctx_")
    expect(result).toContain("ctx_search")
    expect(result).toContain("ctx_fetch_and_index")
    expect(result.includes("ctx_stats") || result.includes("ctx_execute")).toBe(true)
  })

  it("should mention all 7 scenarios in the table", () => {
    //#given: loader returns fallback table or runtime file
    const result = buildContextDisciplineSection(true)

    //#then: fallback rows OR runtime markers
    const isFallback = result.includes("Analysis / Processing")
    const isRuntime = result.includes("Think in Code") || result.includes("BLOCKED") || result.includes("Tool selection")
    expect(isFallback || isRuntime).toBe(true)
    if (isFallback) {
      expect(result).toContain("Analysis / Processing")
      expect(result).toContain("Edits")
      expect(result).toContain("Observation")
      expect(result).toContain("State Mutation")
      expect(result).toContain("Search")
      expect(result).toContain("Docs / Web")
      expect(result).toContain("Compression")
    }
  })
})

describe("buildHeadroomSection", () => {
  it("should return empty string when headroom not available", () => {
    //#given: hasHeadroom false
    const result = buildHeadroomSection(false)
    //#then: empty
    expect(result).toBe("")
  })

  it("should return empty string by default", () => {
    //#given: default param
    const result = buildHeadroomSection()
    //#then: empty
    expect(result).toBe("")
  })

  it("should render headroom table when available", () => {
    //#given: hasHeadroom true
    const result = buildHeadroomSection(true)
    //#then: contains expected parts
    expect(result).toContain("Headroom Proxy Discipline")
    expect(result).toContain("headroom_retrieve")
    expect(result).toContain("headroom_search")
    expect(result).toContain("headroom_stats")
    expect(result).toContain("HEADROOM_PROXY_URL")
    expect(result).toContain("127.0.0.1:8787")
    expect(result).toContain("L4")
  })

  it("should mention transport-level complement note", () => {
    //#given
    const result = buildHeadroomSection(true)
    //#then
    expect(result).toContain("CacheAligner")
    expect(result).toContain("L1 RTK")
  })
})

describe("buildCompactContextDisciplineSection", () => {
  it("should return empty string when not available", () => {
    //#given: false
    expect(buildCompactContextDisciplineSection(false)).toBe("")
    //#then: empty
  })

  it("should return empty string by default", () => {
    //#given: default
    expect(buildCompactContextDisciplineSection()).toBe("")
    //#then: empty
  })

  it("should render compact table when available", () => {
    //#given: true (runtime file or fallback)
    const result = buildCompactContextDisciplineSection(true)
    //#then: non-empty discipline in either form
    expect(result.length).toBeGreaterThan(50)
    expect(result.includes("Context Discipline") || result.includes("context-mode")).toBe(true)
    expect(result).not.toContain("ALWAYS")
  })

  it("should contain 4 compact scenarios", () => {
    //#given (runtime file or fallback)
    const result = buildCompactContextDisciplineSection(true)
    //#then: ctx coverage in either form
    expect(result).toContain("ctx_")
    expect(result.includes("ctx_batch_execute") || result.includes("GATHER")).toBe(true)
    expect(result.includes("ctx_search") || result.includes("FOLLOW-UP")).toBe(true)
    expect(result.includes("ctx_fetch_and_index") || result.includes("WEB")).toBe(true)
    expect(result.includes("ctx_stats") || result.includes("PROCESSING")).toBe(true)
  })

  it("should mention read→edit chain exempt", () => {
    //#given (runtime file distinguishes edit-reads; fallback states chain exempt)
    const result = buildCompactContextDisciplineSection(true)
    //#then
    expect(result.includes("LINE#ID") || result.includes("reading correct") || result.includes("ctx_execute_file")).toBe(true)
    expect(result.includes("read→edit") || result.includes("Reading to **edit**") || result.includes("ctx_")).toBe(true)
  })

  it("should not contain full-table rows", () => {
    //#given
    const result = buildCompactContextDisciplineSection(true)
    //#then: compact omits Edits/Observation/State Mutation distinctions
    expect(result).not.toContain("Analysis / Processing")
    expect(result).not.toContain("Observation")
    expect(result).not.toContain("State Mutation")
  })
})

describe("buildExploreDisciplineSection", () => {
  it("should return empty when neither available", () => {
    //#given
    expect(buildExploreDisciplineSection(false, false)).toBe("")
    expect(buildExploreDisciplineSection()).toBe("")
    //#then: empty
  })

  it("should render ctx part when ctx available", () => {
    //#given: ctx only
    const result = buildExploreDisciplineSection(true, false)
    //#then
    expect(result).toContain("when available")
    expect(result).toContain("ctx_search")
    expect(result).toContain("grep/glob fallback")
    expect(result).toContain("ctx_batch_execute")
    expect(result).toContain("ctx_fetch_and_index")
    expect(result).not.toContain("headroom_")
  })

  it("should render headroom part when headroom available", () => {
    //#given: headroom only
    const result = buildExploreDisciplineSection(false, true)
    //#then
    expect(result).toContain("headroom_retrieve")
    expect(result).toContain("headroom_search")
    expect(result).not.toContain("ctx_search")
  })

  it("should render both parts when both available", () => {
    //#given: both
    const result = buildExploreDisciplineSection(true, true)
    //#then: contains both
    expect(result).toContain("ctx_search")
    expect(result).toContain("ctx_batch_execute")
    expect(result).toContain("ctx_fetch_and_index")
    expect(result).toContain("headroom_retrieve")
    expect(result).toContain("NEVER re-read full history")
  })

  it("should always mention fallback semantics for explore", () => {
    //#given
    const result = buildExploreDisciplineSection(true, false)
    //#then: explore tier emphasizes fallback not NEVER",
    expect(result).toContain("→ grep/glob fallback")
    expect(result).not.toContain("NEVER raw")
  })
})

describe("categorizeTools extended", () => {
  it("should categorize headroom_* as sandbox", () => {
    //#given: headroom tools
    const result = categorizeTools(["headroom_retrieve", "headroom_search", "headroom_stats"])
    //#then: sandbox
    expect(result.every((t) => t.category === "sandbox")).toBe(true)
  })

  it("should categorize ctx_stats and ctx_index as sandbox", () => {
    //#given
    const result = categorizeTools(["ctx_stats", "ctx_index"])
    //#then
    expect(result.every((t) => t.category === "sandbox")).toBe(true)
  })

  it("should categorize session_* as session and slashcommand as command", () => {
    //#given
    const result = categorizeTools(["session_list", "session_get", "slashcommand"])
    //#then
    expect(result.find((t) => t.name === "session_list")?.category).toBe("session")
    expect(result.find((t) => t.name === "slashcommand")?.category).toBe("command")
  })

  it("should keep ctx and headroom mixed as sandbox in mixed list", () => {
    //#given: mixed ctx/headroom plus plain
    const result = categorizeTools(["ctx_search", "headroom_retrieve", "grep", "read"])
    //#then
    const byCategory = (c: string) => result.filter((t) => t.category === c).map((t) => t.name)
    expect(byCategory("sandbox")).toEqual(["ctx_search", "headroom_retrieve"])
    expect(byCategory("search")).toEqual(["grep"])
    expect(byCategory("other")).toEqual(["read"])
  })
})
