import { z } from "zod"
import { TASK_ID_PATTERN } from "./constants"

export const TaskStatusSchema = z.enum(["pending", "in_progress", "completed", "deleted"])
export type TaskStatus = z.infer<typeof TaskStatusSchema>

/** Task ID must match T-{uuid}-style format (rejects truncated IDs like "T-"). */
export const TaskIdSchema = z.string().regex(TASK_ID_PATTERN)

export const TaskObjectSchema = z
  .object({
    id: z.string(),
    subject: z.string(),
    description: z.string(),
    status: TaskStatusSchema,
    activeForm: z.string().optional(),
    blocks: z.array(z.string()).default([]),
    blockedBy: z.array(z.string()).default([]),
    owner: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    repoURL: z.string().optional(),
    parentID: z.string().optional(),
    threadID: z.string(),
    projectRoot: z.string().optional(),
  })
  .strict()

export type TaskObject = z.infer<typeof TaskObjectSchema>

// Claude Code style aliases
export const TaskSchema = TaskObjectSchema
export type Task = TaskObject

// Action input schemas
export const TaskCreateInputSchema = z.object({
  subject: z.string(),
  description: z.string().optional(),
  activeForm: z.string().optional(),
  blocks: z.array(TaskIdSchema).optional(),
  blockedBy: z.array(TaskIdSchema).optional(),
  owner: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  repoURL: z.string().optional(),
  parentID: TaskIdSchema.optional(),
})

export type TaskCreateInput = z.infer<typeof TaskCreateInputSchema>

export const TaskListInputSchema = z.object({
  status: TaskStatusSchema.optional(),
  parentID: z.string().optional(),
})

export type TaskListInput = z.infer<typeof TaskListInputSchema>

export const TaskGetInputSchema = z.object({
  id: z.string(),
})

export type TaskGetInput = z.infer<typeof TaskGetInputSchema>

export const TaskUpdateInputSchema = z.object({
  id: z.string(),
  subject: z.string().optional(),
  description: z.string().optional(),
  status: TaskStatusSchema.optional(),
  activeForm: z.string().optional(),
  addBlocks: z.array(TaskIdSchema).optional(),
  addBlockedBy: z.array(TaskIdSchema).optional(),
  owner: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  repoURL: z.string().optional(),
  parentID: TaskIdSchema.optional(),
})

export type TaskUpdateInput = z.infer<typeof TaskUpdateInputSchema>

export const TaskDeleteInputSchema = z.object({
  id: z.string(),
})

export type TaskDeleteInput = z.infer<typeof TaskDeleteInputSchema>
