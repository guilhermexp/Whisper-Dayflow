import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ComponentProps } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useQuery } from "@tanstack/react-query"
import dayjs from "dayjs"
import { Button } from "@renderer/components/ui/button"
import { Input } from "@renderer/components/ui/input"
import { PageHeader } from "@renderer/components/page-header"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select"
import { queryClient } from "@renderer/lib/query-client"
import { rendererHandlers, tipcClient } from "@renderer/lib/tipc-client"
import { cn } from "@renderer/lib/utils"
import type {
  RecordingHistoryItem,
  RecordingHistoryItemHighlight,
  RecordingHistorySearchFilters,
  SavedRecordingSearch,
} from "@shared/types"

const HISTORY_PAGE_LIMIT = 2000
const SAVED_SEARCH_STORAGE_KEY = "whispo.history.saved-searches"

const DATE_PRESETS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom" },
] as const

type DatePreset = (typeof DATE_PRESETS)[number]["value"]

const GROUPING_OPTIONS = [
  { value: "date", label: "Date" },
  { value: "confidence", label: "Confidence" },
  { value: "duration", label: "Duration" },
  { value: "provider", label: "Provider" },
] as const

type GroupingValue = (typeof GROUPING_OPTIONS)[number]["value"]

const SEARCH_MODES: SearchMode[] = [
  "full-text",
  "fuzzy",
  "semantic",
  "regex",
]

type SearchMode = NonNullable<RecordingHistorySearchFilters["searchMode"]>
type SortField = NonNullable<RecordingHistorySearchFilters["sortBy"]>

const SORT_OPTIONS = [
  { value: "createdAt", label: "Newest" },
  { value: "duration", label: "Duration" },
  { value: "processingTime", label: "Processing time" },
  { value: "confidence", label: "Confidence" },
] as const

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

type FilterInputProps = ComponentProps<typeof Input> & { label: string }

const FilterInput = ({ label, ...props }: FilterInputProps) => (
  <label className="grid gap-1 text-xs text-white/60">
    <span>{label}</span>
    <Input wrapperClassName="bg-white/5 border-white/10" {...props} />
  </label>
)

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

