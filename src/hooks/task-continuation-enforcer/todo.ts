import type { Task } from "../../features/task-storage/types"

export function getIncompleteCount(todos: { status: string }[]): number {
  return todos.filter(
    (todo) =>
      todo.status !== "completed" &&
      todo.status !== "cancelled" &&
      todo.status !== "blocked" &&
      todo.status !== "deleted",
  ).length
}

export function getIncompleteTasks(tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  return tasks.filter((task) => {
    if (task.status !== "pending" && task.status !== "in_progress") return false
    if (task.blockedBy.length === 0) return true
    return task.blockedBy.every((bid) => byId.get(bid)?.status === "completed")
  })
}

export function getIncompleteTaskCount(tasks: Task[]): number {
  return getIncompleteTasks(tasks).length
}

export interface SessionFilterOptions {
  sessionID: string
  subagentIDs: string[]
  sessionScoped?: boolean // default: true
}

/**
 * Filter tasks by session scope.
 * - When sessionScoped=false: all tasks pass through (opt-out / legacy behavior)
 * - Pre-migration tasks (no threadID) are always included for backward compatibility
 * - Current session's tasks (threadID === sessionID) are included
 * - Subagent session tasks (threadID in subagentIDs) are included
 * - All other tasks are excluded
 */
export function filterTasksBySession(
  tasks: Task[],
  options: SessionFilterOptions
): Task[] {
  if (options.sessionScoped === false) return tasks
  return tasks.filter((task) => {
    if (!task.threadID) return true
    if (task.threadID === options.sessionID) return true
    if (options.subagentIDs.includes(task.threadID)) return true
    return false
  })
}

