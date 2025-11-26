import fs from "fs"
import path from "path"
import { app } from "electron"
import { execFile } from "child_process"
import { configStore, recordingsFolder } from "../config"
import { historyStore } from "../history-store"
import { generateAutoJournalSummaryFromHistory } from "../llm"
import type { AutoJournalRun, RecordingHistoryItem } from "../../shared/types"
import { saveAutoJournalEntry } from "./auto-journal-entry"
import pileIndex from "../pile-utils/pileIndex"
// @ts-ignore - FFmpeg static binary path
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg"

const RUNS_DIR = path.join(recordingsFolder, "auto-journal", "runs")
const GIF_DIR = path.join(recordingsFolder, "auto-journal", "gifs")
const TEMP_DIR = path.join(recordingsFolder, "auto-journal", "tmp")

// Get bundled FFmpeg path
const FFMPEG_PATH = ffmpegInstaller.path

// Helper to get the first available pile path
function getFirstPilePath(): string | null {
  try {
    const userHomeDirectoryPath = app.getPath("home")
    const pilesConfigPath = path.join(userHomeDirectoryPath, "Piles", "piles.json")

    if (!fs.existsSync(pilesConfigPath)) {
      console.log("[auto-journal] piles.json not found at:", pilesConfigPath)
      return null
    }

    const pilesConfig = JSON.parse(fs.readFileSync(pilesConfigPath, "utf-8"))

    // piles.json is an array directly, not an object with a "piles" property
    const piles = Array.isArray(pilesConfig) ? pilesConfig : (pilesConfig.piles || [])

    if (piles.length > 0 && piles[0].path) {
      console.log("[auto-journal] Found pile:", piles[0].name, "at", piles[0].path)
      return piles[0].path
    }

    console.log("[auto-journal] No piles found in piles.json")
    return null
  } catch (error) {
    console.error("[auto-journal] Failed to read piles.json:", error)
    return null
  }
}

let intervalId: NodeJS.Timeout | null = null
let running = false
let nextRunAt: number | null = null
let lastRunAt: number | null = null

/**
 * Check if bundled FFmpeg is available and functional
 */
async function isFfmpegAvailable(): Promise<boolean> {
  if (!FFMPEG_PATH || !fs.existsSync(FFMPEG_PATH)) {
    console.error("[ffmpeg] Bundled binary not found at:", FFMPEG_PATH)
    return false
  }

  return new Promise((resolve) => {
    execFile(FFMPEG_PATH, ["-version"], (error) => {
      if (error) {
        console.error("[ffmpeg] Version check failed:", error)
        resolve(false)
      } else {
        resolve(true)
      }
    })
  })
}

/**
 * Public API: Check if ffmpeg is available
 * Used by main process to verify bundled FFmpeg on startup
 */
export async function checkFfmpegAvailability(): Promise<boolean> {
  return isFfmpegAvailable()
}

async function generateGifFromScreenshots(
  frames: string[],
  outputPath: string,
): Promise<{ path: string | null; error?: string }> {
  if (frames.length === 0) return { path: null }

  // Ensure bundled ffmpeg is available
  const available = await isFfmpegAvailable()
  if (!available) {
    console.warn("[auto-journal] Bundled FFmpeg not available; skipping GIF preview")
    return { path: null, error: "ffmpeg_not_found" }
  }

  try {
    // Create temp list file for concat
    fs.mkdirSync(TEMP_DIR, { recursive: true })
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })

    const listPath = path.join(
      TEMP_DIR,
      `frames-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
    )
    const safeLines = frames
      .filter((f) => fs.existsSync(f))
      .map((f) => `file '${f.replace(/'/g, "'\\''")}'`)
    if (safeLines.length === 0) return { path: null }

    await fs.promises.writeFile(listPath, safeLines.join("\n"), "utf-8")

    await new Promise<void>((resolve, reject) => {
      execFile(
        FFMPEG_PATH,
        [
          "-y",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          listPath,
          "-vf",
          "fps=2,scale=1024:-1:force_original_aspect_ratio=decrease",
          "-loop",
          "0",
          outputPath,
        ],
        (error) => {
          if (error) {
            reject(error)
          } else {
            resolve()
          }
        },
      )
    })

    return { path: fs.existsSync(outputPath) ? outputPath : null }
  } catch (error) {
    console.error("[auto-journal] Failed to generate GIF:", error)
    return { path: null, error: "ffmpeg_failed" }
  } finally {
    // Cleanup list file
    try {
      const files = await fs.promises.readdir(TEMP_DIR)
      for (const file of files) {
        if (file.startsWith("frames-") && file.endsWith(".txt")) {
          const full = path.join(TEMP_DIR, file)
          const stats = await fs.promises.stat(full)
          // Remove files older than ~10 minutes
          if (Date.now() - stats.mtimeMs > 10 * 60 * 1000) {
            await fs.promises.unlink(full)
          }
        }
      }
    } catch {}
  }
}

