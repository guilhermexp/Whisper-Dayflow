/**
 * Centralized logging module for Liv
 *
 * Provides persistent file logging that survives app crashes.
 * Logs are saved to:
 * - macOS: ~/Library/Logs/Liv/main.log
 * - Windows: %USERPROFILE%\AppData\Roaming\Liv\logs\main.log
 * - Linux: ~/.config/Liv/logs/main.log
 */

import log from "electron-log"
import { app } from "electron"
import path from "path"

// Configure log file location and format
log.transports.file.level = "info"
log.transports.file.maxSize = 10 * 1024 * 1024 // 10MB max per file
log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}"

// Keep last 3 log files for rotation
log.transports.file.archiveLogFn = (oldLogFile) => {
  const info = path.parse(oldLogFile.path)
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  return path.join(info.dir, `${info.name}.${timestamp}${info.ext}`)
}

// Console transport for development
log.transports.console.level = app.isPackaged ? false : "debug"
log.transports.console.format = "[{level}] {text}"

// Error serialization for better stack traces
log.errorHandler.startCatching({
  showDialog: false, // Don't show native error dialogs
  onError: ({ error, versions }) => {
    log.error("=== UNCAUGHT ERROR ===")
    log.error("Error:", error?.message || error)
    log.error("Stack:", error?.stack)
    log.error("Versions:", versions)
    log.error("======================")
    // Return false to not show dialog
    return false
  },
})

// Capture unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  log.error("=== UNHANDLED REJECTION ===")
  log.error("Reason:", reason)
  log.error("Promise:", promise)
  log.error("===========================")
})

// Capture uncaught exceptions (backup in case errorHandler misses any)
process.on("uncaughtException", (error, origin) => {
  log.error("=== UNCAUGHT EXCEPTION ===")
  log.error("Error:", error?.message || error)
  log.error("Stack:", error?.stack)
  log.error("Origin:", origin)
  log.error("==========================")
})

// Log app lifecycle events
app.on("will-quit", () => {
  log.info("App will-quit event triggered")
})

app.on("before-quit", () => {
  log.info("App before-quit event triggered")
})

app.on("quit", (_event, exitCode) => {
  log.info(`App quit with exit code: ${exitCode}`)
})

// Renderer process crash (covers GPU crashes too in modern Electron)
app.on("render-process-gone", (_event, _webContents, details) => {
  log.error("=== RENDERER PROCESS GONE ===")
  log.error("Reason:", details.reason)
  log.error("Exit code:", details.exitCode)
  log.error("=============================")
})

// Child process crash
app.on("child-process-gone", (_event, details) => {
  log.error("=== CHILD PROCESS GONE ===")
  log.error("Type:", details.type)
  log.error("Reason:", details.reason)
  log.error("Exit code:", details.exitCode)
  log.error("Service name:", details.serviceName)
  log.error("===========================")
})

// Export configured logger
export const logger = log

// Convenience exports matching console API
export const logInfo = log.info.bind(log)
export const logWarn = log.warn.bind(log)
export const logError = log.error.bind(log)
export const logDebug = log.debug.bind(log)

// Get log file path for user reference
export const getLogFilePath = (): string => {
  return log.transports.file.getFile()?.path || "unknown"
}

// Helper to log with context
export const logWithContext = (context: string) => ({
  info: (...args: unknown[]) => log.info(`[${context}]`, ...args),
  warn: (...args: unknown[]) => log.warn(`[${context}]`, ...args),
  error: (...args: unknown[]) => log.error(`[${context}]`, ...args),
  debug: (...args: unknown[]) => log.debug(`[${context}]`, ...args),
})

// Log startup info
logger.info("=================================")
logger.info("Liv app starting...")
logger.info(`Version: ${app.getVersion()}`)
logger.info(`Electron: ${process.versions.electron}`)
logger.info(`Chrome: ${process.versions.chrome}`)
logger.info(`Node: ${process.versions.node}`)
logger.info(`Platform: ${process.platform} ${process.arch}`)
logger.info(`Packaged: ${app.isPackaged}`)
logger.info(`Log file: ${getLogFilePath()}`)
logger.info("=================================")
