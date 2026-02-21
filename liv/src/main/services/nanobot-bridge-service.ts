/**
 * Nanobot Bridge Service
 *
 * Manages the lifecycle of the Python nanobot gateway process:
 * - Spawns the gateway with correct env vars
 * - Health-checks until ready
 * - Auto-restarts with exponential backoff on crash
 * - Emits status events for the UI
 * - Graceful shutdown on app quit
 */

import { ChildProcess, spawn } from "child_process"
import path from "path"
import fs from "fs"
import { app } from "electron"
import { configStore, dataFolder } from "../config"
import { logger } from "../logger"
import { getKey, getOpenrouterKey, getGeminiKey, getGroqKey } from "../pile-utils/store"
import settings from "electron-settings"
import type { NanobotStatus } from "../../shared/types"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOG_PREFIX = "[NanobotBridge]"
const HEALTH_CHECK_INTERVAL_MS = 2_000
const HEALTH_CHECK_TIMEOUT_MS = 30_000
const MAX_BACKOFF_MS = 30_000
const INITIAL_BACKOFF_MS = 1_000

// ---------------------------------------------------------------------------
// Port allocation
// ---------------------------------------------------------------------------

/** Find a free port by binding to 0 and reading the assigned port. */
async function findFreePort(): Promise<number> {
  const net = await import("net")
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address()
      if (addr && typeof addr === "object") {
        const port = addr.port
        srv.close(() => resolve(port))
      } else {
        srv.close(() => reject(new Error("Could not determine port")))
      }
    })
    srv.on("error", reject)
  })
}

// ---------------------------------------------------------------------------
// Bridge Service
// ---------------------------------------------------------------------------

export type NanobotBridgeEvent = "ready" | "error" | "stopped" | "restarting"
type EventListener = (data?: unknown) => void

class NanobotBridgeService {
  private proc: ChildProcess | null = null
  private gatewayPort = 0
  private callbackPort = 0
  private healthTimer: ReturnType<typeof setInterval> | null = null
  private backoffMs = INITIAL_BACKOFF_MS
  private restartTimer: ReturnType<typeof setTimeout> | null = null
  private _status: NanobotStatus = {
    state: "stopped",
    port: 0,
    uptime: 0,
    error: null,
  }
  private startedAt = 0
  private intentionallyStopped = false
  private memoryCheckTimer: ReturnType<typeof setInterval> | null = null
  private listeners: Map<NanobotBridgeEvent, Set<EventListener>> = new Map()

  // --- Public API ---

  get status(): NanobotStatus {
    return {
      ...this._status,
      uptime: this._status.state === "connected"
        ? Math.round((Date.now() - this.startedAt) / 1000)
        : 0,
    }
  }

  get port(): number {
    return this.gatewayPort
  }

  get cbPort(): number {
    return this.callbackPort
  }

  on(event: NanobotBridgeEvent, fn: EventListener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(fn)
  }

  off(event: NanobotBridgeEvent, fn: EventListener) {
    this.listeners.get(event)?.delete(fn)
  }

  private emit(event: NanobotBridgeEvent, data?: unknown) {
    this.listeners.get(event)?.forEach((fn) => fn(data))
  }

