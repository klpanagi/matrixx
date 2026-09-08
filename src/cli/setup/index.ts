export { PLATFORM_INSTALL_COMMANDS } from "./constants";
export { checkOptionalDeps, checkRequiredDeps, formatDepReport, getInstallCommand, getPlatform, isBunVersionOk, isOpenCodeVersionOk } from "./deps";
export { runSetupPrompts } from "./prompts";
export type { DepStatus, Platform, SetupState } from "./types";

import { existsSync, readFileSync } from "node:fs";
import * as p from "@clack/prompts";
import type { MatrixxConfig } from "../../config/schema/matrixx-config";
import { readJsoncFile } from "../../shared/jsonc-parser";
import { buildMatrixxConfig, previewDiff, resolveMatrixxConfigPath, writeMatrixxConfig } from "./config-writer";
import { checkOptionalDeps, checkRequiredDeps, formatDepReport } from "./deps";
import { syncOpencodePlugins } from "./opencode-sync";
import { runSetupPrompts } from "./prompts";

export async function executeSetup(opts: { dryRun: boolean; yes: boolean }): Promise<string> {
  const required = checkRequiredDeps();
  const missingRequired = required.filter((d) => !d.found);
  if (missingRequired.length > 0) {
    const report = formatDepReport(required);
    return `✗ Missing required dependencies:\n${report}\n\nInstall them and re-run: bunx opencode-matrixx setup`;
  }

  const optional = checkOptionalDeps();
  const report = [formatDepReport(required), "", "Optional:", formatDepReport(optional)].join("\n");

  const state = await runSetupPrompts(optional, { yes: opts.yes });

  const { path: matrixxPath } = resolveMatrixxConfigPath();
  let existing: MatrixxConfig | null = null;
  try {
    existing = readJsoncFile<MatrixxConfig>(matrixxPath);
  } catch {}
  if (!existing) {
    try {
      const raw = readFileSync(matrixxPath, "utf-8");
      if (raw.trim()) existing = JSON.parse(raw) as MatrixxConfig;
    } catch {}
  }

  const nextConfig = buildMatrixxConfig(state, existing);

  if (existing && !opts.yes && !opts.dryRun && existsSync(matrixxPath)) {
    const existingContent = readFileSync(matrixxPath, "utf-8");
    const nextContent = `${JSON.stringify(nextConfig, null, 2)}\n`;
    p.note(previewDiff(existingContent, nextContent).slice(0, 2000), "Diff preview (existing → new)");
    const ans = await p.confirm({ message: "Update existing matrixx.jsonc? (backup will be created)", initialValue: true });
    if (p.isCancel(ans)) {
      p.cancel("Cancelled");
      process.exit(130);
    }
    if (!ans) {
      await syncOpencodePlugins(state, { dryRun: opts.dryRun });
      return `Skipped matrixx.jsonc update (kept existing at ${matrixxPath})\nRun with --yes to overwrite without prompt.`;
    }
  }

  await writeMatrixxConfig(matrixxPath, nextConfig, { dryRun: opts.dryRun, backup: true });
  await syncOpencodePlugins(state, { dryRun: opts.dryRun });
  const dry = opts.dryRun ? " (DRY RUN — no files written)" : "";
  const lines = [
    "",
    "┌──────────────────────────────────────┐",
    `│  Matrixx Setup Complete${dry.padEnd(12)}│`,
    "└──────────────────────────────────────┘",
    "",
    report,
    "",
    `✓ matrixx.jsonc → ${matrixxPath}${opts.dryRun ? " (preview)" : ""}`,
    `  task_system: ${state.taskSystem}, headroom: ${state.headroom.enabled}, rtk: ${state.rtk.enabled}, dcp: ${state.dcp.enabled}, context-mode: ${state.contextMode}`,
    "",
    "Next steps:",
    "  1. Restart OpenCode to load new config",
    "  2. Verify with: bunx opencode-matrixx doctor",
    state.headroom.enabled ? "  3. Headroom enabled — run: headroom wrap opencode" : "  3. Headroom disabled — enable later via setup or manual headroom.enabled:true",
    state.contextMode ? "  4. context-mode enabled — plugin array updated in opencode.jsonc" : "  4. context-mode disabled — add \"context-mode\" to opencode.jsonc plugin array to enable",
    "",
  ];
  return lines.join("\n");
}
