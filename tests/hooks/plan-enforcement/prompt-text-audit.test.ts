/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"
import { ORACLE_PERMISSION } from "../../../src/agents/oracle/system-prompt"
import { SMITH_SYSTEM_PROMPT } from "../../../src/agents/smith"
import { START_WORK_TEMPLATE } from "../../../src/features/builtin-commands/templates/start-work"

/**
 * Prompt-text audit (Task 7 of enforce-plan-tools-only-access).
 *
 * Task 5 rewrote the Oracle/Smith/start-work prompts to mandate plan_* tools
 * exclusively. This suite asserts:
 *   1. The plan_* mandate strings are present in every rewritten file.
 *   2. The legacy plain Read/Write/Edit-for-plans strings are gone.
 *   3. ORACLE_PERMISSION denies generic edit and allows plan_update.
 *   4. identity-constraints.ts <write_protocol> mandates plan_create/plan_update
 *      exclusively (Gap 2 resolved: no generic Write/Edit-on-plans instructions).
 */

const SRC = path.join(import.meta.dir, "../../../src")

function readSource(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), "utf-8")
}

describe("prompt-text audit: plan_* mandate present in rewritten files", () => {
  test("behavioral-summary.ts mandates plan_* tools", () => {
    //#given the rewritten behavioral summary
    const content = readSource("agents/oracle/behavioral-summary.ts")
    //#then it mandates plan_* tools and no longer says raw write
    expect(content).toContain("via plan_* tools (plan_create, plan_read, plan_update, plan_list)")
    expect(content).not.toContain("write .matrixx/*.md files")
  })

  test("plan-generation.ts generates via plan_create", () => {
    //#given the rewritten plan generation prompt
    const content = readSource("agents/oracle/plan-generation.ts")
    //#then it routes generation through plan_create
    expect(content).toContain("via plan_create")
    expect(content).not.toContain("Generate work plan to")
  })

  test("plan-template.ts generates via plan_create", () => {
    //#given the rewritten plan template
    const content = readSource("agents/oracle/plan-template.ts")
    //#then it routes generation through plan_create
    expect(content).toContain("via plan_create")
    expect(content).not.toContain("Generate plan to:")
  })

  test("system-prompt.ts denies edit and allows plan_update", () => {
    //#given the rewritten system prompt + permission config
    const content = readSource("agents/oracle/system-prompt.ts")
    //#then the permission config denies generic edit and allows plan_update
    expect(ORACLE_PERMISSION.edit).toBe("deny")
    expect(ORACLE_PERMISSION.plan_update).toBe("allow")
    expect(content).toContain("Plan files are modified ONLY via plan_update (never generic Edit/Write)")
    expect(content).not.toContain('edit: "allow"')
  })

  test("smith.ts reads plans via plan_read", () => {
    //#given the rewritten smith prompt
    const content = readSource("agents/smith.ts")
    //#then it reads plans via plan_read, never bare Read
    expect(SMITH_SYSTEM_PROMPT).toContain("via plan_read")
    expect(content).toContain("via plan_read")
    expect(content).not.toContain("must read it.")
    expect(content).not.toContain("**Read plan**")
  })

  test("start-work template lists and reads via plan_* tools", () => {
    //#given the rewritten start-work template
    const content = readSource("features/builtin-commands/templates/start-work.ts")
    //#then it uses plan_list and plan_read
    expect(START_WORK_TEMPLATE).toContain("via plan_list")
    expect(START_WORK_TEMPLATE).toContain("via plan_read")
    expect(content).toContain("via plan_list")
    expect(content).toContain("via plan_read")
    expect(content).not.toContain("**Read the plan file**")
  })
})

describe("prompt-text audit: identity-constraints.ts mandates plan_* tools (Gap 2 resolved)", () => {
  test("identity-constraints.ts <write_protocol> uses plan_create/plan_update, never generic Write/Edit on plans", () => {
    //#given the rewritten identity-constraints write_protocol
    const content = readSource("agents/oracle/identity-constraints.ts")
    //#then it mandates plan_create (atomic) + plan_update (LINE#ID anchors) exclusively
    expect(content).toContain("<write_protocol>")
    expect(content).toContain("plan_create")
    expect(content).toContain("plan_update")
    expect(content).toContain("Generic Write/Edit on .matrixx/plans is BLOCKED")
    //#and no longer instructs correct-example Write/Edit on plans
    expect(content).not.toContain("✅ Write(")
    expect(content).not.toContain("✅ Edit(")
    expect(content).not.toContain("**The Write tool OVERWRITES files")
  })
})