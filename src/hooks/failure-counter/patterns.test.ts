import { beforeEach, describe, expect, test } from "bun:test"
import { _resetFailureCountersForTesting } from "../../features/session-state/state"
import { isCountableFailure } from "./patterns"

beforeEach(() => {
  _resetFailureCountersForTesting()
})

describe("failure-counter patterns", () => {
  test("abort excluded", () => {
    //#given abort output
    const output = "MessageAbortedError: user aborted"
    //#when
    const result = isCountableFailure(output)
    //#then not countable
    expect(result).toBe(false)
  })

  test("abort excluded AbortError", () => {
    expect(isCountableFailure("AbortError: aborted")).toBe(false)
  })

  test("countable failure - task error", () => {
    expect(isCountableFailure("[ERROR] Invalid arguments: category OR subagent_type")).toBe(true)
  })

  test("countable failure - timeout", () => {
    expect(isCountableFailure("Operation timed out after 30000ms")).toBe(true)
  })

  test("countable failure - background timeout", () => {
    expect(isCountableFailure("Background task failed to start within timeout")).toBe(true)
  })

  test("non-error success not counted", () => {
    expect(isCountableFailure("Task completed successfully")).toBe(false)
    expect(isCountableFailure("")).toBe(false)
  })

  test("generic timed out counted", () => {
    expect(isCountableFailure("timed out while waiting")).toBe(true)
  })
})
