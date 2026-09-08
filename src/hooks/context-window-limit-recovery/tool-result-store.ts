import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import { normalizeSDKResponse, PART_STORAGE } from "../../shared"
import { log } from "../../shared/logger"
import { patchPart } from "../../shared/opencode-http-api"
import { getMessageDir } from "../../shared/opencode-message-dir"
import { isSqliteBackend } from "../../shared/opencode-storage-detection"
import type { StoredToolPart, ToolResultInfo } from "./tool-part-types"
export const TRUNCATION_MESSAGE =
  "[TOOL RESULT TRUNCATED - Context limit exceeded. Original output was too large and has been truncated to recover the session. Please re-run this tool if you need the full output.]"

type OpencodeClient = PluginInput["client"]

interface SDKToolPart {
  id: string
  type: string
  callID?: string
  tool?: string
  state?: {
    status?: string
    input?: Record<string, unknown>
    output?: string
    error?: string
    time?: { start?: number; end?: number; compacted?: number }
  }
}
interface SDKMessage {
  info?: { id?: string }
  parts?: SDKToolPart[]
}
function getMessageIds(sessionID: string): string[] {
  const messageDir = getMessageDir(sessionID)
  if (!messageDir || !existsSync(messageDir)) return []
  const ids: string[] = []
  for (const file of readdirSync(messageDir)) {
    if (!file.endsWith(".json")) continue
    ids.push(file.replace(".json", ""))
  }
  return ids
}
let hasLoggedTruncateWarning = false

// File-backend
export function findToolResultsBySize(sessionID: string): ToolResultInfo[] {
  const messageIds = getMessageIds(sessionID)
  const results: ToolResultInfo[] = []
  for (const messageID of messageIds) {
    const partDir = join(PART_STORAGE, messageID)
    if (!existsSync(partDir)) continue
    for (const file of readdirSync(partDir)) {
      if (!file.endsWith(".json")) continue
      try {
        const partPath = join(partDir, file)
        const content = readFileSync(partPath, "utf-8")
        const part = JSON.parse(content) as StoredToolPart
        if (part.type === "tool" && part.state?.output && !part.truncated) {
          results.push({
            partPath,
            partId: part.id,
            messageID,
            toolName: part.tool,
            outputSize: part.state.output.length,
          })
        }
      } catch {}
    }
  }
  return results.sort((a, b) => b.outputSize - a.outputSize)
}
export function findLargestToolResult(sessionID: string): ToolResultInfo | null {
  const results = findToolResultsBySize(sessionID)
  return results.length > 0 ? results[0] : null
}

export function truncateToolResult(partPath: string): { success: boolean; toolName?: string; originalSize?: number } {
  if (isSqliteBackend()) {
    if (!hasLoggedTruncateWarning) {
      log("[context-window-recovery] Disabled on SQLite backend: truncateToolResult")
      hasLoggedTruncateWarning = true
    }
    return { success: false }
  }
  try {
    const content = readFileSync(partPath, "utf-8")
    const part = JSON.parse(content) as StoredToolPart
    if (!part.state?.output) return { success: false }
    const originalSize = part.state.output.length
    const toolName = part.tool
    part.truncated = true
    part.originalSize = originalSize
    part.state.output = TRUNCATION_MESSAGE
    if (!part.state.time) part.state.time = { start: Date.now() }
    part.state.time.compacted = Date.now()
    writeFileSync(partPath, JSON.stringify(part, null, 2))
    return { success: true, toolName, originalSize }
  } catch {
    return { success: false }
  }
}
export function getTotalToolOutputSize(sessionID: string): number {
  const results = findToolResultsBySize(sessionID)
  return results.reduce((sum, r) => sum + r.outputSize, 0)
}

export function countTruncatedResults(sessionID: string): number {
  const messageIds = getMessageIds(sessionID)
  let count = 0
  for (const messageID of messageIds) {
    const partDir = join(PART_STORAGE, messageID)
    if (!existsSync(partDir)) continue
    for (const file of readdirSync(partDir)) {
      if (!file.endsWith(".json")) continue
      try {
        const content = readFileSync(join(partDir, file), "utf-8")
        const part = JSON.parse(content)
        if (part.truncated === true) count++
      } catch {}
    }
  }
  return count
}
// SDK-backend
export async function findToolResultsBySizeFromSDK(client: OpencodeClient, sessionID: string): Promise<ToolResultInfo[]> {
  try {
    const response = await client.session.messages({ path: { id: sessionID } })
    const messages = normalizeSDKResponse(response, [] as SDKMessage[], { preferResponseOnMissingData: true })
    const results: ToolResultInfo[] = []
    for (const msg of messages) {
      const messageID = msg.info?.id
      if (!messageID || !msg.parts) continue
      for (const part of msg.parts) {
        if (part.type === "tool" && part.state?.output && !part.state?.time?.compacted && part.tool) {
          results.push({
            partPath: "",
            partId: part.id,
            messageID,
            toolName: part.tool,
            outputSize: part.state.output.length,
          })
        }
      }
    }
    return results.sort((a, b) => b.outputSize - a.outputSize)
  } catch {
    return []
  }
}
export async function truncateToolResultAsync(
  client: OpencodeClient,
  sessionID: string,
  messageID: string,
  partId: string,
  part: SDKToolPart,
): Promise<{ success: boolean; toolName?: string; originalSize?: number }> {
  if (!part.state?.output) return { success: false }
  const originalSize = part.state.output.length
  const toolName = part.tool
  const updatedPart: Record<string, unknown> = {
    ...part,
    state: {
      ...part.state,
      output: TRUNCATION_MESSAGE,
      time: {
        ...(part.state.time ?? { start: Date.now() }),
        compacted: Date.now(),
      },
    },
  }
  try {
    const patched = await patchPart(client, sessionID, messageID, partId, updatedPart)
    if (!patched) return { success: false }
    return { success: true, toolName, originalSize }
  } catch (error) {
    log("[context-window-recovery] truncateToolResultAsync failed", { error: String(error) })
    return { success: false }
  }
}

export async function countTruncatedResultsFromSDK(client: OpencodeClient, sessionID: string): Promise<number> {
  try {
    const response = await client.session.messages({ path: { id: sessionID } })
    const messages = normalizeSDKResponse(response, [] as SDKMessage[], { preferResponseOnMissingData: true })
    let count = 0
    for (const msg of messages) {
      if (!msg.parts) continue
      for (const part of msg.parts) {
        if (part.type === "tool" && part.state?.time?.compacted) count++
      }
    }
    return count
  } catch {
    return 0
  }
}
export async function getTotalToolOutputSizeFromSDK(client: OpencodeClient, sessionID: string): Promise<number> {
  const results = await findToolResultsBySizeFromSDK(client, sessionID)
  return results.reduce((sum, r) => sum + r.outputSize, 0)
}
