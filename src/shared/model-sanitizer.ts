type CommandSource = "other" | "opencode"

export function sanitizeModelField(model: unknown, source: CommandSource = "other"): string | undefined {
  if (source === "other") {
    return undefined
  }
  
  if (typeof model === "string" && model.trim().length > 0) {
    return model.trim()
  }
  return undefined
}
