import { existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import type { createOpencodeClient } from "@opencode-ai/sdk"
import { loadBuiltinCommands } from "../../features/builtin-commands"
import type { BuiltinSkill } from "../../features/builtin-skills"
import type { CommandFrontmatter } from "../../features/command-loader/types"
import {
  getOpenCodeConfigDir,
  log,
  parseFrontmatter,
  resolveCommandsInText,
  resolveFileReferencesInText,
} from "../../shared"
import { isMarkdownFile } from "../../shared/file-utils"
import { sanitizeModelField } from "../../shared/model-sanitizer"
import type { ParsedSlashCommand } from "./types"

interface CommandScope {
  type: "user" | "project" | "opencode" | "opencode-project" | "skill" | "builtin" | "plugin"
}

interface CommandMetadata {
  name: string
  description: string
  argumentHint?: string
  model?: string
  agent?: string
  subtask?: boolean
}

interface CommandInfo {
  name: string
  path?: string
  metadata: CommandMetadata
  content?: string
  scope: CommandScope["type"]
}

function discoverCommandsFromDir(commandsDir: string, scope: CommandScope["type"]): CommandInfo[] {
  if (!existsSync(commandsDir)) {
    return []
  }

  const entries = readdirSync(commandsDir, { withFileTypes: true })
  const commands: CommandInfo[] = []

  for (const entry of entries) {
    if (!isMarkdownFile(entry)) continue

    const commandPath = join(commandsDir, entry.name)
    const commandName = basename(entry.name, ".md")

    try {
      const content = readFileSync(commandPath, "utf-8")
      const { data, body } = parseFrontmatter<CommandFrontmatter>(content)

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

function skillToCommandInfo(skill: BuiltinSkill): CommandInfo {
  return {
    name: skill.name,
    path: undefined,
    metadata: {
      name: skill.name,
      description: skill.description || "",
      argumentHint: skill.argumentHint,
      model: skill.model,
      agent: skill.agent,
      subtask: skill.subtask,
    },
    content: skill.template,
    scope: "skill",
  }
}

export interface ExecutorOptions {
  skills?: BuiltinSkill[]
  /** OpenCode SDK client for discovering plugin-registered commands */
  client?: ReturnType<typeof createOpencodeClient>
}

async function discoverPluginCommands(client?: ReturnType<typeof createOpencodeClient>): Promise<CommandInfo[]> {
  if (!client) return []

  try {
    const result = await client.command.list()
    const commands = result.data ?? []
    return commands.map(cmd => ({
      name: cmd.name,
      metadata: {
        name: cmd.name,
        description: cmd.description || "",
        model: typeof cmd.model === "string" ? cmd.model : undefined,
        agent: cmd.agent,
        subtask: cmd.subtask,
      },
      content: typeof cmd.template === "string" ? cmd.template : undefined,
      scope: "plugin" as const,
    }))
  } catch (err) {
    log(`[auto-slash-command] Failed to discover plugin commands:`, err)
    return []
  }
}

async function discoverAllCommands(options?: ExecutorOptions): Promise<CommandInfo[]> {
  const configDir = getOpenCodeConfigDir({ binary: "opencode" })
  const opencodeGlobalDir = join(configDir, "command")
  const opencodeProjectDir = join(process.cwd(), ".opencode", "command")

  const opencodeGlobalCommands = discoverCommandsFromDir(opencodeGlobalDir, "opencode")
  const opencodeProjectCommands = discoverCommandsFromDir(opencodeProjectDir, "opencode-project")
  const builtinCommandsMap = loadBuiltinCommands()
  const builtinCommands: CommandInfo[] = Object.values(builtinCommandsMap).map(cmd => ({
    name: cmd.name,
    metadata: {
      name: cmd.name,
      description: cmd.description || "",
      model: cmd.model,
      agent: cmd.agent,
      subtask: cmd.subtask,
    },
    content: cmd.template,
    scope: "builtin",
  }))

  const skills = options?.skills ?? []
  const skillCommands = skills.map(skillToCommandInfo)

  const pluginCommands = await discoverPluginCommands(options?.client)

  return [
    ...builtinCommands,
    ...opencodeProjectCommands,
    ...opencodeGlobalCommands,
    ...skillCommands,
    ...pluginCommands,
  ]
}

async function findCommand(commandName: string, options?: ExecutorOptions): Promise<CommandInfo | null> {
  const allCommands = await discoverAllCommands(options)
  return allCommands.find(
    (cmd) => cmd.name.toLowerCase() === commandName.toLowerCase()
  ) ?? null
}

async function formatCommandTemplate(cmd: CommandInfo, args: string): Promise<string> {
  const sections: string[] = []

  sections.push(`# /${cmd.name} Command\n`)

  if (cmd.metadata.description) {
    sections.push(`**Description**: ${cmd.metadata.description}\n`)
  }

  if (args) {
    sections.push(`**User Arguments**: ${args}\n`)
  }

  if (cmd.metadata.model) {
    sections.push(`**Model**: ${cmd.metadata.model}\n`)
  }

  if (cmd.metadata.agent) {
    sections.push(`**Agent**: ${cmd.metadata.agent}\n`)
  }

  sections.push(`**Scope**: ${cmd.scope}\n`)
  sections.push("---\n")
  sections.push("## Command Instructions\n")

  const content = cmd.content || ""

  const commandDir = cmd.path ? dirname(cmd.path) : process.cwd()
  const withFileRefs = await resolveFileReferencesInText(content, commandDir)
  const resolvedContent = await resolveCommandsInText(withFileRefs)
  sections.push(resolvedContent.trim())

  if (args) {
    sections.push("\n\n---\n")
    sections.push("## User Request\n")
    sections.push(args)
  }

  return sections.join("\n")
}

interface ExecuteResult {
  success: boolean
  replacementText?: string
  error?: string
}

export async function executeSlashCommand(parsed: ParsedSlashCommand, options?: ExecutorOptions): Promise<ExecuteResult> {
  const command = await findCommand(parsed.command, options)

  if (!command) {
    return {
      success: false,
      error: `Command "/${parsed.command}" not found in Matrixx command registry. The command may be registered by another plugin — try using it directly or check available commands with the slashcommand tool.`
    }
  }

  try {
    const template = await formatCommandTemplate(command, parsed.args)
    return {
      success: true,
      replacementText: template,
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to load command "/${parsed.command}": ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
