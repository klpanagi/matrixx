/// <reference types="bun-types" />

import { describe, expect, it } from "bun:test"
import { injectContextDiscipline } from "../../src/plugin-handlers/agent-config-handler"

function makeAgents(names: string[]): Record<string, Record<string, unknown>> {
  const agents: Record<string, Record<string, unknown>> = {}
  for (const n of names) agents[n] = { prompt: `${n} BASE` }
  return agents
}

describe("injectContextDiscipline pure", () => {
  it("should not inject when no ctx_/headroom tools", () => {
    //#given: no ctx
    const agents = makeAgents(["trinity", "mouse", "cipher"])
    //#when
    injectContextDiscipline(["grep", "read"], agents)
    //#then: nothing injected
    for (const cfg of Object.values(agents)) {
      const prompt = (cfg as { prompt: string }).prompt
      expect(prompt).not.toContain("Context Discipline")
    }
  })

  it("should inject compact into executors when ctx_* present", () => {
    //#given: ctx tools (runtime file or fallback)
    const agents = makeAgents(["mouse", "cipher", "sati", "sentinel", "architect", "customBot"])
    //#when
    injectContextDiscipline(["ctx_search", "ctx_batch_execute"], agents)
    //#then: compact discipline in either form
    for (const name of ["mouse", "cipher", "sati", "sentinel", "architect", "customBot"]) {
      const prompt = (agents[name] as { prompt: string }).prompt
      expect(prompt.includes("when ctx_* available") || prompt.includes("context-mode")).toBe(true)
      expect(prompt).toContain("ctx_batch_execute")
      expect(prompt).toContain("ctx_search")
      expect(prompt).toContain("ctx_fetch_and_index")
    }
  })

  it("should inject explore into explore agents when ctx_* present", () => {
    //#given: ctx tools
    const agents = makeAgents(["trinity", "operator", "seraph", "smith", "merovingian", "construct", "oracle"])
    //#when
    injectContextDiscipline(["ctx_search", "ctx_batch_execute"], agents)
    //#then: explore
    for (const name of ["trinity", "operator", "seraph", "smith", "merovingian", "construct", "oracle"]) {
      const prompt = (agents[name] as { prompt: string }).prompt
      expect(prompt).toContain("when available")
      expect(prompt).toContain("ctx_search")
      expect(prompt).toContain("grep/glob fallback")
    }
  })

  it("should inject explore into bdd-contract when present", () => {
    //#given: bdd-contract via plugin
    const agents = makeAgents(["bdd-contract"])
    //#when
    injectContextDiscipline(["ctx_search"], agents)
    //#then: bdd-contract gets explore
    const prompt = (agents["bdd-contract"] as { prompt: string }).prompt
    expect(prompt).toContain("when available")
    expect(prompt).toContain("ctx_search")
  })

  it("should inject headroom when headroom_* present", () => {
    //#given: headroom only
    const agents = makeAgents(["trinity", "mouse"])
    //#when
    injectContextDiscipline(["headroom_retrieve", "headroom_search"], agents)
    //#then: both get headroom
    expect((agents["trinity"] as { prompt: string }).prompt).toContain("headroom_retrieve")
    expect((agents["mouse"] as { prompt: string }).prompt).toContain("headroom_retrieve")
  })

  it("should inject both ctx and headroom when both present", () => {
    //#given: both
    const agents = makeAgents(["trinity", "mouse"])
    //#when
    injectContextDiscipline(["ctx_search", "headroom_retrieve"], agents)
    //#then: both
    const trinityPrompt = (agents["trinity"] as { prompt: string }).prompt
    expect(trinityPrompt).toContain("ctx_search")
    expect(trinityPrompt).toContain("headroom_retrieve")
    const mousePrompt = (agents["mouse"] as { prompt: string }).prompt
    expect(mousePrompt).toContain("ctx_search")
    expect(mousePrompt).toContain("headroom_retrieve")
  })

  it("should skip morpheus and keymaker", () => {
    //#given: ctx tools
    const agents = makeAgents(["morpheus", "keymaker", "trinity"])
    //#when
    injectContextDiscipline(["ctx_search"], agents)
    //#then: morpheus/keymaker untouched, trinity injected
    expect((agents["morpheus"] as { prompt: string }).prompt).not.toContain("when available")
    expect((agents["morpheus"] as { prompt: string }).prompt).not.toContain("when ctx_* available")
    expect((agents["morpheus"] as { prompt: string }).prompt).toBe("morpheus BASE")
    expect((agents["keymaker"] as { prompt: string }).prompt).toBe("keymaker BASE")
    expect((agents["trinity"] as { prompt: string }).prompt).toContain("when available")
  })

  it("should be idempotent when already contains Context Discipline", () => {
    //#given: already has discipline
    const agents: Record<string, Record<string, unknown>> = {
      customBot: { prompt: "BASE\n\n### Context Discipline (when ctx_* available)\nold" },
    }
    //#when
    injectContextDiscipline(["ctx_search"], agents)
    //#then: not duplicated
    const prompt = (agents["customBot"] as { prompt: string }).prompt
    const count = (prompt.match(/Context Discipline/g) ?? []).length
    expect(count).toBe(1)
  })

  it("should inject compact into custom agents", () => {
    //#given: custom (runtime file or fallback)
    const agents = makeAgents(["myCustom"])
    //#when
    injectContextDiscipline(["ctx_search"], agents)
    //#then: compact
    const prompt = (agents["myCustom"] as { prompt: string }).prompt
    expect(prompt.includes("when ctx_* available") || prompt.includes("context-mode")).toBe(true)
    expect(prompt).toContain("ctx_search")
  })

  it("should handle agents without prompt gracefully", () => {
    //#given: no prompt
    const agents: Record<string, Record<string, unknown>> = {
      noPromptAgent: { mode: "subagent" },
      trinity: { prompt: "BASE" },
    }
    //#when
    injectContextDiscipline(["ctx_search"], agents)
    //#then: no throw, trinity still injected, noPrompt preserved
    expect(agents["noPromptAgent"]).toBeDefined()
    expect((agents["noPromptAgent"] as { prompt?: string }).prompt).toBeUndefined()
    expect((agents["trinity"] as { prompt: string }).prompt).toContain("ctx_search")
  })

  it("should handle case-insensitive explore names", () => {
    //#given: uppercase
    const agents = makeAgents(["Trinity", "Oracle", "MOUSE"])
    //#when
    injectContextDiscipline(["ctx_search"], agents)
    //#then: Trinity/Oracle get explore (lowercased), MOUSE gets compact
    expect((agents["Trinity"] as { prompt: string }).prompt).toContain("when available")
    expect((agents["Oracle"] as { prompt: string }).prompt).toContain("when available")
    const mousePrompt = (agents["MOUSE"] as { prompt: string }).prompt
    expect(mousePrompt.includes("when ctx_* available") || mousePrompt.includes("context-mode")).toBe(true)
  })

  it("should preserve read→edit chain exempt note in compact", () => {
    //#given: ctx (runtime file distinguishes edit-reads; fallback states chain exempt)
    const agents = makeAgents(["cipher"])
    //#when
    injectContextDiscipline(["ctx_search"], agents)
    //#then: edit-read guidance in either form
    const prompt = (agents["cipher"] as { prompt: string }).prompt
    expect(prompt.includes("LINE#ID") || prompt.includes("reading correct") || prompt.includes("ctx_execute_file")).toBe(true)
  })

  it("should not mutate when agents empty", () => {
    //#given: empty
    const agents: Record<string, Record<string, unknown>> = {}
    //#when
    injectContextDiscipline(["ctx_search"], agents)
    //#then: still empty
    expect(Object.keys(agents)).toHaveLength(0)
  })
})
