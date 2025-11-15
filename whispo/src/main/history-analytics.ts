import Fuse from "fuse.js"
import type { IFuseOptions } from "fuse.js"
import dayjs from "dayjs"
import type {
  RecordingAnalyticsSnapshot,
  RecordingHistoryItem,
  RecordingHistoryItemHighlight,
  RecordingHistorySearchFilters,
  RecordingHistorySearchResult,
} from "../shared/types"

const DEFAULT_FUSE_OPTIONS: IFuseOptions<RecordingHistoryItem> = {
  includeScore: true,
  threshold: 0.35,
  ignoreLocation: true,
  useExtendedSearch: false,
  keys: ["transcript"],
}

const safeWordCount = (text: string) => {
  const normalized = text.trim()
  if (!normalized) return 0
  return normalized.split(/\s+/).length
}

const clampPercentage = (value: number | null | undefined) => {
  if (typeof value !== "number" || Number.isNaN(value)) return null
  return Math.min(0.99, Math.max(0, Number(value.toFixed(4))))
}

const highlightFromText = (
  transcript: string,
  terms: string[],
  regex?: RegExp,
): RecordingHistoryItemHighlight | undefined => {
  if (!transcript.length) return undefined

  if (regex) {
    const match = transcript.match(regex)
    if (!match?.[0]) return undefined
    const idx = match.index ?? 0
    const preview = transcript.slice(
      Math.max(0, idx - 40),
      Math.min(transcript.length, idx + match[0].length + 40),
    )
    return {
      preview,
      matches: [match[0]],
    }
  }

  if (!terms.length) return undefined

  const normalized = transcript.toLowerCase()
  let selectedRange: { start: number; end: number; matches: string[] } | null =
    null

  for (const term of terms) {
    const idx = normalized.indexOf(term.toLowerCase())
    if (idx === -1) continue
    const start = Math.max(0, idx - 40)
    const end = Math.min(transcript.length, idx + term.length + 40)
    if (!selectedRange || end - start > selectedRange.end - selectedRange.start) {
      selectedRange = { start, end, matches: [term] }
    } else {
      selectedRange.matches.push(term)
    }
  }

  if (!selectedRange) return undefined

  return {
    preview: transcript.slice(selectedRange.start, selectedRange.end),
    matches: selectedRange.matches,
  }
}

const applyBooleanKeywordFilter = (
  transcript: string,
  keywords: string[],
  operator: "and" | "or",
) => {
  if (!keywords.length) return true
  const normalized = transcript.toLowerCase()
  return operator === "and"
    ? keywords.every((keyword) => normalized.includes(keyword.toLowerCase()))
    : keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
}

const applyFilters = (
  items: RecordingHistoryItem[],
  filters: RecordingHistorySearchFilters,
) => {
  const {
    dateRange,
    durationMsRange,
    transcriptLengthRange,
    wordCountRange,
    confidenceRange,
    tags,
    excludeTags,
    audioProfile,
    mustNotInclude,
    booleanOperator = "and",
  } = filters

  const excluded = (mustNotInclude || []).map((keyword) => keyword.toLowerCase())

  return items.filter((item) => {
    if (dateRange) {
      if (dateRange.from && item.createdAt < dateRange.from) return false
      if (dateRange.to && item.createdAt > dateRange.to) return false
    }

    if (durationMsRange) {
      if (
        typeof durationMsRange.min === "number" &&
        item.duration < durationMsRange.min
      ) {
        return false
      }
      if (
        typeof durationMsRange.max === "number" &&
        item.duration > durationMsRange.max
      ) {
        return false
      }
    }

    if (transcriptLengthRange) {
      const charCount = item.transcriptCharacterCount ?? item.transcript.length
      if (
        typeof transcriptLengthRange.min === "number" &&
        charCount < transcriptLengthRange.min
      ) {
        return false
      }
      if (
        typeof transcriptLengthRange.max === "number" &&
        charCount > transcriptLengthRange.max
      ) {
        return false
      }
    }

    if (wordCountRange) {
      const words =
        typeof item.transcriptWordCount === "number"
          ? item.transcriptWordCount
          : safeWordCount(item.transcript)
      if (
        typeof wordCountRange.min === "number" &&
        words < wordCountRange.min
      ) {
        return false
      }
      if (
        typeof wordCountRange.max === "number" &&
        words > wordCountRange.max
      ) {
        return false
      }
    }

    if (confidenceRange) {
      const confidence = item.confidenceScore ?? item.accuracyScore
      if (
        typeof confidenceRange.min === "number" &&
        (confidence ?? 0) < confidenceRange.min
      ) {
        return false
      }
      if (
        typeof confidenceRange.max === "number" &&
        (confidence ?? 0) > confidenceRange.max
      ) {
        return false
      }
    }

    if (tags?.length) {
      const tagSet = new Set(item.tags || [])
      const matcher = booleanOperator === "or" ? "some" : "every"
      const match = tags[matcher]((tag) => tagSet.has(tag))
      if (!match) return false
    }

    if (excludeTags?.length) {
      const tagSet = new Set(item.tags || [])
      if (excludeTags.some((tag) => tagSet.has(tag))) {
        return false
      }
    }

    if (audioProfile) {
      const profile = item.audioProfile
      if (audioProfile.minAverageLevel && profile?.averageLevel != null) {
        if (profile.averageLevel < audioProfile.minAverageLevel) return false
      }
      if (audioProfile.maxAverageLevel && profile?.averageLevel != null) {
        if (profile.averageLevel > audioProfile.maxAverageLevel) return false
      }
      if (audioProfile.maxSilenceRatio && profile?.silenceRatio != null) {
        if (profile.silenceRatio > audioProfile.maxSilenceRatio) return false
      }
    }

    if (excluded.length) {
      const normalized = item.transcript.toLowerCase()
      if (excluded.some((keyword) => normalized.includes(keyword))) {
        return false
      }
    }

    return true
  })
}

