import type { ToolDefinition } from "@opencode-ai/plugin"

import type {
  AvailableCategory,
} from "../agents/dynamic-agent-prompt-builder"
import type { MatrixxConfig } from "../config"
import type { Managers } from "../create-managers"
import { log } from "../shared";
import { filterDisabledTools } from "../shared/disabled-tools";
import { isTaskSystemEnabled } from "../shared/task-system-gating";
import {
  builtinTools,
  createAssemblyTool,
  createAstGrepTools,
  createBackgroundTools,
  createBddCreateContractTool,
  createBddParseGherkinTool,
  createBddPipelineTool,
  createBddValidateContractTool,
  createDcpSwitchProfileTool,
createDelegateAgent,
  createDelegateTask,
  createGlobTools,
  createGrepTools,
  createHandoffTools,
  createHashlineEditTool,
  createLookAt,
  createPdfExtractFiguresTool,
  createSessionManagerTools,
  createSkillTool,
  createSlashcommandTool,
  createTaskCleanupTool,
  createTaskCreateTool,
  createTaskGetTool,
  createTaskList,
  createTaskUpdateTool,
  discoverCommandsSync,
  interactive_bash,
} from "../tools"
import type { SkillContext } from "./skill-context"
import type { PluginContext, ToolsRecord } from "./types"

export type ToolRegistryResult = {
  filteredTools: ToolsRecord
  taskSystemEnabled: boolean
}

export function createToolRegistry(args: {
  ctx: PluginContext
  pluginConfig: MatrixxConfig
  managers: Pick<Managers, "backgroundManager" | "tmuxSessionManager">
  skillContext: SkillContext
  availableCategories: AvailableCategory[]
}): ToolRegistryResult {
  const { ctx, pluginConfig, managers, skillContext, availableCategories } = args

  const backgroundTools = createBackgroundTools(managers.backgroundManager, ctx.client)
  const delegateAgent = createDelegateAgent(ctx, managers.backgroundManager, pluginConfig.disabled_agents ?? [])

  const isMultimodalLookerEnabled = !(pluginConfig.disabled_agents ?? []).some(
    (agent) => agent.toLowerCase() === "construct",
  )
  const lookAt = isMultimodalLookerEnabled ? createLookAt(ctx) : null

  const delegateTask = createDelegateTask({
    manager: managers.backgroundManager,
    client: ctx.client,
    directory: ctx.directory,
    userCategories: pluginConfig.categories,
    globalModel: pluginConfig.global_model,
    mouseModel: pluginConfig.agents?.mouse?.model,
    browserProvider: skillContext.browserProvider,
    disabledSkills: skillContext.disabledSkills,
    availableCategories,
    availableSkills: skillContext.availableSkills,
    modelRequirements: pluginConfig.modelRequirements,
    complexityDowngrades: pluginConfig.complexityDowngrades,
    tiers: pluginConfig.tiers,
    agentOverrides: pluginConfig.agents,
    onSyncSessionCreated: async (event) => {
      log("[index] onSyncSessionCreated callback", {
        sessionID: event.sessionID,
        parentID: event.parentID,
        title: event.title,
      })
      await managers.tmuxSessionManager.onSessionCreated({
        type: "session.created",
        properties: {
          info: {
            id: event.sessionID,
            parentID: event.parentID,
            title: event.title,
          },
        },
      })
    },
  })


  const skillTool = createSkillTool({
    skills: skillContext.builtinSkills,
    disabledSkills: skillContext.disabledSkills,
  })

  const commands = discoverCommandsSync(ctx.directory)
  const slashcommandTool = createSlashcommandTool({
    commands,
    skills: skillContext.builtinSkills,
    client: ctx.client,
  })

  const taskSystemEnabled = isTaskSystemEnabled(pluginConfig)
  const taskToolsRecord: Record<string, ToolDefinition> = taskSystemEnabled
    ? {
        task_create: createTaskCreateTool(pluginConfig, ctx),
        task_get: createTaskGetTool(pluginConfig, ctx),
        task_list: createTaskList(pluginConfig, ctx),
        task_update: createTaskUpdateTool(pluginConfig, ctx),
        task_cleanup: createTaskCleanupTool(pluginConfig, ctx),
      }
    : {}
  const hashlineEnabled = pluginConfig.experimental?.hashline_edit ?? false
  const hashlineToolsRecord: Record<string, ToolDefinition> = hashlineEnabled
    ? { edit: createHashlineEditTool(ctx) }
    : {}

  const assemblyEnabled = pluginConfig.assembly?.enabled !== false
const assemblyTool = assemblyEnabled
  ? createAssemblyTool({
    manager: managers.backgroundManager,
    pluginConfig,
  })
  : null

  const allTools: Record<string, ToolDefinition> = {
    ...builtinTools,
    ...createGrepTools(ctx),
    ...createGlobTools(ctx),
    ...createAstGrepTools(ctx),
    ...createSessionManagerTools(ctx),
...createHandoffTools(ctx),
...createPdfExtractFiguresTool(),
    ...createDcpSwitchProfileTool({ pluginConfig }),
...backgroundTools,
    delegate_agent: delegateAgent,
    ...(lookAt ? { look_at: lookAt } : {}),
    task: delegateTask,
    skill: skillTool,
    slashcommand: slashcommandTool,
    interactive_bash,
    ...taskToolsRecord,
    ...hashlineToolsRecord,
    ...(assemblyTool ? { assembly: assemblyTool } : {}),
    bdd_create_contract: createBddCreateContractTool(),
    bdd_parse_gherkin: createBddParseGherkinTool(),
    bdd_pipeline_run: createBddPipelineTool({ manager: managers.backgroundManager }),
    bdd_validate_contract: createBddValidateContractTool(),
}

  const filteredTools = filterDisabledTools(allTools, pluginConfig.disabled_tools)

  return {
    filteredTools,
    taskSystemEnabled,
  }
}