function ensureRunsDir() {
  fs.mkdirSync(RUNS_DIR, { recursive: true })
}

async function writeRun(run: AutoJournalRun) {
  ensureRunsDir()
  const file = path.join(RUNS_DIR, `${run.id}.json`)
  await fs.promises.writeFile(file, JSON.stringify(run, null, 2), "utf-8")
}

async function addEntryToIndex(pilePath: string, relativePath: string) {
  try {
    await pileIndex.load(pilePath)
    pileIndex.add(relativePath)
    console.log("[auto-journal] Indexed entry:", relativePath)
  } catch (error) {
    console.error("[auto-journal] Failed to index entry", error)
  }
}

export async function runAutoJournalOnce(windowMinutes?: number) {
  if (running) {
    console.log("[auto-journal] Run already in progress, skipping")
    return null
  }
  running = true
  const startedAt = Date.now()
  lastRunAt = startedAt
  const cfg = configStore.get()
  const wm = windowMinutes ?? cfg.autoJournalWindowMinutes ?? 60
  const windowMs = wm * 60 * 1000
  const windowStartTs = Date.now() - windowMs
  const windowEndTs = Date.now()
  const id = `${startedAt}`

  console.log(`[auto-journal] Starting run ${id} with window ${wm} min`)
  console.log(`[auto-journal] Auto-save enabled: ${cfg.autoJournalAutoSaveEnabled}, target pile: ${cfg.autoJournalTargetPilePath || '(not set)'}`)

  try {
    const history = historyStore.readAll()
    // Filter window items once for reuse (LLM + media)
    const windowItems: RecordingHistoryItem[] = history
      .filter(
        (item) =>
          typeof item.createdAt === "number" &&
          item.createdAt >= windowStartTs &&
          item.createdAt <= windowEndTs &&
          item.transcript &&
          item.transcript.trim().length > 0,
      )
      .sort((a, b) => a.createdAt - b.createdAt)

    const summary = await generateAutoJournalSummaryFromHistory(history, {
      windowMinutes: wm,
      promptOverride: cfg.autoJournalPrompt,
    })

    const run: AutoJournalRun = {
      id,
      startedAt,
      finishedAt: Date.now(),
      status: "success",
      windowMinutes: wm,
      summary,
      screenshotCount: windowItems.filter(
        (i) => i.contextScreenshotPath && fs.existsSync(i.contextScreenshotPath),
      ).length,
      autoSaved: false,
    }

    // Build animated GIF from screenshots in window (best-effort, non-blocking)
    const framePaths = windowItems
      .map((i) => i.contextScreenshotPath)
      .filter((p): p is string => Boolean(p && fs.existsSync(p)))
    if (framePaths.length > 0) {
      try {
        const gifPath = path.join(GIF_DIR, `${id}.gif`)
        const generated = await generateGifFromScreenshots(framePaths, gifPath)
        if (generated.path) {
          run.previewGifPath = generated.path
        } else if (generated.error) {
          run.gifError = generated.error
        }
      } catch (error) {
        console.error("[auto-journal] GIF generation failed:", error)
        run.gifError = "gif_generation_failed"
      }
    }

    console.log(`[auto-journal] Run ${id} completed successfully in ${Date.now() - startedAt}ms`)

    // Check if there's actual content to save (not just "No recordings found" message)
    const hasRealContent =
      summary.activities &&
      summary.activities.length > 0 &&
      !summary.summary.includes("No recordings found in the selected time window")

    if (cfg.autoJournalAutoSaveEnabled) {
      if (!hasRealContent) {
        console.log("[auto-journal] No recordings found in window, skipping auto-save")
      } else {
        // Use configured target pile, or fall back to first available pile
        let pilePath: string | null | undefined = cfg.autoJournalTargetPilePath
        if (!pilePath || pilePath.trim().length === 0) {
          pilePath = getFirstPilePath()
          console.log(`[auto-journal] No target pile configured, using first available: ${pilePath}`)
        }

        if (pilePath && pilePath.trim().length > 0) {
          try {
            const result = await saveAutoJournalEntry({
              pilePath,
              summary: summary.summary,
              activities: summary.activities || [],
              windowStartTs: summary.windowStartTs,
              windowEndTs: summary.windowEndTs,
              highlight: summary.highlight ?? null,
            })
            await addEntryToIndex(pilePath, result.relativePath)
            run.autoSaved = true
            console.log(
              `[auto-journal] Auto-saved summary to pile: ${pilePath} (run ${id})`,
            )
          } catch (error) {
            console.error("[auto-journal] Failed to auto-save entry", error)
          }
        } else {
          console.warn(
            "[auto-journal] Auto-save enabled but no pile available; skipping save",
          )
        }
      }
    } else {
      console.log("[auto-journal] Auto-save disabled, skipping save")
    }

    await writeRun(run)
    return run
  } catch (error: any) {
    console.error(`[auto-journal] Run ${id} failed:`, error?.message || error)
    const run: AutoJournalRun = {
      id,
      startedAt,
      finishedAt: Date.now(),
      status: "error",
      windowMinutes: windowMinutes ?? cfg.autoJournalWindowMinutes ?? 60,
      error: error?.message || String(error),
    }
    await writeRun(run)
    return run
  } finally {
    running = false
  }
}

