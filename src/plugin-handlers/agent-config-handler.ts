import { createBuiltinAgents } from "../agents";
import {
  buildCompactContextDisciplineSection,
  buildExploreDisciplineSection,
  buildHeadroomSection,
} from "../agents/dynamic-agent-prompt-builder";
import { createMouseAgentWithOverrides } from "../agents/mouse";
import type { MatrixxConfig } from "../config";
import { log, migrateAgentConfig } from "../shared";
import { isTaskSystemEnabled } from "../shared/task-system-gating";
import { reorderAgentsByPriority } from "./agent-priority-order";
import { buildOracleAgentConfig } from "./oracle-agent-config-builder";
import { buildPlanDemoteConfig } from "./plan-model-inheritance";
import type { PluginComponents } from "./plugin-components-loader";

// Module-level tool names cache, set once at startup by index.ts
let _availableToolNames: string[] = []
export function setAvailableToolNames(names: string[]) {
  _availableToolNames = names
}
export function getAvailableToolNames(): string[] {
  return _availableToolNames
}

export function injectContextDiscipline(
  availableToolNames: string[],
  agents: Record<string, Record<string, unknown>>,
): void {
  const hasContextMode = availableToolNames.some((n) => n.startsWith("ctx_"));
  const hasHeadroom = availableToolNames.some((n) => n.startsWith("headroom_"));
  if (!(hasContextMode || hasHeadroom)) return;
  const exploreAgents = new Set(["trinity", "operator", "seraph", "smith", "merovingian", "construct", "bdd-contract"]);
  for (const [name, cfg] of Object.entries(agents)) {
    if (name === "morpheus" || name === "keymaker") continue;
    if (!cfg || typeof cfg.prompt !== "string") continue;
    if (cfg.prompt.includes("Context Discipline")) continue;
    const normalized = name.toLowerCase();
    let discipline = "";
    if (exploreAgents.has(normalized) || normalized === "oracle") {
      discipline = buildExploreDisciplineSection(hasContextMode, hasHeadroom);
    } else {
      const compact = buildCompactContextDisciplineSection(hasContextMode);
      const headroom = buildHeadroomSection(hasHeadroom);
      discipline = [compact, headroom].filter(Boolean).join("\n\n");
    }
    if (discipline) {
      (cfg as { prompt: string }).prompt = `${cfg.prompt}\n\n${discipline}`;
    }
  }
}

type AgentConfigRecord = Record<string, Record<string, unknown> | undefined> & {
  build?: Record<string, unknown>;
  plan?: Record<string, unknown>;
};

function hasConfiguredDefaultAgent(config: Record<string, unknown>): boolean {
  const defaultAgent = config.default_agent;
  return typeof defaultAgent === "string" && defaultAgent.trim().length > 0;
}

