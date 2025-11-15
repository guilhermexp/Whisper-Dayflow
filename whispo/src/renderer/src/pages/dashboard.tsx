import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
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
  return value.toFixed(precision)
}

export function Component() {
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
    <div className="flex h-dvh flex-col">
      <div className="flex-1 overflow-auto p-6">
        <PageHeader
          title="Analytics Dashboard"
          description="Monitor provider usage, productivity trends, and peak recording times."
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => analyticsQuery.refetch()}
              disabled={analyticsQuery.isRefetching}
            >
              <span className="i-mingcute-refresh-3-line" /> Refresh
            </Button>
          }
        />

        {!data ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {analyticsQuery.isLoading ? "Loading analytics…" : "No analytics available yet."}
          </div>
        ) : (
          <div className="grid gap-6">
            <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <AnalyticsCard
                label="Total recordings"
                value={data.totals.recordings.toLocaleString()}
                helper={`Avg session ${formatDurationLong(data.totals.averageSessionMs)}`}
              />
              <AnalyticsCard
                label="Total duration"
                value={formatDurationLong(data.totals.durationMs)}
                helper="Recorded time"
              />
              <AnalyticsCard
                label="Avg accuracy"
                value={
                  data.totals.averageAccuracy == null
                    ? "--"
                    : `${Math.round(data.totals.averageAccuracy * 100)}%`
                }
                helper="Across filters"
              />
              <AnalyticsCard
                label="Avg WPM"
                value={formatNumber(data.totals.averageWpm)}
                helper="Words per minute"
              />
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">Timeline</div>
                    <div className="text-lg font-semibold">Recording pattern</div>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={timelineData} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                    <XAxis dataKey="label" tickLine={false} />
                    <YAxis tickLine={false} />
                    <RechartsTooltip />
                    <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={false} name="Recordings" />
                    <Line
                      type="monotone"
                      dataKey="durationMinutes"
                      stroke="#ec4899"
                      strokeWidth={2}
                      dot={false}
                      name="Duration (m)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-lg border p-4">
                <div className="text-xs uppercase text-muted-foreground">Provider usage</div>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={providerData}
                      dataKey="count"
                      nameKey="providerId"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
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
                    <div key={entry.providerId} className="flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                      />
                      <span className="font-medium">{entry.providerId}</span>
                      <span className="text-muted-foreground">{entry.count} sessions</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-lg border p-4">
                <div className="text-xs uppercase text-muted-foreground">Peak hours</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={peakHourData}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                    <XAxis dataKey="label" tickLine={false} interval={2} />
                    <YAxis tickLine={false} allowDecimals={false} />
                    <RechartsTooltip />
                    <Bar dataKey="count" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-lg border p-4 space-y-3">
                <div className="text-xs uppercase text-muted-foreground">Productivity insights</div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border p-3">
                    <div className="text-muted-foreground text-xs">Avg WPM</div>
                    <div className="text-xl font-semibold">
                      {formatNumber(data.productivity.wordsPerMinute.average)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Median {formatNumber(data.productivity.wordsPerMinute.median)}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-muted-foreground text-xs">Processing</div>
                    <div className="text-xl font-semibold">
                      {formatProcessing(data.productivity.processingTimeMs.average)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      P95 {formatProcessing(data.productivity.processingTimeMs.percentile95)}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Trend: {formatNumber(data.productivity.wordsPerMinute.trend, 2)}%
                </div>
              </div>
            </section>

            <section className="rounded-lg border p-4">
              <div className="text-xs uppercase text-muted-foreground">Top tags</div>
              {tags.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No tags collected yet.</p>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {tags.map((tag) => (
                    <span
                      key={tag.tag}
                      className="rounded-full border px-3 py-1 font-medium"
                    >
                      #{tag.tag} · {tag.count}
                    </span>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

const AnalyticsCard = ({
  label,
  value,
  helper,
}: {
  label: string
  value: string
  helper?: string
}) => (
  <div className="rounded-lg border p-4">
    <div className="text-xs uppercase text-muted-foreground">{label}</div>
    <div className="text-2xl font-semibold">{value}</div>
    {helper && <div className="text-xs text-muted-foreground">{helper}</div>}
  </div>
)

const formatProcessing = (value: number | null | undefined) => {
  if (value == null) return "--"
  if (value < 1000) return `${value}ms`
  return `${(value / 1000).toFixed(2)}s`
}
