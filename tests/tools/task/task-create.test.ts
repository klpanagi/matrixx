import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createTaskCreateTool } from "../../../src/tools/task/task-create"

const TEST_STORAGE = ".test-task-create-tool"
const TEST_SESSION_ID = "test-session-123"
const TEST_ABORT_CONTROLLER = new AbortController()
const TEST_CONTEXT = {
  sessionID: TEST_SESSION_ID,
  messageID: "test-message-123",
  agent: "test-agent",
  abort: TEST_ABORT_CONTROLLER.signal,
}

describe("task_create tool", () => {
  let tool: ReturnType<typeof createTaskCreateTool>
  let testDir: string
  let testConfig: { morpheus: { tasks: { storage_path: string } } }

  beforeEach(() => {
    // Create unique temp directory for each test to avoid batch conflicts
    testDir = join(tmpdir(), `task-create-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const storagePath = join(testDir, TEST_STORAGE)
    mkdirSync(storagePath, { recursive: true })
    testConfig = {
      morpheus: {
        tasks: {
          storage_path: storagePath,
        },
      },
    }
    tool = createTaskCreateTool(testConfig)
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe("create action", () => {
    test("creates task with required subject field", async () => {
      //#given
      const args = {
        subject: "Implement authentication",
      }

      //#when
      const resultStr = await tool.execute(args, TEST_CONTEXT)
      const result = JSON.parse(resultStr)

      //#then
      expect(result).toHaveProperty("task")
      expect(result.task).toHaveProperty("id")
      expect(result.task.subject).toBe("Implement authentication")
    })

    test("auto-generates T-{uuid} format ID", async () => {
      //#given
      const args = {
        subject: "Test task",
      }

      //#when
      const resultStr = await tool.execute(args, TEST_CONTEXT)
      const result = JSON.parse(resultStr)

      //#then
      expect(result.task.id).toMatch(/^T-[a-f0-9-]+$/)
    })

    test("auto-records threadID from session context", async () => {
      //#given
      const args = {
        subject: "Test task",
      }

      //#when
      const resultStr = await tool.execute(args, TEST_CONTEXT)
      const result = JSON.parse(resultStr)
      const taskId = result.task.id

      //#then
      const taskFile = join(testDir, TEST_STORAGE, `${taskId}.json`)
      expect(existsSync(taskFile)).toBe(true)
      const taskContent = JSON.parse(await Bun.file(taskFile).text())
      expect(taskContent.threadID).toBe(TEST_SESSION_ID)
    })

    test("sets default status to pending", async () => {
      //#given
      const args = {
        subject: "Test task",
      }

      //#when
      const resultStr = await tool.execute(args, TEST_CONTEXT)
      const result = JSON.parse(resultStr)
      const taskId = result.task.id

      //#then
      const taskFile = join(testDir, TEST_STORAGE, `${taskId}.json`)
      const taskContent = JSON.parse(await Bun.file(taskFile).text())
      expect(taskContent.status).toBe("pending")
    })

    test("sets default blocks and blockedBy to empty arrays", async () => {
      //#given
      const args = {
        subject: "Test task",
      }

      //#when
      const resultStr = await tool.execute(args, TEST_CONTEXT)
      const result = JSON.parse(resultStr)
      const taskId = result.task.id

      //#then
      const taskFile = join(testDir, TEST_STORAGE, `${taskId}.json`)
      const taskContent = JSON.parse(await Bun.file(taskFile).text())
      expect(taskContent.blocks).toEqual([])
      expect(taskContent.blockedBy).toEqual([])
    })

    test("accepts optional description", async () => {
      //#given
      const args = {
        subject: "Test task",
        description: "This is a test description",
      }

      //#when
      const resultStr = await tool.execute(args, TEST_CONTEXT)
      const result = JSON.parse(resultStr)
      const taskId = result.task.id

      //#then
      const taskFile = join(testDir, TEST_STORAGE, `${taskId}.json`)
      const taskContent = JSON.parse(await Bun.file(taskFile).text())
      expect(taskContent.description).toBe("This is a test description")
    })

    test("accepts optional activeForm", async () => {
      //#given
      const args = {
        subject: "Test task",
        activeForm: "Implementing authentication",
      }

      //#when
      const resultStr = await tool.execute(args, TEST_CONTEXT)
      const result = JSON.parse(resultStr)
      const taskId = result.task.id

      //#then
      const taskFile = join(testDir, TEST_STORAGE, `${taskId}.json`)
      const taskContent = JSON.parse(await Bun.file(taskFile).text())
      expect(taskContent.activeForm).toBe("Implementing authentication")
    })

    test("accepts optional metadata", async () => {
      //#given
      const args = {
        subject: "Test task",
        metadata: { priority: "high", tags: ["urgent"] },
      }

      //#when
      const resultStr = await tool.execute(args, TEST_CONTEXT)
      const result = JSON.parse(resultStr)
      const taskId = result.task.id

      //#then
      const taskFile = join(testDir, TEST_STORAGE, `${taskId}.json`)
      const taskContent = JSON.parse(await Bun.file(taskFile).text())
      expect(taskContent.metadata).toEqual({ priority: "high", tags: ["urgent"] })
    })

    test("accepts optional blockedBy array", async () => {
      //#given
      const args = {
        subject: "Test task",
        blockedBy: ["T-123", "T-456"],
      }

      //#when
      const resultStr = await tool.execute(args, TEST_CONTEXT)
      const result = JSON.parse(resultStr)
      const taskId = result.task.id

      //#then
      const taskFile = join(testDir, TEST_STORAGE, `${taskId}.json`)
      const taskContent = JSON.parse(await Bun.file(taskFile).text())
      expect(taskContent.blockedBy).toEqual(["T-123", "T-456"])
    })

    test("accepts optional blocks array", async () => {
      //#given
      const args = {
        subject: "Test task",
        blocks: ["T-789", "T-101"],
      }

      //#when
      const resultStr = await tool.execute(args, TEST_CONTEXT)
      const result = JSON.parse(resultStr)
      const taskId = result.task.id

      //#then
      const taskFile = join(testDir, TEST_STORAGE, `${taskId}.json`)
      const taskContent = JSON.parse(await Bun.file(taskFile).text())
      expect(taskContent.blocks).toEqual(["T-789", "T-101"])
    })

    test("accepts optional repoURL", async () => {
      //#given
      const args = {
        subject: "Test task",
        repoURL: "https://github.com/example/repo",
      }

      //#when
      const resultStr = await tool.execute(args, TEST_CONTEXT)
      const result = JSON.parse(resultStr)
      const taskId = result.task.id

      //#then
      const taskFile = join(testDir, TEST_STORAGE, `${taskId}.json`)
      const taskContent = JSON.parse(await Bun.file(taskFile).text())
      expect(taskContent.repoURL).toBe("https://github.com/example/repo")
    })

    test("accepts optional parentID", async () => {
      //#given
      const args = {
        subject: "Test task",
        parentID: "T-parent-123",
      }

      //#when
      const resultStr = await tool.execute(args, TEST_CONTEXT)
      const result = JSON.parse(resultStr)
      const taskId = result.task.id

      //#then
      const taskFile = join(testDir, TEST_STORAGE, `${taskId}.json`)
      const taskContent = JSON.parse(await Bun.file(taskFile).text())
      expect(taskContent.parentID).toBe("T-parent-123")
    })

    test("returns minimal response with id and subject", async () => {
      //#given
      const args = {
        subject: "Test task",
      }

      //#when
      const resultStr = await tool.execute(args, TEST_CONTEXT)
      const result = JSON.parse(resultStr)

      //#then
      expect(result.task).toHaveProperty("id")
      expect(result.task).toHaveProperty("subject")
      expect(result.task.subject).toBe("Test task")
    })

    test("rejects missing subject", async () => {
      //#given
      const args = {}

      //#when
      const resultStr = await tool.execute(args, TEST_CONTEXT)
      const result = JSON.parse(resultStr)

      //#then
      expect(result).toHaveProperty("error")
    })

    test("writes task to file storage atomically", async () => {
      //#given
      const args = {
        subject: "Test task",
        description: "Test description",
      }

      //#when
      const resultStr = await tool.execute(args, TEST_CONTEXT)
      const result = JSON.parse(resultStr)
      const taskId = result.task.id

      //#then
      const taskFile = join(testDir, TEST_STORAGE, `${taskId}.json`)
      expect(existsSync(taskFile)).toBe(true)
      const taskContent = JSON.parse(await Bun.file(taskFile).text())
      expect(taskContent.id).toBe(taskId)
      expect(taskContent.subject).toBe("Test task")
      expect(taskContent.description).toBe("Test description")
    })

    test("rejects malformed blockedBy task IDs", async () => {
      //#given
      const args = {
        subject: "Test task",
        blockedBy: ["T-"],
      }

      //#when
      const resultStr = await tool.execute(args, TEST_CONTEXT)
      const result = JSON.parse(resultStr)

      //#then
      expect(result.error).toBe("validation_error")
    })

    test("rejects malformed blocks task IDs", async () => {
      //#given
      const args = {
        subject: "Test task",
        blocks: ["T-abc-"],
      }

      //#when
      const resultStr = await tool.execute(args, TEST_CONTEXT)
      const result = JSON.parse(resultStr)

      //#then
      expect(result.error).toBe("validation_error")
    })
  })
})
