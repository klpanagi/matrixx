/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { hashFinding, redactMatch } from "./redactor"

describe("redactMatch", () => {
  test("keeps 4 prefix and 4 suffix with ellipsis for normal token", () => {
    //#given
    const raw = "AKIAIOSFODNN7EXAMPLE"
    //#when
    const redacted = redactMatch(raw)
    //#then
    expect(redacted).toBe("AKIA…MPLE")
    expect(redacted.startsWith("AKIA")).toBe(true)
    expect(redacted.endsWith("MPLE")).toBe(true)
    expect(redacted).not.toBe(raw)
    expect(redacted).not.toContain("IOSFODNN7EXA")
  })

  test("PEM case redacts body and keeps header with [REDACTED]", () => {
    //#given
    const raw = "-----BEGIN PRIVATE KEY-----\nMIIBIjANBgkqhkiG9w0B"
    //#when
    const redacted = redactMatch(raw)
    //#then
    expect(redacted).toContain("-----BEGIN PRIVATE KEY-----")
    expect(redacted).toContain("…[REDACTED]")
    expect(redacted).not.toContain("MIIBIjAN")
  })

  test("PEM BEGIN RSA PRIVATE KEY redacts body", () => {
    //#given
    const raw = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA7b"
    //#when
    const redacted = redactMatch(raw)
    //#then
    expect(redacted).toBe("-----BEGIN RSA PRIVATE KEY----- …[REDACTED]")
    expect(redacted).not.toContain("MIIEowIB")
  })

  test("short string 8 chars or less is fully redacted", () => {
    //#given
    const raw = "short123"
    //#when
    const redacted = redactMatch(raw)
    //#then
    expect(redacted).toBe("…[REDACTED]")
    expect(redacted).not.toBe(raw)
  })

  test("very short string is fully redacted", () => {
    //#given
    const raw = "ab"
    //#when
    const redacted = redactMatch(raw)
    //#then
    expect(redacted).toBe("…[REDACTED]")
  })

  test("exactly 9 chars uses prefix-suffix form", () => {
    //#given
    const raw = "123456789"
    //#when
    const redacted = redactMatch(raw)
    //#then
    expect(redacted).toBe("1234…6789")
  })

  test("redacted never equals raw for long token", () => {
    //#given
    const raw = "ghp_123456789012345678901234567890123456"
    //#when
    const redacted = redactMatch(raw)
    //#then
    expect(redacted).not.toBe(raw)
    expect(redacted).toContain("…")
  })
})

describe("hashFinding", () => {
  test("is deterministic for same inputs", () => {
    //#given
    const ruleId = "aws-access-key"
    const redacted = "AKIA…MPLE"
    //#when
    const h1 = hashFinding(ruleId, redacted)
    const h2 = hashFinding(ruleId, redacted)
    //#then
    expect(h1).toBe(h2)
  })

  test("different rule produces different hash", () => {
    //#given
    const redacted = "AKIA…MPLE"
    //#when
    const h1 = hashFinding("aws-access-key", redacted)
    const h2 = hashFinding("github-pat", redacted)
    //#then
    expect(h1).not.toBe(h2)
    expect(h1).toContain("aws-access-key:")
    expect(h2).toContain("github-pat:")
  })

  test("different redacted produces different hash", () => {
    //#given
    const ruleId = "aws-access-key"
    //#when
    const h1 = hashFinding(ruleId, "AKIA…MPLE")
    const h2 = hashFinding(ruleId, "AKIA…XXXX")
    //#then
    expect(h1).not.toBe(h2)
  })

  test("hash does not contain raw secret substring", () => {
    //#given
    const raw = "AKIAIOSFODNN7EXAMPLE"
    const redacted = redactMatch(raw)
    //#when
    const h = hashFinding("aws-access-key", redacted)
    //#then
    expect(h).not.toContain(raw)
    expect(h).not.toContain("EXAMPLE")
    expect(h).not.toContain("IOSFODNN")
  })

  test("hash format is ruleId colon 8 hex chars", () => {
    //#given
    const ruleId = "test-rule"
    const redacted = "abcd…wxyz"
    //#when
    const h = hashFinding(ruleId, redacted)
    //#then
    expect(h.startsWith("test-rule:")).toBe(true)
    const hex = h.slice("test-rule:".length)
    expect(hex.length).toBe(8)
    expect(/^[0-9a-f]{8}$/.test(hex)).toBe(true)
  })
})
