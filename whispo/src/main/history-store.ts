import fs from "fs"
import path from "path"
import { recordingsFolder } from "./config"
import type { RecordingAudioProfile, RecordingHistoryItem } from "../shared/types"

const HISTORY_FILE_PATH = path.join(recordingsFolder, "history.json")

type LegacyHistoryItem = Partial<RecordingHistoryItem> &
  Pick<RecordingHistoryItem, "id" | "createdAt" | "duration" | "transcript" | "filePath"> &
  {
    fileSize?: number
  }

const safeWordCount = (text: string) => {
  const normalized = text.trim()
  if (!normalized) return 0
  return normalized.split(/\s+/).length
}

const ensureAudioProfile = (
  profile?: RecordingAudioProfile,
): RecordingAudioProfile | undefined => {
  if (!profile) return undefined
  return {
    peakLevel: profile.peakLevel ?? null,
    averageLevel: profile.averageLevel ?? null,
    silenceRatio: profile.silenceRatio ?? null,
    sampleCount: profile.sampleCount ?? 0,
  }
}

export const normalizeRecordingHistoryItem = (
  item: LegacyHistoryItem,
): RecordingHistoryItem => {
  const transcript = item.transcript ?? ""
  const duration = item.duration ?? 0
  const transcriptWordCount =
    item.transcriptWordCount ?? safeWordCount(transcript)
  const transcriptCharacterCount =
    item.transcriptCharacterCount ?? transcript.length

  let fileSize = item.fileSize

  if (!fileSize && item.filePath) {
    try {
      fileSize = fs.statSync(item.filePath).size
    } catch {
      fileSize = undefined
    }
  }

  const wordsPerMinute =
    item.wordsPerMinute ??
    (duration > 0 && transcriptWordCount > 0
      ? Number(((transcriptWordCount / duration) * 60000).toFixed(2))
      : undefined)

  return {
    id: item.id,
    createdAt: item.createdAt ?? Date.now(),
    duration,
    transcript,
    filePath: item.filePath,
    fileSize,
    transcriptWordCount,
    transcriptCharacterCount,
    wordsPerMinute,
    providerId: item.providerId,
    hasPostProcessing: item.hasPostProcessing,
    llmProviderId: item.llmProviderId,
    processingTimeMs: item.processingTimeMs,
    transcriptionLatencyMs: item.transcriptionLatencyMs,
    postProcessingTimeMs: item.postProcessingTimeMs,
    accuracyScore: item.accuracyScore ?? null,
    confidenceScore: item.confidenceScore ?? null,
    tags: Array.isArray(item.tags) ? item.tags : [],
    audioProfile: ensureAudioProfile(item.audioProfile),
  }
}

const readFileIfExists = () => {
  try {
    const raw = fs.readFileSync(HISTORY_FILE_PATH, "utf8")
    const parsed = JSON.parse(raw) as LegacyHistoryItem[]
    return parsed
  } catch {
    return []
  }
}

const writeHistory = (history: RecordingHistoryItem[]) => {
  fs.mkdirSync(recordingsFolder, { recursive: true })
  fs.writeFileSync(HISTORY_FILE_PATH, JSON.stringify(history))
}

export const historyStore = {
  readAll(): RecordingHistoryItem[] {
    const history = readFileIfExists().map((item) =>
      normalizeRecordingHistoryItem(item),
    )

    return history.sort((a, b) => b.createdAt - a.createdAt)
  },

  saveAll(history: RecordingHistoryItem[]) {
    writeHistory(history)
  },

  append(item: RecordingHistoryItem) {
    const normalized = normalizeRecordingHistoryItem(item)
    const history = historyStore.readAll()
    history.push(normalized)
    writeHistory(history)
    return normalized
  },

  delete(id: string) {
    const history = historyStore.readAll().filter((item) => item.id !== id)
    writeHistory(history)

    const wavPath = path.join(recordingsFolder, `${id}.wav`)
    const legacyPath = path.join(recordingsFolder, `${id}.webm`)
    if (fs.existsSync(wavPath)) {
      fs.unlinkSync(wavPath)
    } else if (fs.existsSync(legacyPath)) {
      fs.unlinkSync(legacyPath)
    }
  },

  clear() {
    if (fs.existsSync(recordingsFolder)) {
      fs.rmSync(recordingsFolder, { recursive: true, force: true })
    }
  },

  update(id: string, patch: Partial<RecordingHistoryItem>) {
    const history = historyStore.readAll()
    const index = history.findIndex((item) => item.id === id)
    if (index === -1) return null

    const merged: LegacyHistoryItem = {
      ...history[index],
      ...patch,
    }
    const normalized = normalizeRecordingHistoryItem(merged)
    history[index] = normalized
    writeHistory(history)
    return normalized
  },
}