export async function applyAgentConfig(params: {
  config: Record<string, unknown>;
  pluginConfig: MatrixxConfig;
  ctx: { directory: string; client?: unknown };
  pluginComponents: PluginComponents;
}): Promise<Record<string, unknown>> {
  const migratedDisabledAgents = params.pluginConfig.disabled_agents;

  const allDiscoveredSkills: never[] = [];

  const browserProvider =
    params.pluginConfig.browser_automation_engine?.provider ?? "playwright";
  const currentModel = params.config.model as string | undefined;
  const disabledSkills = new Set<string>(params.pluginConfig.disabled_skills ?? []);
  if (!params.pluginConfig.tdd_enforcer?.enabled) {
    disabledSkills.add("tdd-enforcer");
  }
  const useTaskSystem = isTaskSystemEnabled(params.pluginConfig);
  const availableToolNames = getAvailableToolNames()

  const builtinAgents = await createBuiltinAgents(
    migratedDisabledAgents,
    params.pluginConfig.agents,
    params.ctx.directory,
    undefined,
    params.pluginConfig.categories,
    allDiscoveredSkills,
    params.ctx.client,
    browserProvider,
    currentModel,
    disabledSkills,
    useTaskSystem,
    params.pluginConfig.global_model,
    availableToolNames,
  );

  const rawPluginAgents = params.pluginComponents.agents;
  const pluginAgents = Object.fromEntries(
    Object.entries(rawPluginAgents).map(([key, value]) => [
      key,
      value ? migrateAgentConfig(value as Record<string, unknown>) : value,
    ]),
  );

  const isMorpheusEnabled = params.pluginConfig.morpheus_agent?.disabled !== true;
  const builderEnabled =
    params.pluginConfig.morpheus_agent?.default_builder_enabled ?? false;
  const plannerEnabled = params.pluginConfig.morpheus_agent?.planner_enabled ?? true;
  const replacePlan = params.pluginConfig.morpheus_agent?.replace_plan ?? true;
  const shouldDemotePlan = plannerEnabled && replacePlan;

  const configAgent = params.config.agent as AgentConfigRecord | undefined;

  if (isMorpheusEnabled && builtinAgents.morpheus) {
    if (!hasConfiguredDefaultAgent(params.config)) {
      (params.config as { default_agent?: string }).default_agent = "morpheus";
    }

    const agentConfig: Record<string, unknown> = {
      morpheus: builtinAgents.morpheus,
    };

    agentConfig.mouse = createMouseAgentWithOverrides(
      params.pluginConfig.agents?.mouse,
      undefined,
      useTaskSystem,
    );

    if (builderEnabled) {
      const { name: _buildName, ...buildConfigWithoutName } =
        configAgent?.build ?? {};
      const migratedBuildConfig = migrateAgentConfig(
        buildConfigWithoutName as Record<string, unknown>,
      );
      const override = params.pluginConfig.agents?.["OpenCode-Builder"];
      const base = {
        ...migratedBuildConfig,
        description: `${(configAgent?.build?.description as string) ?? "Build agent"} (OpenCode default)`,
      };
      agentConfig["OpenCode-Builder"] = override ? { ...base, ...override } : base;
    }

    if (plannerEnabled) {
      const oracleOverride = params.pluginConfig.agents?.oracle as
        | (Record<string, unknown> & { prompt_append?: string })
        | undefined;

      agentConfig.oracle = await buildOracleAgentConfig({
        configAgentPlan: configAgent?.plan,
        pluginOracleOverride: oracleOverride,
        userCategories: params.pluginConfig.categories,
        currentModel,
        globalOverrideModel: params.pluginConfig.global_model,
        modelRequirements: params.pluginConfig.modelRequirements,
      });
    }

    const filteredConfigAgents = configAgent
      ? Object.fromEntries(
          Object.entries(configAgent)
            .filter(([key]) => {
              if (key === "build") return false;
              if (key === "plan" && shouldDemotePlan) return false;
              if (key in builtinAgents) return false;
              return true;
            })
            .map(([key, value]) => [
              key,
              value ? migrateAgentConfig(value as Record<string, unknown>) : value,
            ]),
        )
      : {};

    const migratedBuild = configAgent?.build
      ? migrateAgentConfig(configAgent.build as Record<string, unknown>)
      : {};

    const planDemoteConfig = shouldDemotePlan
      ? buildPlanDemoteConfig(
          agentConfig.oracle as Record<string, unknown> | undefined,
          params.pluginConfig.agents?.plan as Record<string, unknown> | undefined,
        )
      : undefined;

    params.config.agent = {
      ...agentConfig,
      ...Object.fromEntries(
        Object.entries(builtinAgents).filter(([key]) => key !== "morpheus"),
      ),
      ...pluginAgents,
      ...filteredConfigAgents,
      build: { ...migratedBuild, mode: "subagent", hidden: true },
      ...(planDemoteConfig ? { plan: planDemoteConfig } : {}),
    };
  } else {
    params.config.agent = {
      ...builtinAgents,
      ...pluginAgents,
      ...configAgent,
    };
  }

  if (params.config.agent) {
    params.config.agent = reorderAgentsByPriority(
      params.config.agent as Record<string, unknown>,
    );
  }

  if (params.config.agent) {
    injectContextDiscipline(availableToolNames, params.config.agent as Record<string, Record<string, unknown>>);
  }

  const agentResult = params.config.agent as Record<string, unknown>;
  log("[config-handler] agents loaded", { agentKeys: Object.keys(agentResult) });
  return agentResult;
}
