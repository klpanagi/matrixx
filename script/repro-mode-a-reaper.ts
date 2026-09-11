/**
 * Mode A repro — background-agent reaper (stale-task interrupt) killing running tasks.
 *
 * Issue: docs/issues/2026-09-11-background-agent-interruption.md
 * Hypothesis H1: the periodic stale-task reaper in BackgroundManager cancels
 * running background tasks when the parent session reports idle.
 *
 * Usage: bun run script/repro-mode-a-reaper.ts
 *
 * Time simulation: standalone scripts cannot use bun:test fake timers, so time
 * is simulated deterministically by backdating task.startedAt / progress.lastUpdate
 * past the thresholds — the exact equivalent of advancing a mocked clock.
 *
 * Thresholds under test (src/features/background-agent/constants.ts):
 *   DEFAULT_STALE_TIMEOUT_MS            = 180s  (no activity since last progress update)
 *   DEFAULT_MESSAGE_STALENESS_TIMEOUT_MS = 600s (no progress update since start)
 *   MIN_RUNTIME_BEFORE_STALE_MS          = 30s  (grace before staleness applies)
 *
 * Reaper logic (manager.ts checkAndInterruptStaleTasks):
 *   For each running task with startedAt + sessionID:
 *     sessionIsRunning = status !== undefined && status !== "idle"
 *     - no progress:      skip if sessionIsRunning; skip if runtime <= 600s; else CANCEL
 *     - with progress:    skip if sessionIsRunning; skip if runtime < 30s;
 *                         skip if timeSinceLastUpdate <= 180s; else CANCEL
 *   On cancel: task.status = "cancelled", error set, abortSessionQuietly(sessionID) fired.
 */
import { BackgroundManager } from "../src/features/background-agent/manager.ts"
import {
  DEFAULT_STALE_TIMEOUT_MS,
  DEFAULT_MESSAGE_STALENESS_TIMEOUT_MS,
  MIN_RUNTIME_BEFORE_STALE_MS,
} from "../src/features/background-agent/constants.ts"

const MIN = 60_000

interface MockClient {
  session: {
    status: () => Promise<unknown>
    abort: (args: { path: { id: string } }) => Promise<unknown>
    messages: (args: { path: { id: string } }) => Promise<unknown>
    promptAsync: (args: unknown) => Promise<unknown>
    get: (args: unknown) => Promise<unknown>
    create: (args: unknown) => Promise<unknown>
    todo: (args: unknown) => Promise<unknown>
  }
  tui: { showToast: (args: unknown) => Promise<unknown> }
}

function makeMockClient(abortCalls: string[], messagesBySession: Record<string, Array<unknown>> = {}): MockClient {
  return {
    session: {
      status: async () => ({ data: {} }),
      abort: async ({ path }: { path: { id: string } }) => {
        abortCalls.push(path.id)
      },
      messages: async ({ path }: { path: { id: string } }) => ({ data: messagesBySession[path.id] ?? [] }),
      promptAsync: async () => {},
      get: async () => ({ data: {} }),
      create: async () => ({ data: { id: "sub-session" } }),
      todo: async () => ({ data: [] }),
    },
    tui: { showToast: async () => {} },
  }
}

function makeManager(abortCalls: string[], messagesBySession: Record<string, Array<unknown>> = {}) {
  const client = makeMockClient(abortCalls, messagesBySession)
  const manager = new BackgroundManager(
    { client, directory: "/tmp" } as never,
    undefined,
    { enableParentSessionNotifications: false },
  )
  return manager
}

/** Access the private reaper method for direct invocation. */
function reap(manager: BackgroundManager, statuses: Record<string, { type: string }>): Promise<void> {
  const m = manager as unknown as {
    checkAndInterruptStaleTasks(s: Record<string, { type: string }>): Promise<void>
  }
  return m.checkAndInterruptStaleTasks(statuses)
}

