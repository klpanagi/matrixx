/// <reference types="bun-types" />
import { beforeEach, describe, expect, test } from "bun:test"
import {
  allowOnce,
  allowSession,
  clearAll,
  clearSession,
  consumeOneShot,
  isSessionAllowed,
} from "./session-allow-cache"

describe("session-allow-cache", () => {
  beforeEach(() => clearAll())

  test("allowOnce then consumeOneShot succeeds once then false", () => {
    //#given
    const sid = "sess-1"
    const hash = "aws-access-key:abc12345"
    allowOnce(sid, hash)
    //#when
    const first = consumeOneShot(sid, hash)
    const second = consumeOneShot(sid, hash)
    //#then
    expect(first).toBe(true)
    expect(second).toBe(false)
  })

  test("consumeOneShot returns false when never allowed", () => {
    //#given
    const sid = "sess-2"
    const hash = "test:deadbeef"
    //#when
    const result = consumeOneShot(sid, hash)
    //#then
    expect(result).toBe(false)
  })

  test("allowSession persists across multiple checks", () => {
    //#given
    const sid = "sess-3"
    const hash = "gcp-api-key:12345678"
    //#when
    allowSession(sid, hash)
    //#then
    expect(isSessionAllowed(sid, hash)).toBe(true)
    expect(isSessionAllowed(sid, hash)).toBe(true)
    expect(consumeOneShot(sid, hash)).toBe(false)
  })

  test("isSessionAllowed false for unknown session or hash", () => {
    //#given
    allowSession("sess-a", "rule:aaaa1111")
    //#when
    const unknownSession = isSessionAllowed("sess-b", "rule:aaaa1111")
    const unknownHash = isSessionAllowed("sess-a", "rule:bbbb2222")
    //#then
    expect(unknownSession).toBe(false)
    expect(unknownHash).toBe(false)
  })

  test("allowSession does not affect other sessions", () => {
    //#given
    const hash = "shared:abcd1234"
    allowSession("sess-x", hash)
    //#when
    const other = isSessionAllowed("sess-y", hash)
    const owner = isSessionAllowed("sess-x", hash)
    //#then
    expect(other).toBe(false)
    expect(owner).toBe(true)
  })

  test("clearSession wipes session and its one-shot entries only", () => {
    //#given
    allowSession("sess-clear", "rule:11111111")
    allowOnce("sess-clear", "rule:22222222")
    allowSession("sess-keep", "rule:33333333")
    allowOnce("sess-keep", "rule:44444444")
    //#when
    clearSession("sess-clear")
    //#then
    expect(isSessionAllowed("sess-clear", "rule:11111111")).toBe(false)
    expect(consumeOneShot("sess-clear", "rule:22222222")).toBe(false)
    expect(isSessionAllowed("sess-keep", "rule:33333333")).toBe(true)
    expect(consumeOneShot("sess-keep", "rule:44444444")).toBe(true)
  })

  test("clearAll wipes all sessions and one-shots", () => {
    //#given
    allowSession("s1", "r:aaaa")
    allowOnce("s1", "r:bbbb")
    allowSession("s2", "r:cccc")
    //#when
    clearAll()
    //#then
    expect(isSessionAllowed("s1", "r:aaaa")).toBe(false)
    expect(isSessionAllowed("s2", "r:cccc")).toBe(false)
    expect(consumeOneShot("s1", "r:bbbb")).toBe(false)
  })

  test("allowOnce for same hash twice still consumes once", () => {
    //#given
    const sid = "sess-dup"
    const hash = "dup:abc12345"
    allowOnce(sid, hash)
    allowOnce(sid, hash)
    //#when
    const first = consumeOneShot(sid, hash)
    const second = consumeOneShot(sid, hash)
    //#then
    expect(first).toBe(true)
    expect(second).toBe(false)
  })

  test("one-shot scoped to session does not leak to other session", () => {
    //#given
    const hash = "leak:test1234"
    allowOnce("sess-owner", hash)
    //#when
    const other = consumeOneShot("sess-other", hash)
    const owner = consumeOneShot("sess-owner", hash)
    //#then
    expect(other).toBe(false)
    expect(owner).toBe(true)
  })
})
