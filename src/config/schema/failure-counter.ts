import { z } from "zod"

export const FailureCounterConfigSchema = z.object({
  /** Enable failure-counter gating (default: true) */
  enabled: z.boolean().default(true),
  /** Consecutive failures before gating (default: 2, min 1 max 10) */
  threshold: z.number().min(1).max(10).default(2),
  /** Reset counter on any success (default: true) */
  resetOnSuccess: z.boolean().default(true),
})

export type FailureCounterConfig = z.infer<typeof FailureCounterConfigSchema>
