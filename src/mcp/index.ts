import type { MatrixxConfig } from "../config/schema"
import { context7 } from "./context7"
import { document_reader } from "./document-reader"
import { isCommandAvailable, type McpCreationFailure, validateWebsearchConfig } from "./mcp-validator"
import { createWebsearchConfig } from "./websearch"
import { white_rabbit } from "./white-rabbit"

export type { McpCreationFailure } from "./mcp-validator"
export { type McpName, McpNameSchema } from "./types"

type RemoteMcpConfig = {
  type: "remote"
  url: string
  enabled: boolean
  headers?: Record<string, string>
  oauth?: false
}

type LocalMcpConfig = {
  type: "local"
  command: string[]
  enabled: boolean
}

type BuiltinMcpConfig = RemoteMcpConfig | LocalMcpConfig

export interface CreateBuiltinMcpsOptions {
  isCommandAvailable?: (command: string) => boolean
}

export interface CreateBuiltinMcpsResult {
  mcps: Record<string, BuiltinMcpConfig>
  failures: McpCreationFailure[]
}

const DISABLED_REMOTE_STUB: RemoteMcpConfig = {
  type: "remote",
  url: "",
  enabled: false,
  oauth: false,
}

const DISABLED_LOCAL_STUB: LocalMcpConfig = {
  type: "local",
  command: [],
  enabled: false,
}

export function createBuiltinMcps(
  disabledMcps: string[] = [],
  config?: MatrixxConfig,
  options: CreateBuiltinMcpsOptions = {},
): CreateBuiltinMcpsResult {
  const commandAvailable = options.isCommandAvailable ?? isCommandAvailable
  const mcps: Record<string, BuiltinMcpConfig> = {}
  const failures: McpCreationFailure[] = []

  const recordFailure = (name: string, error: string): void => {
    failures.push({ name, error })
  }

  if (!disabledMcps.includes("websearch")) {
    const validation = validateWebsearchConfig(config?.websearch)
    if (!validation.ok) {
      recordFailure("websearch", validation.error)
      mcps.websearch = DISABLED_REMOTE_STUB
    } else {
      let websearchConfig: BuiltinMcpConfig | undefined
      Object.defineProperty(mcps, "websearch", {
        enumerable: true,
        configurable: true,
        get() {
          if (!websearchConfig) {
            try {
              websearchConfig = createWebsearchConfig(config?.websearch)
            } catch (err) {
              recordFailure("websearch", err instanceof Error ? err.message : String(err))
              websearchConfig = DISABLED_REMOTE_STUB
            }
          }
          return websearchConfig
        },
      })
    }
  }

  if (!disabledMcps.includes("context7")) {
    mcps.context7 = context7
  }

  if (!disabledMcps.includes("white_rabbit")) {
    mcps.white_rabbit = white_rabbit
  }

  if (!disabledMcps.includes("document_reader")) {
    if (commandAvailable("uvx")) {
      mcps.document_reader = document_reader
    } else {
      recordFailure(
        "document_reader",
        "uvx (uv package manager) not found in PATH. Install with: curl -LsSf https://astral.sh/uv/install.sh | sh",
      )
      mcps.document_reader = DISABLED_LOCAL_STUB
    }
  }

  return { mcps, failures }
}
