import settings from "electron-settings"
import { configStore } from "../config"
import {
  getSchedulerStatus,
  restartAutoJournalScheduler,
  runAutoJournalOnce,
  stopAutoJournalScheduler,
} from "./auto-journal-service"
import {
  getPeriodicScreenshotStatus,
  restartPeriodicScreenshotScheduler,
  stopPeriodicScreenshotScheduler,
} from "./periodic-screenshot-service"
import {
  getScreenSessionRecordingStatus,
  startScreenSessionRecording,
  stopScreenSessionRecording,
} from "./screen-session-recording-service"

type FocusPauseReason = "paused" | "finished" | "cancelled"

type FocusSessionState = {
  active: boolean
  startedAt: number | null
  label: string
  expectedDurationMs: number | null
  pipelinesSuspended: boolean
  suspendedAutoJournalScheduler: boolean
  suspendedPeriodicScreenshots: boolean
  suspendedContinuousScreenRecording: boolean
}

const state: FocusSessionState = {
  active: false,
  startedAt: null,
  label: "",
  expectedDurationMs: null,
  pipelinesSuspended: false,
  suspendedAutoJournalScheduler: false,
  suspendedPeriodicScreenshots: false,
  suspendedContinuousScreenRecording: false,
}

function getGeminiDefaultModel(): string {
  return "gemini-3-flash-preview"
}

async function suspendPipelinesIfNeeded() {
  if (state.pipelinesSuspended) return

  const autoJournalStatus = getSchedulerStatus()
  const periodicStatus = getPeriodicScreenshotStatus()
  const screenSessionStatus = getScreenSessionRecordingStatus()

  state.suspendedAutoJournalScheduler = autoJournalStatus.running
  state.suspendedPeriodicScreenshots = periodicStatus.running
  state.suspendedContinuousScreenRecording = screenSessionStatus.running

  if (autoJournalStatus.running) {
    stopAutoJournalScheduler()
  }
  if (periodicStatus.running) {
    stopPeriodicScreenshotScheduler()
  }
  if (screenSessionStatus.running) {
    await stopScreenSessionRecording()
  }

  state.pipelinesSuspended = true
}

async function restorePipelinesIfNeeded() {
  if (!state.pipelinesSuspended) return

  if (state.suspendedAutoJournalScheduler) {
    restartAutoJournalScheduler(false)
  }
  if (state.suspendedPeriodicScreenshots) {
    restartPeriodicScreenshotScheduler()
  }
  if (state.suspendedContinuousScreenRecording) {
    const cfg = configStore.get()
    await startScreenSessionRecording({
      intervalSeconds: cfg.screenSessionCaptureIntervalSeconds ?? 5,
    })
  }

  state.pipelinesSuspended = false
  state.suspendedAutoJournalScheduler = false
  state.suspendedPeriodicScreenshots = false
  state.suspendedContinuousScreenRecording = false
}

async function runFocusedAnalysisAndPublish(windowMinutes: number) {
  const previousConfig = configStore.get()
  const previousProvider = (await settings.get("pileAIProvider")) as
    | string
    | undefined

  const geminiApiFromEnv = process.env.GEMINI_API_KEY
  const geminiApiFromConfig = previousConfig.geminiApiKey
  const geminiApiKey = geminiApiFromConfig || geminiApiFromEnv

  try {
    // Force focused analysis path: use video-first source and auto-save enabled.
    configStore.save({
      ...previousConfig,
      autoJournalAutoSaveEnabled: true,
      autoJournalSourceMode: "video",
      geminiApiKey,
      geminiModel: previousConfig.geminiModel || getGeminiDefaultModel(),
    })

    await settings.set("pileAIProvider", "gemini")

    return await runAutoJournalOnce(windowMinutes)
  } finally {
    configStore.save(previousConfig)

    if (previousProvider) {
      await settings.set("pileAIProvider", previousProvider)
    }
  }
}

export async function startFocusSession(input?: {
  label?: string
  expectedDurationMs?: number
}) {
  if (state.active) {
    return getFocusSessionStatus()
  }

  await suspendPipelinesIfNeeded()

  const cfg = configStore.get()
  await startScreenSessionRecording({
    intervalSeconds: cfg.screenSessionCaptureIntervalSeconds ?? 5,
  })

  state.active = true
  state.startedAt = Date.now()
  state.label = input?.label?.trim() || "Sessão de foco"
  state.expectedDurationMs = input?.expectedDurationMs ?? null

  return getFocusSessionStatus()
}

export async function pauseFocusSession(_input?: { reason?: FocusPauseReason }) {
  if (!state.active || !state.startedAt) {
    return {
      session: getFocusSessionStatus(),
      run: null,
    }
  }

  const startedAt = state.startedAt
  await stopScreenSessionRecording()

  const elapsedMs = Math.max(0, Date.now() - startedAt)
  const windowMinutes = Math.max(1, Math.ceil(elapsedMs / 60000))

  state.active = false
  state.startedAt = null

  const run = await runFocusedAnalysisAndPublish(windowMinutes)
  await restorePipelinesIfNeeded()

  return {
    session: getFocusSessionStatus(),
    run,
  }
}

export async function resumeFocusSession(input?: {
  label?: string
  expectedDurationMs?: number
}) {
  return startFocusSession(input)
}

export async function stopFocusSession(input?: { reason?: FocusPauseReason }) {
  const result = await pauseFocusSession(input)
  return result
}

export function getFocusSessionStatus() {
  return {
    active: state.active,
    startedAt: state.startedAt,
    label: state.label,
    expectedDurationMs: state.expectedDurationMs,
    pipelinesSuspended: state.pipelinesSuspended,
  }
}