export async function listAutoJournalRuns(limit = 50): Promise<AutoJournalRun[]> {
  ensureRunsDir()
  const files = fs.readdirSync(RUNS_DIR).filter((f) => f.endsWith(".json"))
  const sorted = files.sort((a, b) => Number(b.replace(".json", "")) - Number(a.replace(".json", "")))
  const selected = sorted.slice(0, limit)
  const runs: AutoJournalRun[] = []
  for (const file of selected) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(RUNS_DIR, file), "utf-8")) as AutoJournalRun
      runs.push(data)
    } catch {}
  }
  return runs
}

export function startAutoJournalScheduler(runImmediately = false) {
  const cfg = configStore.get()

  // Always stop existing scheduler first
  stopAutoJournalScheduler()

  if (!cfg.autoJournalEnabled) {
    console.log("[auto-journal] Scheduler disabled in config")
    return
  }

  const wm = cfg.autoJournalWindowMinutes ?? 60
  const periodMs = wm * 60 * 1000

  // Calculate next run time
  nextRunAt = Date.now() + periodMs

  intervalId = setInterval(() => {
    console.log(`[auto-journal] Scheduled run triggered at ${new Date().toLocaleTimeString()}`)
    nextRunAt = Date.now() + periodMs
    runAutoJournalOnce().catch((err) => console.error("[auto-journal] scheduled run failed", err))
  }, periodMs)

  console.log(`[auto-journal] Scheduler started. Window ${wm} min, period ${periodMs / 60000} min`)
  console.log(`[auto-journal] Next run at: ${new Date(nextRunAt).toLocaleTimeString()}`)

  // Run immediately if requested (e.g., when user enables the scheduler)
  if (runImmediately) {
    console.log("[auto-journal] Running immediately as requested")
    runAutoJournalOnce().catch((err) => console.error("[auto-journal] immediate run failed", err))
  }
}

export function stopAutoJournalScheduler() {
  if (intervalId) {
    clearInterval(intervalId)
    console.log("[auto-journal] Scheduler stopped")
  }
  intervalId = null
  nextRunAt = null
}

export function restartAutoJournalScheduler(runImmediately = false) {
  console.log("[auto-journal] Restarting scheduler...")
  startAutoJournalScheduler(runImmediately)
}

export function getSchedulerStatus() {
  const cfg = configStore.get()
  return {
    enabled: cfg.autoJournalEnabled ?? false,
    running: intervalId !== null,
    isProcessing: running,
    nextRunAt,
    lastRunAt,
    windowMinutes: cfg.autoJournalWindowMinutes ?? 60,
    autoSaveEnabled: cfg.autoJournalAutoSaveEnabled ?? false,
    targetPilePath: cfg.autoJournalTargetPilePath ?? "",
  }
}
