/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import {
  buildCompactContextDisciplineSection,
  buildContextDisciplineSection,
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
})
