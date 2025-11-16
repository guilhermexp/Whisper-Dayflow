import { useMemo, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import dayjs from "dayjs"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { Button } from "@renderer/components/ui/button"
import { tipcClient } from "@renderer/lib/tipc-client"
import { PageHeader } from "@renderer/components/page-header"
import { SectionCard, StatCard, InsightCard } from "@renderer/components/ui/section-card"

const PIE_COLORS = ["#6366f1", "#ec4899", "#f97316", "#14b8a6", "#0ea5e9"]

const formatDurationLong = (ms: number) => {
  if (!ms) return "0m"
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  return `${hours}h ${remaining}m`
}

const formatNumber = (value: number | null | undefined, precision = 0) => {
  if (value == null) return "--"
  return Number(value).toFixed(precision)
}

export function Component() {
  const { t } = useTranslation()
  const analyticsQuery = useQuery({
    queryKey: ["recording-analytics"],
    queryFn: async () => tipcClient.getRecordingAnalytics(),
  })

  const data = analyticsQuery.data

  const timelineData = useMemo(() => {
    if (!data) return []
    return data.timeline.map((entry) => ({
      ...entry,
      label: dayjs(entry.date).format("MMM D"),
      durationMinutes: Number((entry.durationMs / 60000).toFixed(2)),
    }))
  }, [data])

  const peakHourData = useMemo(() => {
    if (!data) return []
    return data.peakHours.map((entry) => ({
      ...entry,
      label: `${entry.hour}:00`,
    }))
  }, [data])

  const providerData = data?.providerBreakdown || []
  const tags = data?.tags || []

  return (
    <div className="flex h-full flex-col gap-4 text-white">
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.description")}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => analyticsQuery.refetch()}
            disabled={analyticsQuery.isRefetching}
          >
            <span className="i-mingcute-refresh-3-line" /> {t("dashboard.refresh")}
          </Button>
        }
      />

      {!data ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-white/70">
          {analyticsQuery.isLoading ? t("dashboard.loadingAnalytics") : t("dashboard.noAnalytics")}
        </div>
      ) : (
        <div className="space-y-4">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={t("dashboard.totalRecordings")}
              value={data.totals.recordings.toLocaleString()}
              helper={t("dashboard.avgSession", { duration: formatDurationLong(data.totals.averageSessionMs) })}
              icon="i-mingcute-mic-line"
            />
            <StatCard
              label={t("dashboard.totalDuration")}
              value={formatDurationLong(data.totals.durationMs)}
              helper={t("dashboard.recordedTime")}
              icon="i-mingcute-time-line"
            />
            <StatCard
              label={t("dashboard.avgAccuracy")}
              value={
                data.totals.averageAccuracy == null
                  ? "--"
                  : `${Math.round(data.totals.averageAccuracy * 100)}%`
              }
              helper={t("dashboard.acrossFilters")}
              icon="i-mingcute-check-circle-line"
            />
            <StatCard
              label={t("dashboard.avgWpm")}
              value={formatNumber(data.totals.averageWpm)}
              helper={t("dashboard.wordsPerMinute")}
              icon="i-mingcute-speed-line"
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <SectionCard
              title={t("dashboard.timeline")}
              description={t("dashboard.recordingPattern")}
            >
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={timelineData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} />
                  <XAxis dataKey="label" tickLine={false} stroke="#9ca3af" />
                  <YAxis tickLine={false} stroke="#9ca3af" />
                  <RechartsTooltip />
                  <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={false} name={t("dashboard.recordings")} />
                  <Line
                    type="monotone"
                    dataKey="durationMinutes"
                    stroke="#ec4899"
                    strokeWidth={2}
                    dot={false}
                    name={t("dashboard.durationMinutes")}
                  />
                </LineChart>
              </ResponsiveContainer>
            </SectionCard>

            <SectionCard title={t("dashboard.providerBreakdown")} description={t("dashboard.usageDistribution")}>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={providerData}
                    dataKey="count"
                    nameKey="providerId"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {providerData.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                {providerData.map((entry, index) => (
                  <div key={entry.providerId} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                    />
                    <span className="font-medium text-white">{entry.providerId}</span>
                    <span className="ml-auto text-white/70">{entry.count} sessions</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <SectionCard title={t("dashboard.peakHours")} description={t("dashboard.mostActive")}>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={peakHourData}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} />
                  <XAxis dataKey="label" tickLine={false} stroke="#9ca3af" interval={2} />
                  <YAxis tickLine={false} stroke="#9ca3af" allowDecimals={false} />
                  <RechartsTooltip />
                  <Bar dataKey="count" fill="#14b8a6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>

            <SectionCard title={t("dashboard.productivity")} description={t("dashboard.performanceMetrics")}>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <InsightCard
                  label={t("dashboard.avgWpm")}
                  value={formatNumber(data.productivity.wordsPerMinute.average)}
                  helper={`Median ${formatNumber(data.productivity.wordsPerMinute.median)}`}
                />
                <InsightCard
                  label={t("dashboard.processingTime")}
                  value={formatProcessing(data.productivity.processingTimeMs.average)}
                  helper={`P95 ${formatProcessing(data.productivity.processingTimeMs.percentile95)}`}
                />
              </div>
              <div className="mt-3 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70">
                {t("dashboard.wpmTrend")} {formatNumber(data.productivity.wordsPerMinute.trend, 2)}%
              </div>
            </SectionCard>
          </section>

          {/* STT Model Performance Ranking */}
          <SectionCard
            title="🎙️ STT Model Performance"
            description="Transcription models ranked by usage and performance"
          >
            {data.sttModelRanking.length === 0 ? (
              <p className="text-sm text-white/70">No transcription data yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs text-white/60">
                      <th className="pb-2 pr-4 font-medium">#</th>
                      <th className="pb-2 pr-4 font-medium">Model</th>
                      <th className="pb-2 pr-4 font-medium text-right">Uses</th>
                      <th className="pb-2 pr-4 font-medium text-right">Avg Speed</th>
                      <th className="pb-2 pr-4 font-medium text-right">P95 Speed</th>
                      <th className="pb-2 pr-4 font-medium text-right">Accuracy</th>
                      <th className="pb-2 pr-4 font-medium text-right">Success Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sttModelRanking.slice(0, 10).map((model, index) => (
                      <tr key={model.modelId} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="py-3 pr-4 text-white/60">{index + 1}</td>
                        <td className="py-3 pr-4 font-medium text-white">
                          {model.modelName}
                          {index === 0 && <span className="ml-2 text-xs text-yellow-500">👑</span>}
                        </td>
                        <td className="py-3 pr-4 text-right text-white/80">{model.count}</td>
                        <td className="py-3 pr-4 text-right text-white/80">
                          {formatProcessing(model.averageLatencyMs)}
                        </td>
                        <td className="py-3 pr-4 text-right text-white/80">
                          {formatProcessing(model.p95LatencyMs)}
                        </td>
                        <td className="py-3 pr-4 text-right text-white/80">
                          {model.averageAccuracy != null
                            ? `${(model.averageAccuracy * 100).toFixed(1)}%`
                            : "--"}
                        </td>
                        <td className="py-3 pr-4 text-right">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                            model.successRate >= 0.95 ? "bg-green-500/20 text-green-300"
                            : model.successRate >= 0.8 ? "bg-yellow-500/20 text-yellow-300"
                            : "bg-red-500/20 text-red-300"
                          }`}>
                            {(model.successRate * 100).toFixed(0)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* Enhancement Model Performance Ranking */}
          <SectionCard
            title="✨ Enhancement Model Performance"
            description="AI enhancement models ranked by usage and speed"
          >
            {data.enhancementModelRanking.length === 0 ? (
              <p className="text-sm text-white/70">No enhancement data yet. Enable AI enhancement in settings.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs text-white/60">
                      <th className="pb-2 pr-4 font-medium">#</th>
                      <th className="pb-2 pr-4 font-medium">Model</th>
                      <th className="pb-2 pr-4 font-medium text-right">Uses</th>
                      <th className="pb-2 pr-4 font-medium text-right">Avg Speed</th>
                      <th className="pb-2 pr-4 font-medium text-right">Median Speed</th>
                      <th className="pb-2 pr-4 font-medium text-right">P95 Speed</th>
                      <th className="pb-2 pr-4 font-medium text-right">Success Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.enhancementModelRanking.slice(0, 10).map((model, index) => (
                      <tr key={model.modelId} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="py-3 pr-4 text-white/60">{index + 1}</td>
                        <td className="py-3 pr-4 font-medium text-white">
                          {model.modelName}
                          {index === 0 && <span className="ml-2 text-xs text-yellow-500">👑</span>}
                        </td>
                        <td className="py-3 pr-4 text-right text-white/80">{model.count}</td>
                        <td className="py-3 pr-4 text-right text-white/80">
                          {formatProcessing(model.averageLatencyMs)}
                        </td>
                        <td className="py-3 pr-4 text-right text-white/80">
                          {formatProcessing(model.medianLatencyMs)}
                        </td>
                        <td className="py-3 pr-4 text-right text-white/80">
                          {formatProcessing(model.p95LatencyMs)}
                        </td>
                        <td className="py-3 pr-4 text-right">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                            model.successRate >= 0.95 ? "bg-green-500/20 text-green-300"
                            : model.successRate >= 0.8 ? "bg-yellow-500/20 text-yellow-300"
                            : "bg-red-500/20 text-red-300"
                          }`}>
                            {(model.successRate * 100).toFixed(0)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title={t("dashboard.topTags")} description="Most frequent topics">
            {tags.length === 0 ? (
              <p className="text-sm text-white/70">No tags collected yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2 text-xs">
                {tags.map((tag) => (
                  <span
                    key={tag.tag}
                    className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 font-medium text-white"
                  >
                    #{tag.tag} · {tag.count}
                  </span>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  )
}

const formatProcessing = (value: number | null | undefined) => {
  if (value == null) return "--"
  if (value < 1000) return `${value.toFixed(0)}ms`
  return `${(value / 1000).toFixed(2)}s`
}
