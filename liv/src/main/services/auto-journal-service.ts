import fs from "fs"
import path from "path"
import { app } from "electron"
import { execFile, exec } from "child_process"
import { createRequire } from "module"
import { configStore, recordingsFolder } from "../config"
import { historyStore } from "../history-store"
import { generateAutoJournalSummaryFromHistory } from "../llm"
import type { AutoJournalRun, RecordingHistoryItem } from "../../shared/types"
import { saveAutoJournalEntry } from "./auto-journal-entry"
import { logWithContext } from "../logger"

const autoJournalLog = logWithContext("AutoJournal")
import pileIndex from "../pile-utils/pileIndex"
import { listPeriodicScreenshotsInRange } from "./periodic-screenshot-service"
import { refreshAutonomousKanban } from "./autonomous-kanban-service"
import { refreshAutonomousProfile } from "./autonomous-profile-service"
import { listScreenSessionSamplesInRange } from "./screen-session-recording-service"

const RUNS_DIR = path.join(recordingsFolder, "auto-journal", "runs")
export const GIF_DIR = path.join(recordingsFolder, "auto-journal", "gifs")
const TEMP_DIR = path.join(recordingsFolder, "auto-journal", "tmp")

// FFmpeg path - try system ffmpeg first, then bundled
let FFMPEG_PATH: string | null = null
const requireForFfmpeg = createRequire(import.meta.url)

// Try to find ffmpeg
async function findFfmpeg(): Promise<string | null> {
  // Common system paths
  const systemPaths = [
    "/usr/local/bin/ffmpeg",
    "/opt/homebrew/bin/ffmpeg",
    "/usr/bin/ffmpeg",
  ]

  for (const p of systemPaths) {
    if (fs.existsSync(p)) {
      console.log("[ffmpeg] Found system ffmpeg at:", p)
      return p
    }
  }

  // Try bundled ffmpeg from dependency (@ffmpeg-installer/ffmpeg)
  try {
    const bundled = requireForFfmpeg("@ffmpeg-installer/ffmpeg") as {
      path?: string
    }
    if (bundled?.path && fs.existsSync(bundled.path)) {
      console.log("[ffmpeg] Found bundled ffmpeg at:", bundled.path)
      return bundled.path
    }
  } catch (error) {
    console.warn("[ffmpeg] Bundled ffmpeg not available:", error)
  }

  // Try which command
  return new Promise((resolve) => {
    exec("which ffmpeg", (error, stdout) => {
      if (!error && stdout.trim()) {
        console.log("[ffmpeg] Found ffmpeg via which:", stdout.trim())
        resolve(stdout.trim())
      } else {
        console.log("[ffmpeg] No ffmpeg found on system")
        resolve(null)
      }
    })
  })
}

// Initialize ffmpeg path
findFfmpeg().then((p) => {
  FFMPEG_PATH = p
})

// Helper to get the first available pile path
function getFirstPilePath(): string | null {
  const parsePilesConfig = (configPath: string): string | null => {
    try {
      if (!fs.existsSync(configPath)) {
        return null
      }

      const pilesConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"))
      const piles = Array.isArray(pilesConfig)
        ? pilesConfig
        : pilesConfig.piles || []

      for (const pile of piles) {
        const pilePath = typeof pile?.path === "string" ? pile.path : ""
        if (pilePath && fs.existsSync(pilePath)) {
          console.log(
            "[auto-journal] Found pile from config:",
            pile?.name || "(unnamed)",
            "at",
            pilePath,
          )
          return pilePath
        }
      }
      return null
    } catch (error) {
      console.error("[auto-journal] Failed to parse piles config:", configPath, error)
      return null
    }
  }

  const findFirstPileInDefaultFolder = (livFolder: string): string | null => {
    try {
      if (!fs.existsSync(livFolder)) return null
      const entries = fs.readdirSync(livFolder, { withFileTypes: true })
      const pileDirs = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(livFolder, entry.name))
        .filter((dirPath) => fs.existsSync(dirPath))

      if (pileDirs.length === 0) return null

      // Prefer most recently modified pile folder
      pileDirs.sort(
        (a, b) =>
          fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs,
      )

      console.log("[auto-journal] Found pile from default Liv folder:", pileDirs[0])
      return pileDirs[0]
    } catch (error) {
      console.error(
        "[auto-journal] Failed to inspect default Liv folder:",
        livFolder,
        error,
      )
      return null
    }
  }

  try {
    const homeDirectoryPath = app.getPath("home")
    const documentsDirectoryPath = app.getPath("documents")

    // Try known config locations first
    const configCandidates = [
      path.join(homeDirectoryPath, "Piles", "piles.json"),
      path.join(documentsDirectoryPath, "Piles", "piles.json"),
    ]

    for (const candidate of configCandidates) {
      const pilePath = parsePilesConfig(candidate)
      if (pilePath) return pilePath
    }

    // Fallback: look for pile folders in ~/Documents/Liv
    const livFolderCandidates = [
      path.join(documentsDirectoryPath, "Liv"),
      path.join(homeDirectoryPath, "Documents", "Liv"),
    ]
    for (const livFolder of livFolderCandidates) {
      const pilePath = findFirstPileInDefaultFolder(livFolder)
      if (pilePath) return pilePath
    }

    console.log("[auto-journal] No pile path found from config or default folders")
    return null
  } catch (error) {
    console.error("[auto-journal] Failed to resolve fallback pile path:", error)
    return null
  }
}

