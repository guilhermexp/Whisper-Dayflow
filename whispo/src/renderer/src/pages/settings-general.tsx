import { PageHeader } from "@renderer/components/page-header"
import { Control, ControlGroup } from "@renderer/components/ui/control"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select"
import { Switch } from "@renderer/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@renderer/components/ui/tooltip"
import {
  useConfigQuery,
  useSaveConfigMutation,
  queryClient,
} from "@renderer/lib/query-client"
import { Config } from "@shared/types"
import { useEffect } from "react"

const supportsAutoLaunch = (() => {
  if (typeof navigator === "undefined") return true
  const userAgent = navigator.userAgent.toLowerCase()
  return userAgent.includes("mac") || userAgent.includes("win")
})()

export function Component() {
  const configQuery = useConfigQuery()

  const saveConfigMutation = useSaveConfigMutation()

  const saveConfig = (config: Partial<Config>) => {
    saveConfigMutation.mutate({
      config: {
        ...configQuery.data,
        ...config,
      },
    })
  }

  const shortcut = configQuery.data?.shortcut || "hold-ctrl"
  const audioCuesEnabled = configQuery.data?.enableAudioCues ?? true
  const launchOnStartup = configQuery.data?.launchOnStartup ?? false

  // Force refetch when window gains focus to ensure fresh config
  useEffect(() => {
    const handleFocus = () => {
      queryClient.invalidateQueries({ queryKey: ["config"] })
    }
    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [])

  if (!configQuery.data) return null

  return (
    <div className="space-y-6">
      <PageHeader
        title="General"
        description="Configure shortcuts, audio cues, and core application preferences."
      />

      {process.env.IS_MAC && (
        <ControlGroup title="App">
          <Control label="Hide Dock Icon" className="px-3">
            <Switch
              defaultChecked={configQuery.data.hideDockIcon}
              onCheckedChange={(value) => {
                saveConfig({
                  hideDockIcon: value,
                })
              }}
            />
          </Control>
        </ControlGroup>
      )}

      <ControlGroup
        title="Shortcuts"
        endDescription={
          <div className="flex items-center gap-1">
            <div>
              {shortcut === "hold-ctrl"
                ? "Hold Ctrl key for ~0.8s to start, release to finish"
                : shortcut === "instant-ctrl"
                  ? "Press and hold Ctrl to start instantly, release to finish"
                  : shortcut === "fn-key"
                    ? "Use the Fn key (push-to-talk)"
                    : "Press Ctrl+/ to start and finish recording"}
            </div>
            <TooltipProvider disableHoverableContent delayDuration={0}>
              <Tooltip>
                <TooltipTrigger className="inline-flex items-center justify-center">
                  <span className="i-mingcute-information-fill text-base"></span>
                </TooltipTrigger>
                <TooltipContent collisionPadding={5}>
                  {shortcut === "hold-ctrl"
                    ? "Press any key to cancel"
                    : shortcut === "instant-ctrl"
                      ? "Press Esc twice to cancel"
                      : shortcut === "fn-key"
                        ? "Press Esc twice to cancel (requires Accessibility on macOS)"
                        : "Press Esc to cancel"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        }
      >
        <Control label="Recording" className="px-3">
          <Select
            defaultValue={shortcut}
            onValueChange={(value) => {
              saveConfig({
                shortcut: value as typeof configQuery.data.shortcut,
              })
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hold-ctrl">Hold Ctrl</SelectItem>
              <SelectItem value="instant-ctrl">Instant Ctrl</SelectItem>
              <SelectItem value="fn-key">Fn Key (push-to-talk)</SelectItem>
              <SelectItem value="ctrl-slash">Ctrl+{"/"}</SelectItem>
            </SelectContent>
          </Select>
        </Control>
      </ControlGroup>

      <ControlGroup
        title="Clipboard"
        endDescription="When enabled, your clipboard (Cmd+V) will be preserved after transcription. Use Ctrl+V to paste the last transcription."
      >
        <Control label="Preserve Clipboard" className="px-3">
          <Switch
            defaultChecked={configQuery.data.preserveClipboard ?? true}
            onCheckedChange={(value) => {
              saveConfig({
                preserveClipboard: value,
              })
            }}
          />
        </Control>
      </ControlGroup>

      <ControlGroup
        title="Notifications"
        endDescription="Play audible cues when recording starts or finishes."
      >
        <Control label="Audio cues" className="px-3">
          <Switch
            checked={audioCuesEnabled}
            onCheckedChange={(value) => {
              saveConfig({
                enableAudioCues: value,
              })
            }}
          />
        </Control>
      </ControlGroup>

      <ControlGroup
        title="Startup"
        endDescription={
          supportsAutoLaunch
            ? "Launch Whispo automatically when you sign in."
            : "Auto-launch is available on macOS and Windows builds."
        }
      >
        <Control label="Launch on login" className="px-3">
          <Switch
            checked={launchOnStartup}
            disabled={!supportsAutoLaunch}
            onCheckedChange={(value) => {
              if (!supportsAutoLaunch) return
              saveConfig({
                launchOnStartup: value,
              })
            }}
          />
        </Control>
      </ControlGroup>

    </div>
  )
}
