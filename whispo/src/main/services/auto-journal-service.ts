import fs from "fs"
import path from "path"
import { configStore, recordingsFolder } from "../config"
import { historyStore } from "../history-store"
import { generateAutoJournalSummaryFromHistory } from "../llm"
import type { AutoJournalRun } from "../../shared/types"

const RUNS_DIR = path.join(recordingsFolder, "auto-journal", "runs")

let intervalId: NodeJS.Timeout | null = null
let running = false

function ensureRunsDir() {
  fs.mkdirSync(RUNS_DIR, { recursive: true })
}

async function writeRun(run: AutoJournalRun) {
  ensureRunsDir()
  const file = path.join(RUNS_DIR, `${run.id}.json`)
  await fs.promises.writeFile(file, JSON.stringify(run, null, 2), "utf-8")
}

export async function runAutoJournalOnce(windowMinutes?: number) {
  if (running) return null
  running = true
  const startedAt = Date.now()
  const cfg = configStore.get()
  const wm = windowMinutes ?? cfg.autoJournalWindowMinutes ?? 60
  const id = `${startedAt}`

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
    }
    await writeRun(run)
    return run
  } catch (error: any) {
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

export function startAutoJournalScheduler() {
  const cfg = configStore.get()
  if (!cfg.autoJournalEnabled) return
  const wm = cfg.autoJournalWindowMinutes ?? 60
  const periodMs = wm * 60 * 1000
  if (intervalId) clearInterval(intervalId)
  intervalId = setInterval(() => {
    runAutoJournalOnce().catch((err) => console.error("[auto-journal] scheduled run failed", err))
  }, periodMs)
  console.log(`[auto-journal] Scheduler started. Window ${wm} min, period ${periodMs / 60000} min`)
}

export function stopAutoJournalScheduler() {
  if (intervalId) clearInterval(intervalId)
  intervalId = null
}
