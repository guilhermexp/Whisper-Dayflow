import path from "path"
import fs from "fs"
import { configStore, recordingsFolder } from "../config"
import { screenCaptureService } from "./screen-capture-service"
import type { PeriodicScreenshot } from "@shared/types"

// ============================================================================
// CONSTANTS
// ============================================================================

const PERIODIC_SCREENSHOTS_DIR = path.join(recordingsFolder, "periodic-screenshots")
const INDEX_FILE = path.join(PERIODIC_SCREENSHOTS_DIR, "index.json")
const RETENTION_DAYS = 7

// ============================================================================
// STATE
// ============================================================================

let intervalId: NodeJS.Timeout | null = null
let isCapturing = false
let nextCaptureAt: number | null = null
let lastCaptureAt: number | null = null

// ============================================================================
// STORAGE
// ============================================================================

function ensureDirectoryExists(): void {
  fs.mkdirSync(PERIODIC_SCREENSHOTS_DIR, { recursive: true })
}

function readIndex(): PeriodicScreenshot[] {
  try {
    if (fs.existsSync(INDEX_FILE)) {
      return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"))
    }
  } catch (error) {
    console.error("[PeriodicScreenshot] Failed to read index:", error)
  }
  return []
}

function writeIndex(screenshots: PeriodicScreenshot[]): void {
  ensureDirectoryExists()
  const tmpPath = `${INDEX_FILE}.tmp`
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(screenshots, null, 2), "utf8")
    fs.renameSync(tmpPath, INDEX_FILE)
  } catch (error) {
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath)
    }
    throw error
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function formatDatePath(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatTimeFilename(timestamp: number, id: string): string {
  const date = new Date(timestamp)
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  const seconds = String(date.getSeconds()).padStart(2, "0")
  return `${hours}${minutes}${seconds}-${id}.png`
}

// ============================================================================
// CLEANUP (7 days retention)
// ============================================================================

export function cleanupOldScreenshots(): void {
  const cutoffTime = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
  const screenshots = readIndex()

  const toDelete = screenshots.filter((s) => s.capturedAt < cutoffTime)
  const toKeep = screenshots.filter((s) => s.capturedAt >= cutoffTime)

  if (toDelete.length === 0) {
    return
  }

  console.log(`[PeriodicScreenshot] Cleaning up ${toDelete.length} old screenshots (> ${RETENTION_DAYS} days)`)

  // Delete image files
  for (const screenshot of toDelete) {
    try {
      if (fs.existsSync(screenshot.imagePath)) {
        fs.unlinkSync(screenshot.imagePath)
      }
    } catch (error) {
      console.warn(`[PeriodicScreenshot] Failed to delete ${screenshot.imagePath}:`, error)
    }
  }

  // Clean up empty date directories
  try {
    const dateDirs = fs.readdirSync(PERIODIC_SCREENSHOTS_DIR).filter((name) => {
      const fullPath = path.join(PERIODIC_SCREENSHOTS_DIR, name)
      return fs.statSync(fullPath).isDirectory()
    })

    for (const dir of dateDirs) {
      const dirPath = path.join(PERIODIC_SCREENSHOTS_DIR, dir)
      const files = fs.readdirSync(dirPath)
      if (files.length === 0) {
        fs.rmdirSync(dirPath)
        console.log(`[PeriodicScreenshot] Removed empty directory: ${dir}`)
      }
    }
  } catch (error) {
    console.warn("[PeriodicScreenshot] Failed to clean empty directories:", error)
  }

  // Update index
  writeIndex(toKeep)
  console.log(`[PeriodicScreenshot] Cleanup complete. Kept ${toKeep.length} screenshots.`)
}

// ============================================================================
// CAPTURE
// ============================================================================

async function captureScreenshot(): Promise<PeriodicScreenshot | null> {
  if (isCapturing) {
    console.log("[PeriodicScreenshot] Already capturing, skipping...")
    return null
  }

  isCapturing = true

  try {
    const id = generateId()
    const timestamp = Date.now()
    const datePath = formatDatePath(timestamp)
    const filename = formatTimeFilename(timestamp, id)
    const imagePath = path.join(PERIODIC_SCREENSHOTS_DIR, datePath, filename)

    console.log(`[PeriodicScreenshot] Capturing screenshot...`)

    const result = await screenCaptureService.captureAndExtractText(imagePath)

    if (!result) {
      console.warn("[PeriodicScreenshot] Capture returned null")
      return null
    }

    const screenshot: PeriodicScreenshot = {
      id,
      capturedAt: timestamp,
      imagePath: result.imagePath || imagePath,
      windowTitle: result.windowTitle,
      appName: result.appName,
      ocrText: result.text,
    }

    // Add to index
    const screenshots = readIndex()
    screenshots.push(screenshot)
    writeIndex(screenshots)

    lastCaptureAt = timestamp
    console.log(`[PeriodicScreenshot] Captured: ${screenshot.appName} - ${screenshot.windowTitle}`)

    // Run cleanup in background (non-blocking)
    setImmediate(() => {
      try {
        cleanupOldScreenshots()
      } catch (error) {
        console.error("[PeriodicScreenshot] Cleanup error:", error)
      }
    })

    return screenshot
  } catch (error) {
    console.error("[PeriodicScreenshot] Capture failed:", error)
    return null
  } finally {
    isCapturing = false
  }
}

// ============================================================================
// SCHEDULER
// ============================================================================

export function startPeriodicScreenshotScheduler(): void {
  const config = configStore.get()

  // Stop existing scheduler first
  stopPeriodicScreenshotScheduler()

  if (!config.periodicScreenshotEnabled) {
    console.log("[PeriodicScreenshot] Scheduler disabled by config")
    return
  }

  const intervalMinutes = config.periodicScreenshotIntervalMinutes || 60
  const intervalMs = intervalMinutes * 60 * 1000

  console.log(`[PeriodicScreenshot] Starting scheduler with ${intervalMinutes}min interval`)

  // Ensure directory exists
  ensureDirectoryExists()

  // Run cleanup on startup
  cleanupOldScreenshots()

  // Calculate next capture time
  nextCaptureAt = Date.now() + intervalMs

  // Start interval
  intervalId = setInterval(async () => {
    await captureScreenshot()
    nextCaptureAt = Date.now() + intervalMs
  }, intervalMs)

  console.log(`[PeriodicScreenshot] Next capture at: ${new Date(nextCaptureAt).toLocaleTimeString()}`)
}

export function stopPeriodicScreenshotScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    nextCaptureAt = null
    console.log("[PeriodicScreenshot] Scheduler stopped")
  }
}

