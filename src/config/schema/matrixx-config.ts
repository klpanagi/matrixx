import { z } from "zod"
import { AnyMcpNameSchema } from "../../mcp/types"
import { AgentDefinitionsConfigSchema } from "./agent-definitions"
import { BuiltinAgentNameSchema, BuiltinSkillNameSchema } from "./agent-names"
import { AgentOverridesSchema, TierNameSchema } from "./agent-overrides"
import { AssemblyConfigSchema } from "./assembly"
import { BabysittingConfigSchema } from "./babysitting"
import { BackgroundTaskConfigSchema } from "./background-task"
import { BrowserAutomationConfigSchema } from "./browser-automation"
import { CategoriesConfigSchema } from "./categories"
import { BuiltinCommandNameSchema } from "./commands"
import { CommentCheckerConfigSchema } from "./comment-checker"
import { ContextModeConfigSchema } from "./context-mode"
import { DcpConfigSchema } from "./dcp"
import { EvolutionConfigSchema } from "./evolution"
import { ExperimentalConfigSchema } from "./experimental"
import { FailureCounterConfigSchema } from "./failure-counter"
import { HeadroomConfigSchema } from "./headroom"
import { HookNameSchema } from "./hooks"
import { MatrixLoopConfigSchema } from "./matrix-loop"
import { MatrixxSelfConfigSkillConfigSchema } from "./matrixx-self-config"
import { ComplexityDowngradesSchema, ModelRequirementsSchema, TiersSchema } from "./model-config"
import { MorpheusConfigSchema } from "./morpheus"
import { MorpheusAgentConfigSchema } from "./morpheus-agent"
import { NotificationConfigSchema } from "./notification"
import { RtkConfigSchema } from "./rtk"
import { RuntimeFallbackConfigSchema } from "./runtime-fallback"
import { SecurityConfigSchema } from "./security"
import { SkillsConfigSchema } from "./skills"
import { TddEnforcerConfigSchema } from "./tdd-enforcer"
import { TmuxConfigSchema } from "./tmux"
import { WebsearchConfigSchema } from "./websearch"

export const MatrixxConfigSchema = z.object({
  $schema: z.string().optional(),
  /** Global provider/model override for ALL agents and categories (e.g., "<provider>/<model>" from provider.list — replace with your live model).
   * When set, this model is used for every agent and category regardless of their individual config. */
  global_model: z.string().optional(),
  /** Default tier applied to every agent and category that has no explicit `model` or `tier`. */
  default_tier: TierNameSchema.optional(),
  /** Enable new task system (default: false) */
  new_task_system_enabled: z.boolean().optional(),
  /** Default agent name for `matrixx run` (env: OPENCODE_DEFAULT_AGENT) */
  default_run_agent: z.string().optional(),
  disabled_mcps: z.array(AnyMcpNameSchema).optional(),
  disabled_agents: z.array(BuiltinAgentNameSchema).optional(),
  disabled_skills: z.array(BuiltinSkillNameSchema).optional(),
  disabled_hooks: z.array(HookNameSchema).optional(),
  disabled_commands: z.array(BuiltinCommandNameSchema).optional(),
  /** Disable specific tools by name (e.g., ["todowrite", "todoread"]) */
  disabled_tools: z.array(z.string()).optional(),
  agents: AgentOverridesSchema.optional(),
  categories: CategoriesConfigSchema.optional(),
  morpheus_agent: MorpheusAgentConfigSchema.optional(),
  comment_checker: CommentCheckerConfigSchema.optional(),
  experimental: ExperimentalConfigSchema.optional(),
  /** Dynamic Context Pruning (DCP) profile switcher configuration */
  dcp: DcpConfigSchema.optional(),
  auto_update: z.boolean().optional(),
  skills: SkillsConfigSchema.optional(),
  matrix_loop: MatrixLoopConfigSchema.optional(),
  failure_counter: FailureCounterConfigSchema.optional(),
  background_task: BackgroundTaskConfigSchema.optional(),
  notification: NotificationConfigSchema.optional(),
  babysitting: BabysittingConfigSchema.optional(),

  tdd_enforcer: TddEnforcerConfigSchema.optional(),
  browser_automation_engine: BrowserAutomationConfigSchema.optional(),
  websearch: WebsearchConfigSchema.optional(),
  tmux: TmuxConfigSchema.optional(),
  morpheus: MorpheusConfigSchema.optional(),
  /** Assembly tool configuration — provider models for multi-model voting */
  assembly: AssemblyConfigSchema.optional(),
  /** Security scanning, secret detection, and sensitive file guards */
  security: SecurityConfigSchema.optional(),
  runtime_fallback: RuntimeFallbackConfigSchema.optional(),
  /** Paths to external agent definition files */
  agent_definitions: AgentDefinitionsConfigSchema.optional(),
  /** Enable matrixx-self-config skill (default: false - opt-in feature) */
  matrixx_self_config: MatrixxSelfConfigSkillConfigSchema.optional(),
  /** Headroom network-proxy compression configuration (default: disabled) */
  headroom: HeadroomConfigSchema.optional(),
  /** context-mode tool sandbox discipline (L2) — FTS5 ctx_* gating */
  context_mode: ContextModeConfigSchema.optional(),
  /** RTK bash command rewriter configuration (default: disabled) */
  rtk: RtkConfigSchema.optional(),
  /** Self-evolution loop configuration (default: disabled) */
  /** Self-evolution loop configuration (default: disabled) */
  evolution: EvolutionConfigSchema.optional(),
  /** Migration history to prevent re-applying migrations (e.g., model version upgrades) */
  _migrations: z.array(z.string()).optional(),
  /** Config-driven tier definitions — keys are tier names, values are TierSpec */
  tiers: TiersSchema.optional(),
  /** Config-driven agent/category model requirements */
  modelRequirements: ModelRequirementsSchema.optional(),
  /** Config-driven complexity downgrade targets per category */
  complexityDowngrades: ComplexityDowngradesSchema.optional(),
})

export type MatrixxConfig = z.infer<typeof MatrixxConfigSchema>
