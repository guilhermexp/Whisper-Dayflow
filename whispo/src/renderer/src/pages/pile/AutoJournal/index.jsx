import styles from "./AutoJournal.module.scss"
import { CrossIcon, RefreshIcon, ClockIcon } from "renderer/icons"
import { useState, useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import * as Tabs from "@radix-ui/react-tabs"
import * as Switch from "@radix-ui/react-switch"
import { tipcClient } from "renderer/lib/tipc-client"
import dayjs from "dayjs"
import { useTranslation } from "react-i18next"
import { usePilesContext } from "renderer/context/PilesContext"
import { useToastsContext } from "renderer/context/ToastsContext"

function AutoJournal() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { piles, getCurrentPilePath } = usePilesContext()
  const { addToast } = useToastsContext()
  const [mainTab, setMainTab] = useState("runs")
  const [selectedRunId, setSelectedRunId] = useState(null)
  const [savingRunId, setSavingRunId] = useState(null)

  // Queries
  const runsQuery = useQuery({
    queryKey: ["auto-journal-runs"],
    queryFn: async () => tipcClient.listAutoJournalRuns({ limit: 100 }),
  })

  const settingsQuery = useQuery({
    queryKey: ["auto-journal-settings"],
    queryFn: async () => tipcClient.getAutoJournalSettings(),
  })

  // Mutations
  const saveSettingsMutation = useMutation({
    mutationFn: (settings) => tipcClient.saveAutoJournalSettings(settings),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ["auto-journal-settings"] })
      addToast({
        use: "text",
        text: t("autoJournal.settingsSaved"),
      })
    },
  })

  const runNowMutation = useMutation({
    mutationFn: (windowMinutes) =>
      tipcClient.runAutoJournalNow({ windowMinutes }),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ["auto-journal-runs"] })
      addToast({
        use: "text",
        text: t("autoJournal.runCompleted"),
      })
    },
    onError(error) {
      addToast({
        use: "text",
        text: `${t("autoJournal.error")} ${error.message}`,
      })
    },
  })

  const saveToJournalMutation = useMutation({
    mutationFn: async ({ run, pilePath }) => {
      if (!run.summary) throw new Error("No summary to save")
      return tipcClient.createAutoJournalEntry({
        pilePath,
        summary: run.summary.summary,
        activities: run.summary.activities || [],
        windowStartTs: run.summary.windowStartTs,
        windowEndTs: run.summary.windowEndTs,
      })
    },
    onSuccess() {
      addToast({
        use: "text",
        text: t("autoJournal.savedToJournal"),
      })
    },
    onError(error) {
      addToast({
        use: "text",
        text: `${t("autoJournal.saveError")} ${error.message}`,
      })
    },
    onSettled() {
      setSavingRunId(null)
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
    autoJournalPrompt: "",
    autoJournalTitlePromptEnabled: false,
    autoJournalTitlePrompt: "",
    autoJournalSummaryPromptEnabled: false,
    autoJournalSummaryPrompt: "",
    ...(settingsQuery.data || {}),
  }

  const selectedRun = useMemo(() => {
    if (!selectedRunId) return null
    return runs.find((r) => r.id === selectedRunId) || null
  }, [selectedRunId, runs])

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

  const handleSaveToJournal = (run) => {
    const pilePath =
      settings.autoJournalTargetPilePath || getCurrentPilePath()
    if (!pilePath) {
      addToast({
        use: "text",
        text: t("autoJournal.noPileSelected"),
      })
      return
    }
    setSavingRunId(run.id)
    saveToJournalMutation.mutate({ run, pilePath })
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
    <div className={styles.pageContainer}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <h1 className={styles.pageTitle}>{t("autoJournal.title")}</h1>
          <button
            onClick={() => runsQuery.refetch()}
            disabled={runsQuery.isRefetching}
            className={styles.RefreshButton}
          >
            <RefreshIcon
              style={{
                height: "14px",
                width: "14px",
                color: "var(--secondary)",
              }}
            />
          </button>
        </div>
        <button
          onClick={() => navigate(-1)}
          className={styles.backBtn}
          title="Voltar"
        >
          <CrossIcon />
        </button>
      </div>

      {/* Tabs */}
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
                {t("common.settings")}
              </Tabs.Trigger>
            </Tabs.List>

            {/* Runs Tab */}
            <Tabs.Content value="runs">
              <div className={styles.Container}>
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
                    runs.map((run) => (
                      <div
                        key={run.id}
                        className={`${styles.RunItem} ${selectedRunId === run.id ? styles.selected : ""}`}
                        onClick={() => setSelectedRunId(run.id)}
                      >
                        <div className={styles.RunHeader}>
                          <span className={styles.RunDate}>
                            {formatDate(run.startedAt)}
                          </span>
                          <span
                            className={`${styles.RunStatus} ${styles[run.status]}`}
                          >
                            {run.status === "success"
                              ? t("autoJournal.statusSuccess")
                              : t("autoJournal.statusError")}
                          </span>
                        </div>
                        <div className={styles.RunMeta}>
                          <span>
                            {t("autoJournal.window")}: {run.windowMinutes} min
                          </span>
                          <span>
                            {t("autoJournal.duration")}:{" "}
                            {formatDuration(run.startedAt, run.finishedAt)}
                          </span>
                        </div>
                        {run.summary && (
                          <div className={styles.RunPreview}>
                            {run.summary.summary.slice(0, 100)}
                            {run.summary.summary.length > 100 ? "..." : ""}
                          </div>
                        )}
                        {run.error && (
                          <div className={styles.RunError}>{run.error}</div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Selected Run Details */}
                {selectedRun && selectedRun.summary && (
                  <div className={styles.RunDetails}>
                    <div className={styles.RunDetailsHeader}>
                      <span className={styles.SectionTitle}>
                        {t("autoJournal.runDetails")}
                      </span>
                      <button
                        onClick={() => handleSaveToJournal(selectedRun)}
                        disabled={savingRunId === selectedRun.id}
                        className={styles.ActionBtn}
                      >
                        {savingRunId === selectedRun.id
                          ? t("autoJournal.saving")
                          : t("autoJournal.saveToJournal")}
                      </button>
                    </div>

                    <div className={styles.SummaryBox}>
                      {selectedRun.summary.activities?.length > 0 && (
                        <div className={styles.ActivitiesList}>
                          {selectedRun.summary.activities.map((act, idx) => (
                            <div
                              key={`${act.startTs}-${idx}`}
                              className={styles.ActivityCard}
                            >
                              {/* Activity Header - Dayflow style */}
                              <div className={styles.ActivityCardHeader}>
                                <div className={styles.ActivityCardTitle}>
                                  {act.title}
                                </div>
                                <div className={styles.ActivityCardMeta}>
                                  <span className={styles.ActivityTimeRange}>
                                    {dayjs(act.startTs).format("h:mm A")} -{" "}
                                    {dayjs(act.endTs).format("h:mm A")}
                                  </span>
                                  {act.category && (
                                    <span
                                      className={`${styles.CategoryBadge} ${styles[`category${act.category}`]}`}
                                    >
                                      {act.category}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Summary */}
                              <div className={styles.ActivityCardSection}>
                                <div className={styles.ActivityCardLabel}>
                                  SUMMARY
                                </div>
                                <div className={styles.ActivityCardText}>
                                  {act.summary}
                                </div>
                              </div>

                              {/* Detailed Summary - Dayflow style */}
                              {act.detailedSummary &&
                                act.detailedSummary.length > 0 && (
                                  <div className={styles.ActivityCardSection}>
                                    <div className={styles.ActivityCardLabel}>
                                      DETAILED SUMMARY
                                    </div>
                                    <div className={styles.DetailedList}>
                                      {act.detailedSummary.map((detail, dIdx) => (
                                        <div
                                          key={`${detail.startTs}-${dIdx}`}
                                          className={styles.DetailedItem}
                                        >
                                          <span className={styles.DetailedTime}>
                                            {dayjs(detail.startTs).format(
                                              "h:mm A"
                                            )}{" "}
                                            -{" "}
                                            {dayjs(detail.endTs).format("h:mm A")}
                                          </span>
                                          <span className={styles.DetailedDesc}>
                                            {detail.description}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Overall Summary */}
                      {selectedRun.summary.summary && (
                        <div className={styles.OverallSummary}>
                          <div className={styles.ActivityCardLabel}>
                            OVERALL SUMMARY
                          </div>
                          <div className={styles.SummaryText}>
                            {selectedRun.summary.summary}
                          </div>
                        </div>
                      )}

                      {selectedRun.summary.debug && (
                        <div className={styles.Diagnostics}>
                          <div
                            className={styles.SummaryTitle}
                            style={{ marginTop: "6px" }}
                          >
                            {t("autoJournal.diagnostics")}
                          </div>
                          <div className={styles.DiagnosticsRow}>
                            <span>{t("dashboard.provider")}</span>
                            <span>{selectedRun.summary.debug.provider}</span>
                          </div>
                          <div className={styles.DiagnosticsRow}>
                            <span>{t("settingsDialog.journal.model")}</span>
                            <span>{selectedRun.summary.debug.model}</span>
                          </div>
                          <div className={styles.DiagnosticsRow}>
                            <span>{t("autoJournal.itemsUsed")}</span>
                            <span>{selectedRun.summary.debug.itemsUsed}</span>
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
            </Tabs.Content>

            {/* Settings Tab */}
            <Tabs.Content value="settings">
              <div className={styles.Container}>
                {/* Enable Toggle */}
                <div className={styles.SettingRow}>
                  <div className={styles.SettingInfo}>
                    <span className={styles.SettingLabel}>
                      {t("autoJournal.enableScheduler")}
                    </span>
                    <span className={styles.SettingDesc}>
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

                {/* Interval */}
                <div className={styles.SettingRow}>
                  <div className={styles.SettingInfo}>
                    <span className={styles.SettingLabel}>
                      {t("autoJournal.interval")}
                    </span>
                    <span className={styles.SettingDesc}>
                      {t("autoJournal.intervalDesc")}
                    </span>
                  </div>
                  <select
                    value={settings.autoJournalWindowMinutes}
                    onChange={(e) => handleWindowChange(e.target.value)}
                    className={styles.Select}
                  >
                    <option value={30}>{t("autoJournal.last30min")}</option>
                    <option value={60}>{t("autoJournal.last60min")}</option>
                    <option value={120}>{t("autoJournal.last2hours")}</option>
                  </select>
                </div>

                {/* Target Pile */}
                <div className={styles.SettingRow}>
                  <div className={styles.SettingInfo}>
                    <span className={styles.SettingLabel}>
                      {t("autoJournal.targetPile")}
                    </span>
                    <span className={styles.SettingDesc}>
                      {t("autoJournal.targetPileDesc")}
                    </span>
                  </div>
                  <select
                    value={settings.autoJournalTargetPilePath}
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
                </div>

                {/* Card Titles Customization */}
                <div className={styles.PromptSection}>
                  <div className={styles.PromptHeader}>
                    <div className={styles.PromptHeaderInfo}>
                      <span className={styles.PromptHeaderTitle}>
                        {t("autoJournal.cardTitles")}
                      </span>
                      <span className={styles.PromptHeaderDesc}>
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
                    <div className={styles.PromptContent}>
                      <span className={styles.PromptLabel}>Prompt text</span>
                      <textarea
                        value={settings.autoJournalTitlePrompt || defaultTitlePrompt}
                        onChange={(e) => handleTitlePromptChange(e.target.value)}
                        className={styles.PromptTextArea}
                        rows={12}
                      />
                    </div>
                  )}
                </div>

                {/* Card Summaries Customization */}
                <div className={styles.PromptSection}>
                  <div className={styles.PromptHeader}>
                    <div className={styles.PromptHeaderInfo}>
                      <span className={styles.PromptHeaderTitle}>
                        {t("autoJournal.cardSummaries")}
                      </span>
                      <span className={styles.PromptHeaderDesc}>
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
                    <div className={styles.PromptContent}>
                      <span className={styles.PromptLabel}>Prompt text</span>
                      <textarea
                        value={settings.autoJournalSummaryPrompt || defaultSummaryPrompt}
                        onChange={(e) => handleSummaryPromptChange(e.target.value)}
                        className={styles.PromptTextArea}
                        rows={12}
                      />
                    </div>
                  )}
                </div>
              </div>
            </Tabs.Content>
          </Tabs.Root>
    </div>
  )
}

export const Component = AutoJournal
export default AutoJournal
