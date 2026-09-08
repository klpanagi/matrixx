import type { PluginInput } from "@opencode-ai/plugin"
import { normalizeSDKResponse } from "../../shared"
import { log } from "../../shared/logger"
import { isSqliteBackend } from "../../shared/opencode-storage-detection"
import { findEmptyMessages, injectTextPart, replaceEmptyTextParts } from "../session-recovery/storage"
import { replaceEmptyTextPartsAsync } from "../session-recovery/storage/empty-text"
import { injectTextPartAsync } from "../session-recovery/storage/text-part-injector"

export const PLACEHOLDER_TEXT = "[user interrupted]"

type OpencodeClient = PluginInput["client"]

interface SdkPart {
  type?: string
  text?: string
}

interface SdkMessage {
  info?: { id?: string }
  parts?: SdkPart[]
}

function hasSdkContent(parts?: SdkPart[]): boolean {
  if (!parts || parts.length === 0) return false
  for (const p of parts) {
    if (!p.type) continue
    if (p.type === "thinking" || p.type === "redacted_thinking" || p.type === "meta") continue
    if (p.type === "text") {
      if (p.text?.trim()) return true
      continue
    }
    if (p.type === "tool" || p.type === "tool_use" || p.type === "tool_result") return true
    return true
  }
  return false
}

async function findEmptyIdsSdk(client: OpencodeClient, sessionID: string): Promise<string[]> {
  try {
    const res = (await client.session.messages({ path: { id: sessionID } })) as { data?: SdkMessage[] }
    const msgs = normalizeSDKResponse(res, [] as SdkMessage[], { preferResponseOnMissingData: true })
    const empty: string[] = []
    for (const m of msgs) {
      const id = m.info?.id
      if (!id) continue
      if (!hasSdkContent(m.parts)) empty.push(id)
    }
    return empty
  } catch {
    return []
  }
}

export async function sanitizeEmptyMessagesBeforeSummarize(sessionID: string, client?: OpencodeClient): Promise<number> {
  if (client && isSqliteBackend()) {
    const ids = await findEmptyIdsSdk(client, sessionID)
    if (ids.length === 0) return 0
    let fixed = 0
    for (const mid of ids) {
      if ((await replaceEmptyTextPartsAsync(client, sessionID, mid, PLACEHOLDER_TEXT)) || (await injectTextPartAsync(client, sessionID, mid, PLACEHOLDER_TEXT))) fixed++
    }
    if (fixed > 0) log("[auto-compact] pre-summarize sanitization fixed empty messages", { sessionID, fixedCount: fixed, totalEmpty: ids.length })
    return fixed
  }
  const ids = findEmptyMessages(sessionID)
  if (ids.length === 0) return 0
  let fixed = 0
  for (const mid of ids) {
    if (replaceEmptyTextParts(mid, PLACEHOLDER_TEXT) || injectTextPart(sessionID, mid, PLACEHOLDER_TEXT)) fixed++
  }
  if (fixed > 0) log("[auto-compact] pre-summarize sanitization fixed empty messages", { sessionID, fixedCount: fixed, totalEmpty: ids.length })
  return fixed
}

export async function getLastAssistant(sessionID: string, client: OpencodeClient, directory: string): Promise<Record<string, unknown> | null> {
  try {
    const resp = await client.session.messages({ path: { id: sessionID }, query: { directory } })
    const data = (resp as { data?: unknown[] }).data
    if (!Array.isArray(data)) return null
    const last = [...data].reverse().find((m) => (m as { info?: { role?: string } }).info?.role === "assistant")
    if (!last) return null
    return (last as { info?: Record<string, unknown> }).info ?? null
  } catch {
    return null
  }
}
