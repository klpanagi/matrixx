import { basename, isAbsolute, join, relative, resolve } from "node:path"
import { isAllowedFile } from "../../hooks/oracle-md-only/path-policy"
import type { RawHashlineEdit } from "../hashline-edit/normalize-edits"
import { PLAN_FILENAME_KEBAB_REGEX, PLANS_DIR } from "./constants"

export function resolveDirectory(contextDirectory: unknown, ctxDirectory: unknown): string {
  if (typeof contextDirectory === "string" && contextDirectory.trim() !== "") return contextDirectory
  if (typeof ctxDirectory === "string" && ctxDirectory.trim() !== "") return ctxDirectory
  return process.cwd()
}

export function validatePlanFilePath(filePath: string, directory: string): { resolved: string } | { error: string } {
  if (typeof filePath !== "string" || filePath.trim() === "") {
    return { error: "filePath is required and must be a non-empty string" }
  }
  const base = basename(filePath)
  if (!base.endsWith(".md")) {
    return { error: `filePath must end with .md: ${filePath}` }
  }
  if (!PLAN_FILENAME_KEBAB_REGEX.test(base)) {
    return { error: `fileName must match kebab-case ^[a-z0-9-]+\\.md$: ${base}` }
  }
  const resolved = isAbsolute(filePath) ? resolve(filePath) : resolve(join(directory, filePath))
  const plansDir = resolve(join(directory, PLANS_DIR))
  const relToPlans = relative(plansDir, resolved)
  if (relToPlans.startsWith("..") || isAbsolute(relToPlans)) {
    return { error: `filePath must be inside ${PLANS_DIR}: ${filePath}` }
  }
  if (relToPlans.includes("/") || relToPlans.includes("\\")) {
    return { error: `filePath must be directly inside ${PLANS_DIR} (no subdirectories): ${filePath}` }
  }
  if (!isAllowedFile(resolved, directory)) {
    return { error: `filePath not allowed (must be inside .matrixx/*.md): ${filePath}` }
  }
  return { resolved }
}


export interface PlanCreateArgs {
  filePath: string
  content: string
}

export interface PlanReadArgs {
  filePath: string
}

export interface PlanUpdateArgs {
  filePath: string
  edits: RawHashlineEdit[]
}

export interface PlanDeleteArgs {
  filePath: string
}

export interface PlanInfo {
  fileName: string
  filePath: string
  mtime: string
  mtimeMs: number
  size: number
}
