import { PageHeader } from "@renderer/components/page-header"
import { Button } from "@renderer/components/ui/button"
import { Control, ControlGroup } from "@renderer/components/ui/control"
import { StatCard } from "@renderer/components/ui/section-card"
import { tipcClient } from "@renderer/lib/tipc-client"
import { useMutation, useQuery } from "@tanstack/react-query"

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

export function Component() {
  const historyQuery = useQuery({
    queryKey: ["recording-history"],
    queryFn: async () => tipcClient.getRecordingHistory(),
  })

  const deleteRecordingHistoryMutation = useMutation({
    mutationFn: tipcClient.deleteRecordingHistory,
    onSuccess() {
      historyQuery.refetch()
    },
  })

  const data = historyQuery.data || []
  const totalSize = data.reduce((acc, item) => acc + (item.fileSize || 0), 0)
  const totalDuration = data.reduce((acc, item) => acc + (item.duration || 0), 0)

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
    </div>
  )
}
