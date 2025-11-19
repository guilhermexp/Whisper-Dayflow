import { useMemo } from "react"
import { PageHeader } from "@renderer/components/page-header"
import { Button } from "@renderer/components/ui/button"
import { Control, ControlGroup } from "@renderer/components/ui/control"
import { StatCard, SectionCard, InsightCard } from "@renderer/components/ui/section-card"
import { tipcClient } from "@renderer/lib/tipc-client"
import { useMutation, useQuery } from "@tanstack/react-query"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from "recharts"

const formatBytes = (bytes?: number) => {
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

const formatProcessing = (value: number | null | undefined) => {
  if (value == null) return "--"
  if (value < 1000) return `${value.toFixed(0)}ms`
  return `${(value / 1000).toFixed(2)}s`
}

export function Component() {
  const historyQuery = useQuery({
    queryKey: ["recording-history"],
    queryFn: async () => tipcClient.getRecordingHistory(),
  })

  const analyticsQuery = useQuery({
    queryKey: ["recording-analytics"],
    queryFn: async () => tipcClient.getRecordingAnalytics(),
  })

  const deleteRecordingHistoryMutation = useMutation({
    mutationFn: tipcClient.deleteRecordingHistory,
    onSuccess() {
      historyQuery.refetch()
      analyticsQuery.refetch()
    },
  })

  const data = historyQuery.data || []
  const totalSize = data.reduce((acc, item) => acc + (item.fileSize || 0), 0)
  const totalDuration = data.reduce((acc, item) => acc + (item.duration || 0), 0)

  const analytics = analyticsQuery.data

  const peakHourData = useMemo(() => {
    if (!analytics) return []
    return analytics.peakHours.map((entry) => ({
      ...entry,
      label: `${entry.hour}:00`,
    }))
  }, [analytics])

  const tags = analytics?.tags || []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data"
        description="Manage stored recordings and purge local history when needed."
      />

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Total Recordings"
          value={data.length.toLocaleString()}
          helper="Stored locally"
          icon="i-mingcute-file-line"
        />
        <StatCard
          label="Storage Used"
          value={formatBytes(totalSize)}
          helper="On disk"
          icon="i-mingcute-storage-line"
        />
        <StatCard
          label="Total Duration"
          value={formatDurationLong(totalDuration)}
          helper="Audio time"
          icon="i-mingcute-time-line"
        />
      </section>

      <ControlGroup title="History">
        <Control label="Recorded Transcripts" className="px-3">
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              if (
                window.confirm(
                  "Are you absolutely sure to remove all recordings forever? This action cannot be undone.",
                )
              ) {
                deleteRecordingHistoryMutation.mutate()
              }
            }}
            disabled={data.length === 0}
          >
            <span className="i-mingcute-delete-2-fill"></span>
            <span>Delete All ({data.length})</span>
          </Button>
        </Control>
      </ControlGroup>

      {analytics && (
        <div className="space-y-4">
          <section className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Peak Hours" description="Most active recording times">
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

            <SectionCard title="Productivity" description="Performance metrics">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <InsightCard
                  label="Avg WPM"
                  value={formatNumber(analytics.productivity.wordsPerMinute.average)}
                  helper={`Median ${formatNumber(analytics.productivity.wordsPerMinute.median)}`}
                />
                <InsightCard
                  label="Processing Time"
                  value={formatProcessing(analytics.productivity.processingTimeMs.average)}
                  helper={`P95 ${formatProcessing(analytics.productivity.processingTimeMs.percentile95)}`}
                />
              </div>
              <div className="mt-3 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70">
                WPM Trend: {formatNumber(analytics.productivity.wordsPerMinute.trend, 2)}%
              </div>
            </SectionCard>
          </section>

          {/* STT Model Performance Ranking */}
          <SectionCard
            title="🎙️ STT Model Performance"
            description="Transcription models ranked by usage and performance"
          >
            {analytics.sttModelRanking.length === 0 ? (
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
                    {analytics.sttModelRanking.slice(0, 10).map((model, index) => (
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
            {analytics.enhancementModelRanking.length === 0 ? (
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
                    {analytics.enhancementModelRanking.slice(0, 10).map((model, index) => (
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

          <SectionCard title="Top Tags" description="Most frequent topics">
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
