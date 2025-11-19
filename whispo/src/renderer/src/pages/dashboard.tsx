import { useMemo } from "react"
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
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { Button } from "@renderer/components/ui/button"
import { tipcClient } from "@renderer/lib/tipc-client"
import { PageHeader } from "@renderer/components/page-header"
import { SectionCard, StatCard } from "@renderer/components/ui/section-card"

const PIE_COLORS = ["#3b82f6", "#0ea5e9", "#14b8a6", "#f59e0b", "#64748b"]

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

  const providerData = data?.providerBreakdown || []

  return (
    <div className="flex min-h-full flex-col gap-6 text-white bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/5 via-transparent to-transparent">
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
                  <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} name={t("dashboard.recordings")} />
                  <Line
                    type="monotone"
                    dataKey="durationMinutes"
                    stroke="#0ea5e9"
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
        </div>
      )}
    </div>
  )
}
