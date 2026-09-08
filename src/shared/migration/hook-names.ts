// Migration map: legacy hook names → current names (for disabled_hooks auto-upgrade)
// Deprecated alias — remove in v2.7 (BREAKING: anthropic- → generic rename)
export const LEGACY_HOOK_NAME_MAP: Record<string, string> = {
  "anthropic-context-window-limit-recovery": "context-window-limit-recovery",
}

// Backwards-compat alias for precedent (HOOK_NAME_MAP used by older migration consumers)
export const HOOK_NAME_MAP: Record<string, string | null> = {
  ...LEGACY_HOOK_NAME_MAP,
}

export function migrateHookNames(
  hooks: string[]
): { migrated: string[]; changed: boolean; removed: string[] } {
  const migrated: string[] = []
  const removed: string[] = []
  let changed = false

  for (const hook of hooks) {
    const mapping = HOOK_NAME_MAP[hook]
    if (mapping === null) {
      removed.push(hook)
      changed = true
      continue
    }
    const newHook = mapping ?? hook
    if (newHook !== hook) {
      changed = true
    }
    migrated.push(newHook)
  }

  return { migrated, changed, removed }
}
