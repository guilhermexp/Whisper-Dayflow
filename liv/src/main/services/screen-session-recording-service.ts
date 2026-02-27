import fs from "fs"
import path from "path"
import { createRequire } from "module"
import { exec, execFile } from "child_process"
import { desktopCapturer, BrowserWindow, app } from "electron"
import { configStore, recordingsFolder } from "../config"
import { logger } from "../logger"
import type {
  ScreenRecordingSession,
  ScreenRecordingSessionStatus,
} from "@shared/types"

const SESSIONS_DIR = path.join(recordingsFolder, "screen-sessions")
const INDEX_FILE = path.join(SESSIONS_DIR, "index.json")
const TMP_DIR = path.join(SESSIONS_DIR, "tmp")

const requireForFfmpeg = createRequire(import.meta.url)
let ffmpegPath: string | null = null

let intervalId: NodeJS.Timeout | null = null
let activeSession: ScreenRecordingSession | null = null
let nextCaptureAt: number | null = null
let lastCaptureAt: number | null = null
let captureInProgress = false

type SessionSample = {
  timestamp: number
  imagePath: string
  windowTitle: string
  appName: string
}

type RawVideoTranscriptLine = {
  timestamp: number
  appName: string
  windowTitle: string
  imagePath?: string
  text: string
}

function ensureDirs() {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true })
  fs.mkdirSync(TMP_DIR, { recursive: true })
}

function readIndex(): ScreenRecordingSession[] {
  ensureDirs()
  try {
    if (!fs.existsSync(INDEX_FILE)) return []
    return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"))
  } catch (error) {
    logger.error("[ScreenSession] Failed to read index:", error)
    return []
  }
}

function writeIndex(sessions: ScreenRecordingSession[]) {
  ensureDirs()
  const tmpPath = `${INDEX_FILE}.tmp`
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(sessions, null, 2), "utf8")
    fs.renameSync(tmpPath, INDEX_FILE)
  } catch (error) {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
    throw error
  }
}

function upsertSession(session: ScreenRecordingSession) {
  const sessions = readIndex()
  const index = sessions.findIndex((s) => s.id === session.id)
  if (index >= 0) {
    sessions[index] = session
  } else {
    sessions.push(session)
  }
  writeIndex(sessions)
}

function makeSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function getFramesDir(sessionId: string): string {
  return path.join(SESSIONS_DIR, sessionId, "frames")
}

function getSamplesPath(sessionId: string): string {
  return path.join(SESSIONS_DIR, sessionId, "samples.jsonl")
}

function getVideoPath(sessionId: string): string {
  return path.join(SESSIONS_DIR, sessionId, "session.mp4")
}

function getRawTranscriptPath(sessionId: string): string {
  return path.join(SESSIONS_DIR, sessionId, "video-transcript.jsonl")
}

function appendSampleLine(samplesPath: string, sample: SessionSample) {
  fs.mkdirSync(path.dirname(samplesPath), { recursive: true })
  fs.appendFileSync(samplesPath, `${JSON.stringify(sample)}\n`, "utf8")
}

