import type { PluginInput } from "@opencode-ai/plugin"
import { normalizeSDKResponse } from "../../shared"
import { isSqliteBackend } from "../../shared/opencode-storage-detection"
import type { AggressiveTruncateResult } from "./tool-part-types"
import { findToolResultsBySize, truncateToolResult, truncateToolResultAsync } from "./tool-result-store"

type OpencodeClient = PluginInput["client"]
interface SDKToolPart { id: string; type: string; tool?: string; state?: { output?: string; time?: { start?: number; end?: number; compacted?: number } } }
interface SDKMessage { info?: { id?: string }; parts?: SDKToolPart[] }
function calculateTargetBytesToRemove(currentTokens: number, maxTokens: number, targetRatio: number, charsPerToken: number) {
  const targetTokens = Math.floor(maxTokens * targetRatio)
  const tokensToReduce = currentTokens - targetTokens
  return { tokensToReduce, targetBytesToRemove: tokensToReduce * charsPerToken }
}
async function truncateResultsUntilTarget(results: import("./tool-part-types").ToolResultInfo[], targetBytesToRemove: number, truncateFn: (r: import("./tool-part-types").ToolResultInfo) => Promise<{ success: boolean; toolName?: string; originalSize?: number }>): Promise<{ truncatedCount: number; totalRemoved: number; truncatedTools: Array<{ toolName: string; originalSize: number }> }> {
  let totalRemoved = 0; let truncatedCount = 0; const truncatedTools: Array<{ toolName: string; originalSize: number }> = []
  for (const result of results) { const res = await truncateFn(result); if (res.success) { truncatedCount++; const removed = res.originalSize ?? result.outputSize; totalRemoved += removed; truncatedTools.push({ toolName: res.toolName ?? result.toolName, originalSize: removed }); if (totalRemoved >= targetBytesToRemove) break } }
  return { truncatedCount, totalRemoved, truncatedTools }
}
export async function truncateUntilTargetTokens(sessionID: string, currentTokens: number, maxTokens: number, targetRatio = 0.8, charsPerToken = 4, client?: OpencodeClient): Promise<AggressiveTruncateResult> {
  const { tokensToReduce, targetBytesToRemove } = calculateTargetBytesToRemove(currentTokens, maxTokens, targetRatio, charsPerToken)
  if (tokensToReduce <= 0) return { success: true, sufficient: true, truncatedCount: 0, totalBytesRemoved: 0, targetBytesToRemove: 0, truncatedTools: [] }
  if (client && isSqliteBackend()) {
    let toolPartsByKey = new Map<string, SDKToolPart>()
    try { const response = (await client.session.messages({ path: { id: sessionID } })) as { data?: SDKMessage[] }; const messages = normalizeSDKResponse(response, [] as SDKMessage[], { preferResponseOnMissingData: true }); toolPartsByKey = new Map(); for (const message of messages) { const messageID = message.info?.id; if (!messageID || !message.parts) continue; for (const part of message.parts) { if (part.type !== "tool") continue; toolPartsByKey.set(`${messageID}:${part.id}`, part) } } } catch { toolPartsByKey = new Map() }
    const results: import("./tool-part-types").ToolResultInfo[] = []
    for (const [key, part] of toolPartsByKey) { if (part.type === "tool" && part.state?.output && !part.state?.time?.compacted && part.tool) results.push({ partPath: "", partId: part.id, messageID: key.split(":")[0], toolName: part.tool, outputSize: part.state.output.length }) }
    results.sort((a, b) => b.outputSize - a.outputSize)
    if (results.length === 0) return { success: false, sufficient: false, truncatedCount: 0, totalBytesRemoved: 0, targetBytesToRemove, truncatedTools: [] }
    const { truncatedCount, totalRemoved, truncatedTools } = await truncateResultsUntilTarget(results, targetBytesToRemove, async (result) => { const part = toolPartsByKey.get(`${result.messageID}:${result.partId}`); if (!part) return { success: false }; return truncateToolResultAsync(client, sessionID, result.messageID, result.partId, part) })
    return { success: truncatedCount > 0, sufficient: totalRemoved >= targetBytesToRemove, truncatedCount, totalBytesRemoved: totalRemoved, targetBytesToRemove, truncatedTools }
  }
  const results = findToolResultsBySize(sessionID)
  if (results.length === 0) return { success: false, sufficient: false, truncatedCount: 0, totalBytesRemoved: 0, targetBytesToRemove, truncatedTools: [] }
  const { truncatedCount, totalRemoved, truncatedTools } = await truncateResultsUntilTarget(results, targetBytesToRemove, async (result) => truncateToolResult(result.partPath))
  return { success: truncatedCount > 0, sufficient: totalRemoved >= targetBytesToRemove, truncatedCount, totalBytesRemoved: totalRemoved, targetBytesToRemove, truncatedTools }
}
