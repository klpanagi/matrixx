/// <reference types="bun-types" />
import { beforeEach, describe, expect, test } from "bun:test"
import { createInputSecretGuardHook } from "./hook"
import { clearAll } from "./session-allow-cache"

type ToastCall = { title: string; message: string; variant: string }

function mockCtx(capture?: { toasts: ToastCall[] }) {
  const toasts = capture?.toasts ?? []
  return {
    directory: "/tmp",
    client: {
      tui: {
        showToast: async (arg: { body: { title: string; message: string; variant: string } }) => {
          toasts.push(arg.body)
        },
      },
    },
  } as unknown as import("@opencode-ai/plugin").PluginInput
}

const SYNTHETIC_OPENAI = "sk-proj-abcdefghij12345678901234567890"
const SYNTHETIC_AKIA = "AKIAIOSFODNN7EXAMPLE"
const WARN_TEXT = "api_key= hunter2notarealsecretvalue123"

describe("createInputSecretGuardHook", () => {
  beforeEach(() => clearAll())

  test("throws on blocklist with redacted preview not containing raw secret", async () => {
    //#given
    const capture = { toasts: [] as ToastCall[] }
    const hook = createInputSecretGuardHook(mockCtx(capture), undefined)
    let err: Error | null = null
    //#when
    try {
      await hook["chat.message"](
        { sessionID: "s1" },
        { message: {}, parts: [{ type: "text", text: SYNTHETIC_OPENAI }] },
      )
    } catch (e) {
      err = e as Error
    }
    //#then
    expect(err).not.toBeNull()
    expect(err!.message).toContain("…")
    expect(err!.message).not.toContain(SYNTHETIC_OPENAI)
    expect(err!.message).not.toContain("abcdefghij12345678901234567890")
    expect(capture.toasts.length).toBe(1)
    expect(capture.toasts[0].message).not.toContain(SYNTHETIC_OPENAI)
    expect(capture.toasts[0].message).toContain("…")
  })

  test("toast body is redacted and does not leak raw secret", async () => {
    //#given
    const capture = { toasts: [] as ToastCall[] }
    const hook = createInputSecretGuardHook(mockCtx(capture), undefined)
    //#when
    try {
      await hook["chat.message"](
        { sessionID: "s-toast" },
        { message: {}, parts: [{ type: "text", text: SYNTHETIC_AKIA }] },
      )
    } catch {}
    //#then
    expect(capture.toasts.length).toBe(1)
    expect(capture.toasts[0].message).not.toContain(SYNTHETIC_AKIA)
    expect(capture.toasts[0].message).toContain("…")
    expect(capture.toasts[0].title).toContain("Potential secret")
  })

  test("enabled false does not throw even with secret", async () => {
    //#given
    const hook = createInputSecretGuardHook(mockCtx(), {
      enabled: false,
      mode: "prompt",
      blocklist_mode: "prompt",
      warnlist_mode: "prompt",
    })
    //#when
    const result = hook["chat.message"](
      { sessionID: "s1" },
      { message: {}, parts: [{ type: "text", text: SYNTHETIC_OPENAI }] },
    )
    //#then
    await expect(result).resolves.toBeUndefined()
  })

  test("system directive prefix is not blocked", async () => {
    //#given
    const hook = createInputSecretGuardHook(mockCtx(), undefined)
    //#when
    const result = hook["chat.message"](
      { sessionID: "s1" },
      { message: {}, parts: [{ type: "text", text: `[SYSTEM DIRECTIVE: MATRIXX - TEST] ${SYNTHETIC_OPENAI}` }] },
    )
    //#then
    await expect(result).resolves.toBeUndefined()
  })

  test("allow once flow: first blocked, reply allow once, second identical passes", async () => {
    //#given
    const hook = createInputSecretGuardHook(mockCtx(), undefined)
    const secret = SYNTHETIC_OPENAI
    try {
      await hook["chat.message"]({ sessionID: "s2" }, { message: {}, parts: [{ type: "text", text: secret }] })
    } catch {}
    //#when
    await hook["chat.message"]({ sessionID: "s2" }, { message: {}, parts: [{ type: "text", text: "allow once" }] })
    const second = hook["chat.message"](
      { sessionID: "s2" },
      { message: {}, parts: [{ type: "text", text: secret }] },
    )
    //#then
    await expect(second).resolves.toBeUndefined()
  })

  test("allow once is one-shot: third identical is blocked again", async () => {
    //#given
    const hook = createInputSecretGuardHook(mockCtx(), undefined)
    const secret = SYNTHETIC_AKIA
    try {
      await hook["chat.message"]({ sessionID: "s-oneshot" }, { message: {}, parts: [{ type: "text", text: secret }] })
    } catch {}
    await hook["chat.message"](
      { sessionID: "s-oneshot" },
      { message: {}, parts: [{ type: "text", text: "allow once" }] },
    )
    await hook["chat.message"](
      { sessionID: "s-oneshot" },
      { message: {}, parts: [{ type: "text", text: secret }] },
    )
    let err: Error | null = null
    //#when
    try {
      await hook["chat.message"](
        { sessionID: "s-oneshot" },
        { message: {}, parts: [{ type: "text", text: secret }] },
      )
    } catch (e) {
      err = e as Error
    }
    //#then
    expect(err).not.toBeNull()
    expect(err!.message).not.toContain(secret)
  })

  test("allow session persists for subsequent sends", async () => {
    //#given
    const hook = createInputSecretGuardHook(mockCtx(), undefined)
    const secret = SYNTHETIC_AKIA
    try {
      await hook["chat.message"]({ sessionID: "s-sess" }, { message: {}, parts: [{ type: "text", text: secret }] })
    } catch {}
    //#when
    await hook["chat.message"](
      { sessionID: "s-sess" },
      { message: {}, parts: [{ type: "text", text: "allow session" }] },
    )
    const second = hook["chat.message"](
      { sessionID: "s-sess" },
      { message: {}, parts: [{ type: "text", text: secret }] },
    )
    const third = hook["chat.message"](
      { sessionID: "s-sess" },
      { message: {}, parts: [{ type: "text", text: secret }] },
    )
    //#then
    await expect(second).resolves.toBeUndefined()
    await expect(third).resolves.toBeUndefined()
  })

  test("mode off suppresses warnlist without throw or toast", async () => {
    //#given
    const capture = { toasts: [] as ToastCall[] }
    const hook = createInputSecretGuardHook(mockCtx(capture), {
      enabled: true,
      mode: "off",
      blocklist_mode: "prompt",
      warnlist_mode: "off",
    })
    //#when
    await hook["chat.message"](
      { sessionID: "s3" },
      { message: {}, parts: [{ type: "text", text: WARN_TEXT }] },
    )
    //#then
    expect(capture.toasts.length).toBe(0)
  })

  test("warnlist off via warnlist_mode off suppresses even when mode is prompt", async () => {
    //#given
    const capture = { toasts: [] as ToastCall[] }
    const hook = createInputSecretGuardHook(mockCtx(capture), {
      enabled: true,
      mode: "prompt",
      blocklist_mode: "prompt",
      warnlist_mode: "off",
    })
    //#when
    await hook["chat.message"](
      { sessionID: "s-warn-off" },
      { message: {}, parts: [{ type: "text", text: WARN_TEXT }] },
    )
    //#then
    expect(capture.toasts.length).toBe(0)
  })

  test("benign message does not throw and no toast", async () => {
    //#given
    const capture = { toasts: [] as ToastCall[] }
    const hook = createInputSecretGuardHook(mockCtx(capture), undefined)
    //#when
    await hook["chat.message"](
      { sessionID: "s-benign" },
      { message: {}, parts: [{ type: "text", text: "hello, please help me refactor this function" }] },
    )
    //#then
    expect(capture.toasts.length).toBe(0)
  })

  test("empty parts does not throw", async () => {
    //#given
    const hook = createInputSecretGuardHook(mockCtx(), undefined)
    //#when
    const result = hook["chat.message"]({ sessionID: "s-empty" }, { message: {}, parts: [] })
    //#then
    await expect(result).resolves.toBeUndefined()
  })

  test("no raw secret substring in throw message or toast for PEM", async () => {
    //#given
    const capture = { toasts: [] as ToastCall[] }
    const hook = createInputSecretGuardHook(mockCtx(capture), undefined)
    const pem = "-----BEGIN PRIVATE KEY----- MIIBIjANBgkqhkiG9w0B"
    let err: Error | null = null
    //#when
    try {
      await hook["chat.message"]({ sessionID: "s-pem" }, { message: {}, parts: [{ type: "text", text: pem }] })
    } catch (e) {
      err = e as Error
    }
    //#then
    expect(err).not.toBeNull()
    expect(err!.message).not.toContain("MIIBIjAN")
    expect(capture.toasts[0].message).not.toContain("MIIBIjAN")
    expect(capture.toasts[0].message).toContain("…[REDACTED]")
  })

  test("quoted allow once with quotes is accepted", async () => {
    //#given
    const hook = createInputSecretGuardHook(mockCtx(), undefined)
    try {
      await hook["chat.message"](
        { sessionID: "s-quoted" },
        { message: {}, parts: [{ type: "text", text: SYNTHETIC_AKIA }] },
      )
    } catch {}
    //#when
    await hook["chat.message"](
      { sessionID: "s-quoted" },
      { message: {}, parts: [{ type: "text", text: '"allow once"' }] },
    )
    const result = hook["chat.message"](
      { sessionID: "s-quoted" },
      { message: {}, parts: [{ type: "text", text: SYNTHETIC_AKIA }] },
    )
    //#then
    await expect(result).resolves.toBeUndefined()
  })

  test("blocklist_mode block still prompts and redacts", async () => {
    //#given
    const capture = { toasts: [] as ToastCall[] }
    const hook = createInputSecretGuardHook(mockCtx(capture), {
      enabled: true,
      mode: "prompt",
      blocklist_mode: "block",
      warnlist_mode: "prompt",
    })
    let err: Error | null = null
    //#when
    try {
      await hook["chat.message"](
        { sessionID: "s-block-mode" },
        { message: {}, parts: [{ type: "text", text: SYNTHETIC_AKIA }] },
      )
    } catch (e) {
      err = e as Error
    }
    //#then
    expect(err).not.toBeNull()
    expect(err!.message).not.toContain(SYNTHETIC_AKIA)
    expect(capture.toasts.length).toBe(1)
  })
})