let intervalId: NodeJS.Timeout | null = null
let running = false
let nextRunAt: number | null = null
let lastRunAt: number | null = null

function isNoRecordingsSummary(summary: string | undefined): boolean {
  if (!summary) return true
  const normalized = summary.trim().toLowerCase()
  return normalized.includes("no recordings found in the selected time window")
}

/**
 * Check if FFmpeg is available and functional
 */
async function isFfmpegAvailable(): Promise<boolean> {
  // Try to find ffmpeg if not already found
  if (!FFMPEG_PATH) {
    FFMPEG_PATH = await findFfmpeg()
  }

  if (!FFMPEG_PATH) {
    console.error("[ffmpeg] No ffmpeg found on system")
    return false
  }

  return new Promise((resolve) => {
    execFile(FFMPEG_PATH!, ["-version"], (error) => {
      if (error) {
        console.error("[ffmpeg] Version check failed:", error)
        resolve(false)
      } else {
        console.log("[ffmpeg] Available at:", FFMPEG_PATH)
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

  const available = await isFfmpegAvailable()
  if (!available) {
    console.warn(
      "[auto-journal] Bundled FFmpeg not available; skipping GIF preview",
    )
    return { path: null, error: "ffmpeg_not_found" }
  }

  // Normalize frames and copy to a temp folder with sequential names for ffmpeg
  const tmpDir = path.join(
    TEMP_DIR,
    `gif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  try {
    fs.mkdirSync(tmpDir, { recursive: true })
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })

    const seqFrames: string[] = []
    let idx = 1
    for (const f of frames) {
      if (!f || !fs.existsSync(f)) continue
      const target = path.join(
        tmpDir,
        `frame-${String(idx).padStart(4, "0")}.png`,
      )
      fs.copyFileSync(f, target)
      seqFrames.push(target)
      idx++
    }

    if (seqFrames.length === 0) return { path: null }

    await new Promise<void>((resolve, reject) => {
      if (!FFMPEG_PATH) {
        reject(new Error("FFmpeg not available"))
        return
      }
      execFile(
        FFMPEG_PATH,
        [
          "-y",
          "-framerate",
          "2",
          "-i",
          path.join(tmpDir, "frame-%04d.png"),
          "-vf",
          "scale=1024:-1:force_original_aspect_ratio=decrease",
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

    const ok = fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0
    if (!ok) {
      return { path: null, error: "ffmpeg_empty_output" }
    }

    return { path: outputPath }
  } catch (error) {
    console.error("[auto-journal] Failed to generate GIF:", error)
    return { path: null, error: "ffmpeg_failed" }
  } finally {
    // Cleanup temp files
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true })
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

export async function deleteAutoJournalRun(runId: string): Promise<boolean> {
  try {
    const runFile = path.join(RUNS_DIR, `${runId}.json`)
    const gifFile = path.join(GIF_DIR, `${runId}.gif`)

    // Delete run JSON
    if (fs.existsSync(runFile)) {
      await fs.promises.unlink(runFile)
      console.log("[auto-journal] Deleted run file:", runFile)
    }

    // Delete associated GIF if exists
    if (fs.existsSync(gifFile)) {
      await fs.promises.unlink(gifFile)
      console.log("[auto-journal] Deleted GIF file:", gifFile)
    }

    return true
  } catch (error) {
    console.error("[auto-journal] Failed to delete run:", runId, error)
    return false
  }
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
  console.log(
    `[auto-journal] Auto-save enabled: ${cfg.autoJournalAutoSaveEnabled}, target pile: ${cfg.autoJournalTargetPilePath || "(not set)"}`,
  )

  try {
    const history = historyStore.readAll()
    const sourceMode = cfg.autoJournalSourceMode ?? "both"

    const audioWindowItems: RecordingHistoryItem[] = history
      .filter(
        (item) =>
          typeof item.createdAt === "number" &&
          item.createdAt >= windowStartTs &&
          item.createdAt <= windowEndTs &&
          item.transcript &&
          item.transcript.trim().length > 0,
      )
      .sort((a, b) => a.createdAt - b.createdAt)

    const videoSamples = listScreenSessionSamplesInRange(
      windowStartTs,
      windowEndTs,
      800,
    )

    const videoWindowItems: RecordingHistoryItem[] = videoSamples.map(
      (sample, index) => ({
        id: `video-${sample.timestamp}-${index}`,
        createdAt: sample.timestamp,
        duration: 1000,
        transcript: `Visual: ${sample.appName} - ${sample.windowTitle}`,
        filePath: sample.imagePath,
        contextScreenshotPath: sample.imagePath,
        contextCapturedAt: sample.timestamp,
        contextScreenAppName: sample.appName,
        contextScreenWindowTitle: sample.windowTitle,
      }),
    )

    const summaryInputHistory =
      sourceMode === "audio"
        ? audioWindowItems
        : sourceMode === "video"
          ? videoWindowItems
          : [...audioWindowItems, ...videoWindowItems].sort(
              (a, b) => a.createdAt - b.createdAt,
            )

    const summary = await generateAutoJournalSummaryFromHistory(
      summaryInputHistory,
      {
        windowMinutes: wm,
        promptOverride: cfg.autoJournalPrompt,
        pipeline: sourceMode === "video" ? "video" : "default",
      },
    )

    // Collect screenshots from recordings
    const recordingScreenshots = audioWindowItems
      .filter((i) => i.contextScreenshotPath && fs.existsSync(i.contextScreenshotPath))
      .map((i) => ({
        path: i.contextScreenshotPath!,
        timestamp: i.createdAt,
      }))

    // Collect periodic screenshots (independent of recordings)
    const periodicScreenshots = listPeriodicScreenshotsInRange(windowStartTs, windowEndTs)
      .filter((s) => fs.existsSync(s.imagePath))
      .map((s) => ({
        path: s.imagePath,
        timestamp: s.capturedAt,
      }))

    const videoFrames = videoSamples
      .filter((sample) => sample.imagePath && fs.existsSync(sample.imagePath))
      .map((sample) => ({
        path: sample.imagePath,
        timestamp: sample.timestamp,
      }))

    // Combine and sort all screenshots by timestamp
    const allScreenshots = [
      ...recordingScreenshots,
      ...periodicScreenshots,
      ...videoFrames,
    ]
      .sort((a, b) => a.timestamp - b.timestamp)

    const MAX_PREVIEW_FRAMES = 240
    const previewScreenshots =
      allScreenshots.length > MAX_PREVIEW_FRAMES
        ? allScreenshots.filter(
            (_, index) =>
              index %
                Math.ceil(allScreenshots.length / MAX_PREVIEW_FRAMES) ===
              0,
          )
        : allScreenshots

    const run: AutoJournalRun = {
      id,
      startedAt,
      finishedAt: Date.now(),
      status: "success",
      windowMinutes: wm,
      summary,
      screenshotCount: allScreenshots.length,
      autoSaved: false,
    }

    // Build animated GIF from all screenshots in window (best-effort, non-blocking)
    const framePaths = previewScreenshots.map((s) => s.path)
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

    console.log(
      `[auto-journal] Run ${id} completed successfully in ${Date.now() - startedAt}ms`,
    )

    // Content exists whenever we had recordings in the time window and the
    // returned summary is not the explicit empty-window placeholder.
    const hasRealContent =
      summaryInputHistory.length > 0 && !isNoRecordingsSummary(summary.summary)

    // Skip saving empty runs entirely - don't clutter the history with "Vazio" entries
    if (!hasRealContent) {
      console.log(
        "[auto-journal] No recordings found in window, skipping run save entirely",
      )
      return null
    }

    if (cfg.autoJournalAutoSaveEnabled) {
      // Use configured target pile, or fall back to first available pile
      let pilePath: string | null | undefined = cfg.autoJournalTargetPilePath
      if (!pilePath || pilePath.trim().length === 0) {
        pilePath = getFirstPilePath()
        console.log(
          `[auto-journal] No target pile configured, using first available: ${pilePath}`,
        )
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
    } else {
      console.log("[auto-journal] Auto-save disabled, skipping save")
    }

    await writeRun(run)

    // Keep kanban boards synchronized with newly generated activity summaries.
    refreshAutonomousKanban().catch((error) => {
      autoJournalLog.error("Failed to refresh autonomous kanban", error)
    })
    refreshAutonomousProfile().catch((error) => {
      autoJournalLog.error("Failed to refresh autonomous profile", error)
    })

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

export async function runAutoJournalForRange(input: {
  windowStartTs: number
  windowEndTs: number
}) {
  if (running) {
    console.log("[auto-journal] Run already in progress, skipping")
    return null
  }
  running = true
  const startedAt = Date.now()
  lastRunAt = startedAt
  const cfg = configStore.get()
  const windowStartTs = Math.max(0, Math.floor(input.windowStartTs))
  const windowEndTs = Math.max(windowStartTs, Math.floor(input.windowEndTs))
  const wm = Math.max(1, Math.ceil((windowEndTs - windowStartTs) / 60000))
  const id = `${startedAt}`

  console.log(
    `[auto-journal] Starting explicit range run ${id} (${new Date(windowStartTs).toISOString()} - ${new Date(windowEndTs).toISOString()})`,
  )

  try {
    const history = historyStore.readAll()
    const sourceMode = cfg.autoJournalSourceMode ?? "both"

    const audioWindowItems: RecordingHistoryItem[] = history
      .filter(
        (item) =>
          typeof item.createdAt === "number" &&
          item.createdAt >= windowStartTs &&
          item.createdAt <= windowEndTs &&
          item.transcript &&
          item.transcript.trim().length > 0,
      )
      .sort((a, b) => a.createdAt - b.createdAt)

    const videoSamples = listScreenSessionSamplesInRange(
      windowStartTs,
      windowEndTs,
      800,
    )

    const videoWindowItems: RecordingHistoryItem[] = videoSamples.map(
      (sample, index) => ({
        id: `video-${sample.timestamp}-${index}`,
        createdAt: sample.timestamp,
        duration: 1000,
        transcript: `Visual: ${sample.appName} - ${sample.windowTitle}`,
        filePath: sample.imagePath,
        contextScreenshotPath: sample.imagePath,
        contextCapturedAt: sample.timestamp,
        contextScreenAppName: sample.appName,
        contextScreenWindowTitle: sample.windowTitle,
      }),
    )

    const summaryInputHistory =
      sourceMode === "audio"
        ? audioWindowItems
        : sourceMode === "video"
          ? videoWindowItems
          : [...audioWindowItems, ...videoWindowItems].sort(
              (a, b) => a.createdAt - b.createdAt,
            )

    const summary = await generateAutoJournalSummaryFromHistory(
      summaryInputHistory,
      {
        windowMinutes: wm,
        promptOverride: cfg.autoJournalPrompt,
        pipeline: sourceMode === "video" ? "video" : "default",
      },
    )

    const recordingScreenshots = audioWindowItems
      .filter(
        (i) => i.contextScreenshotPath && fs.existsSync(i.contextScreenshotPath),
      )
      .map((i) => ({
        path: i.contextScreenshotPath!,
        timestamp: i.createdAt,
      }))

    const periodicScreenshots = listPeriodicScreenshotsInRange(
      windowStartTs,
      windowEndTs,
    )
      .filter((s) => fs.existsSync(s.imagePath))
      .map((s) => ({
        path: s.imagePath,
        timestamp: s.capturedAt,
      }))

    const videoFrames = videoSamples
      .filter((sample) => sample.imagePath && fs.existsSync(sample.imagePath))
      .map((sample) => ({
        path: sample.imagePath,
        timestamp: sample.timestamp,
      }))

    const allScreenshots = [
      ...recordingScreenshots,
      ...periodicScreenshots,
      ...videoFrames,
    ].sort((a, b) => a.timestamp - b.timestamp)

    const MAX_PREVIEW_FRAMES = 240
    const previewScreenshots =
      allScreenshots.length > MAX_PREVIEW_FRAMES
        ? allScreenshots.filter(
            (_, index) =>
              index %
                Math.ceil(allScreenshots.length / MAX_PREVIEW_FRAMES) ===
              0,
          )
        : allScreenshots

    const run: AutoJournalRun = {
      id,
      startedAt,
      finishedAt: Date.now(),
      status: "success",
      windowMinutes: wm,
      summary,
      screenshotCount: allScreenshots.length,
      autoSaved: false,
    }

    const framePaths = previewScreenshots.map((s) => s.path)
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

    const hasRealContent =
      summaryInputHistory.length > 0 && !isNoRecordingsSummary(summary.summary)

    if (!hasRealContent) {
      console.log(
        "[auto-journal] No recordings found in explicit range, skipping run save entirely",
      )
      return null
    }

    if (cfg.autoJournalAutoSaveEnabled) {
      let pilePath: string | null | undefined = cfg.autoJournalTargetPilePath
      if (!pilePath || pilePath.trim().length === 0) {
        pilePath = getFirstPilePath()
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
        } catch (error) {
          console.error("[auto-journal] Failed to auto-save entry", error)
        }
      }
    }

    await writeRun(run)

    refreshAutonomousKanban().catch((error) => {
      autoJournalLog.error("Failed to refresh autonomous kanban", error)
    })
    refreshAutonomousProfile().catch((error) => {
      autoJournalLog.error("Failed to refresh autonomous profile", error)
    })

    return run
  } catch (error: any) {
    console.error(`[auto-journal] Range run ${id} failed:`, error?.message || error)
    const run: AutoJournalRun = {
      id,
      startedAt,
      finishedAt: Date.now(),
      status: "error",
      windowMinutes: wm,
      error: error?.message || String(error),
    }
    await writeRun(run)
    return run
  } finally {
    running = false
  }
}

export async function listAutoJournalRuns(
  limit = 50,
): Promise<AutoJournalRun[]> {
  ensureRunsDir()
  const files = fs.readdirSync(RUNS_DIR).filter((f) => f.endsWith(".json"))
  const sorted = files.sort(
    (a, b) => Number(b.replace(".json", "")) - Number(a.replace(".json", "")),
  )
  const selected = sorted.slice(0, limit)
  const runs: AutoJournalRun[] = []
  for (const file of selected) {
    try {
      const data = JSON.parse(
        fs.readFileSync(path.join(RUNS_DIR, file), "utf-8"),
      ) as AutoJournalRun

      // Regenerate GIF lazily if missing or empty
      if (
        data.summary?.windowStartTs &&
        (!data.previewGifPath ||
          !fs.existsSync(data.previewGifPath) ||
          fs.statSync(data.previewGifPath).size === 0)
      ) {
        const history = historyStore.readAll()
        // Collect recording screenshots
        const recordingFrames = history
          .filter(
            (h) =>
              typeof h.createdAt === "number" &&
              h.createdAt >= data.summary!.windowStartTs &&
              h.createdAt <= data.summary!.windowEndTs &&
              h.contextScreenshotPath &&
              fs.existsSync(h.contextScreenshotPath),
          )
          .map((h) => ({
            path: h.contextScreenshotPath as string,
            timestamp: h.createdAt,
          }))

        // Collect periodic screenshots
        const periodicFrames = listPeriodicScreenshotsInRange(
          data.summary!.windowStartTs,
          data.summary!.windowEndTs,
        )
          .filter((s) => fs.existsSync(s.imagePath))
          .map((s) => ({
            path: s.imagePath,
            timestamp: s.capturedAt,
          }))

        // Combine and sort all frames
        const frames = [...recordingFrames, ...periodicFrames]
          .sort((a, b) => a.timestamp - b.timestamp)
          .map((f) => f.path)

        if (frames.length > 0) {
          const gifPath = path.join(GIF_DIR, `${data.id}.gif`)
          try {
            const generated = await generateGifFromScreenshots(frames, gifPath)
            if (generated.path) {
              data.previewGifPath = generated.path
              data.gifError = undefined
              await writeRun(data)
            } else if (generated.error) {
              data.gifError = generated.error
            }
          } catch (err) {
            data.gifError = "gif_regen_failed"
            console.error("[auto-journal] GIF regen failed", err)
          }
        }
      }

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
    console.log(
      `[auto-journal] Scheduled run triggered at ${new Date().toLocaleTimeString()}`,
    )
    nextRunAt = Date.now() + periodMs
    runAutoJournalOnce().catch((err) =>
      console.error("[auto-journal] scheduled run failed", err),
    )
  }, periodMs)

  console.log(
    `[auto-journal] Scheduler started. Window ${wm} min, period ${periodMs / 60000} min`,
  )
  console.log(
    `[auto-journal] Next run at: ${new Date(nextRunAt).toLocaleTimeString()}`,
  )

  // Run immediately if requested (e.g., when user enables the scheduler)
  if (runImmediately) {
    console.log("[auto-journal] Running immediately as requested")
    runAutoJournalOnce().catch((err) =>
      console.error("[auto-journal] immediate run failed", err),
    )
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
