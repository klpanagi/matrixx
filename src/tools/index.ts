import {
  lsp_diagnostics,
  lsp_find_references,
  lsp_goto_definition,
  lsp_prepare_rename,
  lsp_rename,
  lsp_symbols,
  lspManager,
} from "./lsp"

export { createAstGrepTools } from "./ast-grep"
export { createBddCreateContractTool } from "./bdd-create-contract"
export { createBddParseGherkinTool } from "./bdd-parse-gherkin"
export { createBddPipelineTool } from "./bdd-pipeline"
export { createBddValidateContractTool } from "./bdd-validate-contract"
export { createGlobTools } from "./glob"
export { createGrepTools } from "./grep"
export { createHandoffTools } from "./handoff"
export { interactive_bash, startBackgroundCheck as startTmuxCheck } from "./interactive-bash"
export { createPdfExtractFiguresTool } from "./pdf-extract-figures"
export { createPlanCreateTool } from "./plan/plan-create"
export { createPlanDeleteTool } from "./plan/plan-delete"
export { createPlanListTool } from "./plan/plan-list"
export { createPlanReadTool } from "./plan/plan-read"
export { createPlanUpdateTool } from "./plan/plan-update"
export { createSessionManagerTools } from "./session-manager"
export { sessionExists } from "./session-manager/storage"
export { createSkillTool } from "./skill"
export { createSlashcommandTool, discoverCommandsSync } from "./slashcommand"
export { lspManager }

import type { PluginInput, ToolDefinition } from "@opencode-ai/plugin"
import type { BackgroundManager } from "../features/background-agent"
import {
  type BackgroundCancelClient,
  type BackgroundOutputManager,
  createBackgroundCancel,
  createBackgroundOutput,
} from "./background-task"

type OpencodeClient = PluginInput["client"]

export { createAssemblyTool } from "./assembly"
export { createDcpSwitchProfileTool } from "./dcp-switch-profile"
export { createDelegateAgent } from "./delegate-agent"
export { createDelegateTask } from "./delegate-task"
export { createHashlineEditTool } from "./hashline-edit"
export { createLookAt } from "./look-at"
export {
  createTaskCleanupTool,
  createTaskCreateTool,
  createTaskGetTool,
  createTaskList,
  createTaskUpdateTool,
} from "./task"

export function createBackgroundTools(manager: BackgroundManager, client: OpencodeClient): Record<string, ToolDefinition> {
  const outputManager: BackgroundOutputManager = manager
  const cancelClient: BackgroundCancelClient = client
  return {
    background_output: createBackgroundOutput(outputManager, client),
    background_cancel: createBackgroundCancel(manager, cancelClient),
  }
}

export const builtinTools: Record<string, ToolDefinition> = {
  lsp_goto_definition,
  lsp_find_references,
  lsp_symbols,
  lsp_diagnostics,
  lsp_prepare_rename,
  lsp_rename,
}
