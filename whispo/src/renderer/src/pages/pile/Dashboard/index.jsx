import styles from "./Dashboard.module.scss"
import { CardIcon, CrossIcon, RefreshIcon } from "renderer/icons"
import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import * as Dialog from "@radix-ui/react-dialog"
import { tipcClient } from "renderer/lib/tipc-client"
import dayjs from "dayjs"
import { useTranslation } from "react-i18next"
import { usePilesContext } from "renderer/context/PilesContext"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts"

const PIE_COLORS = ["#3b82f6", "#0ea5e9", "#14b8a6", "#f59e0b", "#64748b"]

export default function Dashboard() {
  const { t } = useTranslation()
  const { getCurrentPilePath } = usePilesContext()
  const analyticsQuery = useQuery({
    queryKey: ["recording-analytics"],
    queryFn: async () => tipcClient.getRecordingAnalytics(),
  })

  const [autoJournalWindow, setAutoJournalWindow] = useState(60)
  const autoJournalQuery = useQuery({
    queryKey: ["auto-journal-summary", autoJournalWindow],
    enabled: false, // manual trigger
    queryFn: async () =>
      tipcClient.generateAutoJournalSummary({
        windowMinutes: autoJournalWindow,
      }),
  })

  const data = analyticsQuery.data
  const autoJournalData = autoJournalQuery.data
  const autoJournalError =
    autoJournalQuery.error instanceof Error
      ? autoJournalQuery.error.message
      : autoJournalQuery.error
        ? String(autoJournalQuery.error)
        : null
  const [savingToJournal, setSavingToJournal] = useState(false)

  const timelineData = useMemo(() => {
    if (!data || !data.timeline) return []
    return data.timeline.map((entry) => ({
      ...entry,
      label: dayjs(entry.date).format("MMM D"),
      durationMinutes: Number((entry.durationMs / 60000).toFixed(2)),
    }))
  }, [data])

  const providerData = data?.providerBreakdown || []

  const handleSaveToJournal = async () => {
    if (!autoJournalData) return
    const pilePath = getCurrentPilePath()
    if (!pilePath) {
      console.error("No pile selected; cannot save auto journal entry.")
      return
    }
    try {
      setSavingToJournal(true)
      await tipcClient.createAutoJournalEntry({
        pilePath,
        summary: autoJournalData.summary,
        activities: autoJournalData.activities || [],
        windowStartTs: autoJournalData.windowStartTs,
        windowEndTs: autoJournalData.windowEndTs,
      })
    } catch (error) {
      console.error("Failed to save auto journal entry:", error)
    } finally {
      setSavingToJournal(false)
    }
  }

  // Helper functions
  const formatDurationLong = (ms) => {
    if (!ms) return "0m"
    const minutes = Math.round(ms / 60000)
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    const remaining = minutes % 60
    return `${hours}h ${remaining}m`
  }

  const formatNumber = (value, precision = 0) => {
    if (value == null) return "--"
    return Number(value).toFixed(precision)
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <div className={styles.iconHolder}>
          <CardIcon className={styles.dashboardIcon} />
        </div>
      </Dialog.Trigger>
      <Dialog.Portal container={document.getElementById("dialog")}>
        <Dialog.Overlay className={styles.DialogOverlay} />
        <Dialog.Content
          className={styles.DialogContent}
          aria-describedby={undefined}
        >
          <Dialog.Title className={styles.DialogTitle}>
            <span>{t("dashboard.title")}</span>
            <button
              onClick={() => analyticsQuery.refetch()}
              disabled={analyticsQuery.isRefetching}
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
          </Dialog.Title>

          {!data ? (
            <div className={styles.EmptyState}>
              {analyticsQuery.isLoading
                ? t("dashboard.loadingAnalytics")
                : t("dashboard.noAnalytics")}
            </div>
          ) : (
            <div className={styles.Container}>
              {/* Stats Cards */}
              <div className={styles.Grid2}>
                <div className={styles.Card}>
                  <div className={styles.StatValue}>
                    {data.totals?.recordings?.toLocaleString() || 0}
                  </div>
                  <div className={styles.StatLabel}>
                    {t("dashboard.totalRecordings")}
                  </div>
                  <div className={styles.StatSubLabel}>
                    {t("dashboard.avgSession", {
                      duration: formatDurationLong(
                        data.totals?.averageSessionMs,
                      ),
                    })}
                  </div>
                </div>
                <div className={styles.Card}>
                  <div className={styles.StatValue}>
                    {formatDurationLong(data.totals?.durationMs)}
                  </div>
                  <div className={styles.StatLabel}>
                    {t("dashboard.totalDuration")}
                  </div>
                </div>
                <div className={styles.Card}>
                  <div className={styles.StatValue}>
                    {data.totals?.averageAccuracy == null
                      ? "--"
                      : `${Math.round(data.totals.averageAccuracy * 100)}%`}
                  </div>
                  <div className={styles.StatLabel}>
                    {t("dashboard.avgAccuracy")}
                  </div>
                </div>
                <div className={styles.Card}>
                  <div className={styles.StatValue}>
                    {formatNumber(data.totals?.averageWpm)}
                  </div>
                  <div className={styles.StatLabel}>
                    {t("dashboard.avgWpm")}
                  </div>
                </div>
              </div>

              {/* Timeline Chart */}
              {timelineData.length > 0 && (
                <div className={`${styles.Card} ${styles.AlignLeft}`}>
                  <div className={styles.SectionTitle}>
                    {t("dashboard.timeline")}
                  </div>
                  <div className={styles.ChartContainer}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={timelineData}
                        margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          strokeOpacity={0.1}
                        />
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          tick={{ fontSize: 10, fill: "var(--secondary)" }}
                        />
                        <YAxis
                          tickLine={false}
                          tick={{ fontSize: 10, fill: "var(--secondary)" }}
                        />
                        <RechartsTooltip
                          contentStyle={{
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                            fontSize: "11px",
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="count"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          dot={false}
                          name="Recordings"
                        />
                        <Line
                          type="monotone"
                          dataKey="durationMinutes"
                          stroke="#0ea5e9"
                          strokeWidth={2}
                          dot={false}
                          name="Duration (min)"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Auto Journal (manual preview) */}
              <div className={styles.AutoJournalCard}>
                <div className={styles.AutoJournalHeader}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span className={styles.AutoJournalTitle}>
                      Auto Journal (beta)
                    </span>
                    <span className={styles.AutoJournalDesc}>
                      Generate a summary of what you&apos;ve been doing based on
                      recent recordings.
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <select
                      value={autoJournalWindow}
                      onChange={(e) =>
                        setAutoJournalWindow(Number(e.target.value) || 60)
                      }
                      className={styles.Select}
                    >
                      <option value={30}>{t("autoJournal.last30min")}</option>
                      <option value={60}>{t("autoJournal.last60min")}</option>
                      <option value={120}>{t("autoJournal.last2hours")}</option>
                    </select>
                    <button
                      onClick={() => autoJournalQuery.refetch()}
                      disabled={autoJournalQuery.isFetching}
                      className={styles.ActionBtn}
                    >
                      {autoJournalQuery.isFetching
                        ? t("autoJournal.generating")
                        : t("autoJournal.generateNow")}
                    </button>
                    {autoJournalData && (
                      <button
                        onClick={handleSaveToJournal}
                        disabled={savingToJournal}
                        className={styles.ActionBtn}
                        style={{
                          background: "var(--bg-secondary)",
                          color: "var(--primary)",
                        }}
                      >
                        {savingToJournal
                          ? t("autoJournal.saving")
                          : t("autoJournal.saveToJournal")}
                      </button>
                    )}
                  </div>
                </div>

                {autoJournalData && (
                  <div className={styles.SummaryBox}>
                    <div className={styles.SummaryTitle}>
                      {t("autoJournal.summary")}
                    </div>
                    <div className={styles.SummaryText}>
                      {autoJournalData.summary}
                    </div>

                    {autoJournalData.activities?.length > 0 && (
                      <>
                        <div
                          className={styles.SummaryTitle}
                          style={{ marginTop: "4px" }}
                        >
                          {t("autoJournal.activities")}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                          }}
                        >
                          {autoJournalData.activities.map((act, idx) => (
                            <div
                              key={`${act.startTs}-${act.endTs}-${idx}`}
                              className={styles.ActivityItem}
                            >
                              <div className={styles.ActivityHeader}>
                                <span className={styles.ActivityTitle}>
                                  {act.title}
                                </span>
                                <span className={styles.ActivityTime}>
                                  {dayjs(act.startTs).format("HH:mm")}–
                                  {dayjs(act.endTs).format("HH:mm")}
                                </span>
                              </div>
                              {act.category && (
                                <span className={styles.ActivityTime}>
                                  {act.category}
                                </span>
                              )}
                              <span className={styles.ActivityTime}>
                                {act.summary}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    {autoJournalData.debug && (
                      <div className={styles.Diagnostics}>
                        <div
                          className={styles.SummaryTitle}
                          style={{ marginTop: "6px" }}
                        >
                          {t("autoJournal.diagnostics")}
                        </div>
                        <div className={styles.DiagnosticsRow}>
                          <span>{t("dashboard.provider")}</span>
                          <span>{autoJournalData.debug.provider}</span>
                        </div>
                        <div className={styles.DiagnosticsRow}>
                          <span>{t("settingsDialog.journal.model")}</span>
                          <span>{autoJournalData.debug.model}</span>
                        </div>
                        <div className={styles.DiagnosticsRow}>
                          <span>{t("autoJournal.itemsUsed")}</span>
                          <span>{autoJournalData.debug.itemsUsed}</span>
                        </div>
                        <div className={styles.DiagnosticsRow}>
                          <span>{t("autoJournal.window")}</span>
                          <span>{autoJournalData.debug.windowMinutes} min</span>
                        </div>
                        <div className={styles.DiagnosticsRow}>
                          <span>{t("autoJournal.logLength")}</span>
                          <span>
                            {autoJournalData.debug.logChars}{" "}
                            {t("autoJournal.chars")}
                            {autoJournalData.debug.truncated
                              ? ` (${t("autoJournal.truncated")})`
                              : ""}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {autoJournalQuery.isError && (
                  <div
                    style={{ fontSize: "11px", color: "var(--error, #ff6b6b)" }}
                  >
                    {t("autoJournal.error")}
                    {autoJournalError ? ` ${autoJournalError}` : ""}
                  </div>
                )}
              </div>

              {/* Provider Breakdown */}
              {providerData.length > 0 && (
                <div className={`${styles.Card} ${styles.AlignLeft}`}>
                  <div className={styles.SectionTitle}>
                    {t("dashboard.providerBreakdown")}
                  </div>
                  <div className={styles.PieChartContainer}>
                    <div
                      style={{ height: "120px", width: "120px", flexShrink: 0 }}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={providerData}
                            dataKey="count"
                            nameKey="providerId"
                            innerRadius={30}
                            outerRadius={55}
                            paddingAngle={2}
                          >
                            {providerData.map((_, index) => (
                              <Cell
                                key={index}
                                fill={PIE_COLORS[index % PIE_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            contentStyle={{
                              background: "var(--bg)",
                              border: "1px solid var(--border)",
                              borderRadius: "6px",
                              fontSize: "11px",
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className={styles.PieLegend}>
                      {providerData.map((entry, index) => (
                        <div
                          key={entry.providerId}
                          className={styles.PieLegendItem}
                        >
                          <span
                            className={styles.PieLegendDot}
                            style={{
                              backgroundColor:
                                PIE_COLORS[index % PIE_COLORS.length],
                            }}
                          />
                          <span className={styles.PieLegendLabel}>
                            {entry.providerId}
                          </span>
                          <span className={styles.PieLegendValue}>
                            {entry.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <Dialog.Close asChild>
            <button className={styles.IconButton} aria-label="Close">
              <CrossIcon />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
