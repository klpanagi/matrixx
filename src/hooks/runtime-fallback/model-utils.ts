import { parseModelString as parseBaseModelString } from "../../tools/delegate-task/model-string-parser"

export function parseModelString(model: string): { providerID: string; modelID: string; variant?: string } | undefined {
  const variantMatch = model.match(/^(.+)\(([^)]+)\)$/)
  if (variantMatch) {
    const base = variantMatch[1]
    const variant = variantMatch[2]
    const parsed = parseBaseModelString(base)
    if (parsed) return { ...parsed, variant }
    return undefined
  }

  const parsed = parseBaseModelString(model)
  if (parsed) return { ...parsed }
  return undefined
}

export function normalizeFallbackModels(models: string | string[] | undefined): string[] | undefined {
  if (!models) return undefined
  if (typeof models === "string") return [models]
  return models
}

export function flattenToFallbackModelStrings(models: string[] | undefined): string[] | undefined {
  return models
}