const useDebounce = <T,>(value: T, delay = 250) => {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

const loadSavedSearches = (): SavedRecordingSearch[] => {
  try {
    const raw = localStorage.getItem(SAVED_SEARCH_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedRecordingSearch[]
    return parsed
  } catch {
    return []
  }
}

const persistSavedSearches = (items: SavedRecordingSearch[]) => {
  try {
    localStorage.setItem(SAVED_SEARCH_STORAGE_KEY, JSON.stringify(items))
  } catch {}
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
  const historyQuery = useQuery({
    queryKey: ["recording-history"],
    queryFn: async () => tipcClient.getRecordingHistory(),
  })

  const [searchKeyword, setSearchKeyword] = useState("")
  const debouncedKeyword = useDebounce(searchKeyword)
  const [searchMode, setSearchMode] = useState<SearchMode>("full-text")
  const [booleanOperator, setBooleanOperator] = useState<"and" | "or">("and")
  const [excludedKeywords, setExcludedKeywords] = useState("")
  const [datePreset, setDatePreset] = useState<DatePreset>("all")
  const [customDateRange, setCustomDateRange] = useState<{ from?: string; to?: string }>({})
  const [durationRange, setDurationRange] = useState({ min: "", max: "" })
  const [lengthRange, setLengthRange] = useState({ min: "", max: "" })
  const [wordRange, setWordRange] = useState({ min: "", max: "" })
  const [confidenceFilter, setConfidenceFilter] = useState({ min: "", max: "" })
  const [audioFilters, setAudioFilters] = useState({ minAverage: "", maxAverage: "", maxSilence: "" })
  const [tagFilters, setTagFilters] = useState<string[]>([])
  const [grouping, setGrouping] = useState<GroupingValue>("date")
  const [sortBy, setSortBy] = useState<SortField>("createdAt")
  const [savedSearches, setSavedSearches] = useState<SavedRecordingSearch[]>(() => loadSavedSearches())
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

  const historySuggestions = useMemo(() => {
    if (!historyQuery.data) return []
    const counts = new Map<string, number>()
    for (const item of historyQuery.data) {
      const terms = item.transcript
        .split(/\s+/)
        .map((word) => word.toLowerCase().replace(/[^a-z0-9]/g, ""))
        .filter((word) => word.length >= 4)
      for (const term of terms) {
        counts.set(term, (counts.get(term) || 0) + 1)
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([value]) => value)
  }, [historyQuery.data])

  const availableTags = useMemo(() => {
    if (!historyQuery.data) return []
    const tags = new Set<string>()
    for (const item of historyQuery.data) {
      for (const tag of item.tags || []) {
        tags.add(tag)
      }
    }
    return Array.from(tags).sort()
  }, [historyQuery.data])

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
  const rowVirtualizer = useVirtualizer({
    count: flattenedRows.length,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 140,
    overscan: 8,
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
    if (!window.confirm(`Delete ${selectedIds.size} recording(s)? This cannot be undone.`)) {
      return
    }
    void bulkAction((id) => tipcClient.deleteRecordingItem({ id }), "Deleting...", "Deleted")
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
    setBulkStatus("Exported to clipboard")
    setTimeout(() => setBulkStatus(null), 2000)
  }

  const handleBulkTag = () => {
    if (!selectedIds.size) return
    const value = window.prompt("Enter tags separated by commas")
    if (!value) return
    const tags = value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
    if (!tags.length) return
    void bulkAction(
      (id) => tipcClient.updateRecordingItem({ id, patch: { tags } }),
      "Updating tags...",
      "Tags updated",
    )
  }

  const handleSaveCurrentSearch = () => {
    const name = window.prompt("Save this search as")
    if (!name) return
    const next: SavedRecordingSearch = {
      id: crypto.randomUUID(),
      name,
      filters: remoteFilters,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      usageCount: 0,
    }
    const updated = [...savedSearches, next]
    setSavedSearches(updated)
    persistSavedSearches(updated)
  }

  const applySavedSearch = (entry: SavedRecordingSearch) => {
    setSearchMode(entry.filters.searchMode || "full-text")
    setBooleanOperator(entry.filters.booleanOperator || "and")
    setSearchKeyword(entry.filters.text || "")
    setExcludedKeywords((entry.filters.mustNotInclude || []).join(", "))
    if (entry.filters.dateRange) {
      setDatePreset("custom")
      setCustomDateRange({
        from: entry.filters.dateRange.from
          ? dayjs(entry.filters.dateRange.from).format("YYYY-MM-DD")
          : undefined,
        to: entry.filters.dateRange.to
          ? dayjs(entry.filters.dateRange.to).format("YYYY-MM-DD")
          : undefined,
      })
    } else {
      setDatePreset("all")
      setCustomDateRange({})
    }
    setDurationRange({
      min: entry.filters.durationMsRange?.min
        ? String(Math.round(entry.filters.durationMsRange.min / 1000))
        : "",
      max: entry.filters.durationMsRange?.max
        ? String(Math.round(entry.filters.durationMsRange.max / 1000))
        : "",
    })
    setLengthRange({
      min: entry.filters.transcriptLengthRange?.min
        ? String(entry.filters.transcriptLengthRange.min)
        : "",
      max: entry.filters.transcriptLengthRange?.max
        ? String(entry.filters.transcriptLengthRange.max)
        : "",
    })
    setWordRange({
      min: entry.filters.wordCountRange?.min ? String(entry.filters.wordCountRange.min) : "",
      max: entry.filters.wordCountRange?.max ? String(entry.filters.wordCountRange.max) : "",
    })
    setConfidenceFilter({
      min: entry.filters.confidenceRange?.min
        ? String(Math.round((entry.filters.confidenceRange.min || 0) * 100))
        : "",
      max: entry.filters.confidenceRange?.max
        ? String(Math.round((entry.filters.confidenceRange.max || 0) * 100))
        : "",
    })
    setAudioFilters({
      minAverage: entry.filters.audioProfile?.minAverageLevel
        ? String(entry.filters.audioProfile.minAverageLevel)
        : "",
      maxAverage: entry.filters.audioProfile?.maxAverageLevel
        ? String(entry.filters.audioProfile.maxAverageLevel)
        : "",
      maxSilence: entry.filters.audioProfile?.maxSilenceRatio
        ? String(entry.filters.audioProfile.maxSilenceRatio)
        : "",
    })
    setTagFilters(entry.filters.tags || [])
    setSortBy(entry.filters.sortBy || "createdAt")
    const updated = savedSearches.map((search) =>
      search.id === entry.id
        ? { ...search, lastUsedAt: Date.now(), usageCount: search.usageCount + 1 }
        : search,
    )
    setSavedSearches(updated)
    persistSavedSearches(updated)
  }

  const deleteSavedSearch = (id: string) => {
    const updated = savedSearches.filter((entry) => entry.id !== id)
    setSavedSearches(updated)
    persistSavedSearches(updated)
  }

  const renderRow = (row: FlattenedHistoryRow) => {
    if (row.type === "group") {
      return (
        <div className="flex items-center justify-between rounded-full bg-white/[0.05] px-4 py-2 text-xs font-semibold uppercase tracking-wide">
          <span>{row.label}</span>
          <span className="text-white/60">{row.count} item(s)</span>
        </div>
      )
    }

    const record = row.record
    const isSelected = selectedIds.has(record.id)
    const confidence = record.confidenceScore ?? record.accuracyScore

    return (
      <div
        className={cn(
          "rounded-2xl border border-white/10 bg-white/[0.015] px-4 py-4 transition-colors",
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
                <div className="text-base font-semibold">
                  {record.transcript.slice(0, 160) || "(Empty transcript)"}
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
                  const value = window.prompt("Add tags separated by commas", (record.tags || []).join(", "))
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
                <span className="i-mingcute-add-line" /> Tag
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
        title="History & Analytics"
        description="Search, filter, and review your recordings with the analytics tooling."
        actions={
          <>
            <Input
              placeholder="Search transcripts"
              wrapperClassName="bg-white/5 border-white/10"
              endContent={<span className="i-mingcute-search-2-line text-white/60" />}
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
            />
            <Select
              value={searchMode}
              onValueChange={(value) => setSearchMode(value as SearchMode)}
            >
              <SelectTrigger className="w-32 border-white/10 bg-white/5">
                <SelectValue placeholder="Mode" />
              </SelectTrigger>
              <SelectContent>
                {SEARCH_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {mode === "full-text" && "Full text"}
                    {mode === "fuzzy" && "Fuzzy"}
                    {mode === "semantic" && "Semantic"}
                    {mode === "regex" && "Regex"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={booleanOperator}
              onValueChange={(value) => setBooleanOperator(value as "and" | "or")}
            >
              <SelectTrigger className="w-24 border-white/10 bg-white/5">
                <SelectValue placeholder="Logic" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="and">AND</SelectItem>
                <SelectItem value="or">OR</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={sortBy}
              onValueChange={(value) => setSortBy(value as SortField)}
            >
              <SelectTrigger className="w-36 border-white/10 bg-white/5">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={handleSaveCurrentSearch}>
              <span className="i-mingcute-bookmark-line" /> Save search
            </Button>
          </>
        }
      />

      <div className="flex h-full flex-col gap-6 lg:flex-row">
        <aside className="flex w-full flex-col gap-4 overflow-auto text-sm lg:w-80">
          <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-white/60">
              Date range
            </div>
            <Select
              value={datePreset}
              onValueChange={(value) => setDatePreset(value as DatePreset)}
            >
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                {DATE_PRESETS.map((preset) => (
                  <SelectItem key={preset.value} value={preset.value}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {datePreset === "custom" && (
              <div className="flex flex-col gap-2">
              <FilterInput
                type="date"
                label="From"
                value={customDateRange.from || ""}
                onChange={(event) =>
                  setCustomDateRange((prev) => ({ ...prev, from: event.target.value }))
                }
              />
              <FilterInput
                type="date"
                label="To"
                value={customDateRange.to || ""}
                onChange={(event) =>
                  setCustomDateRange((prev) => ({ ...prev, to: event.target.value }))
                }
              />
            </div>
          )}
          </section>

          <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-white/60">
              Filters
            </div>
            <div className="grid gap-3">
              <FilterInput
                label="Exclude keywords"
                placeholder="comma separated"
                value={excludedKeywords}
                onChange={(event) => setExcludedKeywords(event.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <FilterInput
                  label="Min duration (s)"
                  value={durationRange.min}
                  onChange={(event) => setDurationRange((prev) => ({ ...prev, min: event.target.value }))}
                />
                <FilterInput
                  label="Max duration (s)"
                  value={durationRange.max}
                  onChange={(event) => setDurationRange((prev) => ({ ...prev, max: event.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FilterInput
                  label="Min chars"
                  value={lengthRange.min}
                  onChange={(event) => setLengthRange((prev) => ({ ...prev, min: event.target.value }))}
                />
                <FilterInput
                  label="Max chars"
                  value={lengthRange.max}
                  onChange={(event) => setLengthRange((prev) => ({ ...prev, max: event.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FilterInput
                  label="Min words"
                  value={wordRange.min}
                  onChange={(event) => setWordRange((prev) => ({ ...prev, min: event.target.value }))}
                />
                <FilterInput
                  label="Max words"
                  value={wordRange.max}
                  onChange={(event) => setWordRange((prev) => ({ ...prev, max: event.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FilterInput
                  label="Min accuracy %"
                  value={confidenceFilter.min}
                  onChange={(event) => setConfidenceFilter((prev) => ({ ...prev, min: event.target.value }))}
                />
                <FilterInput
                  label="Max accuracy %"
                  value={confidenceFilter.max}
                  onChange={(event) => setConfidenceFilter((prev) => ({ ...prev, max: event.target.value }))}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <FilterInput
                  label="Min avg lvl"
                  value={audioFilters.minAverage}
                  onChange={(event) => setAudioFilters((prev) => ({ ...prev, minAverage: event.target.value }))}
                />
                <FilterInput
                  label="Max avg lvl"
                  value={audioFilters.maxAverage}
                  onChange={(event) => setAudioFilters((prev) => ({ ...prev, maxAverage: event.target.value }))}
                />
                <FilterInput
                  label="Max silence"
                  value={audioFilters.maxSilence}
                  onChange={(event) => setAudioFilters((prev) => ({ ...prev, maxSilence: event.target.value }))}
                />
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-white/60">
              Tag filters
            </div>
            <div className="flex flex-wrap gap-2">
              {availableTags.length === 0 && <span className="text-xs text-white/50">No tags yet</span>}
              {availableTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs",
                    tagFilters.includes(tag)
                      ? "border-white bg-white/20 text-white"
                      : "border-white/10 text-white/70 hover:border-white/30",
                  )}
                  onClick={() =>
                    setTagFilters((prev) =>
                      prev.includes(tag)
                        ? prev.filter((item) => item !== tag)
                        : [...prev, tag],
                    )
                  }
                >
                  #{tag}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-white/60">
              Saved searches
            </div>
            <div className="space-y-1">
              {savedSearches.length === 0 && (
                <p className="text-xs text-white/50">No saved searches yet.</p>
              )}
              {savedSearches.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs"
                >
                  <button
                    className="text-left font-medium"
                    onClick={() => applySavedSearch(entry)}
                  >
                    {entry.name}
                  </button>
                  <button
                    className="text-white/60 hover:text-red-400"
                    onClick={() => deleteSavedSearch(entry.id)}
                  >
                    <span className="i-mingcute-delete-2-line" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </aside>

        <main className="flex h-full flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <div className="text-xs uppercase text-white/60">Matches</div>
              <div className="text-2xl font-semibold">
                {searchQuery.data?.total ?? "--"}
              </div>
              <div className="text-xs text-white/60">of {historyQuery.data?.length ?? "--"} recordings</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <div className="text-xs uppercase text-white/60">Total duration</div>
              <div className="text-2xl font-semibold">
                {searchQuery.data ? formatDuration(searchQuery.data.stats.totalDurationMs) : "--"}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <div className="text-xs uppercase text-white/60">Avg processing</div>
              <div className="text-2xl font-semibold">
                {searchQuery.data ? formatProcessingTime(searchQuery.data.stats.averageProcessingTimeMs || undefined) : "--"}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <div className="text-xs uppercase text-white/60">Avg accuracy</div>
              <div className="text-2xl font-semibold">
                {searchQuery.data ? formatConfidence(searchQuery.data.stats.averageConfidence) : "--"}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold uppercase tracking-wide text-white/60">
                Group by
              </span>
              <Select
                value={grouping}
                onValueChange={(value) => setGrouping(value as GroupingValue)}
              >
                <SelectTrigger className="w-40 border-white/10 bg-white/5">
                  <SelectValue placeholder="Grouping" />
                </SelectTrigger>
                <SelectContent>
                  {GROUPING_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-white/60">
              {flattenedRows.length} row(s)
            </div>
          </div>

          {historySuggestions.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-3 text-xs">
              <span className="text-white/60">Suggestions:</span>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {historySuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    className="rounded-full border border-white/10 px-2 py-1"
                    onClick={() => setSearchKeyword((prev) => `${prev} ${suggestion}`.trim())}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-3 text-sm">
              <span className="font-semibold">{selectedIds.size} selected</span>
              <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                Select all
              </Button>
              <Button variant="ghost" size="sm" onClick={handleClearSelection}>
                Clear
              </Button>
              <div className="ml-auto flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleBulkTag}>
                  <span className="i-mingcute-hashtag-line" /> Tag
                </Button>
                <Button variant="ghost" size="sm" onClick={handleBulkExport}>
                  <span className="i-mingcute-download-line" /> Export
                </Button>
                <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                  <span className="i-mingcute-delete-2-line" /> Delete
                </Button>
              </div>
            </div>
          )}

          {bulkStatus && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-6 py-2 text-xs text-amber-100">
              {bulkStatus}
            </div>
          )}

          <div ref={listParentRef} className="flex-1 overflow-auto rounded-2xl border border-white/10 bg-black/30">
            {!searchQuery.data ? (
              <div className="flex h-full items-center justify-center text-sm text-white/60">
                Loading history…
              </div>
            ) : flattenedRows.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-white/60">
                <span>No recordings match the current filters.</span>
                <Button variant="ghost" size="sm" onClick={() => {
                  setSearchKeyword("")
                  setExcludedKeywords("")
                  setDatePreset("all")
                  setCustomDateRange({})
                  setDurationRange({ min: "", max: "" })
                  setLengthRange({ min: "", max: "" })
                  setWordRange({ min: "", max: "" })
                  setConfidenceFilter({ min: "", max: "" })
                  setAudioFilters({ minAverage: "", maxAverage: "", maxSilence: "" })
                  setTagFilters([])
                }}>
                  Reset filters
                </Button>
              </div>
            ) : (
              <div
                style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}
                className="px-4"
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const item = flattenedRows[virtualRow.index]
                  return (
                    <div
                      key={virtualRow.key}
                      className="absolute left-0 right-0"
                      style={{
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      {renderRow(item)}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

const itemButtonVariants = ({ isDanger }: { isDanger?: boolean } = {}) =>
  cn(
    "inline-flex h-8 w-8 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white",
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
  return (
    <button
      type="button"
      className={itemButtonVariants({ isDanger: true })}
      onClick={async () => {
        if (window.confirm("Delete this recording forever?")) {
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