function normalizeInlineText(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function readSessionSamples(session: ScreenRecordingSession): SessionSample[] {
  if (!fs.existsSync(session.samplesPath)) return []
  try {
    return fs
      .readFileSync(session.samplesPath, "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as SessionSample)
      .filter((sample) => Number.isFinite(sample.timestamp))
      .sort((a, b) => a.timestamp - b.timestamp)
  } catch (error) {
    logger.warn(`[ScreenSession] Failed to read samples for transcript (${session.id}):`, error)
    return []
  }
}

function writeRawVideoTranscript(session: ScreenRecordingSession): string | null {
  const samples = readSessionSamples(session)
  if (samples.length === 0) return null

  const transcriptPath = getRawTranscriptPath(session.id)
  try {
    fs.mkdirSync(path.dirname(transcriptPath), { recursive: true })

    const lines: RawVideoTranscriptLine[] = samples.map((sample) => {
      const appName = normalizeInlineText(sample.appName || "Unknown")
      const windowTitle = normalizeInlineText(sample.windowTitle || "Unknown")
      const label =
        windowTitle && windowTitle !== appName
          ? `${appName} - ${windowTitle}`
          : appName || windowTitle || "Unknown"

      return {
        timestamp: sample.timestamp,
        appName,
        windowTitle,
        imagePath: sample.imagePath,
        text: `Visual: ${label}`,
      }
    })

    fs.writeFileSync(
      transcriptPath,
      `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`,
      "utf8",
    )
    return transcriptPath
  } catch (error) {
    logger.warn(`[ScreenSession] Failed to write raw transcript (${session.id}):`, error)
    return null
  }
}

function parseWindowName(name: string): { appName: string; windowTitle: string } {
  if (!name) {
    return { appName: "Unknown", windowTitle: "Unknown" }
  }

  const separators = [" - ", " — ", " | "]
  for (const separator of separators) {
    if (name.includes(separator)) {
      const parts = name.split(separator).map((part) => part.trim()).filter(Boolean)
      if (parts.length >= 2) {
        const appName = parts[parts.length - 1]
        const windowTitle = parts.slice(0, -1).join(separator)
        return {
          appName: appName || "Unknown",
          windowTitle: windowTitle || name,
        }
      }
    }
  }

  return { appName: name, windowTitle: name }
}

async function findFfmpeg(): Promise<string | null> {
  const systemPaths = [
    "/usr/local/bin/ffmpeg",
    "/opt/homebrew/bin/ffmpeg",
    "/usr/bin/ffmpeg",
  ]

  for (const candidate of systemPaths) {
    if (fs.existsSync(candidate)) return candidate
  }

  try {
    const bundled = requireForFfmpeg("@ffmpeg-installer/ffmpeg") as {
      path?: string
    }
    if (bundled.path) {
      const candidates = [bundled.path]
      // Executables cannot be spawned from inside app.asar; prefer unpacked path.
      if (app.isPackaged && bundled.path.includes("app.asar")) {
        candidates.unshift(bundled.path.replace("app.asar", "app.asar.unpacked"))
      }
      const hit = candidates.find((candidate) => fs.existsSync(candidate))
      if (hit) return hit
    }
  } catch {}

  return new Promise((resolve) => {
    exec("which ffmpeg", (error, stdout) => {
      if (!error && stdout.trim()) {
        resolve(stdout.trim())
      } else {
        resolve(null)
      }
    })
  })
}

async function ensureFfmpegPath(): Promise<string | null> {
  if (ffmpegPath) return ffmpegPath
  ffmpegPath = await findFfmpeg()
  return ffmpegPath
}

async function captureFrame(session: ScreenRecordingSession): Promise<void> {
  const hasVisibleWindow = BrowserWindow.getAllWindows().some(
    (window) => !window.isDestroyed() && window.isVisible(),
  )

  if (!hasVisibleWindow) {
    return
  }

  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 1280, height: 720 },
  })

  if (!sources.length) return

  const target = sources.find((source) => !source.thumbnail.isEmpty()) || sources[0]
  if (!target || target.thumbnail.isEmpty()) return

  const now = Date.now()
  const filename = `${now}-${String(session.capturedFrames + 1).padStart(6, "0")}.jpg`
  const imagePath = path.join(session.framesDir, filename)

  fs.mkdirSync(session.framesDir, { recursive: true })
  fs.writeFileSync(imagePath, target.thumbnail.toJPEG(75))

  const parsed = parseWindowName(target.name)
  const sample: SessionSample = {
    timestamp: now,
    imagePath,
    appName: parsed.appName,
    windowTitle: parsed.windowTitle,
  }

  appendSampleLine(session.samplesPath, sample)

  session.capturedFrames += 1
  lastCaptureAt = now
  upsertSession(session)
}

