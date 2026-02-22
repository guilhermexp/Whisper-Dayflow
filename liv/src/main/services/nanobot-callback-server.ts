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
  createKanbanCard,
  updateKanbanCard,
  deleteKanbanCard,
  moveKanbanCard,
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

const LOG_PREFIX = "[NanobotCallback]"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = ""
    req.on("data", (chunk: Buffer) => { data += chunk.toString() })
    req.on("end", () => {
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
    if (path === "/kanban/board" && method === "GET") {
      const board = await getAutonomousKanbanBoard()
      return json(res, board)
    }

    if (path === "/kanban/card" && method === "POST") {
      const body = await parseBody(req)
      const columnId = (body.columnId as string) || "pending"
      const board = await createKanbanCard(columnId, {
        title: body.title as string,
        description: body.description as string | undefined,
        bullets: body.bullets as string[] | undefined,
      })
      return json(res, board)
    }

    if (path.startsWith("/kanban/card/") && method === "PUT") {
      const cardId = path.split("/kanban/card/")[1]
      const body = await parseBody(req)
      const board = await updateKanbanCard(cardId, {
        title: body.title as string | undefined,
        description: body.description as string | undefined,
        bullets: body.bullets as string[] | undefined,
        status: body.status as "open" | "done" | undefined,
        lane: body.lane as "pending" | "suggestions" | "automations" | undefined,
      })
      return json(res, board)
    }

    if (path.startsWith("/kanban/card/") && method === "DELETE") {
      const cardId = path.split("/kanban/card/")[1]
      const board = await deleteKanbanCard(cardId)
      return json(res, board)
    }

    if (path.startsWith("/kanban/move/") && method === "POST") {
      const cardId = path.split("/kanban/move/")[1]
      const body = await parseBody(req)
      const board = await moveKanbanCard(
        cardId,
        body.toColumnId as string,
        body.position as number | undefined,
      )
      return json(res, board)
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

    // --- 404 ---
    error(res, `Not found: ${method} ${path}`, 404)
  } catch (err) {
    logger.error(`${LOG_PREFIX} Error handling ${method} ${path}:`, err)
    error(res, String(err), 500)
  }
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

let server: http.Server | null = null

/** Start the callback server and return the port it's listening on. */
export async function startNanobotCallbackServer(): Promise<number> {
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
    logger.info(`${LOG_PREFIX} Callback server stopped`)
  }
}
