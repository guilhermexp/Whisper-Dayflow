import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useQuery } from "@tanstack/react-query"
import dayjs from "dayjs"
import { Button } from "@renderer/components/ui/button"
import { PageHeader } from "@renderer/components/page-header"
import { queryClient } from "@renderer/lib/query-client"
import { rendererHandlers, tipcClient } from "@renderer/lib/tipc-client"
import { cn } from "@renderer/lib/utils"
import { useTranslation } from "react-i18next"
import type {
  RecordingHistoryItem,
  RecordingHistoryItemHighlight,
  RecordingHistorySearchFilters,
} from "@shared/types"

const HISTORY_PAGE_LIMIT = 2000

type DatePreset = "all" | "today" | "yesterday" | "week" | "month" | "custom"

type GroupingValue = "date" | "confidence" | "duration" | "provider"

type SearchMode = NonNullable<RecordingHistorySearchFilters["searchMode"]>
type SortField = NonNullable<RecordingHistorySearchFilters["sortBy"]>

type FlattenedHistoryRow =
  | { type: "group"; id: string; label: string; count: number }
  | {
      type: "record"
      id: string
      record: RecordingHistoryItem
      highlight?: RecordingHistoryItemHighlight
    }

const formatDuration = (ms: number) => {
  if (!ms) return "0s"
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${minutes}m ${remaining}s`
}

const formatBytes = (bytes?: number) => {
  if (!bytes) return "--"
  const units = ["B", "KB", "MB", "GB"]
  let unitIndex = 0
  let value = bytes
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(1)}${units[unitIndex]}`
}

const formatConfidence = (score?: number | null) => {
  if (typeof score !== "number") return "--"
  return `${Math.round(score * 100)}%`
}