async function generateSessionVideo(session: ScreenRecordingSession): Promise<string | null> {
  if (session.capturedFrames < 2) {
    return null
  }

  const binaryPath = await ensureFfmpegPath()
  if (!binaryPath) {
    logger.warn("[ScreenSession] ffmpeg not found, skipping MP4 generation")
    return null
  }

  const tmpDir = path.join(TMP_DIR, `video-${session.id}`)
  try {
    fs.mkdirSync(tmpDir, { recursive: true })

    const frameFiles = fs
      .readdirSync(session.framesDir)
      .filter((name) => name.endsWith(".jpg"))
      .sort((a, b) => a.localeCompare(b))

    if (frameFiles.length < 2) {
      return null
    }

    let seq = 1
    for (const file of frameFiles) {
      const source = path.join(session.framesDir, file)
      const target = path.join(tmpDir, `frame-${String(seq).padStart(5, "0")}.jpg`)
      fs.copyFileSync(source, target)
      seq += 1
    }

    const videoPath = getVideoPath(session.id)
    const ptsFactor = Math.max(1, session.intervalSeconds)
    const baseArgs = [
      "-y",
      "-framerate",
      "1",
      "-i",
      path.join(tmpDir, "frame-%05d.jpg"),
      "-vf",
      // Ensure final dimensions are even (libx264 requires width/height divisible by 2).
      `scale=1280:-2:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2,setsar=1,setpts=${ptsFactor}*PTS`,
    ]

    const tryEncode = async (label: string, extraArgs: string[]) => {
      if (fs.existsSync(videoPath)) {
        fs.rmSync(videoPath, { force: true })
      }

      await new Promise<void>((resolve, reject) => {
        execFile(
          binaryPath,
          [...baseArgs, ...extraArgs, videoPath],
          (error, _stdout, stderr) => {
            if (error) {
              logger.warn(`[ScreenSession] ffmpeg ${label} failed: ${String(error)}`)
              if (stderr?.trim()) {
                logger.warn(`[ScreenSession] ffmpeg ${label} stderr: ${stderr.trim()}`)
              }
              reject(error)
              return
            }
            resolve()
          },
        )
      })

      return fs.existsSync(videoPath) && fs.statSync(videoPath).size > 0
    }

    let encoded = false
    try {
      encoded = await tryEncode("libx264", [
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
      ])
    } catch {
      encoded = false
    }

    if (!encoded) {
      try {
        encoded = await tryEncode("mpeg4", [
          "-c:v",
          "mpeg4",
          "-q:v",
          "5",
          "-pix_fmt",
          "yuv420p",
        ])
      } catch {
        encoded = false
      }
    }

    if (!encoded) {
      return null
    }

    return videoPath
  } catch (error) {
    logger.error("[ScreenSession] Failed to generate MP4:", error)
    return null
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  }
}

async function finalizeStoppedSessionArtifacts(session: ScreenRecordingSession): Promise<void> {
  try {
    const videoPath = await generateSessionVideo(session)
    if (videoPath) {
      session.videoPath = videoPath
    }

    const rawTranscriptPath = writeRawVideoTranscript(session)
    if (rawTranscriptPath) {
      session.rawTranscriptPath = rawTranscriptPath
    }

    upsertSession(session)
    logger.info(`[ScreenSession] Finalized artifacts for ${session.id}`)
  } catch (error) {
    logger.error(`[ScreenSession] Failed to finalize artifacts for ${session.id}:`, error)
    upsertSession(session)
  }
}

export async function startScreenSessionRecording(options?: {
  intervalSeconds?: number
}): Promise<ScreenRecordingSessionStatus> {
  if (activeSession && intervalId) {
    return getScreenSessionRecordingStatus()
  }

  const config = configStore.get()
  const intervalSeconds = Math.min(
    30,
    Math.max(2, options?.intervalSeconds ?? config.screenSessionCaptureIntervalSeconds ?? 5),
  )

  const id = makeSessionId()
  const startedAt = Date.now()
  const session: ScreenRecordingSession = {
    id,
    startedAt,
    endedAt: null,
    status: "recording",
    intervalSeconds,
    capturedFrames: 0,
    framesDir: getFramesDir(id),
    samplesPath: getSamplesPath(id),
  }

  fs.mkdirSync(session.framesDir, { recursive: true })
  fs.mkdirSync(path.dirname(session.samplesPath), { recursive: true })

  activeSession = session
  upsertSession(session)

  const intervalMs = intervalSeconds * 1000
  nextCaptureAt = Date.now()

  await captureFrame(session)
  nextCaptureAt = Date.now() + intervalMs

  intervalId = setInterval(() => {
    if (!activeSession || captureInProgress) return
    captureInProgress = true
    captureFrame(activeSession)
      .catch((error) => {
        logger.error("[ScreenSession] Failed to capture frame:", error)
      })
      .finally(() => {
        captureInProgress = false
      })
    nextCaptureAt = Date.now() + intervalMs
  }, intervalMs)

  logger.info(
    `[ScreenSession] Started recording ${id} (${intervalSeconds}s interval)`,
  )

  return getScreenSessionRecordingStatus()
}

