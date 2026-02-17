import styles from "./AutoJournal.module.scss"
import {
  CrossIcon,
  RefreshIcon,
  ClockIcon,
  SettingsIcon,
  TrashIcon,
  EditIcon,
} from "renderer/icons"
import { useState, useMemo, useEffect } from "react"
import Markdown from "react-markdown"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import * as Tabs from "@radix-ui/react-tabs"
import * as Switch from "@radix-ui/react-switch"
import { tipcClient } from "renderer/lib/tipc-client"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import { useTranslation } from "react-i18next"

dayjs.extend(relativeTime)
import { usePilesContext } from "renderer/context/PilesContext"
import { useToastsContext } from "renderer/context/ToastsContext"
import { useIndexContext } from "renderer/context/IndexContext"
import layoutStyles from "../PileLayout.module.scss"
import Toasts from "../Toasts"
import Navigation from "../Navigation"

const isNoRecordingsSummary = (summaryText) => {
  if (!summaryText) return true
  return summaryText
    .trim()
    .toLowerCase()
    .includes("no recordings found in the selected time window")
}

const hasRunContent = (run) => {
  const summaryText = run?.summary?.summary
  const hasActivities = (run?.summary?.activities?.length || 0) > 0
  const hasSummaryText = Boolean(summaryText && summaryText.trim().length > 0)

  if (!hasSummaryText && !hasActivities) return false
  return !isNoRecordingsSummary(summaryText)
}

