import type { PluginInput } from "@opencode-ai/plugin"

export const JSON_ERROR_TOOL_EXCLUDE_LIST = [
  "bash",
  "read",
  "glob",
  "grep",
  "webfetch",
  "look_at",
  "white_rabbit_searchgithub",
  "websearch_web_search_exa",
] as const

export const JSON_ERROR_PATTERNS: readonly RegExp[] = [
  /json parse error/i,
  /failed to parse json/i,
  /invalid json/i,
  /malformed json/i,
  /unexpected end of json input/i,
  /syntaxerror:\s*unexpected token.*json/i,
  /json[^\n]*expected '\}'/i,
  /json[^\n]*unexpected eof/i,
]

const JSON_ERROR_REMINDER_MARKER = "[JSON PARSE ERROR - IMMEDIATE ACTION REQUIRED]"

const JSON_ERROR_EXCLUDED_TOOLS = new Set<string>(JSON_ERROR_TOOL_EXCLUDE_LIST)

export const JSON_ERROR_REMINDER = `
${JSON_ERROR_REMINDER_MARKER}

You sent invalid JSON arguments to a tool. STOP and do this NOW:

1. DO NOT retry with the same malformed JSON
2. CORRECT the JSON syntax — check for: missing quotes, trailing commas, unmatched braces
3. RETRY the tool call with valid JSON arguments

This usually means you garbled a string parameter or forgot to escape a character.
`

export function createJsonErrorRecoveryHook(_ctx: PluginInput) {
  return {
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { title: string; output: string; metadata: unknown },
    ) => {
      if (JSON_ERROR_EXCLUDED_TOOLS.has(input.tool.toLowerCase())) return
      if (typeof output.output !== "string") return
      if (output.output.includes(JSON_ERROR_REMINDER_MARKER)) return

      const hasJsonError = JSON_ERROR_PATTERNS.some((pattern) => pattern.test(output.output))
      if (hasJsonError) {
        output.output += `\n${JSON_ERROR_REMINDER}`
      }
    },
  }
}
