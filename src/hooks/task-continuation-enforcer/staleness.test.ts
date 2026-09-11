import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  DEFAULT_STALE_AFTER_HOURS,
  formatTaskAge,
  getStaleAfterMs,
  getTaskAgeMs,
  isTaskStale,
} from "./staleness"

const HOUR_MS = 60 * 60 * 1000

describe("staleness helpers", () => {
  test("getStaleAfterMs defaults to 24h", () => {
    //#given
    //#when
    const ms = getStaleAfterMs()
    //#then
    expect(ms).toBe(DEFAULT_STALE_AFTER_HOURS * HOUR_MS)
  })

  test("getStaleAfterMs reads morpheus.tasks.stale_after_hours", () => {
    //#given
    const config = { morpheus: { tasks: { stale_after_hours: 4 } } }
    //#when
    const ms = getStaleAfterMs(config)
    //#then
    expect(ms).toBe(4 * HOUR_MS)
  })

  test("getTaskAgeMs returns null for missing file", () => {
    //#given
    const dir = mkdtempSync(join(tmpdir(), "stale-"))
    //#when
    const age = getTaskAgeMs(join(dir, "T-missing.json"))
    //#then
    expect(age).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })

  test("isTaskStale true when file older than threshold", () => {
    //#given
    const dir = mkdtempSync(join(tmpdir(), "stale-"))
    const file = join(dir, "T-old.json")
    writeFileSync(file, "{}")
    const old = new Date(Date.now() - 3 * HOUR_MS)
    utimesSync(file, old, old)
    //#when
    const stale = isTaskStale(file, 2 * HOUR_MS)
    //#then
    expect(stale).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  test("isTaskStale false when file newer than threshold", () => {
    //#given
    const dir = mkdtempSync(join(tmpdir(), "stale-"))
    const file = join(dir, "T-fresh.json")
    writeFileSync(file, "{}")
    //#when
    const stale = isTaskStale(file, 2 * HOUR_MS)
    //#then
    expect(stale).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  test("formatTaskAge renders hours and days", () => {
    //#given
    //#when
    //#then
    expect(formatTaskAge(2 * HOUR_MS)).toBe("2h")
    expect(formatTaskAge(50 * HOUR_MS)).toBe("2d")
  })
})