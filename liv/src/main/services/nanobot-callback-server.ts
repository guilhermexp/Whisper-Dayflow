/**
 * Nanobot Callback Server
 *
 * Express mini-server running in the Electron main process.
 * Exposes existing Liv services as REST endpoints so the Python
 * nanobot gateway can call them via HTTP (Liv tools).
 *
 * Binds to 127.0.0.1 only (never external).
 */

import http from "http"
import crypto from "crypto"
import { BrowserWindow } from "electron"
import { logger } from "../logger"
import { WINDOWS } from "../window"
import {
  listAutoJournalRuns,
  runAutoJournalOnce,
  getSchedulerStatus,
  deleteAutoJournalRun,
} from "./auto-journal-service"
import {
  getAutonomousKanbanBoard,
  getKanbanWorkspace,
  createKanbanCard,
  updateKanbanCard,
  deleteKanbanCard,
  moveKanbanCard,
  createKanbanBoard,
  updateKanbanBoard,
  deleteKanbanBoard,
  createKanbanColumn,
  searchAutonomousKanbanMemory,
} from "./autonomous-kanban-service"
import {
  getAutonomousProfileBoard,
  refreshAutonomousProfile,
} from "./autonomous-profile-service"
import {
  getLifeContext,
  updateLifeContext,
  getLifeAnalysis,
  refreshLifeAnalysis,
} from "./autonomous-life-service"
import {
  searchAutonomousMemory,
  writeAutonomousMemory,
} from "./autonomous-memory-service"
import { configStore } from "../config"
import { historyStore } from "../history-store"
import { runHistorySearch } from "../history-analytics"
import { Notification } from "electron"
import {
  getAutomationWorkspacePaths,
  loadKanbanAutomationConfig,
  loadProfileAutomationConfig,
} from "./automation-workspace-config"

const LOG_PREFIX = "[NanobotCallback]"
const MAX_BODY_BYTES = 1_048_576 // 1MB

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = ""
    let size = 0
    let rejected = false

    req.on("data", (chunk: Buffer) => {
      if (rejected) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        rejected = true
        reject(new Error("Payload too large"))
        req.destroy()
        return
      }
      data += chunk.toString()
    })
    req.on("end", () => {
      if (rejected) return
      if (!data) return resolve({})
      try {
        resolve(JSON.parse(data))
      } catch (e) {
        reject(new Error("Invalid JSON body"))
      }
    })
    req.on("error", reject)
  })
}

function parseQuery(url: string): Record<string, string> {
  const idx = url.indexOf("?")
  if (idx < 0) return {}
  const params = new URLSearchParams(url.slice(idx + 1))
  const result: Record<string, string> = {}
  params.forEach((v, k) => { result[k] = v })
  return result
}

function json(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(JSON.stringify(data))
}

function error(res: http.ServerResponse, message: string, status = 400) {
  json(res, { error: message }, status)
}

function getBearerToken(req: http.IncomingMessage): string | null {
  const authHeader = req.headers.authorization
  if (!authHeader) return null
  const [scheme, token] = authHeader.split(" ")
  if (!scheme || !token) return null
  if (scheme.toLowerCase() !== "bearer") return null
  return token
}

function safeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

let callbackAuthToken: string | null = null