  /**
   * Start the nanobot gateway process.
   * Resolves when the gateway responds to /health, or rejects on timeout.
   */
  async start(callbackPort: number): Promise<void> {
    if (this.proc) {
      logger.warn(`${LOG_PREFIX} Already running, stopping first`)
      await this.stop()
    }

    this.intentionallyStopped = false
    this.callbackPort = callbackPort

    // Allocate port
    this.gatewayPort = await findFreePort()
    logger.info(`${LOG_PREFIX} Gateway port: ${this.gatewayPort}`)

    // Build env
    const env = await this.buildEnv()

    // Resolve Python executable
    const pythonPath = this.findPython()
    if (!pythonPath) {
      const err = "Python 3 not found. Install Python 3.10+ to use the Nanobot agent."
      this.setStatus("error", err)
      throw new Error(err)
    }

    // Resolve gateway script
    const gatewayScript = this.resolveGatewayScript()
    if (!fs.existsSync(gatewayScript)) {
      const err = `Gateway script not found: ${gatewayScript}`
      this.setStatus("error", err)
      throw new Error(err)
    }

    logger.info(`${LOG_PREFIX} Spawning: ${pythonPath} ${gatewayScript}`)
    this.setStatus("starting")

    this.proc = spawn(pythonPath, [gatewayScript], {
      env: { ...process.env, ...env },
      cwd: path.dirname(gatewayScript),
      stdio: ["ignore", "pipe", "pipe"],
    })

    // Pipe stdout/stderr to log file
    const logStream = this.getLogStream()
    this.proc.stdout?.pipe(logStream)
    this.proc.stderr?.pipe(logStream)

    this.proc.on("error", (err) => {
      logger.error(`${LOG_PREFIX} Process error:`, err)
      this.setStatus("error", err.message)
      this.scheduleRestart()
    })

    this.proc.on("exit", (code, signal) => {
      logger.info(`${LOG_PREFIX} Process exited: code=${code} signal=${signal}`)
      this.proc = null
      if (!this.intentionallyStopped) {
        this.setStatus("error", `Process exited with code ${code}`)
        this.scheduleRestart()
      } else {
        this.setStatus("stopped")
      }
    })

    // Wait for health check
    await this.waitForHealth()
    this.startedAt = Date.now()
    this.backoffMs = INITIAL_BACKOFF_MS
    this.setStatus("connected")
    this.emit("ready", { port: this.gatewayPort })

    // Start memory monitoring (auto-restart if > 512MB)
    this.startMemoryMonitor()
  }

  private startMemoryMonitor() {
    if (this.memoryCheckTimer) clearInterval(this.memoryCheckTimer)
    const MAX_RSS_BYTES = 512 * 1024 * 1024 // 512MB
    this.memoryCheckTimer = setInterval(() => {
      if (!this.proc || !this.proc.pid) return
      try {
        const { execSync } = require("child_process")
        const rss = execSync(
          `ps -o rss= -p ${this.proc.pid} 2>/dev/null`,
          { encoding: "utf8", timeout: 3_000 },
        ).trim()
        const rssBytes = parseInt(rss, 10) * 1024 // ps reports in KB
        if (rssBytes > MAX_RSS_BYTES) {
          logger.warn(
            `${LOG_PREFIX} Process RSS ${Math.round(rssBytes / 1024 / 1024)}MB exceeds limit, restarting`,
          )
          void this.restart()
        }
      } catch {
        // ps may fail if process just exited
      }
    }, 60_000) // Check every 60s
  }

