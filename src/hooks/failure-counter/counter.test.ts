import { beforeEach, describe, expect, test } from "bun:test"
import { _resetFailureCountersForTesting, getFailureCount, incFailureCounter, isThresholdReached } from "../../features/session-state/state"
import { CONTINUATION_COOLDOWN_MS, handleToolAfter } from "./counter"
import { createFailureCounterHook } from "./hook"

beforeEach(() => {
  _resetFailureCountersForTesting()
})

describe("failure-counter counter", () => {
  test("increment", () => {
    //#given empty counter
    //#when
    incFailureCounter("s1")
    incFailureCounter("s1")
    //#then
    expect(getFailureCount("s1")).toBe(2)
  })

  test("reset-on-success", () => {
    //#given 2 failures via direct inc
    incFailureCounter("s1")
    incFailureCounter("s1")
    expect(getFailureCount("s1")).toBe(2)
    //#when success
    handleToolAfter("s1", "success output", true)
    //#then reset to 0
    expect(getFailureCount("s1")).toBe(0)
  })

  test("threshold gate", () => {
    //#given threshold 2
    const threshold = 2
    //#when count 1
    incFailureCounter("s1")
    //#then not reached
    expect(isThresholdReached("s1", threshold)).toBe(false)
    //#when count 2
    incFailureCounter("s1")
    expect(isThresholdReached("s1", threshold)).toBe(true)
  })

  test("session isolation", () => {
    //#given two sessions
    incFailureCounter("s1")
    incFailureCounter("s1")
    incFailureCounter("s2")
    //#then independent
    expect(getFailureCount("s1")).toBe(2)
    expect(getFailureCount("s2")).toBe(1)
  })

  test("compaction reset", async () => {
    //#given inc s1 twice
    incFailureCounter("s1")
    incFailureCounter("s1")
    expect(getFailureCount("s1")).toBe(2)
    //#when session.compacted event
    const hook = createFailureCounterHook({} as never)
    await hook.event({ event: { type: "session.compacted", properties: { sessionID: "s1" } } })
    //#then cleared
    expect(getFailureCount("s1")).toBe(0)
  })

  test("background-task attribution", () => {
    //#given background timeout output
    const bgOutput = "Background task failed to start within timeout"
    //#when attributed to parent
    handleToolAfter("child-session", bgOutput, false, { parentSessionID: "parent-session" })
    //#then parent increments, child not
    expect(getFailureCount("parent-session")).toBe(1)
    expect(getFailureCount("child-session")).toBe(0)
  })

  test("30s dedupe", () => {
    //#given inc at T0
    handleToolAfter("s1", "[ERROR] Operation timed out", false)
    expect(getFailureCount("s1")).toBe(1)
    //#when second failure within 30s
    handleToolAfter("s1", "[ERROR] Operation timed out again", false)
    //#then still 1 (dedupe)
    expect(getFailureCount("s1")).toBe(1)
    //#when after cooldown
    const orig = Date.now
    Date.now = () => orig() + CONTINUATION_COOLDOWN_MS + 1000
    handleToolAfter("s1", "[ERROR] Operation timed out after cooldown", false)
    Date.now = orig
    expect(getFailureCount("s1")).toBe(2)
  })

  test("success resets even when dedupe would apply", () => {
    //#given failure
    handleToolAfter("s1", "[ERROR] timed out", false)
    expect(getFailureCount("s1")).toBe(1)
    //#when success immediately after (should reset, not deduped)
    handleToolAfter("s1", "ok", true)
    expect(getFailureCount("s1")).toBe(0)
  })
})
