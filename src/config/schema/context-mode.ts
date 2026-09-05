import { z } from "zod"

export const ContextModeConfigSchema = z.object({
  enabled: z.boolean().default(true),
  enforce: z.boolean().default(false),
  blocked_tools: z.array(z.string()).default(["read", "grep", "glob"]),
})

export type ContextModeConfig = z.infer<typeof ContextModeConfigSchema>
