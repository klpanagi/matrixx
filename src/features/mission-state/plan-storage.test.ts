import { describe, expect, test } from "bun:test"
import { syncCheckboxes } from "./plan-storage"

describe("syncCheckboxes — monotonic (only check, never uncheck)", () => {
  test("checks an unchecked box when the matching todo is completed", () => {
    //#given a plan with an unchecked box and a completed matching todo
    const content = "- [ ] Write unit tests"
    const todos = [{ content: "Write unit tests", status: "completed" }]
    //#when syncing
    const result = syncCheckboxes(content, todos)
    //#then the box is checked
    expect(result).toBe("- [x] Write unit tests")
  })

  test("preserves a manually checked box when no todo matches (the revert bug)", () => {
    //#given a manually checked box with no matching runtime todo
    const content = "- [x] 2. Add threadID to TaskSchema"
    const todos = [{ content: "Unrelated task", status: "completed" }]
    //#when syncing
    const result = syncCheckboxes(content, todos)
    //#then the manual mark is preserved, not reverted to [ ]
    expect(result).toBe("- [x] 2. Add threadID to TaskSchema")
  })

  test("never unchecks a box whose matching todo is still pending", () => {
    //#given a checked box whose matching todo regressed to pending
    const content = "- [x] Write unit tests"
    const todos = [{ content: "Write unit tests", status: "pending" }]
    //#when syncing
    const result = syncCheckboxes(content, todos)
    //#then the box stays checked
    expect(result).toBe("- [x] Write unit tests")
  })

  test("leaves an unchecked box unchecked when the matching todo is pending", () => {
    //#given an unchecked box with a pending matching todo
    const content = "- [ ] Write unit tests"
    const todos = [{ content: "Write unit tests", status: "pending" }]
    //#when syncing
    const result = syncCheckboxes(content, todos)
    //#then the box stays unchecked
    expect(result).toBe("- [ ] Write unit tests")
  })

  test("treats cancelled and deleted as done", () => {
    //#given unchecked boxes with cancelled/deleted matching todos
    const content = "- [ ] Task A\n- [ ] Task B"
    const todos = [
      { content: "Task A", status: "cancelled" },
      { content: "Task B", status: "deleted" },
    ]
    //#when syncing
    const result = syncCheckboxes(content, todos)
    //#then both boxes are checked
    expect(result).toBe("- [x] Task A\n- [x] Task B")
  })

  test("mixed plan: checks matches, preserves manual marks, keeps case", () => {
    //#given a plan mixing manual marks, matchable todos, and uppercase [X]
    const content = "- [x] Manual task\n- [ ] Auto task\n- [X] Uppercase manual"
    const todos = [{ content: "Auto task", status: "completed" }]
    //#when syncing
    const result = syncCheckboxes(content, todos)
    //#then auto is checked, manual marks preserved byte-for-byte
    expect(result).toBe("- [x] Manual task\n- [x] Auto task\n- [X] Uppercase manual")
  })
})
