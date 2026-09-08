import * as fs from "node:fs";
import * as path from "node:path";
import { type MatrixxConfig, MatrixxConfigSchema } from "./config";
import { resolveTiersInCategoryRegistry, resolveTiersInConfig } from "./config/resolve-tiers";
import {
  addConfigLoadError,
  deepMerge,
  detectConfigFile,
  fetchAvailableModels,
  getOpenCodeConfigDir,
  log,
  migrateConfigFile,
  parseJsonc,
  readConnectedProvidersCache,
} from "./shared";
import { DEFAULT_CATEGORIES } from "./tools/delegate-task/constants";

export function parseConfigPartially(
  rawConfig: Record<string, unknown>
): MatrixxConfig | null {
  const fullResult = MatrixxConfigSchema.safeParse(rawConfig);
  if (fullResult.success) {
    return fullResult.data;
  }

  const partialConfig: Record<string, unknown> = {};
  const invalidSections: string[] = [];

  for (const key of Object.keys(rawConfig)) {
    const sectionResult = MatrixxConfigSchema.safeParse({ [key]: rawConfig[key] });
    if (sectionResult.success) {
      const parsed = sectionResult.data as Record<string, unknown>;
      if (parsed[key] !== undefined) {
        partialConfig[key] = parsed[key];
      }
    } else {
      const sectionErrors = sectionResult.error.issues
        .filter((i) => i.path[0] === key)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(", ");
      if (sectionErrors) {
        invalidSections.push(`${key}: ${sectionErrors}`);
      }
    }
  }

  if (invalidSections.length > 0) {
    log("Partial config loaded — invalid sections skipped:", invalidSections);
  }

  return partialConfig as MatrixxConfig;
}

function loadConfigFromPath(
  configPath: string,
  _ctx: unknown
): MatrixxConfig | null {
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf-8");
      const rawConfig = parseJsonc<Record<string, unknown>>(content);

      migrateConfigFile(configPath, rawConfig);

      const result = MatrixxConfigSchema.safeParse(rawConfig);

      if (result.success) {
        log(`Config loaded from ${configPath}`, { agents: result.data.agents });
        return result.data;
      }

      const errorMsg = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(", ");
      log(`Config validation error in ${configPath}:`, result.error.issues);
      addConfigLoadError({
        path: configPath,
        error: `Partial config loaded — invalid sections skipped: ${errorMsg}`,
      });

      const partialResult = parseConfigPartially(rawConfig);
      if (partialResult) {
        log(`Partial config loaded from ${configPath}`, { agents: partialResult.agents });
        return partialResult;
      }

      return null;
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log(`Error loading config from ${configPath}:`, err);
    addConfigLoadError({ path: configPath, error: errorMsg });
  }
  return null;
}

/**
 * Cached view of the 5 `disabled_*` arrays on a `MatrixxConfig` as Sets.
 * Returned by {@link getDisabledSets} so callers can do O(1) membership
 * checks without re-constructing a Set on every read.
 */
interface DisabledSets {
  disabledAgents: Set<string>
  disabledMcps: Set<string>
  disabledHooks: Set<string>
  disabledCommands: Set<string>
  disabledSkills: Set<string>
}

// Module-level WeakMap cache. WeakMap allows GC to collect cached configs
// when no other references exist, preventing memory leaks. Re-assigned (not
// `const`) so `_resetDisabledSetsCacheForTesting` can swap in a fresh map.
let disabledSetsCache: WeakMap<MatrixxConfig, DisabledSets> = new WeakMap()

/**
 * Returns the cached `DisabledSets` view for `config`, constructing and
 * caching it on first access. Callers MUST treat the returned Sets as
 * read-only — they are shared across all readers of the same config.
 */
export function getDisabledSets(config: MatrixxConfig): DisabledSets {
  const cached = disabledSetsCache.get(config)
  if (cached) return cached

  const fresh: DisabledSets = {
    disabledAgents: new Set(config.disabled_agents ?? []),
    disabledMcps: new Set(config.disabled_mcps ?? []),
    disabledHooks: new Set(config.disabled_hooks ?? []),
    disabledCommands: new Set(config.disabled_commands ?? []),
    disabledSkills: new Set(config.disabled_skills ?? []),
  }
  disabledSetsCache.set(config, fresh)
  return fresh
}

/**
 * Test-only: drop all cached `DisabledSets`. WeakMap has no `clear()`,
 * so we replace the map with a fresh one — the old map is GC'd.
 */
export function _resetDisabledSetsCacheForTesting(): void {
  disabledSetsCache = new WeakMap()
}