export async function stopScreenSessionRecording(): Promise<ScreenRecordingSession | null> {
  if (!activeSession) return null

  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }

  nextCaptureAt = null

  const session = activeSession
  activeSession = null

  session.endedAt = Date.now()
  session.status = "completed"

  upsertSession(session)

  logger.info(`[ScreenSession] Stopped recording ${session.id}`)

  // Finalize heavier artifacts asynchronously so the UI "Parar" action returns fast.
  void finalizeStoppedSessionArtifacts(session)

  return session
}

export function listScreenSessionRecordings(limit?: number): ScreenRecordingSession[] {
  const sessions = readIndex().sort((a, b) => b.startedAt - a.startedAt)
  if (limit && limit > 0) {
    return sessions.slice(0, limit)
  }
  return sessions
}

export function getScreenSessionRecordingStatus(): ScreenRecordingSessionStatus {
  const config = configStore.get()
  return {
    enabled: config.screenSessionRecordingEnabled ?? false,
    running: intervalId !== null && activeSession !== null,
    sessionId: activeSession?.id ?? null,
    startedAt: activeSession?.startedAt ?? null,
    lastCaptureAt,
    nextCaptureAt,
    intervalSeconds: activeSession?.intervalSeconds ?? config.screenSessionCaptureIntervalSeconds ?? 5,
    capturedFrames: activeSession?.capturedFrames ?? 0,
  }
}

export function applyScreenSessionRecordingConfig(config: {
  enabled?: boolean
  intervalSeconds?: number
}) {
  const current = configStore.get()
  const enabled = config.enabled ?? current.screenSessionRecordingEnabled ?? false
  const intervalSeconds = Math.min(
    30,
    Math.max(2, config.intervalSeconds ?? current.screenSessionCaptureIntervalSeconds ?? 5),
  )

  configStore.save({
    ...current,
    screenSessionRecordingEnabled: enabled,
    screenSessionCaptureIntervalSeconds: intervalSeconds,
  })
}

export async function syncScreenSessionRecordingWithConfig(): Promise<void> {
  const config = configStore.get()
  const enabled = config.screenSessionRecordingEnabled ?? false
  const intervalSeconds = config.screenSessionCaptureIntervalSeconds ?? 5

  if (enabled) {
    await startScreenSessionRecording({ intervalSeconds })
  } else if (activeSession) {
    await stopScreenSessionRecording()
  }
}

export function getScreenSessionRecordingsDir(): string {
  return SESSIONS_DIR
}

export function listScreenSessionSamplesInRange(
  startTs: number,
  endTs: number,
  maxItems = 400,
): Array<SessionSample> {
  const sessions = readIndex()
    .filter((session) => {
      const sessionEnd = session.endedAt ?? Date.now()
      return session.startedAt <= endTs && sessionEnd >= startTs
    })
    .sort((a, b) => a.startedAt - b.startedAt)

  const samples: SessionSample[] = []

  for (const session of sessions) {
    if (!fs.existsSync(session.samplesPath)) continue

    try {
      const lines = fs.readFileSync(session.samplesPath, "utf8").split("\n")
      for (const line of lines) {
        if (!line.trim()) continue
        const sample = JSON.parse(line) as SessionSample
        if (sample.timestamp >= startTs && sample.timestamp <= endTs) {
          samples.push(sample)
          if (samples.length >= maxItems) {
            return samples.sort((a, b) => a.timestamp - b.timestamp)
          }
        }
      }
    } catch (error) {
      logger.warn(
        `[ScreenSession] Failed to parse samples for session ${session.id}:`,
        error,
      )
    }
  }

  return samples.sort((a, b) => a.timestamp - b.timestamp)
}
