import { describe, expect, test } from "bun:test"
import { isMainSessionCandidate } from "./state"

describe("isMainSessionCandidate", () => {
  test("//#given a top-level session without metadata\n//#when checked\n//#then it is a main session candidate", () => {
    expect(isMainSessionCandidate({ id: "ses_main", parentID: undefined })).toBe(true)
  })

  test("//#given a subagent session (has parentID)\n//#when checked\n//#then it is NOT a main session candidate", () => {
    expect(isMainSessionCandidate({ id: "ses_sub", parentID: "ses_main" })).toBe(false)
  })

  test("//#given a foreign-plugin internal session (metadata.internal=true)", () => {
    expect(
      isMainSessionCandidate({
        id: "ses_capture",
        parentID: undefined,
        metadata: { "opencode-mem": { internal: true, purpose: "structured-output" } },
      }),
    ).toBe(false)
  })

  test("//#given a foreign-plugin internal session (flat namespaced metadata key)", () => {
    expect(
      isMainSessionCandidate({
        id: "ses_capture",
        parentID: undefined,
        metadata: { "opencode-mem.internal": true, "opencode-mem.purpose": "structured-output" },
      }),
    ).toBe(false)
  })

  test("//#given a top-level session with non-internal metadata\n//#when checked\n//#then it IS a main session candidate", () => {
    expect(isMainSessionCandidate({ id: "ses_main", parentID: undefined, metadata: { foo: "bar" } })).toBe(true)
  })

  test("//#given undefined session info\n//#when checked\n//#then it is NOT a main session candidate", () => {
    expect(isMainSessionCandidate(undefined)).toBe(false)
  })
})