/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { BLOCKLIST_RULES } from "./detection-rules"
import { detectSecrets, shannonEntropy } from "./detector"

describe("detectSecrets blocklist", () => {
  test("openai sk-proj block", () => {
    //#given
    const text = "key sk-proj-abcdefghij12345678901234567890 here"
    //#when
    const findings = detectSecrets(text)
    //#then
    expect(findings.length).toBe(1)
    expect(findings[0].severity).toBe("block")
    expect(findings[0].redacted).not.toBe(findings[0].match)
    expect(findings[0].redacted).toContain("…")
  })

  test("github ghp", () => {
    //#given
    const text = "token ghp_123456789012345678901234567890123456 here"
    //#when
    const findings = detectSecrets(text)
    //#then
    expect(findings.some((f) => f.ruleId === "github-pat")).toBe(true)
  })

  test("aws AKIA", () => {
    //#given
    const text = "AKIAIOSFODNN7EXAMPLE here"
    //#when
    const findings = detectSecrets(text)
    //#then
    expect(findings.some((f) => f.ruleId === "aws-access-key")).toBe(true)
  })

  test("gcp AIza", () => {
    //#given
    const text = "AIzaSyA12345678901234567890123456789012345"
    //#when
    const findings = detectSecrets(text)
    //#then
    expect(findings.some((f) => f.ruleId === "gcp-api-key")).toBe(true)
  })

  test("slack xoxb", () => {
    //#given
    const slackToken = ["xoxb", "123456789012", "123456789012", "EXAMPLETOKEN12345678901234"].join("-")
    const text = `slack ${slackToken}`
    //#when
    const findings = detectSecrets(text)
    //#then
    expect(findings.some((f) => f.severity === "block")).toBe(true)
  })

  test("npm token", () => {
    //#given
    const text = "npm npm_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCD"
    //#when
    const findings = detectSecrets(text)
    //#then
    expect(findings.some((f) => f.ruleId === "npm-token")).toBe(true)
  })

  test("stripe sk_live", () => {
    //#given
    const stripeKey = "sk_live_" + "EXAMPLE12345678901234567890ABCD"
    const text = `stripe ${stripeKey}`
    //#when
    const findings = detectSecrets(text)
    //#then
    expect(findings.some((f) => f.ruleId === "stripe-live-key")).toBe(true)
  })

  test("PEM private key generic", () => {
    //#given
    const text = "-----BEGIN PRIVATE KEY----- MIIBIjAN"
    //#when
    const findings = detectSecrets(text)
    //#then
    expect(findings[0].severity).toBe("block")
    expect(findings[0].ruleId).toBe("private-key-generic")
  })

  test("JWT Bearer", () => {
    //#given
    const text = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
    //#when
    const findings = detectSecrets(text)
    //#then
    expect(findings.some((f) => f.ruleId === "jwt-bearer")).toBe(true)
  })
})

describe("detectSecrets warnlist", () => {
  test("generic secret assignment warn", () => {
    //#given
    const text = "api_key= hunter2notarealsecretvalue123"
    //#when
    const findings = detectSecrets(text)
    //#then
    expect(findings.some((f) => f.severity === "warn")).toBe(true)
  })

  test("high entropy token warn", () => {
    //#given
    const text = "token aB3dEf7GhIjKlMnOpQrStUvWxYz0123456789+/="
    //#when
    const findings = detectSecrets(text)
    //#then
    expect(findings.some((f) => f.ruleId === "high-entropy-token")).toBe(true)
  })

  test("low entropy not flagged as high-entropy", () => {
    //#given
    const low = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    //#when
    const entropy = shannonEntropy(low)
    //#then
    expect(entropy).toBeLessThan(1)
  })
})

describe("detectSecrets allowlist", () => {
  test("allowlist suppresses matching blocklist", () => {
    //#given
    const text = "sk-test-12345678901234567890"
    //#when
    const findings = detectSecrets(text, { allowlist: ["sk-test-.*"] })
    //#then
    expect(findings.length).toBe(0)
  })

  test("non-matching allowlist still flags", () => {
    //#given
    const text = "AKIAIOSFODNN7EXAMPLE"
    //#when
    const findings = detectSecrets(text, { allowlist: ["sk-test-.*"] })
    //#then
    expect(findings.length).toBe(1)
  })
})

describe("detectSecrets edge", () => {
  test("empty returns []", () => {
    //#given
    const text = ""
    //#when
    const findings = detectSecrets(text)
    //#then
    expect(findings).toEqual([])
  })

  test("short text returns []", () => {
    //#given
    const text = "short"
    //#when
    const findings = detectSecrets(text)
    //#then
    expect(findings).toEqual([])
  })

  test("caps scan at maxScanBytes", () => {
    //#given
    const prefix = "a".repeat(70000)
    const secret = "AKIAIOSFODNN7EXAMPLE"
    const text = prefix + secret
    //#when
    const findings = detectSecrets(text, { maxScanBytes: 65536 })
    //#then
    expect(findings.length).toBe(0)
  })

  test("all blocklist patterns valid RE2", () => {
    //#given
    //#when
    //#then
    for (const rule of BLOCKLIST_RULES) {
      expect(() => new RegExp(rule.pattern)).not.toThrow()
      expect(rule.pattern.includes("(?<=")).toBe(false)
    }
  })

  test("invalid allowlist pattern gracefully ignored", () => {
    //#given
    const text = "AKIAIOSFODNN7EXAMPLE"
    //#when
    const findings = detectSecrets(text, { allowlist: ["[invalid"] })
    //#then
    expect(findings.length).toBe(1)
  })
})

describe("detectSecrets performance", () => {
  test("median <50ms on 32KB", () => {
    //#given
    const big = "x".repeat(32000) + " api_key= hunter2notarealsecretvalue123 "
    //#when
    const times: number[] = []
    for (let i = 0; i < 20; i++) {
      const start = performance.now()
      detectSecrets(big)
      times.push(performance.now() - start)
    }
    times.sort((a, b) => a - b)
    const median = times[Math.floor(times.length / 2)]
    //#then
    expect(median).toBeLessThan(50)
  })
})