function isAuthorized(req: http.IncomingMessage): boolean {
  if (!callbackAuthToken) return false
  const tokenFromHeader = req.headers["x-liv-callback-token"]
  const tokenFromBearer = getBearerToken(req)
  const candidate =
    (Array.isArray(tokenFromHeader) ? tokenFromHeader[0] : tokenFromHeader) ||
    tokenFromBearer ||
    ""
  if (!candidate) return false
  return safeEqualString(candidate, callbackAuthToken)
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  const url = req.url || "/"
  const method = req.method || "GET"
  const path = url.split("?")[0]

  try {
    if (!isAuthorized(req)) {
      return error(res, "Unauthorized", 401)
    }

    // --- Journal ---
    if (path === "/journal/entries" && method === "GET") {
      const q = parseQuery(url)
      const limit = q.limit ? parseInt(q.limit, 10) : 50
      const runs = await listAutoJournalRuns(limit)
      // Optionally filter by date range
      let filtered = runs
      if (q.from) {
        const from = parseInt(q.from, 10)
        filtered = filtered.filter((r) => r.startedAt >= from)
      }
      if (q.to) {
        const to = parseInt(q.to, 10)
        filtered = filtered.filter((r) => r.startedAt <= to)
      }
      return json(res, { entries: filtered })
    }

    if (path === "/journal/trigger" && method === "POST") {
      const body = await parseBody(req)
      const windowMinutes = typeof body.windowMinutes === "number"
        ? body.windowMinutes
        : undefined
      const run = await runAutoJournalOnce(windowMinutes)
      return json(res, { run })
    }

    if (path === "/journal/status" && method === "GET") {
      return json(res, getSchedulerStatus())
    }

    // --- Kanban ---

    // Workspace (all boards)
    if (path === "/kanban/workspace" && method === "GET") {
      const workspace = await getKanbanWorkspace()
      return json(res, workspace)
    }

    // Backward compat: single board
    if (path === "/kanban/board" && method === "GET") {
      const board = await getAutonomousKanbanBoard()
      return json(res, board)
    }

    // Create board
    if (path === "/kanban/board" && method === "POST") {
      const body = await parseBody(req)
      const workspace = await createKanbanBoard({
        name: body.name as string,
        description: body.description as string | undefined,
        icon: body.icon as string | undefined,
        color: body.color as string | undefined,
        columns: body.columns as Array<{ id?: string; title: string; color?: string; icon?: string }> | undefined,
        createdBy: (body.createdBy as "agent" | "user" | "system") || "agent",
      })
      return json(res, workspace)
    }

    // Update board metadata
    if (path.startsWith("/kanban/board/") && method === "PUT") {
      const boardId = path.split("/kanban/board/")[1]
      const body = await parseBody(req)
      const workspace = await updateKanbanBoard(boardId, {
        name: body.name as string | undefined,
        description: body.description as string | undefined,
        icon: body.icon as string | undefined,
        color: body.color as string | undefined,
      })
      return json(res, workspace)
    }

    // Delete board
    if (path.startsWith("/kanban/board/") && method === "DELETE") {
      const boardId = path.split("/kanban/board/")[1]
      const workspace = await deleteKanbanBoard(boardId)
      return json(res, workspace)
    }

    // Create column in board
    if (path.match(/^\/kanban\/board\/[^/]+\/column$/) && method === "POST") {
      const boardId = path.split("/kanban/board/")[1].replace("/column", "")
      const body = await parseBody(req)
      const workspace = await createKanbanColumn(boardId, {
        title: body.title as string,
        color: body.color as string | undefined,
        icon: body.icon as string | undefined,
      })
      return json(res, workspace)
    }

    // Create card (with optional boardId)
    if (path === "/kanban/card" && method === "POST") {
      const body = await parseBody(req)
      const boardId = (body.boardId as string) || "auto-analysis"
      const columnId = (body.columnId as string) || "pending"
      const workspace = await createKanbanCard(columnId, {
        title: body.title as string,
        description: body.description as string | undefined,
        bullets: body.bullets as string[] | undefined,
      }, boardId)
      return json(res, workspace)
    }

    // Update card
    if (path.startsWith("/kanban/card/") && method === "PUT") {
      const cardId = path.split("/kanban/card/")[1]
      const body = await parseBody(req)
      const workspace = await updateKanbanCard(cardId, {
        title: body.title as string | undefined,
        description: body.description as string | undefined,
        bullets: body.bullets as string[] | undefined,
        status: body.status as "open" | "done" | undefined,
        lane: body.lane as string | undefined,
      }, body.boardId as string | undefined)
      return json(res, workspace)
    }

    // Delete card
    if (path.startsWith("/kanban/card/") && method === "DELETE") {
      const cardId = path.split("/kanban/card/")[1]
      const workspace = await deleteKanbanCard(cardId)
      return json(res, workspace)
    }

    // Move card
    if (path.startsWith("/kanban/move/") && method === "POST") {
      const cardId = path.split("/kanban/move/")[1]
      const body = await parseBody(req)
      const workspace = await moveKanbanCard(
        cardId,
        body.toColumnId as string,
        body.position as number | undefined,
        body.boardId as string | undefined,
      )
      return json(res, workspace)
    }

    // --- Memory ---
    if (path === "/memory/search" && method === "GET") {
      const q = parseQuery(url)
      if (!q.q) return error(res, "Missing query parameter 'q'")
      const limit = q.limit ? parseInt(q.limit, 10) : 6
      const results = await searchAutonomousMemory(q.q, limit)
      return json(res, { results })
    }

    if (path === "/memory/search" && method === "POST") {
      const body = await parseBody(req)
      const query = body.query as string
      if (!query) return error(res, "Missing 'query' in body")
      const limit = typeof body.limit === "number" ? body.limit : 6
      const results = await searchAutonomousMemory(query, limit)
      return json(res, { results })
    }

    if (path === "/memory/write" && method === "POST") {
      const body = await parseBody(req)
      const content = body.content as string
      if (!content) return error(res, "Missing 'content' in body")
      await writeAutonomousMemory(content, {
        persistent: body.persistent as boolean | undefined,
        section: body.section as string | undefined,
      })
      return json(res, { status: "ok" })
    }

    // --- Life OS ---
    if (path === "/life/context" && method === "GET") {
      const context = await getLifeContext()
      return json(res, context)
    }

    if (path === "/life/context" && method === "PUT") {
      const body = await parseBody(req)
      const updated = await updateLifeContext(body as any)
      return json(res, updated)
    }

    if (path === "/life/analysis" && method === "GET") {
      const analysis = await getLifeAnalysis()
      return json(res, { analysis })
    }

    if (path === "/life/analysis/refresh" && method === "POST") {
      const body = await parseBody(req)
      const windowDays = typeof body.windowDays === "number" ? body.windowDays : 14
      const analysis = await refreshLifeAnalysis(windowDays)
      return json(res, { analysis })
    }

    // --- Profile ---
    if (path === "/profile/board" && method === "GET") {
      const board = await getAutonomousProfileBoard()
      return json(res, board)
    }

    if (path === "/profile/refresh" && method === "POST") {
      const board = await refreshAutonomousProfile()
      return json(res, board)
    }

    // --- Recordings ---
    if (path === "/recordings" && method === "GET") {
      const q = parseQuery(url)
      const limit = q.limit ? parseInt(q.limit, 10) : 50
      const items = historyStore.readAll().slice(0, limit)
      // Filter by date range if provided
      let filtered = items
      if (q.from) {
        const from = parseInt(q.from, 10)
        filtered = filtered.filter((r) => r.createdAt >= from)
      }
      if (q.to) {
        const to = parseInt(q.to, 10)
        filtered = filtered.filter((r) => r.createdAt <= to)
      }
      return json(res, { recordings: filtered })
    }

    if (path === "/recordings/search" && method === "POST") {
      const body = await parseBody(req)
      const text = (body.text as string) || ""
      const items = historyStore.readAll()
      const filters: Record<string, unknown> = { text }
      if (body.tags) filters.tags = body.tags
      if (body.from_ts || body.to_ts) {
        filters.dateRange = {
          from: body.from_ts as number | undefined,
          to: body.to_ts as number | undefined,
        }
      }
      const result = runHistorySearch(items, filters as any)
      return json(res, { recordings: result.items, total: result.total })
    }

    if (path.startsWith("/recordings/") && method === "DELETE") {
      const id = path.split("/recordings/")[1]
      if (!id) return error(res, "Missing recording ID")
      historyStore.delete(id)
      return json(res, { status: "ok", id })
    }

    if (path.startsWith("/recordings/") && method === "PUT") {
      const id = path.split("/recordings/")[1]
      if (!id) return error(res, "Missing recording ID")
      const body = await parseBody(req)
      const updated = historyStore.update(id, body as any)
      if (!updated) return error(res, `Recording not found: ${id}`, 404)
      return json(res, { recording: updated })
    }

    // --- Journal delete ---
    if (path.startsWith("/journal/entries/") && method === "DELETE") {
      const id = path.split("/journal/entries/")[1]
      if (!id) return error(res, "Missing journal entry ID")
      await deleteAutoJournalRun(id)
      return json(res, { status: "ok", id })
    }

    // --- App control ---
    if (path === "/app/navigate" && method === "POST") {
      const body = await parseBody(req)
      const route = body.route as string
      if (!route) return error(res, "Missing 'route' in body")
      const mainWindow = WINDOWS.get("main")
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("navigate", route)
        mainWindow.show()
        return json(res, { status: "ok", route })
      }
      return error(res, "Main window not available", 503)
    }

    if (path === "/app/notify" && method === "POST") {
      const body = await parseBody(req)
      const title = (body.title as string) || "Liv"
      const message = (body.message as string) || ""
      new Notification({ title, body: message }).show()
      return json(res, { status: "ok" })
    }

    if (path === "/app/status" && method === "GET") {
      const cfg = configStore.get()
      return json(res, {
        autoJournal: getSchedulerStatus(),
        config: {
          nanobotEnabled: cfg.nanobotEnabled,
          autoJournalEnabled: cfg.autoJournalEnabled,
          language: cfg.language,
        },
      })
    }

    if (path === "/config" && method === "GET") {
      const cfg = configStore.get()
      // Return only safe, non-sensitive config values
      return json(res, {
        language: cfg.language,
        autoJournalEnabled: cfg.autoJournalEnabled,
        autoJournalWindowMinutes: cfg.autoJournalWindowMinutes,
        nanobotEnabled: cfg.nanobotEnabled,
        nanobotModel: cfg.nanobotModel,
      })
    }

    if (path === "/automation/config" && method === "GET") {
      return json(res, {
        paths: getAutomationWorkspacePaths(),
        kanban: loadKanbanAutomationConfig(),
        profile: loadProfileAutomationConfig(),
      })
    }

    // --- 404 ---
    error(res, `Not found: ${method} ${path}`, 404)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message === "Payload too large") {
      return error(res, message, 413)
    }
    logger.error(`${LOG_PREFIX} Error handling ${method} ${path}:`, err)
    error(res, message, 500)
  }
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

let server: http.Server | null = null

/** Start the callback server and return the port it's listening on. */
export async function startNanobotCallbackServer(input: {
  authToken: string
}): Promise<number> {
  callbackAuthToken = input.authToken

  if (server) {
    logger.warn(`${LOG_PREFIX} Already running`)
    const addr = server.address()
    return typeof addr === "object" && addr ? addr.port : 0
  }

  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        logger.error(`${LOG_PREFIX} Unhandled error:`, err)
        error(res, "Internal server error", 500)
      })
    })

    server.listen(0, "127.0.0.1", () => {
      const addr = server!.address()
      const port = typeof addr === "object" && addr ? addr.port : 0
      logger.info(`${LOG_PREFIX} Callback server listening on 127.0.0.1:${port}`)
      resolve(port)
    })

    server.on("error", (err) => {
      logger.error(`${LOG_PREFIX} Server error:`, err)
      reject(err)
    })
  })
}

/** Stop the callback server. */
export function stopNanobotCallbackServer(): void {
  if (server) {
    server.close()
    server = null
    callbackAuthToken = null
    logger.info(`${LOG_PREFIX} Callback server stopped`)
  }
}
