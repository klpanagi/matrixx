import { z } from "zod"

/**
 * Headroom network-proxy compression configuration.
 *
 * Headroom is an external network-proxy that compresses LLM traffic
 * (CacheAligner → ContentRouter → CCR pipeline). Matrixx does NOT
 * implement compression itself — it only detects/disciplines when
 * Headroom is active.
 *
 * - Opt-in via `enabled: true` (default: false).
 * - Recommended usage is `HEADROOM_WRAP=1 headroom wrap -- <command>`
 *   so the proxy sits transparently in front of the transport.
 * - Native transport integration is deferred until the compaction hook
 *   stabilizes (Headroom #76 collision risk with
 *   context-window-limit-recovery).
 */
export const HeadroomConfigSchema = z.object({
  /** Enable Headroom proxy detection/discipline (default: false — opt-in) */
  enabled: z.boolean().default(false),
  /** Proxy URL for Headroom server (e.g., "http://localhost:8080") */
  proxyUrl: z.string().url().optional(),
  /** Headroom project identifier */
  project: z.string().optional(),
  /** Headroom backend identifier */
  backend: z.string().optional(),
})

export type HeadroomConfig = z.infer<typeof HeadroomConfigSchema>