async function main() {
  console.log("=== Mode A repro: background-agent reaper (stale-task interrupt) ===")
  console.log(`Thresholds: stale=${DEFAULT_STALE_TIMEOUT_MS / 1000}s, messageStaleness=${DEFAULT_MESSAGE_STALENESS_TIMEOUT_MS / 1000}s, grace=${MIN_RUNTIME_BEFORE_STALE_MS / 1000}s\n`)
  let failed = false
  const assert = (cond: boolean, msg: string) => {
    if (!cond) {
      console.error(`  FAIL: ${msg}`)
      failed = true
    } else {
      console.log(`  PASS: ${msg}`)
    }
  }

  // ── Scenario A: no progress updates, parent idle, runtime > 600s ──────────
  console.log("[A] No-progress task, parent session IDLE, runtime 11min (> 600s)")
  {
    const aborts: string[] = []
    const manager = makeManager(aborts)
    const task = await manager.trackTask({
      taskId: "bg_repro_a",
      sessionID: "ses_sub_a",
      parentSessionID: "ses_parent",
      description: "repro A",
      agent: "mouse",
    })
    task.progress = undefined // simulate: never posted a progress update
    task.startedAt = new Date(Date.now() - 11 * MIN)
    await reap(manager, { ses_sub_a: { type: "idle" } })

    assert(task.status === "cancelled", `task cancelled (got ${task.status})`)
    assert(task.error?.includes("Stale timeout (no activity for 11min since start)") === true, `error message set (got: ${task.error})`)
    assert(aborts.includes("ses_sub_a"), `subagent session aborted (aborts: ${JSON.stringify(aborts)})`)
    manager.shutdown()
  }

  // ── Scenario B: stale progress, parent idle, lastUpdate > 180s ────────────
  console.log("\n[B] Task with progress, parent session IDLE, lastUpdate 4min ago (> 180s)")
  {
    const aborts: string[] = []
    const manager = makeManager(aborts)
    const task = await manager.trackTask({
      taskId: "bg_repro_b",
      sessionID: "ses_sub_b",
      parentSessionID: "ses_parent",
      description: "repro B",
      agent: "mouse",
    })
    task.startedAt = new Date(Date.now() - 5 * MIN)
    task.progress!.lastUpdate = new Date(Date.now() - 4 * MIN)
    await reap(manager, { ses_sub_b: { type: "idle" } })

    assert(task.status === "cancelled", `task cancelled (got ${task.status})`)
    assert(task.error?.includes("Stale timeout (no activity for 4min)") === true, `error message set (got: ${task.error})`)
    assert(aborts.includes("ses_sub_b"), `subagent session aborted (aborts: ${JSON.stringify(aborts)})`)
    manager.shutdown()
  }

  // ── Control 1: parent session RUNNING → reaper must NOT touch the task ────
  console.log("\n[C1] No-progress task, parent session RUNNING (user actively interacting)")
  {
    const aborts: string[] = []
    const manager = makeManager(aborts)
    const task = await manager.trackTask({
      taskId: "bg_repro_c1",
      sessionID: "ses_sub_c1",
      parentSessionID: "ses_parent",
      description: "repro C1",
      agent: "mouse",
    })
    task.progress = undefined
    task.startedAt = new Date(Date.now() - 11 * MIN)
    await reap(manager, { ses_sub_c1: { type: "running" } })

    assert(task.status === "running", `task survives (got ${task.status})`)
    assert(aborts.length === 0, `no session aborted (aborts: ${JSON.stringify(aborts)})`)
    manager.shutdown()
  }

  // ── Control 2: fresh no-progress task within 600s window → survives ───────
  console.log("\n[C2] No-progress task, parent IDLE, runtime 2min (< 600s)")
  {
    const aborts: string[] = []
    const manager = makeManager(aborts)
    const task = await manager.trackTask({
      taskId: "bg_repro_c2",
      sessionID: "ses_sub_c2",
      parentSessionID: "ses_parent",
      description: "repro C2",
      agent: "mouse",
    })
    task.progress = undefined
    task.startedAt = new Date(Date.now() - 2 * MIN)
    await reap(manager, { ses_sub_c2: { type: "idle" } })

    assert(task.status === "running", `task survives (got ${task.status})`)
    assert(aborts.length === 0, `no session aborted (aborts: ${JSON.stringify(aborts)})`)
    manager.shutdown()
  }

  // ── Control 3: grace period — runtime < 30s → survives ────────────────────
  console.log("\n[C3] Task with progress, parent IDLE, runtime 10s (< 30s grace)")
  {
    const aborts: string[] = []
    const manager = makeManager(aborts)
    const task = await manager.trackTask({
      taskId: "bg_repro_c3",
      sessionID: "ses_sub_c3",
      parentSessionID: "ses_parent",
      description: "repro C3",
      agent: "mouse",
    })
    task.startedAt = new Date(Date.now() - 10_000)
    task.progress!.lastUpdate = new Date(Date.now() - 10_000)
    await reap(manager, { ses_sub_c3: { type: "idle" } })

    assert(task.status === "running", `task survives (got ${task.status})`)
    assert(aborts.length === 0, `no session aborted (aborts: ${JSON.stringify(aborts)})`)
    manager.shutdown()
  }

  // ── Scenario D: task past thresholds BUT subagent awaiting user → must survive ──
  // RED: reaper currently kills it (no awaiting-user guard). Fix: skip reap when
  // the subagent session has a pending question (hasPendingQuestionMessage).
  console.log("\n[D] No-progress task past thresholds, parent IDLE, subagent AWAITING USER (pending question)")
  {
    const aborts: string[] = []
    const pendingQuestion = [
      { info: { role: "assistant" }, parts: [{ type: "question", question: {} }] },
    ]
    const manager = makeManager(aborts, { ses_sub_d: pendingQuestion })
    const task = await manager.trackTask({
      taskId: "bg_repro_d",
      sessionID: "ses_sub_d",
      parentSessionID: "ses_parent",
      description: "repro D",
      agent: "mouse",
    })
    task.progress = undefined
    task.startedAt = new Date(Date.now() - 11 * MIN)
    await reap(manager, { ses_sub_d: { type: "idle" } })

    assert(task.status === "running", `task survives while awaiting user (got ${task.status})`)
    assert(aborts.length === 0, `no session aborted (aborts: ${JSON.stringify(aborts)})`)
    manager.shutdown()
  }


  console.log("\n=== RESULT ===")
  if (failed) {
    console.error("MODE A REPRO: reaper CAN kill running tasks under idle-parent conditions")
    process.exit(1)
  }
  console.log("MODE A REPRO: reaper behavior confirmed — see scenario outcomes above")
}

main().catch((e) => {
  console.error("MODE A REPRO ERROR:", e)
  process.exit(1)
})