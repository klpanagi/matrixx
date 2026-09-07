import type { PluginInput } from "@opencode-ai/plugin"
import type { InputSecretGuardConfig } from "../../config/schema/security"
import { log } from "../../shared"
import { createSystemDirective, isSystemDirective } from "../../shared/system-directive"
import { extractPromptText } from "../keyword-detector/detector"
import { detectSecrets, hashFinding } from "./detector"
import {
  allowOnce,
  allowSession,
  consumeOneShot,
  isSessionAllowed,
} from "./session-allow-cache"

const ALLOW_ONCE_PATTERN = /^\s*"?allow once"?\s*$/i
const ALLOW_SESSION_PATTERN = /^\s*"?allow session"?\s*$/i

const pendingFindings = new Map<string, string[]>()

function buildRedactedPreview(findings: { ruleId: string; redacted: string }[]): string {
  const parts = findings.slice(0, 3).map((f) => `${f.ruleId}: ${f.redacted}`)
  if (findings.length > 3) parts.push(`+${findings.length - 3} more`)
  return parts.join(", ")
}

export function createInputSecretGuardHook(ctx: PluginInput, cfg?: InputSecretGuardConfig) {
  const enabled = cfg?.enabled ?? true
  const mode = cfg?.mode ?? "prompt"
  const blocklistMode = cfg?.blocklist_mode ?? "prompt"
  const warnlistMode = cfg?.warnlist_mode ?? "prompt"
  const allowlistPatterns = cfg?.allowlist_patterns ?? []
  const maxScanBytes = cfg?.detection?.max_scan_bytes ?? 64 * 1024
  const entropyThreshold = cfg?.detection?.entropy_threshold ?? 4.5

  return {
    "chat.message": async (
      input: { sessionID: string; agent?: string; model?: { providerID: string; modelID: string } },
      output: {
        message: Record<string, unknown>
        parts: Array<{ type: string; text?: string; [key: string]: unknown }>
      },
    ): Promise<void> => {
      if (!enabled) return

      const promptText = extractPromptText(output.parts)
      if (!promptText) return
      if (isSystemDirective(promptText)) return

      const trimmed = promptText.trim()

      if (ALLOW_ONCE_PATTERN.test(trimmed)) {
        const pending = pendingFindings.get(input.sessionID)
        if (pending) {
          for (const h of pending) allowOnce(input.sessionID, h)
          pendingFindings.delete(input.sessionID)
        }
        return
      }
      if (ALLOW_SESSION_PATTERN.test(trimmed)) {
        const pending = pendingFindings.get(input.sessionID)
        if (pending) {
          for (const h of pending) allowSession(input.sessionID, h)
          pendingFindings.delete(input.sessionID)
        }
        return
      }

      const start = performance.now()

      let findings = detectSecrets(promptText, {
        maxScanBytes,
        allowlist: allowlistPatterns,
        entropyThreshold,
      })

      if (findings.length === 0) return

      const activeFindings = findings.filter((f) => {
        const h = hashFinding(f.ruleId, f.redacted)
        if (isSessionAllowed(input.sessionID, h)) return false
        if (consumeOneShot(input.sessionID, h)) return false
        return true
      })

      if (activeFindings.length === 0) return

      findings = activeFindings

      const hasBlock = findings.some((f) => f.severity === "block")
      const hasWarn = findings.some((f) => f.severity === "warn")

      let shouldPrompt = false
      let isHardBlock = false

      if (hasBlock) {
        if (blocklistMode === "block") {
          shouldPrompt = true
          isHardBlock = true
        } else {
          shouldPrompt = true
        }
      } else if (hasWarn) {
        if (mode === "off" || warnlistMode === "off") {
          const elapsedMs = Math.round(performance.now() - start)
          log("[input-secret-guard] Warnlist suppressed (mode off)", {
            sessionID: input.sessionID,
            findingCount: findings.length,
            elapsedMs,
          })
          return
        }
        shouldPrompt = mode === "prompt" && warnlistMode === "prompt"
      }

      if (!shouldPrompt) return

      const redactedPreview = buildRedactedPreview(findings)
      const elapsedMs = Math.round(performance.now() - start)
      const findingHashes = findings.map((f) => hashFinding(f.ruleId, f.redacted))
      pendingFindings.set(input.sessionID, findingHashes)

      log("[input-secret-guard] Potential secret detected", {
        sessionID: input.sessionID,
        findingCount: findings.length,
        redactedPreview,
        elapsedMs,
      })

      const toastMessage = isHardBlock
        ? `Found ${findings.length} potential secret(s) (${redactedPreview}). Blocked — remove or redact the secret and resend.`
        : `Found ${findings.length} potential secret(s) (${redactedPreview}). Remove them or reply 'allow once' / 'allow session' to send.`

      ctx.client.tui
        .showToast({
          body: {
            title: "🔒 Potential secret detected",
            message: toastMessage,
            variant: "warning" as const,
            duration: 6000,
          },
        })
        .catch((err) =>
          log("[input-secret-guard] Failed to show toast", {
            error: err,
            sessionID: input.sessionID,
          }),
        )

      const textPartIndex = output.parts.findIndex((p) => p.type === "text" && p.text !== undefined)
      if (textPartIndex !== -1) {
        const originalText = output.parts[textPartIndex].text ?? ""
        const directive = createSystemDirective("INPUT_SECRET_GUARD")
        const injected = isHardBlock
          ? `${directive} ⚠️ Potential secret detected (${redactedPreview}). Blocked — redact the secret and resend.\n\n---\n\n${originalText}`
          : `${directive} ⚠️ Potential secret detected (${redactedPreview}). To send: reply "allow once" / "allow session" or remove the secret. Blocked until confirmed.\n\n---\n\n${originalText}`
        output.parts[textPartIndex].text = injected
      }

      if (promptText.length > 80 && elapsedMs > 50) {
        log("[input-secret-guard] Scan exceeded 50ms budget", {
          sessionID: input.sessionID,
          elapsedMs,
          textLength: promptText.length,
        })
      }

      const errorMessage = isHardBlock
        ? `🔒 Potential secret detected — ${redactedPreview} — redact and resend.`
        : `🔒 Potential secret detected — ${redactedPreview} — reply 'allow once' / 'allow session' or redact and resend.`

      throw new Error(errorMessage)
    },
  }
}
