import { existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import { loadBuiltinCommands } from "../../features/builtin-commands"
import { getOpenCodeConfigDir, parseFrontmatter } from "../../shared"
import { isMarkdownFile } from "../../shared/file-utils"
import { sanitizeModelField } from "../../shared/model-sanitizer"
import type { CommandInfo, CommandMetadata, CommandScope } from "./types"

function discoverCommandsFromDir(commandsDir: string, scope: CommandScope): CommandInfo[] {
  if (!existsSync(commandsDir)) return []

  const entries = readdirSync(commandsDir, { withFileTypes: true })
  const commands: CommandInfo[] = []

  for (const entry of entries) {
    if (!isMarkdownFile(entry)) continue

    const commandPath = join(commandsDir, entry.name)
    const commandName = basename(entry.name, ".md")

    try {
      const content = readFileSync(commandPath, "utf-8")
      const { data, body } = parseFrontmatter<{
        description?: string
        "argument-hint"?: string
        agent?: string
        model?: string
        subtask?: boolean
      }>(content)

      const isOpencodeSource = scope === "opencode" || scope === "opencode-project"
      const metadata: CommandMetadata = {
        name: commandName,
        description: data.description || "",
        argumentHint: data["argument-hint"],
        model: sanitizeModelField(data.model, isOpencodeSource ? "opencode" : "claude-code"),
        agent: data.agent,
        subtask: Boolean(data.subtask),
      }

      commands.push({
        name: commandName,
        path: commandPath,
        metadata,
        content: body,
        scope,
      })
    } catch {
    }
  }

  return commands
}

export function discoverCommandsSync(directory?: string): CommandInfo[] {
  const configDir = getOpenCodeConfigDir({ binary: "opencode" })
  const opencodeGlobalDir = join(configDir, "command")
  const opencodeProjectDir = join(directory ?? process.cwd(), ".opencode", "command")

  const opencodeGlobalCommands = discoverCommandsFromDir(opencodeGlobalDir, "opencode")
  const opencodeProjectCommands = discoverCommandsFromDir(opencodeProjectDir, "opencode-project")

  const builtinCommandsMap = loadBuiltinCommands()
  const builtinCommands: CommandInfo[] = Object.values(builtinCommandsMap).map((command) => ({
    name: command.name,
    metadata: {
      name: command.name,
      description: command.description || "",
      argumentHint: command.argumentHint,
      model: command.model,
      agent: command.agent,
      subtask: command.subtask,
    },
    content: command.template,
    scope: "builtin",
  }))

  return [
    ...builtinCommands,
    ...opencodeProjectCommands,
    ...opencodeGlobalCommands,
  ]
}
