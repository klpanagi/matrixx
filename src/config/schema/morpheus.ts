import { z } from "zod"

const MorpheusTasksConfigSchema = z.object({
  /** Absolute or relative storage path override. When set, bypasses global config dir. */
  storage_path: z.string().optional(),
  /** Force task list ID (alternative to env ULTRAWORK_TASK_LIST_ID) */
  task_list_id: z.string().optional(),
  /** Task storage scope: project → .matrixx/tasks per project (default), global → ~/.config/opencode/tasks/{listId} */
  scope: z.enum(["global", "project"]).default("project").optional().describe("Task storage scope: project → .matrixx/tasks per project (default), global → ~/.config/opencode/tasks/{listId}"),
  /** Pending tasks with no file activity for this many hours are considered stale (default: 24). Stale tasks are excluded from task-continuation directives. */
  stale_after_hours: z.number().int().min(1).optional().describe("Pending tasks with no file activity for this many hours are considered stale (default: 24). Stale tasks are excluded from task-continuation directives."),
  /** When true, the task-continuation-enforcer only considers tasks created by the current session (or its subagent sessions). When false, all project tasks are considered regardless of session origin. */
  session_scoped: z.boolean().default(true).optional().describe(
    "When true, the task-continuation-enforcer only considers tasks created by the current session (or its subagent sessions). When false, all project tasks are considered regardless of session origin."
  ),
})

export const MorpheusConfigSchema = z.object({
  tasks: MorpheusTasksConfigSchema.optional(),
})

export type MorpheusTasksConfig = z.infer<typeof MorpheusTasksConfigSchema>
export type MorpheusConfig = z.infer<typeof MorpheusConfigSchema>