const formatProcessingTime = (ms?: number) => {
  if (!ms) return "--"
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

const computeDateRange = (preset: DatePreset, custom?: { from?: string; to?: string }) => {
  switch (preset) {
    case "today":
      return { from: dayjs().startOf("day").valueOf(), to: dayjs().endOf("day").valueOf() }
    case "yesterday":
      return {
        from: dayjs().subtract(1, "day").startOf("day").valueOf(),
        to: dayjs().subtract(1, "day").endOf("day").valueOf(),
      }
    case "week":
      return { from: dayjs().startOf("week").valueOf(), to: dayjs().endOf("week").valueOf() }
    case "month":
      return { from: dayjs().startOf("month").valueOf(), to: dayjs().endOf("month").valueOf() }
    case "custom":
      return {
        from: custom?.from ? dayjs(custom.from).startOf("day").valueOf() : undefined,
        to: custom?.to ? dayjs(custom.to).endOf("day").valueOf() : undefined,
      }
    default:
      return undefined
  }
}

const getGroupLabel = (record: RecordingHistoryItem, grouping: GroupingValue) => {
  if (grouping === "confidence") {
    const confidence = record.confidenceScore ?? record.accuracyScore
    if (confidence == null) return "Confidence: Unknown"
    if (confidence >= 0.9) return "Confidence: High"
    if (confidence >= 0.75) return "Confidence: Medium"
    return "Confidence: Low"
  }

  if (grouping === "duration") {
    if (record.duration < 60_000) return "Duration: < 1 min"
    if (record.duration < 180_000) return "Duration: 1-3 min"
    return "Duration: > 3 min"
  }

  if (grouping === "provider") {
    return `Provider: ${record.providerId || "Unknown"}`
  }

  return dayjs(record.createdAt).format("MMMM D, YYYY")
}

export function Component() {
  const { t } = useTranslation()
  const historyQuery = useQuery({
    queryKey: ["recording-history"],
    queryFn: async () => tipcClient.getRecordingHistory(),
  })

  const searchKeyword = ""
  const debouncedKeyword = ""
  const searchMode: SearchMode = "full-text"
  const booleanOperator: "and" | "or" = "and"
  const excludedKeywords = ""
  const datePreset: DatePreset = "all"
  const customDateRange: { from?: string; to?: string } = {}
  const durationRange = { min: "", max: "" }
  const lengthRange = { min: "", max: "" }
  const wordRange = { min: "", max: "" }
  const confidenceFilter = { min: "", max: "" }
  const audioFilters = { minAverage: "", maxAverage: "", maxSilence: "" }
  const [tagFilters, setTagFilters] = useState<string[]>([])
  const grouping: GroupingValue = "date"
  const sortBy: SortField = "createdAt"
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<string | null>(null)

  const dateRange = useMemo(
    () => computeDateRange(datePreset, customDateRange),
    [datePreset, customDateRange],
  )

  const remoteFilters = useMemo<RecordingHistorySearchFilters>(() => {
    const filters: RecordingHistorySearchFilters = {
      searchMode,
      booleanOperator,
      pagination: { limit: HISTORY_PAGE_LIMIT },
      sortBy,
      sortDirection: "desc",
    }

    if (debouncedKeyword.trim().length) {
      filters.text = debouncedKeyword.trim()
    }

    if (excludedKeywords.trim().length) {
      filters.mustNotInclude = excludedKeywords
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean)
    }

    if (dateRange) {
      filters.dateRange = dateRange
    }

    const durationMin = durationRange.min ? Number(durationRange.min) * 1000 : undefined
    const durationMax = durationRange.max ? Number(durationRange.max) * 1000 : undefined
    if (durationMin || durationMax) {
      filters.durationMsRange = {
        min: durationMin,
        max: durationMax,
      }
    }

    const lengthMin = lengthRange.min ? Number(lengthRange.min) : undefined
    const lengthMax = lengthRange.max ? Number(lengthRange.max) : undefined
    if (lengthMin || lengthMax) {
      filters.transcriptLengthRange = { min: lengthMin, max: lengthMax }
    }

    const wordsMin = wordRange.min ? Number(wordRange.min) : undefined
    const wordsMax = wordRange.max ? Number(wordRange.max) : undefined
    if (wordsMin || wordsMax) {
      filters.wordCountRange = { min: wordsMin, max: wordsMax }
    }

    const confidenceMin = confidenceFilter.min ? Number(confidenceFilter.min) / 100 : undefined
    const confidenceMax = confidenceFilter.max ? Number(confidenceFilter.max) / 100 : undefined
    if (confidenceMin || confidenceMax) {
      filters.confidenceRange = { min: confidenceMin, max: confidenceMax }
    }

    const audioFilterEnabled = Boolean(
      audioFilters.minAverage || audioFilters.maxAverage || audioFilters.maxSilence,
    )
    if (audioFilterEnabled) {
      filters.audioProfile = {
        minAverageLevel: audioFilters.minAverage ? Number(audioFilters.minAverage) : undefined,
        maxAverageLevel: audioFilters.maxAverage ? Number(audioFilters.maxAverage) : undefined,
        maxSilenceRatio: audioFilters.maxSilence ? Number(audioFilters.maxSilence) : undefined,
      }
    }

    if (tagFilters.length) {
      filters.tags = tagFilters
    }

    return filters
  }, [
    searchMode,
    booleanOperator,
    debouncedKeyword,
    excludedKeywords,
    dateRange,
    durationRange,
    lengthRange,
    wordRange,
    confidenceFilter,
    audioFilters,
    tagFilters,
    sortBy,
  ])

  const searchQuery = useQuery({
    queryKey: ["recording-history-search", remoteFilters],
    queryFn: async () => tipcClient.searchRecordingHistory(remoteFilters),
  })

  useEffect(() => {
    return rendererHandlers.refreshRecordingHistory.listen(() => {
      queryClient.invalidateQueries({ queryKey: ["recording-history"] })
      queryClient.invalidateQueries({ queryKey: ["recording-history-search"] })
    })
  }, [])

  useEffect(() => {
    if (!searchQuery.data) return
    const allowed = new Set(searchQuery.data.items.map((item) => item.id))
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => allowed.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [searchQuery.data])

  const highlightMap = useMemo(() => {
    const map = new Map<string, RecordingHistoryItemHighlight | undefined>()
    for (const item of searchQuery.data?.items || []) {
      map.set(item.id, item.highlight)
    }
    return map
  }, [searchQuery.data])

  const flattenedRows = useMemo<FlattenedHistoryRow[]>(() => {
    if (!searchQuery.data) return []
    const groups = new Map<string, { label: string; items: RecordingHistoryItem[] }>()
    for (const item of searchQuery.data.items) {
      const label = getGroupLabel(item, grouping)
      const entry = groups.get(label) || { label, items: [] }
      entry.items.push(item)
      groups.set(label, entry)
    }

    const output: FlattenedHistoryRow[] = []
    for (const [label, entry] of groups.entries()) {
      output.push({ type: "group", id: label, label, count: entry.items.length })
      for (const record of entry.items) {
        output.push({
          type: "record",
          id: record.id,
          record,
          highlight: highlightMap.get(record.id),
        })
      }
    }

    return output
  }, [searchQuery.data, grouping, highlightMap])

  const listParentRef = useRef<HTMLDivElement | null>(null)

  const getScrollElement = useCallback(() => listParentRef.current, [])

  const estimateSize = useCallback((index: number) => {
    const item = flattenedRows[index]
    return item?.type === "group" ? 50 : 152
  }, [flattenedRows])

  const rowVirtualizer = useVirtualizer({
    count: flattenedRows.length,
    getScrollElement,
    estimateSize,
    overscan: 5,
  })

  const handleToggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    const ids = flattenedRows
      .filter((row): row is Extract<FlattenedHistoryRow, { type: "record" }> => row.type === "record")
      .map((row) => row.record.id)
    setSelectedIds(new Set(ids))
  }

  const handleClearSelection = () => setSelectedIds(new Set())

  const bulkAction = useCallback(
    async (
      action: (id: string) => Promise<unknown>,
      statusMessage: string,
      successMessage: string,
    ) => {
      if (!selectedIds.size) return
      setBulkStatus(statusMessage)
      try {
        for (const id of selectedIds) {
          await action(id)
        }
        setSelectedIds(new Set())
        queryClient.invalidateQueries({ queryKey: ["recording-history"] })
        queryClient.invalidateQueries({ queryKey: ["recording-history-search"] })
        setBulkStatus(successMessage)
        setTimeout(() => setBulkStatus(null), 2000)
      } catch (error) {
        console.error(error)
        setBulkStatus("Operation failed")
        setTimeout(() => setBulkStatus(null), 2000)
      }
    },
    [selectedIds],
  )

  const handleBulkDelete = () => {
    if (!selectedIds.size) return
    if (!window.confirm(t("history.deleteMultipleConfirm", { count: selectedIds.size }))) {
      return
    }
    void bulkAction((id) => tipcClient.deleteRecordingItem({ id }), t("history.deleting"), t("history.deleted"))
  }

  const handleBulkExport = async () => {
    if (!selectedIds.size) return
    const selection = flattenedRows.filter(
      (row): row is Extract<FlattenedHistoryRow, { type: "record" }> =>
        row.type === "record" && selectedIds.has(row.record.id),
    )
    const payload = selection.map(({ record }) => ({
      id: record.id,
      createdAt: record.createdAt,
      transcript: record.transcript,
      duration: record.duration,
      tags: record.tags,
    }))
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
    setBulkStatus(t("history.exportedToClipboard"))
    setTimeout(() => setBulkStatus(null), 2000)
  }

  const handleBulkTag = () => {
    if (!selectedIds.size) return
    const value = window.prompt(t("history.addTags"))
    if (!value) return
    const tags = value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
    if (!tags.length) return
    void bulkAction(
      (id) => tipcClient.updateRecordingItem({ id, patch: { tags } }),
      t("history.updatingTags"),
      t("history.tagsUpdated"),
    )
  }

  const renderRow = (row: FlattenedHistoryRow) => {
    if (row.type === "group") {
      return (
        <div className="flex items-center justify-between rounded-full bg-white/[0.05] px-4 py-2 text-xs font-semibold uppercase tracking-wide">
          <span>{row.label}</span>
          <span className="text-white/60">{t("history.itemCount", { count: row.count })}</span>
        </div>
      )
    }

    const record = row.record
    const isSelected = selectedIds.has(record.id)
    const confidence = record.confidenceScore ?? record.accuracyScore

    return (
      <div
        className={cn(
          "rounded-2xl border border-white/10 bg-white/[0.015] px-4 py-4 transition-all duration-200",
          "hover:border-white/20 hover:bg-white/[0.03]",
          isSelected && "border-white/40 bg-white/[0.08]",
        )}
      >
        <div className="flex items-start gap-3">
          <input
            aria-label="Select recording"
            type="checkbox"
            className="mt-1"
            checked={isSelected}
            onChange={() => handleToggleSelection(record.id)}
          />
          <div className="flex grow flex-col gap-2">
            <div className="flex items-center justify-between gap-4 text-sm">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <div className="text-base font-semibold">
                    {record.transcript.slice(0, 160) || t("history.emptyTranscript")}
                  </div>
                  {record.enhancementPromptId && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-200">
                      <span className="i-mingcute-sparkles-line text-xs" />
                      Enhanced
                    </span>
                  )}
                </div>
                {row.highlight?.preview && (
                  <p className="text-xs text-white/60">
                    …{row.highlight.preview.trim()}…
                  </p>
                )}
                <div className="flex flex-wrap gap-2 text-xs text-white/60">
                  <span className="inline-flex items-center gap-1">
                    <span className="i-mingcute-time-line" />
                    {dayjs(record.createdAt).format("MMM D, YYYY h:mm A")}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="i-mingcute-timer-line" />
                    {formatDuration(record.duration)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="i-mingcute-file-line" />
                    {formatBytes(record.fileSize)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="i-mingcute-bubble-warning-line" />
                    {formatConfidence(confidence)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="i-mingcute-speed-line" />
                    {formatProcessingTime(record.processingTimeMs)}
                  </span>
                  {typeof record.wordsPerMinute === "number" && (
                    <span className="inline-flex items-center gap-1">
                      <span className="i-mingcute-book-2-line" />
                      {record.wordsPerMinute.toFixed(0)} WPM
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {record.originalTranscript && (
                  <button
                    type="button"
                    title="Compare original vs enhanced"
                    className={cn(
                      itemButtonVariants(),
                      "text-white/60 hover:text-white",
                    )}
                    onClick={() => {
                      // TODO: Open comparison dialog
                      alert(`Original: ${record.originalTranscript}\n\nEnhanced: ${record.transcript}`)
                    }}
                  >
                    <span className="i-mingcute-transfer-line" />
                  </button>
                )}
                <PlayButton item={record} />
                <DeleteButton
                  id={record.id}
                  onDeleted={() => {
                    setSelectedIds((prev) => {
                      const next = new Set(prev)
                      next.delete(record.id)
                      return next
                    })
                  }}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(record.tags || []).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={cn(
                    "rounded-full border border-white/10 px-2 py-0.5 text-xs text-white/70",
                    tagFilters.includes(tag)
                      ? "border-white bg-white/20 text-white"
                      : "hover:border-white/30",
                  )}
                  onClick={() => {
                    setTagFilters((prev) =>
                      prev.includes(tag)
                        ? prev.filter((item) => item !== tag)
                        : [...prev, tag],
                    )
                  }}
                >
                  #{tag}
                </button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const value = window.prompt(t("history.addTags"), (record.tags || []).join(", "))
                  if (!value) return
                  const tags = value
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean)
                  void tipcClient
                    .updateRecordingItem({ id: record.id, patch: { tags } })
                    .then(() => {
                      queryClient.invalidateQueries({ queryKey: ["recording-history"] })
                      queryClient.invalidateQueries({ queryKey: ["recording-history-search"] })
                    })
                }}
              >
                <span className="i-mingcute-add-line" /> {t("history.tag")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-6 text-white">
      <PageHeader
        title={t("history.title")}
        description={t("history.description")}
      />

      <div className="flex flex-1 flex-col gap-4">
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-3 text-sm">
            <span className="font-semibold">{selectedIds.size} {t("history.selected")}</span>
            <Button variant="ghost" size="sm" onClick={handleSelectAll}>
              {t("history.selectAll")}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClearSelection}>
              {t("history.clear")}
            </Button>
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleBulkTag}>
                <span className="i-mingcute-hashtag-line" /> {t("history.tag")}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleBulkExport}>
                <span className="i-mingcute-download-line" /> {t("history.export")}
              </Button>
              <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                <span className="i-mingcute-delete-2-line" /> {t("history.delete")}
              </Button>
            </div>
          </div>
        )}

        {bulkStatus && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-6 py-2 text-xs text-amber-100">
            {bulkStatus}
          </div>
        )}

        <div
          ref={listParentRef}
          className="flex-1 overflow-auto rounded-2xl border border-white/10 bg-black/30"
          style={{
            WebkitOverflowScrolling: 'touch',
            willChange: 'scroll-position',
          }}
        >
          {!searchQuery.data ? (
            <div className="flex h-full items-center justify-center text-sm text-white/60">
              {t("history.loadingHistory")}
            </div>
          ) : flattenedRows.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-white/60">
              <span>{t("history.noRecordings")}</span>
            </div>
          ) : (
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                position: "relative",
                contain: 'layout style paint',
              }}
              className="w-full"
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const item = flattenedRows[virtualRow.index]
                const isGroup = item.type === "group"
                const isFirstItem = virtualRow.index === 0

                return (
                  <div
                    key={virtualRow.key}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    className="absolute w-full"
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                      paddingLeft: '1.5rem',
                      paddingRight: '1.5rem',
                      paddingTop: isFirstItem ? '1rem' : (isGroup ? '1rem' : '0'),
                      paddingBottom: isGroup ? '0.5rem' : '0.75rem',
                      willChange: 'transform',
                      backfaceVisibility: 'hidden',
                      perspective: 1000,
                    }}
                  >
                    {renderRow(item)}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const itemButtonVariants = ({ isDanger }: { isDanger?: boolean } = {}) =>
  cn(
    "inline-flex h-8 w-8 items-center justify-center rounded-md text-white/60 transition-all duration-200",
    "hover:bg-white/10 hover:text-white hover:scale-110 active:scale-95",
    isDanger && "hover:text-red-400",
  )

