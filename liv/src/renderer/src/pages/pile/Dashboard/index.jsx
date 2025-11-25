import styles from "./Dashboard.module.scss"
import layoutStyles from "../PileLayout.module.scss"
import {
  CardIcon,
  CrossIcon,
  RefreshIcon,
  ClockIcon,
  GaugeIcon,
  CopyIcon,
} from "renderer/icons"
import { useMemo, useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import * as Dialog from "@radix-ui/react-dialog"
import * as Tabs from "@radix-ui/react-tabs"
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
  const [mainTab, setMainTab] = useState("dashboard")

  // Analytics queries
  const analyticsQuery = useQuery({
    queryKey: ["recording-analytics"],
    queryFn: async () => tipcClient.getRecordingAnalytics(),
  })

  const historyQuery = useQuery({
    queryKey: ["recording-history"],
    queryFn: async () => tipcClient.getRecordingHistory(),
  })

  // Mutations
  const deleteRecordingHistoryMutation = useMutation({
    mutationFn: tipcClient.deleteRecordingHistory,
    onSuccess() {
      historyQuery.refetch()
      analyticsQuery.refetch()
    },
  })

  const deleteRecordingMutation = useMutation({
    mutationFn: (id) => tipcClient.deleteRecording({ id }),
    onSuccess() {
      historyQuery.refetch()
      analyticsQuery.refetch()
    },
  })

  // History data
  const historyData = historyQuery.data || []
  const totalSize = historyData.reduce(
    (acc, item) => acc + (item.fileSize || 0),
    0,
  )
  const totalDuration = historyData.reduce(
    (acc, item) => acc + (item.duration || 0),
    0,
  )

  const data = analyticsQuery.data
  const timelineData = useMemo(() => {
    if (!data || !data.timeline) return []
    return data.timeline.map((entry) => ({
      ...entry,
      label: dayjs(entry.date).format("MMM D"),
      durationMinutes: Number((entry.durationMs / 60000).toFixed(2)),
    }))
  }, [data])

  const providerData = data?.providerBreakdown || []

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

  const formatBytes = (bytes) => {
    if (!bytes) return "0 B"
    const units = ["B", "KB", "MB", "GB"]
    let unitIndex = 0
    let value = bytes
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024
      unitIndex += 1
    }
    return `${value.toFixed(1)} ${units[unitIndex]}`
  }

  const formatDuration = (ms) => {
    if (!ms) return "0s"
    const seconds = Math.round(ms / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remaining = seconds % 60
    return `${minutes}m ${remaining}s`
  }

  const formatProcessing = (value) => {
    if (value == null) return "--"
    if (value < 1000) return `${value.toFixed(0)}ms`
    return `${(value / 1000).toFixed(2)}s`
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return "--"
    const date = new Date(timestamp)
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const formatConfidence = (score) => {
    if (typeof score !== "number") return "--"
    return `${Math.round(score * 100)}%`
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <div className={layoutStyles.iconHolder}>
          <CardIcon />
        </div>
      </Dialog.Trigger>
      <Dialog.Portal container={document.getElementById("dialog")}>
        <Dialog.Overlay className={styles.DialogOverlay} />
        <Dialog.Content
          className={styles.DialogContent}
          aria-describedby={undefined}
        >
          <div className={styles.header}>
            <div className={styles.wrapper}>
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
              <Dialog.Close asChild>
                <button className={styles.close} aria-label="Close">
                  <CrossIcon style={{ height: 14, width: 14 }} />
                </button>
              </Dialog.Close>
            </div>
          </div>

          <div className={styles.mainContent}>
            <Tabs.Root
              value={mainTab}
              onValueChange={setMainTab}
              className={styles.tabsRoot}
            >
              <Tabs.List className={styles.TabsList}>
                <Tabs.Trigger value="dashboard" className={styles.TabTrigger}>
                  <GaugeIcon style={{ height: "16px", width: "16px" }} />
                  {t("dashboard.title")}
                </Tabs.Trigger>
                <Tabs.Trigger value="history" className={styles.TabTrigger}>
                  <ClockIcon style={{ height: "16px", width: "16px" }} />
                  {t("navigation.history")}
                </Tabs.Trigger>
              </Tabs.List>

              {/* Dashboard Tab */}
              <Tabs.Content
                value="dashboard"
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                {!data ? (
                  <div className={styles.EmptyState}>
                    {analyticsQuery.isLoading
                      ? t("dashboard.loadingAnalytics")
                      : t("dashboard.noAnalytics")}
                  </div>
                ) : (
                  <div className={styles.DashboardFrame}>
                    {/* Stats Row - 4 compact cards */}
                    <div className={styles.StatsRow}>
                      <div className={styles.StatCard}>
                        <div className={styles.StatValue}>
                          {data.totals?.recordings?.toLocaleString() || 0}
                        </div>
                        <div className={styles.StatLabel}>
                          {t("dashboard.totalRecordings")}
                        </div>
                      </div>
                      <div className={styles.StatCard}>
                        <div className={styles.StatValue}>
                          {formatDurationLong(data.totals?.durationMs)}
                        </div>
                        <div className={styles.StatLabel}>
                          {t("dashboard.totalDuration")}
                        </div>
                      </div>
                      <div className={styles.StatCard}>
                        <div className={styles.StatValue}>
                          {data.totals?.averageAccuracy == null
                            ? "--"
                            : `${Math.round(data.totals.averageAccuracy * 100)}%`}
                        </div>
                        <div className={styles.StatLabel}>
                          {t("dashboard.avgAccuracy")}
                        </div>
                      </div>
                      <div className={styles.StatCard}>
                        <div className={styles.StatValue}>
                          {formatNumber(data.totals?.averageWpm)}
                        </div>
                        <div className={styles.StatLabel}>
                          {t("dashboard.avgWpm")}
                        </div>
                      </div>
                    </div>

                    {/* Charts Section - Timeline + Pie side by side */}
                    <div className={styles.ChartsSection}>
                      {/* Timeline Chart */}
                      {timelineData.length > 0 && (
                        <div className={styles.TimelineCard}>
                          <div className={styles.CardTitle}>
                            {t("dashboard.timeline")}
                          </div>
                          <div className={styles.TimelineChart}>
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart
                                data={timelineData}
                                margin={{
                                  top: 8,
                                  right: 8,
                                  bottom: 0,
                                  left: -20,
                                }}
                              >
                                <CartesianGrid
                                  strokeDasharray="3 3"
                                  strokeOpacity={0.1}
                                />
                                <XAxis
                                  dataKey="label"
                                  tickLine={false}
                                  tick={{
                                    fontSize: 10,
                                    fill: "var(--secondary)",
                                  }}
                                />
                                <YAxis
                                  tickLine={false}
                                  tick={{
                                    fontSize: 10,
                                    fill: "var(--secondary)",
                                  }}
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

                      {/* Provider Breakdown */}
                      {providerData.length > 0 && (
                        <div className={styles.ProviderCard}>
                          <div className={styles.CardTitle}>
                            {t("dashboard.providerBreakdown")}
                          </div>
                          <div className={styles.ProviderContent}>
                            <div className={styles.PieWrapper}>
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={providerData}
                                    dataKey="count"
                                    nameKey="providerId"
                                    innerRadius={25}
                                    outerRadius={45}
                                    paddingAngle={2}
                                  >
                                    {providerData.map((_, index) => (
                                      <Cell
                                        key={index}
                                        fill={
                                          PIE_COLORS[index % PIE_COLORS.length]
                                        }
                                      />
                                    ))}
                                  </Pie>
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

                    {/* STT Model Performance */}
                    {data.sttModelRanking &&
                      data.sttModelRanking.length > 0 && (
                        <div className={styles.PerformanceCard}>
                          <div className={styles.CardTitle}>
                            {t("analytics.sttModelPerformance")}
                          </div>
                          <div className={styles.TableWrapper}>
                            <table className={styles.Table}>
                              <thead>
                                <tr>
                                  <th>#</th>
                                  <th>{t("analytics.model")}</th>
                                  <th>{t("analytics.uses")}</th>
                                  <th>{t("analytics.avg")}</th>
                                  <th>{t("analytics.success")}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {data.sttModelRanking
                                  .slice(0, 5)
                                  .map((model, index) => (
                                    <tr key={model.modelId}>
                                      <td>{index + 1}</td>
                                      <td className={styles.ModelName}>
                                        {model.modelName}
                                      </td>
                                      <td>{model.count}</td>
                                      <td>
                                        {formatProcessing(
                                          model.averageLatencyMs,
                                        )}
                                      </td>
                                      <td>
                                        <span
                                          className={styles.SuccessRate}
                                          style={{
                                            background:
                                              model.successRate >= 0.95
                                                ? "rgba(34, 197, 94, 0.2)"
                                                : model.successRate >= 0.8
                                                  ? "rgba(234, 179, 8, 0.2)"
                                                  : "rgba(239, 68, 68, 0.2)",
                                            color:
                                              model.successRate >= 0.95
                                                ? "#22c55e"
                                                : model.successRate >= 0.8
                                                  ? "#eab308"
                                                  : "#ef4444",
                                          }}
                                        >
                                          {(model.successRate * 100).toFixed(0)}
                                          %
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                  </div>
                )}
              </Tabs.Content>

              {/* History Tab */}
              <Tabs.Content
                value="history"
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "center",
                  flex: 1,
                  minHeight: 0,
                }}
              >
                <div className={styles.HistoryContainer}>
                  {/* Minimalist Header */}
                  <div className={styles.HistoryListHeader}>
                    <span className={styles.HistoryCount}>
                      {historyData.length} {t("analytics.recordings")}
                    </span>
                    {historyData.length > 0 && (
                      <button
                        className={styles.DeleteAllBtn}
                        onClick={() => {
                          if (window.confirm(t("analytics.deleteAllConfirm"))) {
                            deleteRecordingHistoryMutation.mutate()
                          }
                        }}
                      >
                        {t("analytics.deleteAll")}
                      </button>
                    )}
                  </div>

                  <div className={styles.HistoryList}>
                    {historyData.length === 0 ? (
                      <div className={styles.EmptyState}>
                        {t("analytics.noRecordingsYet")}
                      </div>
                    ) : (
                      historyData
                        .slice()
                        .sort(
                          (a, b) =>
                            new Date(b.createdAt) - new Date(a.createdAt),
                        )
                        .map((item, index) => (
                          <div
                            key={`${item.id}-${index}`}
                            className={styles.HistoryItem}
                          >
                            <div className={styles.HistoryHeader}>
                              <div className={styles.HistoryDate}>
                                {formatDate(item.createdAt)}
                              </div>
                              <div className={styles.HistoryActions}>
                                <span className={styles.HistoryDuration}>
                                  {formatDuration(item.duration)}
                                </span>
                                <button
                                  className={styles.CopyBtn}
                                  onClick={() => {
                                    if (item.transcript) {
                                      navigator.clipboard.writeText(
                                        item.transcript,
                                      )
                                    }
                                  }}
                                  title={t("common.copy")}
                                >
                                  <CopyIcon />
                                </button>
                                <button
                                  className={styles.DeleteIconBtn}
                                  onClick={() => {
                                    if (
                                      window.confirm(t("history.deleteConfirm"))
                                    ) {
                                      deleteRecordingMutation.mutate(item.id)
                                    }
                                  }}
                                >
                                  {t("common.delete")}
                                </button>
                              </div>
                            </div>
                            <div className={styles.HistoryTranscript}>
                              {item.transcript ||
                                t("analytics.noTranscription")}
                            </div>
                            <div className={styles.HistoryMeta}>
                              {item.providerId && (
                                <span className={styles.MetaItem}>
                                  {item.providerId}
                                </span>
                              )}
                              {item.fileSize && (
                                <span className={styles.MetaItem}>
                                  {formatBytes(item.fileSize)}
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </Tabs.Content>
            </Tabs.Root>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
