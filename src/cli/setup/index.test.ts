import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeSetup } from "./index";

describe("executeSetup --yes --dry-run", () => {
  test("does not write files in dryRun", async () => {
    const dir = mkdtempSync(join(tmpdir(), "setup-dry-"));
    const orig = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = dir;
    const out = await executeSetup({ dryRun: true, yes: true });
    expect(out).toContain("DRY RUN");
    expect(existsSync(join(dir, "opencode", "matrixx.jsonc"))).toBe(false);
    process.env.XDG_CONFIG_HOME = orig;
    rmSync(dir, { recursive: true, force: true });
  });

  test("creates matrixx.jsonc with --yes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "setup-real-"));
    const _orig = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = dir;
    const out = await executeSetup({ dryRun: false, yes: true });
    expect(out).toContain("Setup Complete");
    expect(out).toContain("matrixx");
    const hasFile = existsSync(join(dir, "opencode", "matrixx.jsonc")) || existsSync(join(dir, "opencode", "matrixx.json"));
    expect(hasFile).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test("help path via executeSetup contains systems", async () => {
    const out = await executeSetup({ dryRun: true, yes: true });
    expect(out).toContain("task_system");
    expect(out).toContain("headroom");
  });
});

describe("setup idempotency", () => {
  test("re-run does not duplicate and creates backup", async () => {
    const dir = mkdtempSync(join(tmpdir(), "setup-idem-"));
    const orig = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = dir;
    await executeSetup({ dryRun: false, yes: true });
    await executeSetup({ dryRun: false, yes: true });
    const { readdirSync } = await import("node:fs");
    const files = readdirSync(join(dir, "opencode"));
    const hasBak = files.some((f: string) => f.includes("matrixx") && f.includes(".bak."));
    expect(hasBak).toBe(true);
    process.env.XDG_CONFIG_HOME = orig;
    rmSync(dir, { recursive: true, force: true });
  });
});