const PlayButton = ({ item }: { item: RecordingHistoryItem }) => {
  const [status, setStatus] = useState<null | "playing" | "paused">(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const start = () => {
    const audio = (audioRef.current = new Audio())
    const encodedPath = encodeURIComponent(item.filePath)
    audio.src = `assets://file?path=${encodedPath}`
    audio.addEventListener("play", () => {
      setStatus("playing")
    })
    audio.addEventListener("ended", () => {
      setStatus(null)
    })
    audio.addEventListener("pause", () => {
      setStatus("paused")
    })

    audio.play()
  }

  const pause = () => {
    audioRef.current?.pause()
  }

  return (
    <button
      type="button"
      className={itemButtonVariants()}
      onClick={() => {
        if (status === null) {
          start()
        } else if (status === "playing") {
          pause()
        } else if (status === "paused") {
          audioRef.current?.play()
        }
      }}
    >
      <span
        className={cn(
          status === "playing" ? "i-mingcute-pause-fill" : "i-mingcute-play-fill",
        )}
      ></span>
    </button>
  )
}

const DeleteButton = ({ id, onDeleted }: { id: string; onDeleted?: () => void }) => {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      className={itemButtonVariants({ isDanger: true })}
      onClick={async () => {
        if (window.confirm(t("history.deleteConfirm"))) {
          await tipcClient.deleteRecordingItem({ id })
          onDeleted?.()
          queryClient.invalidateQueries({ queryKey: ["recording-history"] })
          queryClient.invalidateQueries({ queryKey: ["recording-history-search"] })
        }
      }}
    >
      <span className="i-mingcute-delete-2-fill"></span>
    </button>
  )
}
