// Provider-agnostic patterns — keyword + regex, not provider-gated.
export const TOKEN_LIMIT_PATTERNS = [
  /(\d+)\s*tokens?\s*>\s*(\d+)\s*maximum/i,
  /prompt.*?(\d+).*?tokens.*?exceeds.*?(\d+)/i,
  /(\d+).*?tokens.*?limit.*?(\d+)/i,
  /context.*?length.*?(\d+).*?maximum.*?(\d+)/i,
  /max.*?context.*?(\d+).*?but.*?(\d+)/i,
]

export const TOKEN_LIMIT_KEYWORDS = [
  "prompt is too long",
  "is too long",
  "context_length_exceeded",
  "max_tokens",
  "token limit",
  "context length",
  "too many tokens",
  "non-empty content",
]

export const THINKING_BLOCK_ERROR_PATTERNS = [
  /thinking.*first block/i,
  /first block.*thinking/i,
  /must.*start.*thinking/i,
  /thinking.*redacted_thinking/i,
  /expected.*thinking.*found/i,
  /thinking.*disabled.*cannot.*contain/i,
]

export const MESSAGE_INDEX_PATTERN = /messages\.(\d+)/

export function extractTokensFromMessage(message: string): { current: number; max: number } | null {
  for (const pattern of TOKEN_LIMIT_PATTERNS) {
    const match = message.match(pattern)
    if (match) {
      const num1 = parseInt(match[1], 10)
      const num2 = parseInt(match[2], 10)
      return num1 > num2 ? { current: num1, max: num2 } : { current: num2, max: num1 }
    }
  }
  return null
}

export function extractMessageIndex(text: string): number | undefined {
  const match = text.match(MESSAGE_INDEX_PATTERN)
  if (match) return parseInt(match[1], 10)
  return undefined
}

export function isThinkingBlockError(text: string): boolean {
  return THINKING_BLOCK_ERROR_PATTERNS.some((pattern) => pattern.test(text))
}

export function isTokenLimitError(text: string): boolean {
  if (isThinkingBlockError(text)) return false
  const lower = text.toLowerCase()
  return TOKEN_LIMIT_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))
}