  /** Stop the gateway process gracefully. */
  async stop(): Promise<void> {
    this.intentionallyStopped = true
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    if (this.healthTimer) {
      clearInterval(this.healthTimer)
      this.healthTimer = null
    }
    if (this.memoryCheckTimer) {
      clearInterval(this.memoryCheckTimer)
      this.memoryCheckTimer = null
    }
    if (this.proc) {
      logger.info(`${LOG_PREFIX} Stopping process (PID ${this.proc.pid})`)
      this.proc.kill("SIGTERM")
      // Wait up to 5s for graceful exit
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.proc) {
            logger.warn(`${LOG_PREFIX} Force killing process`)
            this.proc.kill("SIGKILL")
          }
          resolve()
        }, 5_000)
        this.proc!.once("exit", () => {
          clearTimeout(timeout)
          resolve()
        })
      })
      this.proc = null
    }
    this.setStatus("stopped")
    this.emit("stopped")
  }

  /** Restart the gateway (e.g. after config change). */
  async restart(): Promise<void> {
    logger.info(`${LOG_PREFIX} Restarting...`)
    await this.stop()
    this.intentionallyStopped = false
    await this.start(this.callbackPort)
  }

  // --- Private helpers ---

  private setStatus(state: NanobotStatus["state"], error?: string | null) {
    this._status = {
      state,
      port: this.gatewayPort,
      uptime: state === "connected" ? Math.round((Date.now() - this.startedAt) / 1000) : 0,
      error: error ?? null,
    }
  }

  private async buildEnv(): Promise<Record<string, string>> {
    // Read AI provider config from electron-settings (canonical source)
    const pileProvider = (await settings.get("pileAIProvider")) as string | undefined
    const pileModel = (await settings.get("model")) as string | undefined
    const openrouterModel = (await settings.get("openrouterModel")) as string | undefined
    const baseUrl = (await settings.get("baseUrl")) as string | undefined

    // Get API key from encrypted store based on provider
    const provider = pileProvider || "openai"
    let apiKey = ""
    if (provider === "groq") {
      apiKey = (await getGroqKey()) || ""
    } else if (provider === "openrouter") {
      apiKey = (await getOpenrouterKey()) || ""
    } else if (provider === "gemini") {
      apiKey = (await getGeminiKey()) || ""
    } else {
      // openai, anthropic, custom — all use the main AI key
      apiKey = (await getKey()) || ""
    }

    // Determine model string in LiteLLM format (provider/model)
    let model = ""
    if (provider === "openrouter" && openrouterModel) {
      model = `openrouter/${openrouterModel}`
    } else if (pileModel) {
      // Add provider prefix if not already there
      model = pileModel.includes("/") ? pileModel : `${provider}/${pileModel}`
    } else {
      model = "anthropic/claude-sonnet-4-20250514"
    }

    const workspace = path.join(dataFolder, "nanobot-workspace")

    // Nanobot-ref path
    const nanobotRef = app.isPackaged
      ? path.join(process.resourcesPath, "nanobot-ref")
      : path.join(__dirname, "..", "..", "..", "nanobot-ref")

    return {
      LIV_API_KEY: apiKey,
      LIV_MODEL: model,
      LIV_PROVIDER: provider,
      LIV_WORKSPACE: workspace,
      LIV_CALLBACK_PORT: String(this.callbackPort),
      LIV_GATEWAY_PORT: String(this.gatewayPort),
      LIV_NANOBOT_REF: nanobotRef,
      LIV_LOG_LEVEL: "INFO",
      ...(baseUrl ? { LIV_API_BASE: baseUrl } : {}),
    }
  }

  private findPython(): string | null {
    const candidates = [
      "python3",
      "python",
      "/usr/local/bin/python3",
      "/opt/homebrew/bin/python3",
      "/usr/bin/python3",
    ]

    for (const candidate of candidates) {
      try {
        const { execSync } = require("child_process")
        const version = execSync(`${candidate} --version 2>&1`, {
          encoding: "utf8",
          timeout: 5_000,
        }).trim()
        if (version.includes("Python 3")) {
          return candidate
        }
      } catch {
        continue
      }
    }
    return null
  }

  private resolveGatewayScript(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, "nanobot", "gateway.py")
    }
    return path.join(__dirname, "..", "..", "..", "resources", "nanobot", "gateway.py")
  }

  private getLogStream() {
    const logDir = path.join(app.getPath("logs"))
    fs.mkdirSync(logDir, { recursive: true })
    const logPath = path.join(logDir, "nanobot.log")
    return fs.createWriteStream(logPath, { flags: "a" })
  }

  private async waitForHealth(): Promise<void> {
    const deadline = Date.now() + HEALTH_CHECK_TIMEOUT_MS
    const url = `http://127.0.0.1:${this.gatewayPort}/health`

    while (Date.now() < deadline) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(2_000) })
        if (res.ok) {
          const data = await res.json()
          if (data.status === "ok") {
            logger.info(`${LOG_PREFIX} Health check passed`)
            return
          }
        }
      } catch {
        // Expected while process is starting
      }

      // Check if process died
      if (!this.proc) {
        throw new Error("Process exited before becoming healthy")
      }

      await new Promise((r) => setTimeout(r, HEALTH_CHECK_INTERVAL_MS))
    }

    throw new Error("Health check timed out")
  }

  private scheduleRestart() {
    if (this.intentionallyStopped) return

    logger.info(`${LOG_PREFIX} Scheduling restart in ${this.backoffMs}ms`)
    this.emit("restarting", { backoffMs: this.backoffMs })

    this.restartTimer = setTimeout(async () => {
      try {
        await this.start(this.callbackPort)
      } catch (err) {
        logger.error(`${LOG_PREFIX} Restart failed:`, err)
        this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS)
        this.scheduleRestart()
      }
    }, this.backoffMs)

    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS)
  }
}

export const nanobotBridge = new NanobotBridgeService()
