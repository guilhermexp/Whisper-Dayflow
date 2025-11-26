import styles from "./AutoJournal.module.scss"
import {
  CrossIcon,
  RefreshIcon,
  ClockIcon,
  SettingsIcon,
  ChevronRightIcon,
  HomeIcon,
  NotebookIcon,
} from "renderer/icons"
import { useState, useMemo, useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, Link } from "react-router-dom"
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
import InstallUpdate from "../InstallUpdate"
import Chat from "../Chat"
import Search from "../Search"
import Settings from "../Settings"
import Dashboard from "../Dashboard"

function AutoJournal() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { piles, getCurrentPilePath, currentTheme } = usePilesContext()
  const { addNotification } = useToastsContext()
  const { prependIndex, addIndex } = useIndexContext()
  const [mainTab, setMainTab] = useState("runs")
  const [selectedRunId, setSelectedRunId] = useState(null)
  const [savingRunId, setSavingRunId] = useState(null)
  const [savedRunIds, setSavedRunIds] = useState(new Set())
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

  const gifDir = settingsQuery.data?.autoJournalGifDir

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
    autoJournalTargetPilePath: "",
    autoJournalAutoSaveEnabled: false,
    autoJournalPrompt: "",
    autoJournalTitlePromptEnabled: false,
    autoJournalTitlePrompt: "",
    autoJournalSummaryPromptEnabled: false,
    autoJournalSummaryPrompt: "",
    autoJournalIncludeScreenCapture: false,
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
    return (
      selectedRun.summary.activities &&
      selectedRun.summary.activities.length > 0 &&
      !selectedRun.summary.summary.includes("No recordings found in the selected time window")
    )
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

  const handleRunNow = () => {
    runNowMutation.mutate(settings.autoJournalWindowMinutes)
  }

  const handleSaveToJournal = async (run) => {
    console.log("[auto-journal] handleSaveToJournal called with run:", run?.id)

    // Check if there's actual content to save
    const hasRealContent =
      run?.summary?.activities &&
      run.summary.activities.length > 0 &&
      !run.summary.summary.includes("No recordings found in the selected time window")

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

      {/* Toast notifications - fixed position */}
      <div
        style={{
          position: "fixed",
          top: "60px",
          right: "20px",
          zIndex: 1000,
          maxWidth: "300px",
        }}
      >
        <Toasts />
      </div>

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
            <div
              className={styles.close}
              onClick={() => navigate("/")}
              title={t("common.close")}
            >
              <CrossIcon style={{ height: 14, width: 14 }} />
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className={`${styles.mainContent} ${styles.contentOffset}`}>
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

                    {/* Run List */}
                    <div className={styles.RunList}>
                      {runs.length === 0 ? (
                        <div className={styles.EmptyState}>
                          {runsQuery.isLoading
                            ? t("common.loading")
                            : t("autoJournal.noRuns")}
                        </div>
                      ) : (
                        runs.map((run) => {
                          const runHasContent =
                            run.summary?.activities &&
                            run.summary.activities.length > 0 &&
                            !run.summary.summary.includes(
                              "No recordings found in the selected time window",
                            )

                          return (
                            <div
                              key={run.id}
                              className={`${styles.RunItem} ${selectedRunId === run.id ? styles.selected : ""}`}
                              onClick={() =>
                                setSelectedRunId(
                                  selectedRunId === run.id ? null : run.id,
                                )
                              }
                            >
                              <div className={styles.RunHeader}>
                                <span className={styles.RunDate}>
                                  {formatDate(run.startedAt)}
                                </span>
                                <div style={{ display: "flex", gap: "6px" }}>
                                  {!runHasContent && run.status === "success" && (
                                    <span
                                      style={{
                                        fontSize: "0.65rem",
                                        padding: "2px 6px",
                                        borderRadius: "4px",
                                        backgroundColor: "var(--bg-secondary)",
                                        color: "var(--secondary)",
                                        fontWeight: "600",
                                      }}
                                    >
                                      {t("autoJournal.empty")}
                                    </span>
                                  )}
                                  {(savedRunIds.has(run.id) || run.autoSaved) && (
                                    <span
                                      style={{
                                        fontSize: "0.65rem",
                                        padding: "2px 6px",
                                        borderRadius: "4px",
                                        backgroundColor: "var(--base-green)",
                                        color: "white",
                                        fontWeight: "600",
                                      }}
                                    >
                                      {t("autoJournal.published")}
                                    </span>
                                  )}
                                  <span
                                    className={`${styles.RunStatus} ${styles[run.status]}`}
                                  >
                                    {run.status === "success"
                                      ? t("autoJournal.statusSuccess")
                                      : t("autoJournal.statusError")}
                                  </span>
                                </div>
                              </div>
                            <div className={styles.RunMeta}>
                              <span>
                                {t("autoJournal.window")}: {run.windowMinutes}{" "}
                                min
                              </span>
                              <span>•</span>
                              <span>
                                {t("autoJournal.duration")}:{" "}
                                {formatDuration(run.startedAt, run.finishedAt)}
                              </span>
                            </div>
                            {run.summary && (
                              <div className={styles.RunPreview}>
                                {run.summary.summary}
                              </div>
                            )}
                            {run.error && (
                              <div className={styles.RunError}>{run.error}</div>
                            )}
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
                                      backgroundColor: "var(--base-green)",
                                      color: "white",
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
                              <div style={{ marginBottom: "6px", color: "var(--secondary)", fontSize: "12px" }}>
                                {selectedRun.previewGifPath
                                  ? t("autoJournal.gifPreviewDesc")
                                  : t("autoJournal.gifMissing")}
                              {selectedRun.previewGifPath && (
                                <div
                                  style={{
                                    border: "1px solid var(--border)",
                                    borderRadius: "10px",
                                    overflow: "hidden",
                                    maxWidth: "520px",
                                    background: "var(--bg-secondary)",
                                  }}
                                >
                                  {(() => {
                                    const raw = selectedRun.previewGifPath || ""
                                    const basePath = raw || (gifDir ? `${gifDir}/${selectedRun.id}.gif` : "")
                                    const src = basePath
                                      ? basePath.startsWith("assets://")
                                        ? basePath
                                        : `assets://file?path=${encodeURIComponent(basePath)}`
                                      : ""
                                    return src ? (
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
                                    ) : null
                                  })()}
                                </div>
                              )}
                                          maxHeight: "360px",
                                          objectFit: "contain",
                                        }}
                                      />
                                    ) : null
                                  })()}
                                </div>
                              )}
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
                    <textarea
                      value={
                        settings.autoJournalTitlePrompt || defaultTitlePrompt
                      }
                      onChange={(e) => handleTitlePromptChange(e.target.value)}
                      className={styles.Textarea}
                      rows={8}
                      placeholder="Enter custom prompt for titles..."
                    />
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
                    <textarea
                      value={
                        settings.autoJournalSummaryPrompt ||
                        defaultSummaryPrompt
                      }
                      onChange={(e) =>
                        handleSummaryPromptChange(e.target.value)
                      }
                      className={styles.Textarea}
                      rows={8}
                      placeholder="Enter custom prompt for summaries..."
                    />
                  </fieldset>
                )}
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </div>
      </div>

      {/* Bottom Navigation Bar */}
      <div className={layoutStyles.bottomNav}>
        <div className={layoutStyles.navPill}>
          <Chat />
          <Search />
          <Settings />
          <div className={layoutStyles.divider} />
          <Link to="/auto-journal" className={layoutStyles.iconHolder}>
            <NotebookIcon />
          </Link>
          <Dashboard />
          <Link to="/" className={layoutStyles.iconHolder}>
            <HomeIcon />
          </Link>
        </div>
      </div>

      <div id="dialog"></div>
    </div>
  )
}

export const Component = AutoJournal
export default AutoJournal