export function mergeConfigs(
  base: MatrixxConfig,
  override: MatrixxConfig
): MatrixxConfig {
  // Build the 5 dedup Sets once; reuse them for the merged arrays AND the
  // cache so the first `getDisabledSets(merged)` is a hit (zero extra Sets).
  const disabledAgentsSet = new Set([
    ...(base.disabled_agents ?? []),
    ...(override.disabled_agents ?? []),
  ])
  const disabledMcpsSet = new Set([
    ...(base.disabled_mcps ?? []),
    ...(override.disabled_mcps ?? []),
  ])
  const disabledHooksSet = new Set([
    ...(base.disabled_hooks ?? []),
    ...(override.disabled_hooks ?? []),
  ])
  const disabledCommandsSet = new Set([
    ...(base.disabled_commands ?? []),
    ...(override.disabled_commands ?? []),
  ])
  const disabledSkillsSet = new Set([
    ...(base.disabled_skills ?? []),
    ...(override.disabled_skills ?? []),
  ])

  const merged: MatrixxConfig = {
    ...base,
    ...override,
    agents: deepMerge(base.agents, override.agents),
    categories: deepMerge(base.categories, override.categories),
    disabled_agents: [...disabledAgentsSet],
    disabled_mcps: [...disabledMcpsSet],
    disabled_hooks: [...disabledHooksSet],
    disabled_commands: [...disabledCommandsSet],
    disabled_skills: [...disabledSkillsSet],
  // claude_code merging removed during CC compat removal
  }

  disabledSetsCache.set(merged, {
    disabledAgents: disabledAgentsSet,
    disabledMcps: disabledMcpsSet,
    disabledHooks: disabledHooksSet,
    disabledCommands: disabledCommandsSet,
    disabledSkills: disabledSkillsSet,
  })

  return merged
}

function resolveConfigPath(baseDir: string, configName: string): string {
  const newBase = path.join(baseDir, "matrixx");
  const newDetected = detectConfigFile(newBase);
  if (newDetected.format !== "none") {
    return newDetected.path;
  }

  const legacyBase = path.join(baseDir, configName);
  const legacyDetected = detectConfigFile(legacyBase);
  if (legacyDetected.format !== "none") {
    log(
      `Deprecation: "${path.basename(legacyDetected.path)}" detected. ` +
        `Rename to "matrixx.json" or "matrixx.jsonc".`
    );
    return legacyDetected.path;
  }

  return `${newBase}.json`;
}

export async function loadPluginConfig(
  directory: string,
  ctx: unknown
): Promise<MatrixxConfig> {
  const configDir = getOpenCodeConfigDir({ binary: "opencode" });
  const userConfigPath = resolveConfigPath(configDir, "matrixx");

  const projectDir = path.join(directory, ".opencode");
  const projectConfigPath = resolveConfigPath(projectDir, "matrixx");

  let config: MatrixxConfig =
    loadConfigFromPath(userConfigPath, ctx) ?? {};

  const projectConfig = loadConfigFromPath(projectConfigPath, ctx);
  if (projectConfig) {
    config = mergeConfigs(config, projectConfig);
  }

  // Resolve any `tier: "..."` aliases against the live provider list.
  // Tiers that cannot be resolved (cold cache, no matching provider) are left
  // as `tier` fields — downstream code will fall through to category defaults.
  const connectedProviders = readConnectedProvidersCache()
  const availableModels = await fetchAvailableModels(undefined, { connectedProviders })
  const tierCtx = {
    availableModels: availableModels ?? new Set(),
    connectedProviders,
  }
  config = resolveTiersInConfig(config, tierCtx)

  // Also pre-resolve the built-in DEFAULT_CATEGORIES so that downstream code
  // (createBuiltinAgents, buildAgent, resolveCategoryConfig) only sees
  // concrete `model:` strings. User-provided `categories.*` entries override
  // these resolved defaults at config-merge time.
  const resolvedDefaults = resolveTiersInCategoryRegistry(
    DEFAULT_CATEGORIES as unknown as Record<string, { model?: string; tier?: string }>,
    tierCtx,
  )
  config = {
    ...config,
    categories: { ...resolvedDefaults, ...(config.categories ?? {}) } as MatrixxConfig["categories"],
  }

  log("Final merged config", {
    agents: config.agents,
    disabled_agents: config.disabled_agents,
    disabled_mcps: config.disabled_mcps,
    disabled_hooks: config.disabled_hooks,
    // claude_code removed during CC compat removal
  });
  return config;
}
