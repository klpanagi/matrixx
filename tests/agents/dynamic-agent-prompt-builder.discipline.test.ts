/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import {
  buildCompactContextDisciplineSection,
  buildContextDisciplineSection,
  buildExploreDisciplineSection,
  hasGrepGlobToolNames,
} from "../../src/agents/dynamic-agent-prompt-builder"

describe("context discipline loader", () => {
  test("returns empty when hasContextMode false", () => {
    //#given no ctx tools
    //#when build
    //#then empty
    expect(buildContextDisciplineSection(false)).toBe("")
    expect(buildCompactContextDisciplineSection(false)).toBe("")
  })

  test("returns non-empty discipline when hasContextMode true", () => {
    //#given ctx tools present
    //#when build
    const full = buildContextDisciplineSection(true)
    const compact = buildCompactContextDisciplineSection(true)
    //#then contains ctx guidance or fallback table
    expect(full.length).toBeGreaterThan(50)
    expect(compact.length).toBeGreaterThan(50)
    expect(full).toContain("ctx_")
    expect(compact).toContain("ctx_")
  })

  test("falls back to hardcoded table when file missing (memoized)", () => {
    //#given loader with missing file still returns fallback
    //#when called twice (memoization)
    const first = buildContextDisciplineSection(true)
    const second = buildContextDisciplineSection(true)
    //#then stable and contains fallback markers
    expect(first).toBe(second)
    expect(first.includes("Context Discipline") || first.includes("context-mode")).toBe(true)
  })

  test("hasGrepGlobToolNames matches exact tool names", () => {
    //#given tool name lists
    //#when check
    //#then exact lowercase match only
    expect(hasGrepGlobToolNames(["grep", "glob", "read"])).toBe(true)
    expect(hasGrepGlobToolNames(["grep"])).toBe(true)
    expect(hasGrepGlobToolNames(["ctx_search", "read"])).toBe(false)
    expect(hasGrepGlobToolNames([])).toBe(false)
    expect(hasGrepGlobToolNames(["Grep"])).toBe(false)
  })

  test("explore section omits grep/glob fallback when hidden", () => {
    //#given grep/glob hidden
    //#when build explore discipline
    const withTools = buildExploreDisciplineSection(true, false, true)
    const withoutTools = buildExploreDisciplineSection(true, false, false)
    //#then fallback sentence gated
    expect(withTools).toContain("grep/glob fallback")
    expect(withoutTools).not.toContain("grep/glob fallback")
    expect(withoutTools).toContain("LSP/ast_grep")
    expect(withoutTools).toContain("ctx_search")
  })

  test("full and compact omit grep/glob fallback when hidden", () => {
    //#given grep/glob hidden
    //#when build
    const full = buildContextDisciplineSection(true, false)
    const compact = buildCompactContextDisciplineSection(true, false)
    //#then no grep/glob fallback promise in either runtime or fallback form
    expect(full).not.toContain("grep/glob fallback")
    expect(compact).not.toContain("grep/glob fallback")
    expect(full).toContain("ctx_")
    expect(compact).toContain("ctx_")
  })
})
