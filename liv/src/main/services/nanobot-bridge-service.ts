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
import { getKey, getGeminiKey, getGroqKey, getComposioKey } from "../pile-utils/store"
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
const MAX_RESTART_ATTEMPTS = 5

const normalizePileProvider = (provider?: string): string => {
  const supported = new Set(["openai", "openrouter", "ollama", "gemini", "groq", "custom"])
  if (provider === "subscription") return "openai"
  if (!provider || !supported.has(provider)) return "openai"
  return provider
}

const normalizeNanobotProvider = (provider?: string): "openai" | "gemini" | "groq" | "custom" => {
  const normalized = normalizePileProvider(provider)
  // Force-disable OpenRouter for Nanobot runtime as requested.
  if (normalized === "openrouter") return "openai"
  if (normalized === "gemini") return "gemini"
  if (normalized === "groq") return "groq"
  if (normalized === "custom") return "custom"
  return "openai"
}

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
  private restartCount = 0
  private memoryCheckTimer: ReturnType<typeof setInterval> | null = null
  private callbackToken = ""
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
  async start(callbackPort: number, callbackToken = ""): Promise<void> {
    if (this.proc) {
      logger.warn(`${LOG_PREFIX} Already running, stopping first`)
      await this.stop()
    }

    this.intentionallyStopped = false
    this.callbackPort = callbackPort
    this.callbackToken = callbackToken

    // Allocate port (use fixed port from config if set)
    const cfg = configStore.get()
    const fixedPort = cfg.nanobotGatewayPort ?? 0
    this.gatewayPort = fixedPort > 0 ? fixedPort : await findFreePort()
    logger.info(`${LOG_PREFIX} Gateway port: ${this.gatewayPort}`)

    // Build env
    const env = await this.buildEnv()

    // Resolve Python executable
    let pythonPath = this.findPython()
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

    // Ensure Python dependencies are installed
    pythonPath = await this.ensureDependencies(pythonPath, path.dirname(gatewayScript))

    logger.info(`${LOG_PREFIX} Spawning: ${pythonPath} ${gatewayScript}`)
    this.setStatus("starting")

    this.proc = spawn(pythonPath, [gatewayScript], {
      env: { ...process.env, ...env },
      cwd: path.dirname(gatewayScript),
      stdio: ["ignore", "pipe", "pipe"],
    })

    // Pipe stdout/stderr to log file AND to terminal for debug
    const logStream = this.getLogStream()
    this.proc.stdout?.pipe(logStream)
    this.proc.stderr?.pipe(logStream)
    // Also echo to main process stdout/stderr for dev visibility
    this.proc.stdout?.on("data", (chunk: Buffer) => {
      process.stdout.write(`${LOG_PREFIX} ${chunk.toString()}`)
    })
    this.proc.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(`${LOG_PREFIX} ${chunk.toString()}`)
    })

    this.proc.on("error", (err) => {
      logger.error(`${LOG_PREFIX} Process error:`, err)
      this.setStatus("error", err.message)
      this.emit("error", err)
      this.scheduleRestart()
    })

    this.proc.on("exit", (code, signal) => {
      logger.info(`${LOG_PREFIX} Process exited: code=${code} signal=${signal}`)
      this.proc = null
      if (!this.intentionallyStopped) {
        this.setStatus("error", `Process exited with code ${code}`)
        this.emit("error", { code, signal })
        this.scheduleRestart()
      } else {
        this.setStatus("stopped")
      }
    })

    // Wait for health check
    await this.waitForHealth()
    this.startedAt = Date.now()
    this.backoffMs = INITIAL_BACKOFF_MS
    this.restartCount = 0
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
    this.restartCount = 0
    this.backoffMs = INITIAL_BACKOFF_MS
    await this.start(this.callbackPort, this.callbackToken)
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
    const baseUrl = (await settings.get("baseUrl")) as string | undefined

    // Read nanobot-specific config from configStore
    const cfg = configStore.get()

    // Get API key from encrypted store based on provider
    const provider = normalizeNanobotProvider(pileProvider)
    let effectiveProvider = provider
    let apiKey = ""
    if (provider === "groq") {
      apiKey = (await getGroqKey()) || ""
    } else if (provider === "gemini") {
      apiKey = (await getGeminiKey()) || ""
    } else {
      // openai/custom use the main AI key
      apiKey = (await getKey()) || ""
    }

    // Optional runtime fallback to Kimi via environment variables.
    // This avoids hardcoding secrets in repository code.
    const kimiApiKey = process.env.KIMI_API_KEY?.trim() || ""
    const kimiBaseUrl =
      process.env.KIMI_BASE_URL?.trim() || "https://api.kimi.com/coding"
    const kimiModel =
      process.env.KIMI_MODEL?.trim() || "kimi-k2.5-coding"
    let effectiveBaseUrl = baseUrl
    if (!apiKey && kimiApiKey) {
      effectiveProvider = "custom"
      apiKey = kimiApiKey
      effectiveBaseUrl = kimiBaseUrl
      logger.info(`${LOG_PREFIX} Falling back to Kimi custom provider (env).`)
    }

    // Determine model: use nanobot override if set, otherwise Chat model
    let model = ""
    if (cfg.nanobotModel) {
      model = cfg.nanobotModel
    } else if (effectiveProvider === "custom" && !pileModel) {
      model = kimiModel
    } else if (effectiveProvider === "openai" && pileModel?.startsWith("openrouter/")) {
      model = "openai/gpt-5.2"
    } else if (pileModel) {
      model = pileModel.includes("/") ? pileModel : `${effectiveProvider}/${pileModel}`
    } else {
      model = "anthropic/claude-sonnet-4-20250514"
    }

    const workspace = path.join(dataFolder, "nanobot-workspace")
    const nanobotRef = this.resolveNanobotRefPath()

    const env: Record<string, string> = {
      LIV_API_KEY: apiKey,
      LIV_MODEL: model,
      LIV_PROVIDER: effectiveProvider,
      LIV_WORKSPACE: workspace,
      LIV_CALLBACK_PORT: String(this.callbackPort),
      LIV_GATEWAY_PORT: String(this.gatewayPort),
      LIV_NANOBOT_REF: nanobotRef,
      LIV_LOG_LEVEL: "INFO",
      LIV_TEMPERATURE: String(cfg.nanobotTemperature ?? 0.7),
      LIV_MAX_TOKENS: String(cfg.nanobotMaxTokens ?? 8192),
      LIV_MAX_ITERATIONS: String(cfg.nanobotMaxIterations ?? 20),
    }

    if (this.callbackToken) {
      env.LIV_CALLBACK_TOKEN = this.callbackToken
    }

    if (effectiveBaseUrl) env.LIV_API_BASE = effectiveBaseUrl

    // Composio API key (from encrypted storage)
    const composioKey = await getComposioKey()
    if (composioKey) {
      env.LIV_COMPOSIO_API_KEY = composioKey
    }

    // Channel integrations
    if (cfg.nanobotTelegramEnabled) {
      env.LIV_TELEGRAM_ENABLED = "true"
      if (cfg.nanobotTelegramToken) env.LIV_TELEGRAM_TOKEN = cfg.nanobotTelegramToken
    }
    if (cfg.nanobotWhatsappEnabled) {
      env.LIV_WHATSAPP_ENABLED = "true"
      if (cfg.nanobotWhatsappBridgeUrl) env.LIV_WHATSAPP_BRIDGE_URL = cfg.nanobotWhatsappBridgeUrl
      if (cfg.nanobotWhatsappBridgeToken) env.LIV_WHATSAPP_BRIDGE_TOKEN = cfg.nanobotWhatsappBridgeToken
    }
    if (cfg.nanobotSlackEnabled) {
      env.LIV_SLACK_ENABLED = "true"
      if (cfg.nanobotSlackBotToken) env.LIV_SLACK_BOT_TOKEN = cfg.nanobotSlackBotToken
      if (cfg.nanobotSlackAppToken) env.LIV_SLACK_APP_TOKEN = cfg.nanobotSlackAppToken
    }
    if (cfg.nanobotDiscordEnabled) {
      env.LIV_DISCORD_ENABLED = "true"
      if (cfg.nanobotDiscordToken) env.LIV_DISCORD_TOKEN = cfg.nanobotDiscordToken
    }
    if (cfg.nanobotEmailEnabled) {
      env.LIV_EMAIL_ENABLED = "true"
      if (cfg.nanobotEmailImapHost) env.LIV_EMAIL_IMAP_HOST = cfg.nanobotEmailImapHost
      if (cfg.nanobotEmailImapUser) env.LIV_EMAIL_IMAP_USER = cfg.nanobotEmailImapUser
      if (cfg.nanobotEmailImapPass) env.LIV_EMAIL_IMAP_PASS = cfg.nanobotEmailImapPass
      if (cfg.nanobotEmailSmtpHost) env.LIV_EMAIL_SMTP_HOST = cfg.nanobotEmailSmtpHost
      if (cfg.nanobotEmailSmtpUser) env.LIV_EMAIL_SMTP_USER = cfg.nanobotEmailSmtpUser
      if (cfg.nanobotEmailSmtpPass) env.LIV_EMAIL_SMTP_PASS = cfg.nanobotEmailSmtpPass
    }

    return env
  }

  private findPython(): string | null {
    const { execSync } = require("child_process")

    // 0. Prefer app-managed runtime venv (packaged builds, writable location)
    const runtimeVenvPython = this.getRuntimeVenvPythonPath()
    if (fs.existsSync(runtimeVenvPython)) {
      try {
        const version = execSync(`"${runtimeVenvPython}" --version 2>&1`, {
          encoding: "utf8",
          timeout: 5_000,
        }).trim()
        if (version.includes("Python 3")) {
          logger.info(`${LOG_PREFIX} Using runtime venv Python: ${runtimeVenvPython} (${version})`)
          return runtimeVenvPython
        }
      } catch { /* fallthrough */ }
    }

    // 1. Prefer the venv Python inside the gateway directory (always correct version + deps)
    const gatewayDir = path.dirname(this.resolveGatewayScript())
    const venvPython = path.join(gatewayDir, ".venv", "bin", "python3")
    if (fs.existsSync(venvPython)) {
      try {
        const version = execSync(`"${venvPython}" --version 2>&1`, {
          encoding: "utf8",
          timeout: 5_000,
        }).trim()
        if (version.includes("Python 3")) {
          logger.info(`${LOG_PREFIX} Using venv Python: ${venvPython} (${version})`)
          return venvPython
        }
      } catch { /* fallthrough */ }
    }

    // 2. Try system Pythons, preferring 3.11+ (required by nanobot-ref)
    const candidates = [
      "/opt/homebrew/bin/python3.13",
      "/opt/homebrew/bin/python3.12",
      "/opt/homebrew/bin/python3.11",
      "/usr/local/bin/python3.13",
      "/usr/local/bin/python3.12",
      "/usr/local/bin/python3.11",
      "/opt/homebrew/bin/python3",
      "python3",
      "python",
      "/usr/local/bin/python3",
      "/usr/bin/python3",
    ]

    for (const candidate of candidates) {
      try {
        const version = execSync(`${candidate} --version 2>&1`, {
          encoding: "utf8",
          timeout: 5_000,
        }).trim()
        if (version.includes("Python 3")) {
          // Extract minor version and prefer 3.11+
          const match = version.match(/Python 3\.(\d+)/)
          const minor = match ? parseInt(match[1], 10) : 0
          if (minor >= 11) {
            logger.info(`${LOG_PREFIX} Using Python: ${candidate} (${version})`)
            return candidate
          }
        }
      } catch {
        continue
      }
    }

    // 3. Fallback: any Python 3 (may fail at import time)
    for (const candidate of candidates) {
      try {
        const version = execSync(`${candidate} --version 2>&1`, {
          encoding: "utf8",
          timeout: 5_000,
        }).trim()
        if (version.includes("Python 3")) {
          logger.warn(`${LOG_PREFIX} Only found ${candidate} (${version}) — nanobot-ref requires 3.11+`)
          return candidate
        }
      } catch {
        continue
      }
    }

    return null
  }

  /**
   * Check if required Python deps are installed; if not, install them.
   * This prevents the gateway from crashing in a restart loop due to
   * missing modules like fastapi, uvicorn, etc.
   */
  private async ensureDependencies(pythonPath: string, gatewayDir: string): Promise<string> {
    const { execSync } = require("child_process")

    // Packaged macOS builds often fall back to Homebrew Python, where `pip install --user`
    // may be blocked (externally-managed env). Create a dedicated app-owned venv instead.
    if (app.isPackaged && !pythonPath.includes(".venv")) {
      pythonPath = this.ensureRuntimeVenv(pythonPath)
    }

    // Quick check: can Python import the two key modules?
    try {
      execSync(`"${pythonPath}" -c "import fastapi; import loguru" 2>&1`, {
        encoding: "utf8",
        timeout: 10_000,
      })
      return pythonPath // deps already installed
    } catch {
      // deps missing — try to install
    }

    logger.info(`${LOG_PREFIX} Python dependencies missing, attempting install...`)
    this.setStatus("starting")

    // Detect if we're running inside a venv (no --user flag needed)
    const isVenv = pythonPath.includes(".venv")
    const pipUserFlag = isVenv ? "" : "--user"

    // 1. Install gateway requirements.txt
    const reqFile = path.join(gatewayDir, "requirements.txt")
    if (fs.existsSync(reqFile)) {
      try {
        const cmd = `"${pythonPath}" -m pip install ${pipUserFlag} -r "${reqFile}" 2>&1`
        execSync(cmd, { encoding: "utf8", timeout: 120_000, cwd: gatewayDir })
        logger.info(`${LOG_PREFIX} Gateway dependencies installed`)
      } catch (err: unknown) {
        const msg = this.formatCommandError(err)
        logger.error(`${LOG_PREFIX} Failed to install gateway deps: ${msg}`)
      }
    }

    // 2. Install nanobot-ref package (has its own deps like loguru, croniter, etc.)
    const nanobotRefPath = this.resolveNanobotRefPath()
    const nanobotRefPyproject = path.join(nanobotRefPath, "pyproject.toml")
    if (fs.existsSync(nanobotRefPyproject)) {
      try {
        const editableFlag = app.isPackaged ? "" : "-e"
        const cmd = `"${pythonPath}" -m pip install ${pipUserFlag} ${editableFlag} "${nanobotRefPath}" 2>&1`
        execSync(cmd, { encoding: "utf8", timeout: 180_000, cwd: gatewayDir })
        logger.info(`${LOG_PREFIX} nanobot-ref package installed`)
      } catch (err: unknown) {
        const msg = this.formatCommandError(err)
        logger.error(`${LOG_PREFIX} Failed to install nanobot-ref: ${msg}`)
      }
    } else {
      logger.warn(`${LOG_PREFIX} nanobot-ref package not found at runtime: ${nanobotRefPyproject}`)
    }

    // Final verification
    try {
      execSync(`"${pythonPath}" -c "import fastapi; import loguru" 2>&1`, {
        encoding: "utf8",
        timeout: 10_000,
      })
      logger.info(`${LOG_PREFIX} All Python dependencies verified`)
      return pythonPath
    } catch (err: unknown) {
      const msg = this.formatCommandError(err)
      const errStr = `Python dependencies still missing after install. Check logs. Error: ${msg}`
      this.setStatus("error", errStr)
      throw new Error(errStr)
    }
  }

  private getRuntimeVenvDir(): string {
    return path.join(dataFolder, "nanobot-python", ".venv")
  }

  private getRuntimeVenvPythonPath(): string {
    return path.join(this.getRuntimeVenvDir(), "bin", "python3")
  }

  private ensureRuntimeVenv(basePythonPath: string): string {
    const { execSync } = require("child_process")
    const venvDir = this.getRuntimeVenvDir()
    const venvPython = this.getRuntimeVenvPythonPath()

    if (!fs.existsSync(venvPython)) {
      fs.mkdirSync(path.dirname(venvDir), { recursive: true })
      logger.info(`${LOG_PREFIX} Creating runtime Python venv at ${venvDir}`)
      execSync(`"${basePythonPath}" -m venv "${venvDir}" 2>&1`, {
        encoding: "utf8",
        timeout: 120_000,
      })
    }

    // Keep pip/setuptools/wheel reasonably up to date for package installs.
    try {
      execSync(`"${venvPython}" -m pip install --upgrade pip setuptools wheel 2>&1`, {
        encoding: "utf8",
        timeout: 180_000,
      })
    } catch (err: unknown) {
      logger.warn(`${LOG_PREFIX} Failed to upgrade venv packaging tools: ${this.formatCommandError(err)}`)
    }

    logger.info(`${LOG_PREFIX} Using packaged-runtime venv Python: ${venvPython}`)
    return venvPython
  }

  private formatCommandError(err: unknown): string {
    if (!(err instanceof Error)) return String(err)
    const extra = err as Error & { stdout?: string | Buffer; stderr?: string | Buffer }
    const stdout = extra.stdout ? String(extra.stdout) : ""
    const stderr = extra.stderr ? String(extra.stderr) : ""
    const details = [stdout, stderr].filter(Boolean).join("\n").trim()
    return details ? `${err.message}\n${details}` : err.message
  }

  private resolveGatewayScript(): string {
    if (app.isPackaged) {
      const packagedCandidates = [
        path.join(process.resourcesPath, "nanobot", "gateway.py"),
        path.join(process.resourcesPath, "resources", "nanobot", "gateway.py"),
        path.join(
          process.resourcesPath,
          "app.asar.unpacked",
          "resources",
          "nanobot",
          "gateway.py",
        ),
      ]
      const hit = packagedCandidates.find((candidate) => fs.existsSync(candidate))
      return hit || packagedCandidates[packagedCandidates.length - 1]
    }
    return path.join(
      __dirname,
      "..",
      "..",
      "resources",
      "nanobot",
      "gateway.py",
    )
  }

  private resolveNanobotRefPath(): string {
    if (app.isPackaged) {
      const packagedCandidates = [
        path.join(process.resourcesPath, "nanobot-ref"),
        path.join(process.resourcesPath, "resources", "nanobot-ref"),
        path.join(
          process.resourcesPath,
          "app.asar.unpacked",
          "resources",
          "nanobot-ref",
        ),
      ]
      const hit = packagedCandidates.find((candidate) => fs.existsSync(candidate))
      return hit || packagedCandidates[0]
    }
    return path.join(__dirname, "..", "..", "nanobot-ref")
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

    this.restartCount++
    if (this.restartCount > MAX_RESTART_ATTEMPTS) {
      logger.error(
        `${LOG_PREFIX} Max restart attempts (${MAX_RESTART_ATTEMPTS}) reached, giving up. ` +
        `Fix the issue and restart manually.`,
      )
      this.setStatus("error", `Falhou apos ${MAX_RESTART_ATTEMPTS} tentativas. Verifique os logs e reinicie manualmente.`)
      this.emit("error", { message: "Max restart attempts exceeded" })
      return
    }

    logger.info(`${LOG_PREFIX} Scheduling restart ${this.restartCount}/${MAX_RESTART_ATTEMPTS} in ${this.backoffMs}ms`)
    this.emit("restarting", { backoffMs: this.backoffMs, attempt: this.restartCount })

    this.restartTimer = setTimeout(async () => {
      try {
        await this.start(this.callbackPort, this.callbackToken)
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
