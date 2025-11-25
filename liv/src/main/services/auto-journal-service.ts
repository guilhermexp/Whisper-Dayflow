import fs from "fs"
import path from "path"
import { app } from "electron"
import { configStore, recordingsFolder } from "../config"
import { historyStore } from "../history-store"
import { generateAutoJournalSummaryFromHistory } from "../llm"
import type { AutoJournalRun } from "../../shared/types"
import { saveAutoJournalEntry } from "./auto-journal-entry"
import pileIndex from "../pile-utils/pileIndex"

const RUNS_DIR = path.join(recordingsFolder, "auto-journal", "runs")

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
  const id = `${startedAt}`

  console.log(`[auto-journal] Starting run ${id} with window ${wm} min`)
  console.log(`[auto-journal] Auto-save enabled: ${cfg.autoJournalAutoSaveEnabled}, target pile: ${cfg.autoJournalTargetPilePath || '(not set)'}`)

  try {
    const history = historyStore.readAll()
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
      autoSaved: false,
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