function AutoJournal() {

  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { piles, getCurrentPilePath, currentTheme, currentPile } = usePilesContext()
  const { addNotification } = useToastsContext()
  const { prependIndex, addIndex } = useIndexContext()
  const [mainTab, setMainTab] = useState("runs")
  const [selectedRunId, setSelectedRunId] = useState(null)
  const [savingRunId, setSavingRunId] = useState(null)
  const [savedRunIds, setSavedRunIds] = useState(new Set())
  const [editingTitlePrompt, setEditingTitlePrompt] = useState(false)
  const [editingSummaryPrompt, setEditingSummaryPrompt] = useState(false)
  const [titlePromptExpanded, setTitlePromptExpanded] = useState(false)
  const [summaryPromptExpanded, setSummaryPromptExpanded] = useState(false)
  const themeStyles = useMemo(
    () => (currentTheme ? `${currentTheme}Theme` : ""),
    [currentTheme],
  )
  const osStyles = useMemo(
    () => (window.electron.isMac ? layoutStyles.mac : layoutStyles.win),
    [],
  )

  // Queries
  const runsQuery = useQuery({
    queryKey: ["auto-journal-runs"],
    queryFn: async () => tipcClient.listAutoJournalRuns({ limit: 100 }),
  })

  const settingsQuery = useQuery({
    queryKey: ["auto-journal-settings"],
    queryFn: async () => tipcClient.getAutoJournalSettings(),
  })

  const periodicScreenshotQuery = useQuery({
    queryKey: ["periodic-screenshot-status"],
    queryFn: async () => tipcClient.getPeriodicScreenshotStatus(),
    refetchInterval: 10000, // Refresh every 10 seconds
  })

  const screenSessionStatusQuery = useQuery({
    queryKey: ["screen-session-recording-status"],
    queryFn: async () => tipcClient.getScreenSessionRecordingStatus(),
    refetchInterval: 5000,
  })

  const schedulerStatusQuery = useQuery({
    queryKey: ["auto-journal-scheduler-status"],
    queryFn: async () => tipcClient.getAutoJournalSchedulerStatus(),
    refetchInterval: 10000, // Refresh every 10 seconds to update countdown
  })

  // Mutations
  const saveSettingsMutation = useMutation({
    mutationFn: (settings) => tipcClient.saveAutoJournalSettings(settings),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ["auto-journal-settings"] })
      queryClient.invalidateQueries({ queryKey: ["auto-journal-scheduler-status"] })
      addNotification({
        id: Date.now(),
        message: t("autoJournal.settingsSaved"),
      })
    },
  })

  const runNowMutation = useMutation({
    mutationFn: (windowMinutes) =>
      tipcClient.runAutoJournalNow({ windowMinutes }),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ["auto-journal-runs"] })
      addNotification({
        id: Date.now(),
        message: t("autoJournal.runCompleted"),
      })
    },
    onError(error) {
      addNotification({
        id: Date.now(),
        type: "error",
        message: `${t("autoJournal.error")} ${error.message}`,
      })
    },
  })

  const saveToJournalMutation = useMutation({
    mutationFn: async ({ run, pilePath }) => {
      if (!run.summary) throw new Error("No summary to save")
      if (!pilePath) {
        throw new Error("No pile path available")
      }

      return tipcClient.createAutoJournalEntry({
        pilePath,
        summary: run.summary.summary,
        activities: run.summary.activities || [],
        windowStartTs: run.summary.windowStartTs,
        windowEndTs: run.summary.windowEndTs,
        highlight: run.summary.highlight || null,
      })
    },
  })

  const deleteRunMutation = useMutation({
    mutationFn: (runId) => tipcClient.deleteAutoJournalRun({ runId }),
    onSuccess(_, runId) {
      // Clear selection if we deleted the selected run
      if (selectedRunId === runId) {
        setSelectedRunId(null)
      }
      queryClient.invalidateQueries({ queryKey: ["auto-journal-runs"] })
      addNotification({
        id: Date.now(),
        message: t("autoJournal.runDeleted"),
      })
    },
    onError(error) {
      addNotification({
        id: Date.now(),
        type: "error",
        message: `${t("autoJournal.deleteError")} ${error.message}`,
      })
    },
  })

  const savePeriodicScreenshotMutation = useMutation({
    mutationFn: (settings) => tipcClient.savePeriodicScreenshotSettings(settings),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ["periodic-screenshot-status"] })
      addNotification({
        id: Date.now(),
        message: t("autoJournal.settingsSaved"),
      })
    },
  })

  const saveScreenSessionSettingsMutation = useMutation({
    mutationFn: (input) => tipcClient.saveScreenSessionRecordingSettings(input),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ["screen-session-recording-status"] })
      queryClient.invalidateQueries({ queryKey: ["auto-journal-settings"] })
      addNotification({
        id: Date.now(),
        message: t("autoJournal.settingsSaved"),
      })
    },
    onError(error) {
      addNotification({
        id: Date.now(),
        type: "error",
        message: `${t("autoJournal.error")} ${error.message}`,
      })
    },
  })

  const startScreenSessionMutation = useMutation({
    mutationFn: (input) => tipcClient.startScreenSessionRecording(input),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ["screen-session-recording-status"] })
      addNotification({
        id: Date.now(),
        message: t("autoJournal.videoRecordingStarted"),
      })
    },
    onError(error) {
      addNotification({
        id: Date.now(),
        type: "error",
        message: `${t("autoJournal.error")} ${error.message}`,
      })
    },
  })

  const stopScreenSessionMutation = useMutation({
    mutationFn: () => tipcClient.stopScreenSessionRecording(),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ["screen-session-recording-status"] })
      addNotification({
        id: Date.now(),
        message: t("autoJournal.videoRecordingStopped"),
      })
    },
    onError(error) {
      addNotification({
        id: Date.now(),
        type: "error",
        message: `${t("autoJournal.error")} ${error.message}`,
      })
    },
  })

  // Default prompts (Dayflow-style)
  const defaultTitlePrompt = `Title guidelines:
Write titles like you're texting a friend about what you did. Natural, conversational, direct, specific.

Rules:
- Be specific and clear (not creative or vague)
- Keep it short - aim for 5-10 words
- Don't reference other cards or assume context
- Include main activity + distraction if relevant
- Include specific app/tool names, not generic activities
- Use specific verbs: "Debugged Python" not "Worked on project"

Good examples:
- "Debugged auth flow in React"
- "Excel budget analysis for Q4 report"
- "Zoom call with design team"
- "Booked flights on Expedia for Denver trip"
- "Watched Succession finale on HBO"
- "Grocery list and meal prep research"
- "Reddit rabbit hole about conspiracy theories"
- "Random YouTube shorts for 30 minutes"
- "Instagram reels and Twitter scrolling"

Bad examples:
- "Early morning digital drift" (too vague/poetic)
- "Fell down a rabbit hole after lunch" (too long, assumes context)
- "Extended Browsing Session" (too formal)
- "Random browsing and activities" (not specific)
- "Continuing from earlier" (references other cards)
- "Worked on DayFlow project" (too generic - what specifically?)
- "Browsed social media and shopped" (which platforms? for what?)
- "Refined UI and prompts" (which tools? what UI?)`

  const defaultSummaryPrompt = `Summary guidelines:
Write brief factual summaries optimized for quick scanning. First person perspective without "I".

Critical rules - NEVER:
- Use third person ("The session", "The work")
- Assume future actions, mental states, or unverifiable details
- Add filler phrases like "kicked off", "dove into", "started with", "began by"
- Write more than 2-3 short sentences
- Repeat the same phrases across different summaries

Style guidelines:
- State what happened directly - no lead-ins
- List activities and tools concisely
- Mention major interruptions or context switches briefly
- Keep technical terms simple

Content rules:
- Maximum 2-3 sentences
- Just the facts: what you did, which tools/projects, major blockers
- Include specific names (apps, tools, sites) not generic terms
- Note pattern interruptions without elaborating

Good examples:
"Refactored the user auth module in React, added OAuth support. Debugged CORS issues with the backend API for an hour. Posted question on Stack Overflow when the fix wasn't working."

"Designed new landing page mockups in Figma. Exported assets and started implementing in Next.js before getting pulled into a client meeting that ran long."

"Researched competitors' pricing models across SaaS platforms. Built comparison spreadsheet and wrote up recommendations. Got sidetracked reading an article about pricing psychology."

"Configured CI/CD pipeline in GitHub Actions. Tests kept failing on the build step, turned out to be a Node version mismatch. Fixed it and deployed to staging."

Bad examples:
"Kicked off the morning by diving into some design work before transitioning to development tasks. The session was quite productive overall."
(Too vague, unnecessary transitions, says nothing specific)

"Started with refactoring the authentication system before moving on to debugging some issues that came up. Ended up spending time researching solutions online."
(Wordy, lacks specifics, could be half the length)

"Began by reviewing the codebase and then dove deep into implementing new features. The work involved multiple context switches between different parts of the application."
(All filler, no actual information)`

  // Derived state
  const runs = runsQuery.data || []
  const settings = {
    autoJournalEnabled: false,
    autoJournalWindowMinutes: 60,
    autoJournalSourceMode: "both",
    autoJournalTargetPilePath: "",
    autoJournalAutoSaveEnabled: false,
    autoJournalPrompt: "",
    autoJournalTitlePromptEnabled: false,
    autoJournalTitlePrompt: "",
    autoJournalSummaryPromptEnabled: false,
    autoJournalSummaryPrompt: "",
    autoJournalIncludeScreenCapture: false,
    screenSessionRecordingEnabled: false,
    screenSessionCaptureIntervalSeconds: 5,
    ...(settingsQuery.data || {}),
  }

  const resolvePilePath = () => {
    // Prefer explicit target, then current pile, then first available pile
    const targetPath = settings.autoJournalTargetPilePath
    const currentPath = getCurrentPilePath()
    const firstPilePath = piles && piles.length > 0 ? piles[0].path : ""

    const resolved = targetPath || currentPath || firstPilePath

    console.log("[auto-journal] resolvePilePath:", {
      targetPath,
      currentPath,
      firstPilePath,
      resolved,
      pilesCount: piles?.length,
    })

    return resolved
  }

  // Reset saving state if run selection changes
  useEffect(() => {
    setSavingRunId(null)
  }, [selectedRunId])

  // Auto-select the first run when data loads
  useEffect(() => {
    if (runs.length > 0 && !selectedRunId) {
      setSelectedRunId(runs[0].id)
    }
  }, [runs, selectedRunId])

  const selectedRun = useMemo(() => {
    if (!selectedRunId) return null
    return runs.find((r) => r.id === selectedRunId) || null
  }, [selectedRunId, runs])
  const hasSelectedRun = Boolean(selectedRun)
  const canShowRunDetails = Boolean(selectedRun?.summary)

  // Check if selected run has real content (not just "No recordings found")
  const selectedRunHasContent = useMemo(() => {
    if (!selectedRun?.summary) return false
    return hasRunContent(selectedRun)
  }, [selectedRun])

  // Handlers
  const handleToggleEnabled = () => {
    saveSettingsMutation.mutate({
      ...settings,
      autoJournalEnabled: !settings.autoJournalEnabled,
    })
  }

  const handleWindowChange = (value) => {
    saveSettingsMutation.mutate({
      ...settings,
      autoJournalWindowMinutes: Number(value),
    })
  }

  const handleSourceModeChange = (value) => {
    saveSettingsMutation.mutate({
      ...settings,
      autoJournalSourceMode: value,
    })
  }

  const handleTargetPileChange = (value) => {
    saveSettingsMutation.mutate({
      ...settings,
      autoJournalTargetPilePath: value,
    })
  }

  const handleAutoSaveChange = (enabled) => {
    saveSettingsMutation.mutate({
      ...settings,
      autoJournalAutoSaveEnabled: enabled,
    })
  }

  const handleScreenCaptureChange = (enabled) => {
    saveSettingsMutation.mutate({
      ...settings,
      autoJournalIncludeScreenCapture: enabled,
    })
  }

  const handlePromptChange = (value) => {
    saveSettingsMutation.mutate({
      ...settings,
      autoJournalPrompt: value,
    })
  }

  const handleTitlePromptEnabledChange = (enabled) => {
    saveSettingsMutation.mutate({
      ...settings,
      autoJournalTitlePromptEnabled: enabled,
    })
  }

  const handleTitlePromptChange = (value) => {
    saveSettingsMutation.mutate({
      ...settings,
      autoJournalTitlePrompt: value,
    })
  }

  const handleSummaryPromptEnabledChange = (enabled) => {
    saveSettingsMutation.mutate({
      ...settings,
      autoJournalSummaryPromptEnabled: enabled,
    })
  }

  const handleSummaryPromptChange = (value) => {
    saveSettingsMutation.mutate({
      ...settings,
      autoJournalSummaryPrompt: value,
    })
  }

  const handleScreenSessionEnabledChange = (enabled) => {
    saveScreenSessionSettingsMutation.mutate({
      enabled,
      intervalSeconds:
        screenSessionStatusQuery.data?.intervalSeconds ||
        settings.screenSessionCaptureIntervalSeconds ||
        5,
    })
  }

  const handleScreenSessionIntervalChange = (value) => {
    saveScreenSessionSettingsMutation.mutate({
      enabled:
        screenSessionStatusQuery.data?.enabled ??
        settings.screenSessionRecordingEnabled ??
        false,
      intervalSeconds: Number(value),
    })
  }

  const handleRunNow = () => {
    runNowMutation.mutate(settings.autoJournalWindowMinutes)
  }

  const handleSaveToJournal = async (run) => {
    console.log("[auto-journal] handleSaveToJournal called with run:", run?.id)

    // Check if there's actual content to save
    const hasRealContent = hasRunContent(run)

    if (!hasRealContent) {
      console.log("[auto-journal] No real content to save, skipping")
      addNotification({
        id: Date.now(),
        type: "error",
        message: t("autoJournal.noContentToSave"),
      })
      return
    }

    const pilePath = resolvePilePath()
    if (!pilePath) {
      console.error("[auto-journal] No pile path resolved")
      addNotification({
        id: Date.now(),
        type: "error",
        message: t("autoJournal.noPileSelected"),
      })
      return
    }

    console.log("[auto-journal] Saving to pile:", pilePath)
    console.log("[auto-journal] Run summary:", run?.summary)

    const timeoutMs = 15000
    let timedOut = false
    setSavingRunId(run.id)

    const timer = setTimeout(() => {
      timedOut = true
      setSavingRunId(null)
      console.error("[auto-journal] Save timeout after", timeoutMs, "ms")
      addNotification({
        id: Date.now(),
        type: "error",
        message: `${t("autoJournal.saveError")} ${t("autoJournal.timeout")}`,
      })
    }, timeoutMs)

    try {
      const result = await saveToJournalMutation.mutateAsync({ run, pilePath })
      if (timedOut) return
      clearTimeout(timer)
      console.log("[auto-journal] Save successful:", result)

      // Build post data for the index
      const postData = {
        title: run.summary.activities?.[0]?.title || "Auto Journal",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isAI: true,
        isReply: false,
        tags: ["auto-journal"],
        replies: [],
        attachments: [],
        highlight: run.summary.highlight || null,
      }

      // Add to index using the relative path returned from backend
      const relativePath = result.relativePath
      console.log("[auto-journal] Adding to index:", relativePath, postData)

      prependIndex(relativePath, postData)
      await addIndex(relativePath)
      console.log("[auto-journal] Index updated")

      // Mark this run as saved
      setSavedRunIds((prev) => new Set([...prev, run.id]))

      addNotification({
        id: Date.now(),
        message: t("autoJournal.savedToJournal"),
      })
    } catch (error) {
      if (timedOut) return
      clearTimeout(timer)
      console.error("[auto-journal] Save failed:", error)
      addNotification({
        id: Date.now(),
        type: "error",
        message: `${t("autoJournal.saveError")} ${error?.message ?? ""}`,
      })
    } finally {
      if (!timedOut) {
        setSavingRunId(null)
      }
    }
  }

  // Formatters
  const formatDate = (timestamp) => {
    return dayjs(timestamp).format("MMM D, HH:mm")
  }

  const formatDuration = (start, end) => {
    const seconds = Math.round((end - start) / 1000)
    return `${seconds}s`
  }

  return (
    <div className={`${layoutStyles.frame} ${themeStyles} ${osStyles}`}>
      <div className={layoutStyles.bg}></div>

      {/* Toast notifications - always above page container */}
      <Toasts />

      <div className={styles.pageContainer}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.wrapper}>
            <div className={styles.DialogTitle}>
              <span>{t("autoJournal.title")}</span>
              <button
                className={styles.RefreshButton}
                onClick={() => runsQuery.refetch()}
                title={t("common.refresh")}
              >
                <RefreshIcon style={{ height: "14px", width: "14px" }} />
              </button>
            </div>
            <button
              className={styles.close}
              onClick={() => navigate("/")}
              title={t("common.close")}
            >
              <CrossIcon style={{ height: 14, width: 14 }} />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className={styles.mainContent}>
          <Tabs.Root
            value={mainTab}
            onValueChange={setMainTab}
            className={styles.tabsRoot}
          >
            <Tabs.List className={styles.TabsList}>
              <Tabs.Trigger value="runs" className={styles.TabTrigger}>
                <ClockIcon style={{ height: "16px", width: "16px" }} />
                {t("autoJournal.runs")}
              </Tabs.Trigger>
              <Tabs.Trigger value="settings" className={styles.TabTrigger}>
                <SettingsIcon style={{ height: "16px", width: "16px" }} />
                {t("common.settings")}
              </Tabs.Trigger>
            </Tabs.List>

            {/* Runs Tab */}
            <Tabs.Content value="runs" className={styles.RunsTabContent}>
              <div className={styles.ContentShell}>
                <div
                  className={`${styles.SplitPane} ${selectedRunId ? styles.SplitPaneWithSelection : ""}`}
                >
                  {/* Left Panel - List */}
                  <div className={styles.LeftPanel}>
                    {/* Generate Now */}
                    <div className={styles.GenerateCard}>
                      <div className={styles.GenerateHeader}>
                        <span>{t("autoJournal.generateDescription")}</span>
                        <button
                          onClick={handleRunNow}
                          disabled={runNowMutation.isPending}
                          className={styles.ActionBtn}
                        >
                          {runNowMutation.isPending
                            ? t("autoJournal.generating")
                            : t("autoJournal.generateNow")}
                        </button>
                      </div>
                    </div>

                    {/* Run List - Timeline/Calendar style */}
                    <div className={styles.RunList}>
                      {runs.length === 0 ? (
                        <div className={styles.EmptyState}>
                          {runsQuery.isLoading
                            ? t("common.loading")
                            : t("autoJournal.noRuns")}
                        </div>
                      ) : (
                        runs.map((run) => {
                          const runHasContent = hasRunContent(run)

                          const runDate = new Date(run.startedAt)
                          const dayNames = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
                          const dayName = dayNames[runDate.getDay()]
                          const dayNumber = runDate.getDate()

                          return (
                            <div
                              key={run.id}
                              className={`${styles.dayRow} ${selectedRunId === run.id ? styles.selected : ""}`}
                              onClick={() =>
                                setSelectedRunId(
                                  selectedRunId === run.id ? null : run.id,
                                )
                              }
                            >
                              {/* Activities Column (left) */}
                              <div className={styles.activitiesColumn}>
                                {run.summary?.activities?.length > 0 ? (
                                  run.summary.activities.map((activity, idx) => (
                                    <div key={idx} className={styles.activityItem}>
                                      <span className={styles.activityTime}>
                                        {new Date(activity.startTs).getHours().toString().padStart(2, '0')}h
                                      </span>
                                      <span className={styles.activityTitle}>{activity.title}</span>
                                    </div>
                                  ))
                                ) : runHasContent && run.summary?.summary ? (
                                  <span className={styles.activityTitle}>{run.summary.summary}</span>
                                ) : (
                                  <span className={styles.emptyIndicator}>
                                    {run.error ? run.error : t("autoJournal.empty")}
                                  </span>
                                )}
                              </div>

                              {/* Date Column (right) - Timeline style */}
                              <div className={styles.dateColumn}>
                                <div className={styles.dots}>
                                  {runHasContent && run.summary?.activities?.slice(0, 5).map((_, idx) => (
                                    <span key={idx} className={`${styles.dot} ${styles[run.status]}`} />
                                  ))}
                                </div>
                                <div className={styles.dateLine} />
                                <span className={styles.dayLabel}>{dayName}</span>
                                <span className={styles.dayNumber}>{dayNumber}</span>
                                <span className={`${styles.statusDot} ${styles[run.status]}`} />
                              </div>

                              {/* Delete button */}
                              <button
                                className={styles.deleteBtn}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  deleteRunMutation.mutate(run.id)
                                }}
                                disabled={deleteRunMutation.isPending}
                                title={t("common.delete")}
                              >
                                <TrashIcon style={{ height: 12, width: 12 }} />
                              </button>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>

                  {/* Right Panel - Details */}
                  <div
                    className={`${styles.RightPanel} ${selectedRunId ? styles.Visible : ""}`}
                  >
                    {selectedRun && (
                      <div className={styles.RunDetails}>
                        <div className={styles.RunDetailsHeader}>
                          <span className={styles.SectionTitle}>
                            {t("autoJournal.runDetails")}
                          </span>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              onClick={() => handleSaveToJournal(selectedRun)}
                              disabled={
                                !selectedRunHasContent ||
                                savingRunId === selectedRun.id ||
                                savedRunIds.has(selectedRun.id) ||
                                selectedRun.autoSaved
                              }
                              className={styles.ActionBtn}
                              style={
                                savedRunIds.has(selectedRun.id) || selectedRun.autoSaved
                                  ? {
                                      backgroundColor: "rgba(74, 222, 128, 0.15)",
                                      color: "#4ade80",
                                      borderColor: "rgba(74, 222, 128, 0.3)",
                                    }
                                  : {}
                              }
                              title={
                                !selectedRunHasContent
                                  ? t("autoJournal.noContentToSave")
                                  : ""
                              }
                            >
                              {savingRunId === selectedRun.id
                                ? t("autoJournal.saving")
                                : savedRunIds.has(selectedRun.id) || selectedRun.autoSaved
                                  ? t("autoJournal.published")
                                  : t("autoJournal.saveToJournal")}
                            </button>
                            <button
                              className={styles.ActionBtn}
                              style={{
                                background: "var(--bg-tertiary)",
                                color: "var(--primary)",
                              }}
                              onClick={() => setSelectedRunId(null)}
                            >
                              <CrossIcon style={{ height: 14, width: 14 }} />
                            </button>
                          </div>
                        </div>

                        <div className={styles.SummaryBox}>
                          {selectedRun.summary?.activities?.length > 0 && (
                            <div className={styles.ActivitiesList}>
                              {selectedRun.summary.activities.map(
                                (act, idx) => (
                                  <div
                                    key={`${act.startTs}-${idx}`}
                                    className={styles.ActivityCard}
                                  >
                                    <div className={styles.ActivityCardHeader}>
                                      <div className={styles.ActivityCardTitle}>
                                        {act.title}
                                      </div>
                                      <div className={styles.ActivityCardMeta}>
                                        <span
                                          className={styles.ActivityTimeRange}
                                        >
                                          {dayjs(act.startTs).format("h:mm A")}{" "}
                                          - {dayjs(act.endTs).format("h:mm A")}
                                        </span>
                                        {act.category && (
                                          <span
                                            className={`${styles.CategoryBadge} ${styles[`category${act.category}`]}`}
                                          >
                                            {t(`timeline.${act.category.toLowerCase()}`)}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    <div className={styles.ActivityCardSection}>
                                      <div className={styles.ActivityCardLabel}>
                                        SUMMARY
                                      </div>
                                      <div className={styles.ActivityCardText}>
                                        {act.summary}
                                      </div>
                                    </div>

                                    {act.detailedSummary &&
                                      act.detailedSummary.length > 0 && (
                                        <div
                                          className={styles.ActivityCardSection}
                                        >
                                          <div
                                            className={styles.ActivityCardLabel}
                                          >
                                            DETAILED SUMMARY
                                          </div>
                                          <div className={styles.DetailedList}>
                                            {act.detailedSummary.map(
                                              (detail, dIdx) => (
                                                <div
                                                  key={`${detail.startTs}-${dIdx}`}
                                                  className={
                                                    styles.DetailedItem
                                                  }
                                                >
                                                  <span
                                                    className={
                                                      styles.DetailedTime
                                                    }
                                                  >
                                                    {dayjs(
                                                      detail.startTs,
                                                    ).format("h:mm")}{" "}
                                                    -{" "}
                                                    {dayjs(detail.endTs).format(
                                                      "h:mm A",
                                                    )}
                                                  </span>
                                                  <span
                                                    className={
                                                      styles.DetailedDesc
                                                    }
                                                  >
                                                    {detail.description}
                                                  </span>
                                                </div>
                                              ),
                                            )}
                                          </div>
                                        </div>
                                      )}
                                  </div>
                                ),
                              )}
                            </div>
                          )}

                          {selectedRun.summary?.summary && (
                            <div className={styles.OverallSummary}>
                              <div className={styles.ActivityCardLabel}>
                                OVERALL SUMMARY
                              </div>
                              <div className={styles.SummaryText}>
                                {selectedRun.summary.summary}
                              </div>
                            </div>
                          )}

                          {(selectedRun.previewGifPath ||
                            (selectedRun.screenshotCount ?? 0) > 0) && (
                            <div className={styles.OverallSummary}>
                              <div className={styles.ActivityCardLabel}>
                                {t("autoJournal.gifPreview")}
                              </div>
                              <div
                                style={{
                                  marginBottom: "6px",
                                  color: "var(--secondary)",
                                  fontSize: "12px",
                                }}
                              >
                                {selectedRun.previewGifPath
                                  ? t("autoJournal.gifPreviewDesc")
                                  : t("autoJournal.gifMissing")}
                              </div>
                              <div
                                style={{
                                  border: "1px solid var(--border)",
                                  borderRadius: "10px",
                                  overflow: "hidden",
                                  maxWidth: "520px",
                                  margin: "0 auto",
                                  background: "var(--bg-secondary)",
                                }}
                              >
                                {(() => {
                                  const raw = selectedRun.previewGifPath || ""
                                  const src = raw
                                    ? raw.startsWith("assets://")
                                      ? raw
                                      : `assets://file?path=${encodeURIComponent(raw)}`
                                    : ""

                                  if (!src) return null

                                  return (
                                    <img
                                      src={src}
                                      alt="Context GIF preview"
                                      style={{
                                        display: "block",
                                        width: "100%",
                                        maxHeight: "360px",
                                        objectFit: "contain",
                                      }}
                                    />
                                  )
                                })()}
                              </div>
                            </div>
                          )}

                          {selectedRun.summary?.debug && (
                            <div className={styles.Diagnostics}>
                              <div
                                className={styles.SummaryTitle}
                                style={{ marginTop: "6px" }}
                              >
                                {t("autoJournal.diagnostics")}
                              </div>
                              <div className={styles.DiagnosticsRow}>
                                <span>{t("dashboard.provider")}</span>
                                <span>
                                  {selectedRun.summary.debug.provider}
                                </span>
                              </div>
                              <div className={styles.DiagnosticsRow}>
                                <span>{t("settingsDialog.journal.model")}</span>
                                <span>{selectedRun.summary.debug.model}</span>
                              </div>
                              <div className={styles.DiagnosticsRow}>
                                <span>{t("autoJournal.itemsUsed")}</span>
                                <span>
                                  {selectedRun.summary.debug.itemsUsed}
                                </span>
                              </div>
                              <div className={styles.DiagnosticsRow}>
                                <span>{t("autoJournal.logLength")}</span>
                                <span>
                                  {selectedRun.summary.debug.logChars}{" "}
                                  {t("autoJournal.chars")}
                                  {selectedRun.summary.debug.truncated
                                    ? ` (${t("autoJournal.truncated")})`
                                    : ""}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Tabs.Content>

            {/* Settings Tab */}
            <Tabs.Content
              value="settings"
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "center",
              }}
            >
              <div className={styles.Container}>
                {/* Enable Toggle - Kept as SwitchRow for prominence */}
                <div className={styles.SwitchRow}>
                  <div className={styles.SwitchInfo}>
                    <span className={styles.Label}>
                      {t("autoJournal.enableScheduler")}
                    </span>
                    <span className={styles.Desc}>
                      {t("autoJournal.enableSchedulerDesc")}
                    </span>
                  </div>
                  <Switch.Root
                    className={styles.SwitchRoot}
                    checked={settings.autoJournalEnabled}
                    onCheckedChange={handleToggleEnabled}
                  >
                    <Switch.Thumb className={styles.SwitchThumb} />
                  </Switch.Root>
                </div>

                {/* Scheduler Status Indicator */}
                {schedulerStatusQuery.data && settings.autoJournalEnabled && (
                  <div
                    style={{
                      padding: "12px 16px",
                      backgroundColor: schedulerStatusQuery.data.running
                        ? "var(--base-green-transparent, rgba(34, 197, 94, 0.1))"
                        : "var(--bg-tertiary)",
                      borderRadius: "8px",
                      marginBottom: "16px",
                      border: schedulerStatusQuery.data.running
                        ? "1px solid var(--base-green, #22c55e)"
                        : "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginBottom: "4px",
                      }}
                    >
                      <div
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          backgroundColor: schedulerStatusQuery.data.running
                            ? "var(--base-green, #22c55e)"
                            : "var(--text-tertiary)",
                          animation: schedulerStatusQuery.data.running
                            ? "pulse 2s infinite"
                            : "none",
                        }}
                      />
                      <span
                        style={{
                          fontSize: "0.85rem",
                          fontWeight: "600",
                          color: schedulerStatusQuery.data.running
                            ? "var(--base-green, #22c55e)"
                            : "var(--text-secondary)",
                        }}
                      >
                        {schedulerStatusQuery.data.running
                          ? t("autoJournal.schedulerActive")
                          : t("autoJournal.schedulerInactive")}
                      </span>
                    </div>
                    {schedulerStatusQuery.data.running &&
                      schedulerStatusQuery.data.nextRunAt && (
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {t("autoJournal.nextRun")}:{" "}
                          {dayjs(schedulerStatusQuery.data.nextRunAt).format(
                            "HH:mm",
                          )}
                          {" ("}
                          {dayjs(schedulerStatusQuery.data.nextRunAt).fromNow()}
                          {")"}
                        </div>
                      )}
                    {schedulerStatusQuery.data.lastRunAt && (
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-tertiary)",
                          marginTop: "2px",
                        }}
                      >
                        {t("autoJournal.lastRun")}:{" "}
                        {dayjs(schedulerStatusQuery.data.lastRunAt).format(
                          "HH:mm",
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Interval */}
                <fieldset className={styles.Fieldset}>
                  <label className={styles.Label}>
                    {t("autoJournal.interval")}
                  </label>
                  <div className={styles.Desc}>
                    {t("autoJournal.intervalDesc")}
                  </div>
                  <select
                    value={settings.autoJournalWindowMinutes}
                    onChange={(e) => handleWindowChange(e.target.value)}
                    className={styles.Select}
                  >
                  <option value={15}>{t("autoJournal.last15min")}</option>
                  <option value={30}>{t("autoJournal.last30min")}</option>
                  <option value={60}>{t("autoJournal.last60min")}</option>
                    <option value={120}>{t("autoJournal.last2hours")}</option>
                  </select>
                </fieldset>

                <fieldset className={styles.Fieldset}>
                  <label className={styles.Label}>
                    {t("autoJournal.sourceMode")}
                  </label>
                  <div className={styles.Desc}>
                    {t("autoJournal.sourceModeDesc")}
                  </div>
                  <select
                    value={settings.autoJournalSourceMode || "both"}
                    onChange={(e) => handleSourceModeChange(e.target.value)}
                    className={styles.Select}
                  >
                    <option value="audio">{t("autoJournal.sourceAudio")}</option>
                    <option value="video">{t("autoJournal.sourceVideo")}</option>
                    <option value="both">{t("autoJournal.sourceBoth")}</option>
                  </select>
                </fieldset>

                {/* Target Pile */}
                <fieldset className={styles.Fieldset}>
                  <label className={styles.Label}>
                    {t("autoJournal.targetPile")}
                  </label>
                  <div className={styles.Desc}>
                    {t("autoJournal.targetPileDesc")}
                  </div>
                  <select
                    value={
                      settings.autoJournalTargetPilePath ||
                      getCurrentPilePath() ||
                      (piles && piles.length > 0 ? piles[0].path : "")
                    }
                    onChange={(e) => handleTargetPileChange(e.target.value)}
                    className={styles.Select}
                  >
                    <option value="">{t("autoJournal.currentPile")}</option>
                    {piles.map((pile) => (
                      <option key={pile.path} value={pile.path}>
                        {pile.name}
                      </option>
                    ))}
                  </select>
                </fieldset>

                {/* Screen capture context */}
                <div
                  className={styles.SwitchRow}
                  style={{ marginBottom: "10px" }}
                >
                  <div className={styles.SwitchInfo}>
                    <span className={styles.Label}>
                      {t("autoJournal.screenCapture")}
                    </span>
                    <span className={styles.Desc}>
                      {t("autoJournal.screenCaptureDesc")}
                    </span>
                  </div>
                  <Switch.Root
                    className={styles.SwitchRoot}
                    checked={settings.autoJournalIncludeScreenCapture}
                    onCheckedChange={handleScreenCaptureChange}
                  >
                    <Switch.Thumb className={styles.SwitchThumb} />
                  </Switch.Root>
                </div>

                {/* Periodic Screenshots */}
                <div
                  className={styles.SwitchRow}
                  style={{ marginBottom: "10px" }}
                >
                  <div className={styles.SwitchInfo}>
                    <span className={styles.Label}>
                      {t("autoJournal.periodicScreenshots")}
                    </span>
                    <span className={styles.Desc}>
                      {t("autoJournal.periodicScreenshotsDesc")}
                    </span>
                  </div>
                  <Switch.Root
                    className={styles.SwitchRoot}
                    checked={periodicScreenshotQuery.data?.enabled ?? false}
                    onCheckedChange={(enabled) =>
                      savePeriodicScreenshotMutation.mutate({
                        periodicScreenshotEnabled: enabled,
                      })
                    }
                  >
                    <Switch.Thumb className={styles.SwitchThumb} />
                  </Switch.Root>
                </div>

                {/* Continuous screen recording */}
                <div className={styles.SwitchRow} style={{ marginBottom: "10px" }}>
                  <div className={styles.SwitchInfo}>
                    <span className={styles.Label}>
                      {t("autoJournal.videoRecording")}
                    </span>
                    <span className={styles.Desc}>
                      {t("autoJournal.videoRecordingDesc")}
                    </span>
                  </div>
                  <Switch.Root
                    className={styles.SwitchRoot}
                    checked={screenSessionStatusQuery.data?.enabled ?? false}
                    onCheckedChange={handleScreenSessionEnabledChange}
                  >
                    <Switch.Thumb className={styles.SwitchThumb} />
                  </Switch.Root>
                </div>

                {screenSessionStatusQuery.data?.enabled && (
                  <>
                    <div
                      style={{
                        padding: "12px 16px",
                        backgroundColor: screenSessionStatusQuery.data.running
                          ? "var(--base-green-transparent, rgba(34, 197, 94, 0.1))"
                          : "var(--bg-tertiary)",
                        borderRadius: "8px",
                        marginBottom: "16px",
                        border: screenSessionStatusQuery.data.running
                          ? "1px solid var(--base-green, #22c55e)"
                          : "1px solid var(--border)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "10px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.85rem",
                            fontWeight: "600",
                            color: screenSessionStatusQuery.data.running
                              ? "var(--base-green, #22c55e)"
                              : "var(--text-secondary)",
                          }}
                        >
                          {screenSessionStatusQuery.data.running
                            ? t("autoJournal.videoRecordingActive")
                            : t("autoJournal.videoRecordingInactive")}
                        </span>
                        <button
                          className={styles.ActionBtn}
                          onClick={() => {
                            if (screenSessionStatusQuery.data?.running) {
                              stopScreenSessionMutation.mutate()
                            } else {
                              startScreenSessionMutation.mutate({
                                intervalSeconds:
                                  screenSessionStatusQuery.data?.intervalSeconds || 5,
                              })
                            }
                          }}
                          disabled={
                            startScreenSessionMutation.isPending ||
                            stopScreenSessionMutation.isPending
                          }
                        >
                          {screenSessionStatusQuery.data.running
                            ? t("autoJournal.stopVideoRecording")
                            : t("autoJournal.startVideoRecording")}
                        </button>
                      </div>
                      {screenSessionStatusQuery.data.nextCaptureAt && (
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-secondary)",
                            marginTop: "4px",
                          }}
                        >
                          {t("autoJournal.nextCapture")}:{" "}
                          {dayjs(screenSessionStatusQuery.data.nextCaptureAt).format(
                            "HH:mm:ss",
                          )}
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-tertiary)",
                          marginTop: "2px",
                        }}
                      >
                        {t("autoJournal.totalFrames")}:{" "}
                        {screenSessionStatusQuery.data.capturedFrames ?? 0}
                      </div>
                    </div>

                    <fieldset className={styles.Fieldset}>
                      <label className={styles.Label}>
                        {t("autoJournal.videoInterval")}
                      </label>
                      <div className={styles.Desc}>
                        {t("autoJournal.videoIntervalDesc")}
                      </div>
                      <select
                        value={screenSessionStatusQuery.data?.intervalSeconds ?? 5}
                        onChange={(e) => handleScreenSessionIntervalChange(e.target.value)}
                        className={styles.Select}
                      >
                        <option value={2}>{t("autoJournal.every2sec")}</option>
                        <option value={5}>{t("autoJournal.every5sec")}</option>
                        <option value={10}>{t("autoJournal.every10sec")}</option>
                        <option value={15}>{t("autoJournal.every15sec")}</option>
                      </select>
                    </fieldset>
                  </>
                )}

                {/* Periodic Screenshot Status */}
                {periodicScreenshotQuery.data?.enabled && (
                  <>
                    <div
                      style={{
                        padding: "12px 16px",
                        backgroundColor: periodicScreenshotQuery.data.running
                          ? "var(--base-blue-transparent, rgba(59, 130, 246, 0.1))"
                          : "var(--bg-tertiary)",
                        borderRadius: "8px",
                        marginBottom: "16px",
                        border: periodicScreenshotQuery.data.running
                          ? "1px solid var(--base-blue, #3b82f6)"
                          : "1px solid var(--border)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginBottom: "4px",
                        }}
                      >
                        <div
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            backgroundColor: periodicScreenshotQuery.data.running
                              ? "var(--base-blue, #3b82f6)"
                              : "var(--text-tertiary)",
                            animation: periodicScreenshotQuery.data.running
                              ? "pulse 2s infinite"
                              : "none",
                          }}
                        />
                        <span
                          style={{
                            fontSize: "0.85rem",
                            fontWeight: "600",
                            color: periodicScreenshotQuery.data.running
                              ? "var(--base-blue, #3b82f6)"
                              : "var(--text-secondary)",
                          }}
                        >
                          {periodicScreenshotQuery.data.running
                            ? t("autoJournal.periodicActive")
                            : t("autoJournal.periodicInactive")}
                        </span>
                      </div>
                      {periodicScreenshotQuery.data.running &&
                        periodicScreenshotQuery.data.nextCaptureAt && (
                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {t("autoJournal.nextCapture")}:{" "}
                            {dayjs(periodicScreenshotQuery.data.nextCaptureAt).format(
                              "HH:mm",
                            )}
                            {" ("}
                            {dayjs(periodicScreenshotQuery.data.nextCaptureAt).fromNow()}
                            {")"}
                          </div>
                        )}
                      {periodicScreenshotQuery.data.lastCaptureAt && (
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-tertiary)",
                            marginTop: "2px",
                          }}
                        >
                          {t("autoJournal.lastCapture")}:{" "}
                          {dayjs(periodicScreenshotQuery.data.lastCaptureAt).format(
                            "HH:mm",
                          )}
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-tertiary)",
                          marginTop: "2px",
                        }}
                      >
                        {t("autoJournal.totalScreenshots")}:{" "}
                        {periodicScreenshotQuery.data.totalScreenshots ?? 0}
                      </div>
                    </div>

                    {/* Periodic Screenshot Interval */}
                    <fieldset className={styles.Fieldset}>
                      <label className={styles.Label}>
                        {t("autoJournal.periodicInterval")}
                      </label>
                      <div className={styles.Desc}>
                        {t("autoJournal.periodicIntervalDesc")}
                      </div>
                      <select
                        value={periodicScreenshotQuery.data?.intervalMinutes ?? 60}
                        onChange={(e) =>
                          savePeriodicScreenshotMutation.mutate({
                            periodicScreenshotEnabled: true,
                            periodicScreenshotIntervalMinutes: Number(e.target.value),
                          })
                        }
                        className={styles.Select}
                      >
                        <option value={15}>{t("autoJournal.every15min")}</option>
                        <option value={30}>{t("autoJournal.every30min")}</option>
                        <option value={60}>{t("autoJournal.every60min")}</option>
                        <option value={120}>{t("autoJournal.every2hours")}</option>
                      </select>
                    </fieldset>
                  </>
                )}

                {/* Auto-save to journal */}
                <div
                  className={styles.SwitchRow}
                  style={{ marginBottom: "10px" }}
                >
                  <div className={styles.SwitchInfo}>
                    <span className={styles.Label}>
                      {t("autoJournal.autoSave")}
                    </span>
                    <span className={styles.Desc}>
                      {t("autoJournal.autoSaveDesc")}
                    </span>
                  </div>
                  <Switch.Root
                    className={styles.SwitchRoot}
                    checked={settings.autoJournalAutoSaveEnabled}
                    onCheckedChange={handleAutoSaveChange}
                  >
                    <Switch.Thumb className={styles.SwitchThumb} />
                  </Switch.Root>
                </div>

                {/* Card Titles Customization */}
                <div
                  className={styles.SwitchRow}
                  style={{ marginBottom: "10px" }}
                >
                  <div className={styles.SwitchInfo}>
                    <span className={styles.Label}>
                      {t("autoJournal.cardTitles")}
                    </span>
                    <span className={styles.Desc}>
                      {t("autoJournal.cardTitlesDesc")}
                    </span>
                  </div>
                  <Switch.Root
                    className={styles.SwitchRoot}
                    checked={settings.autoJournalTitlePromptEnabled}
                    onCheckedChange={handleTitlePromptEnabledChange}
                  >
                    <Switch.Thumb className={styles.SwitchThumb} />
                  </Switch.Root>
                </div>

                {settings.autoJournalTitlePromptEnabled && (
                  <fieldset className={styles.Fieldset}>
                    <div className={styles.PromptEditor}>
                      <button
                        className={styles.EditPromptBtn}
                        onClick={() => setEditingTitlePrompt(!editingTitlePrompt)}
                        title={editingTitlePrompt ? t("common.preview") : t("common.edit")}
                      >
                        <EditIcon style={{ height: 14, width: 14 }} />
                        {editingTitlePrompt ? t("common.preview") : t("common.edit")}
                      </button>
                      {editingTitlePrompt ? (
                        <textarea
                          value={
                            settings.autoJournalTitlePrompt || defaultTitlePrompt
                          }
                          onChange={(e) => handleTitlePromptChange(e.target.value)}
                          className={styles.Textarea}
                          rows={12}
                          placeholder="Enter custom prompt for titles..."
                        />
                      ) : (
                        <div
                          className={`${styles.MarkdownPreview} ${titlePromptExpanded ? styles.expanded : ''}`}
                          onClick={() => setTitlePromptExpanded(!titlePromptExpanded)}
                          style={{ cursor: 'pointer' }}
                        >
                          <Markdown>
                            {settings.autoJournalTitlePrompt || defaultTitlePrompt}
                          </Markdown>
                        </div>
                      )}
                    </div>
                  </fieldset>
                )}

                {/* Card Summaries Customization */}
                <div
                  className={styles.SwitchRow}
                  style={{ marginBottom: "10px", marginTop: "10px" }}
                >
                  <div className={styles.SwitchInfo}>
                    <span className={styles.Label}>
                      {t("autoJournal.cardSummaries")}
                    </span>
                    <span className={styles.Desc}>
                      {t("autoJournal.cardSummariesDesc")}
                    </span>
                  </div>
                  <Switch.Root
                    className={styles.SwitchRoot}
                    checked={settings.autoJournalSummaryPromptEnabled}
                    onCheckedChange={handleSummaryPromptEnabledChange}
                  >
                    <Switch.Thumb className={styles.SwitchThumb} />
                  </Switch.Root>
                </div>

                {settings.autoJournalSummaryPromptEnabled && (
                  <fieldset className={styles.Fieldset}>
                    <div className={styles.PromptEditor}>
                      <button
                        className={styles.EditPromptBtn}
                        onClick={() => setEditingSummaryPrompt(!editingSummaryPrompt)}
                        title={editingSummaryPrompt ? t("common.preview") : t("common.edit")}
                      >
                        <EditIcon style={{ height: 14, width: 14 }} />
                        {editingSummaryPrompt ? t("common.preview") : t("common.edit")}
                      </button>
                      {editingSummaryPrompt ? (
                        <textarea
                          value={
                            settings.autoJournalSummaryPrompt ||
                            defaultSummaryPrompt
                          }
                          onChange={(e) =>
                            handleSummaryPromptChange(e.target.value)
                          }
                          className={styles.Textarea}
                          rows={12}
                          placeholder="Enter custom prompt for summaries..."
                        />
                      ) : (
                        <div
                          className={`${styles.MarkdownPreview} ${summaryPromptExpanded ? styles.expanded : ''}`}
                          onClick={() => setSummaryPromptExpanded(!summaryPromptExpanded)}
                          style={{ cursor: 'pointer' }}
                        >
                          <Markdown>
                            {settings.autoJournalSummaryPrompt || defaultSummaryPrompt}
                          </Markdown>
                        </div>
                      )}
                    </div>
                  </fieldset>
                )}
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </div>
      </div>

      <Navigation />
    </div>
  )
}

export const Component = AutoJournal
export default AutoJournal
