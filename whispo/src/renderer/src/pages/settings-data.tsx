import { PageHeader } from "@renderer/components/page-header"
import { Button } from "@renderer/components/ui/button"
import { Control, ControlGroup } from "@renderer/components/ui/control"
import { tipcClient } from "@renderer/lib/tipc-client"
import { useMutation } from "@tanstack/react-query"

export function Component() {
  const deleteRecordingHistoryMutation = useMutation({
    mutationFn: tipcClient.deleteRecordingHistory,
    onSuccess() {},
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data"
        description="Manage stored recordings and purge local history when needed."
      />

      <ControlGroup title="History">
        <Control label="Recorded Transcripts" className="px-3">
          <Button
            variant="ghost"
            className="h-7 gap-1 px-2 py-0 text-red-400 hover:text-red-300"
            onClick={() => {
              if (
                window.confirm(
                  "Are you absolutely sure to remove all recordings forever?",
                )
              ) {
                deleteRecordingHistoryMutation.mutate()
              }
            }}
          >
            <span className="i-mingcute-delete-2-fill"></span>
            <span>Delete All</span>
          </Button>
        </Control>
      </ControlGroup>
    </div>
  )
}