const sortResults = (
  items: RecordingHistoryItem[],
  filters: RecordingHistorySearchFilters,
) => {
  const sorted = [...items]
  const sortBy = filters.sortBy || "createdAt"
  const direction = filters.sortDirection === "asc" ? 1 : -1

  sorted.sort((a, b) => {
    const resolveValue = (item: RecordingHistoryItem) => {
      switch (sortBy) {
        case "duration":
          return item.duration
        case "confidence":
          return (item.confidenceScore ?? item.accuracyScore) ?? 0
        case "processingTime":
          return item.processingTimeMs ?? 0
        default:
          return item.createdAt
      }
    }

    return (resolveValue(a) - resolveValue(b)) * direction
  })

  return sorted
}

const computeStats = (items: RecordingHistoryItem[]) => {
  const totalDurationMs = items.reduce((acc, item) => acc + item.duration, 0)
  const processingTimes = items
    .map((item) => item.processingTimeMs)
    .filter((value): value is number => typeof value === "number")
  const confidenceScores = items
    .map((item) => item.confidenceScore ?? item.accuracyScore)
    .filter((value): value is number => typeof value === "number")

  const averageProcessingTimeMs =
    processingTimes.length > 0
      ? processingTimes.reduce((acc, value) => acc + value, 0) /
        processingTimes.length
      : null

  const averageConfidence = clampPercentage(
    confidenceScores.length > 0
      ? confidenceScores.reduce((acc, value) => acc + value, 0) /
          confidenceScores.length
      : null,
  )

  return {
    totalDurationMs,
    averageProcessingTimeMs,
    averageConfidence,
  }
}

const parseKeywords = (filters: RecordingHistorySearchFilters) => {
  const tokens = filters.text?.split(/\s+/).filter(Boolean) || []
  const includes = filters.mustInclude?.length ? filters.mustInclude : tokens
  return includes.map((keyword) => keyword.toLowerCase())
}

export const runHistorySearch = (
  items: RecordingHistoryItem[],
  filters: RecordingHistorySearchFilters,
): RecordingHistorySearchResult => {
  const keywordOperator = filters.booleanOperator || "and"
  const keywords = parseKeywords(filters)
  const regex =
    filters.searchMode === "regex" && filters.text
      ? (() => {
          try {
            return new RegExp(filters.text, "i")
          } catch {
            return undefined
          }
        })()
      : undefined

  const baseFiltered = applyFilters(items, filters)
  let matched: RecordingHistoryItem[] = baseFiltered

  if (regex) {
    matched = baseFiltered.filter((item) => regex.test(item.transcript))
  } else if (filters.searchMode === "fuzzy" || filters.searchMode === "semantic") {
    const fuse = new Fuse(baseFiltered, {
      ...DEFAULT_FUSE_OPTIONS,
      threshold: filters.searchMode === "semantic" ? 0.25 : DEFAULT_FUSE_OPTIONS.threshold,
    })
    matched = fuse.search(filters.text || "").map((result) => result.item)
  } else if (filters.text?.trim()) {
    matched = baseFiltered.filter((item) =>
      applyBooleanKeywordFilter(item.transcript, keywords, keywordOperator),
    )
  }

  const sorted = sortResults(matched, filters)
  const offset = filters.pagination?.offset ?? 0
  const limit = filters.pagination?.limit ?? 200
  const paginated = sorted.slice(offset, offset + limit)

  const itemsWithHighlights = paginated.map((item) => {
    const highlight = highlightFromText(item.transcript, keywords, regex)
    return highlight ? { ...item, highlight } : item
  })

  return {
    items: itemsWithHighlights,
    total: matched.length,
    stats: computeStats(matched),
    appliedFilters: filters,
  }
}

const median = (values: number[]) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }

  return sorted[mid]
}