export function restartPeriodicScreenshotScheduler(): void {
  console.log("[PeriodicScreenshot] Restarting scheduler...")
  startPeriodicScreenshotScheduler()
}

// ============================================================================
// PUBLIC API
// ============================================================================

export interface PeriodicScreenshotStatus {
  enabled: boolean
  running: boolean
  isCapturing: boolean
  intervalMinutes: number
  nextCaptureAt: number | null
  lastCaptureAt: number | null
  totalScreenshots: number
}

export function getPeriodicScreenshotStatus(): PeriodicScreenshotStatus {
  const config = configStore.get()
  const screenshots = readIndex()

  return {
    enabled: config.periodicScreenshotEnabled || false,
    running: intervalId !== null,
    isCapturing,
    intervalMinutes: config.periodicScreenshotIntervalMinutes || 60,
    nextCaptureAt,
    lastCaptureAt,
    totalScreenshots: screenshots.length,
  }
}

export async function capturePeriodicScreenshotNow(): Promise<PeriodicScreenshot | null> {
  console.log("[PeriodicScreenshot] Manual capture triggered")
  return captureScreenshot()
}

export function listPeriodicScreenshots(limit?: number): PeriodicScreenshot[] {
  const screenshots = readIndex()

  // Sort by capturedAt descending (newest first)
  screenshots.sort((a, b) => b.capturedAt - a.capturedAt)

  if (limit && limit > 0) {
    return screenshots.slice(0, limit)
  }

  return screenshots
}

export function listPeriodicScreenshotsInRange(
  startTs: number,
  endTs: number,
): PeriodicScreenshot[] {
  const screenshots = readIndex()

  return screenshots
    .filter((s) => s.capturedAt >= startTs && s.capturedAt <= endTs)
    .sort((a, b) => a.capturedAt - b.capturedAt) // Chronological order
}

export function deletePeriodicScreenshot(id: string): boolean {
  const screenshots = readIndex()
  const screenshot = screenshots.find((s) => s.id === id)

  if (!screenshot) {
    console.warn(`[PeriodicScreenshot] Screenshot not found: ${id}`)
    return false
  }

  // Delete image file
  try {
    if (fs.existsSync(screenshot.imagePath)) {
      fs.unlinkSync(screenshot.imagePath)
    }
  } catch (error) {
    console.warn(`[PeriodicScreenshot] Failed to delete image:`, error)
  }

  // Update index
  const updated = screenshots.filter((s) => s.id !== id)
  writeIndex(updated)

  console.log(`[PeriodicScreenshot] Deleted screenshot: ${id}`)
  return true
}

export function getPeriodicScreenshotsDir(): string {
  return PERIODIC_SCREENSHOTS_DIR
}