const percentile = (values: number[], percentileRank: number) => {
  if (!values.length) return null
  if (values.length === 1) return values[0]
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.ceil((percentileRank / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))]
}

const computeTrend = (timeline: RecordingAnalyticsSnapshot["timeline"]) => {
  if (timeline.length < 2) return null
  const latest = timeline[timeline.length - 1]
  const previous = timeline[timeline.length - 2]
  if (!previous || previous.durationMs === 0) return null
  const change = latest.durationMs - previous.durationMs
  return Number(((change / previous.durationMs) * 100).toFixed(2))
}

export const buildAnalyticsSnapshot = (
  items: RecordingHistoryItem[],
): RecordingAnalyticsSnapshot => {
  const totals = {
    recordings: items.length,
    durationMs: items.reduce((acc, item) => acc + item.duration, 0),
  }

  const avgSession =
    totals.recordings > 0 ? totals.durationMs / totals.recordings : 0

  const accuracyValues = items
    .map((item) => item.accuracyScore ?? item.confidenceScore)
    .filter((value): value is number => typeof value === "number")
  const wpmValues = items
    .map((item) => item.wordsPerMinute)
    .filter((value): value is number => typeof value === "number")

  const processingTimes = items
    .map((item) => item.processingTimeMs)
    .filter((value): value is number => typeof value === "number")

  const timelineMap = new Map<
    string,
    {
      count: number
      durationMs: number
      processingTimes: number[]
      accuracyValues: number[]
    }
  >()

  const peakHourMap = new Map<number, number>()
  const providerMap = new Map<string, { count: number; durationMs: number }>()
  const tagMap = new Map<string, number>()

  for (const item of items) {
    const dateKey = dayjs(item.createdAt).format("YYYY-MM-DD")
    const timelineEntry = timelineMap.get(dateKey) || {
      count: 0,
      durationMs: 0,
      processingTimes: [],
      accuracyValues: [],
    }
    timelineEntry.count += 1
    timelineEntry.durationMs += item.duration
    if (typeof item.processingTimeMs === "number") {
      timelineEntry.processingTimes.push(item.processingTimeMs)
    }
    const accuracy = item.accuracyScore ?? item.confidenceScore
    if (typeof accuracy === "number") {
      timelineEntry.accuracyValues.push(accuracy)
    }
    timelineMap.set(dateKey, timelineEntry)

    const hour = dayjs(item.createdAt).hour()
    peakHourMap.set(hour, (peakHourMap.get(hour) || 0) + 1)

    const providerId = item.providerId || "unknown"
    const providerEntry = providerMap.get(providerId) || {
      count: 0,
      durationMs: 0,
    }
    providerEntry.count += 1
    providerEntry.durationMs += item.duration
    providerMap.set(providerId, providerEntry)

    for (const tag of item.tags || []) {
      tagMap.set(tag, (tagMap.get(tag) || 0) + 1)
    }
  }

  const timeline = Array.from(timelineMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, entry]) => {
      const processingAverage =
        entry.processingTimes.length > 0
          ? entry.processingTimes.reduce((acc, time) => acc + time, 0) /
            entry.processingTimes.length
          : null
      const accuracyAverage = clampPercentage(
        entry.accuracyValues.length > 0
          ? entry.accuracyValues.reduce((acc, value) => acc + value, 0) /
              entry.accuracyValues.length
          : null,
      )
      return {
        date,
        count: entry.count,
        durationMs: entry.durationMs,
        averageProcessingTimeMs: processingAverage,
        averageAccuracy: accuracyAverage,
      }
    })

  const tags = Array.from(tagMap.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)

  const providerBreakdown = Array.from(providerMap.entries())
    .map(([providerId, stats]) => ({ providerId, ...stats }))
    .sort((a, b) => b.count - a.count)

  const peakHours = Array.from(peakHourMap.entries())
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour - b.hour)

  return {
    generatedAt: Date.now(),
    totals: {
      recordings: totals.recordings,
      durationMs: totals.durationMs,
      averageSessionMs: avgSession,
      averageAccuracy: clampPercentage(
        accuracyValues.length > 0
          ? accuracyValues.reduce((acc, value) => acc + value, 0) /
              accuracyValues.length
          : null,
      ),
      averageWpm:
        wpmValues.length > 0
          ? wpmValues.reduce((acc, value) => acc + value, 0) / wpmValues.length
          : null,
    },
    timeline,
    peakHours,
    providerBreakdown,
    productivity: {
      wordsPerMinute: {
        average:
          wpmValues.length > 0
            ? wpmValues.reduce((acc, value) => acc + value, 0) /
              wpmValues.length
            : null,
        median: median(wpmValues),
        trend: computeTrend(timeline),
      },
      processingTimeMs: {
        average:
          processingTimes.length > 0
            ? processingTimes.reduce((acc, value) => acc + value, 0) /
              processingTimes.length
            : null,
        percentile95: percentile(processingTimes, 95),
      },
    },
    tags,
  }
}
