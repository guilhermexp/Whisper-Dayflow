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
import { useTranslation } from "react-i18next"

const supportsAutoLaunch = (() => {
  if (typeof navigator === "undefined") return true
  const userAgent = navigator.userAgent.toLowerCase()
  return userAgent.includes("mac") || userAgent.includes("win")
})()

export function Component() {
  const { t, i18n } = useTranslation()
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
  const currentLanguage = configQuery.data?.language || i18n.language

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
        title={t("settings.general.title")}
        description={t("settings.general.description")}
      />

      {process.env.IS_MAC && (
        <ControlGroup title={t("settings.general.app")}>
          <Control label={t("settings.general.hideDockIcon")}>
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
        title={t("settings.general.shortcuts")}
        endDescription={
          <div className="flex items-center gap-1">
            <div>
              {shortcut === "hold-ctrl"
                ? t("settings.general.shortcutHoldCtrlDesc")
                : shortcut === "instant-ctrl"
                  ? t("settings.general.shortcutInstantCtrlDesc")
                  : shortcut === "fn-key"
                    ? t("settings.general.shortcutFnKeyDesc")
                    : t("settings.general.shortcutCtrlSlashDesc")}
            </div>
            <TooltipProvider disableHoverableContent delayDuration={0}>
              <Tooltip>
                <TooltipTrigger className="inline-flex items-center justify-center">
                  <span className="i-mingcute-information-fill text-base"></span>
                </TooltipTrigger>
                <TooltipContent collisionPadding={5}>
                  {shortcut === "hold-ctrl"
                    ? t("settings.general.shortcutCancelHoldCtrl")
                    : shortcut === "instant-ctrl"
                      ? t("settings.general.shortcutCancelInstantCtrl")
                      : shortcut === "fn-key"
                        ? t("settings.general.shortcutCancelFnKey")
                        : t("settings.general.shortcutCancelCtrlSlash")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        }
      >
        <Control label={t("settings.general.recording")} className="px-3">
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
              <SelectItem value="hold-ctrl">{t("settings.general.holdCtrl")}</SelectItem>
              <SelectItem value="instant-ctrl">{t("settings.general.instantCtrl")}</SelectItem>
              <SelectItem value="fn-key">{t("settings.general.fnKey")}</SelectItem>
              <SelectItem value="ctrl-slash">{t("settings.general.ctrlSlash")}</SelectItem>
            </SelectContent>
          </Select>
        </Control>
      </ControlGroup>

      <ControlGroup
        title={t("settings.general.clipboard")}
        endDescription={t("settings.general.preserveClipboardDesc")}
      >
        <Control label={t("settings.general.preserveClipboard")} className="px-3">
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
        title={t("settings.general.notifications")}
        endDescription={t("settings.general.audioCuesDesc")}
      >
        <Control label={t("settings.general.audioCues")} className="px-3">
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
        title={t("settings.general.language")}
        endDescription={t("settings.general.languageDesc")}
      >
        <Control label={t("settings.general.selectLanguage")} className="px-3">
          <Select
            value={currentLanguage}
            onValueChange={(value: "en-US" | "pt-BR") => {
              i18n.changeLanguage(value)
              saveConfig({
                language: value,
              })
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en-US">English (US)</SelectItem>
              <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
            </SelectContent>
          </Select>
        </Control>
      </ControlGroup>

      {process.env.IS_MAC && (
        <ControlGroup
          title="Media Control"
          endDescription="Automatically mute system audio during recording to prevent background noise"
        >
          <Control label="Mute System Audio" className="px-3">
            <Switch
              defaultChecked={configQuery.data.isPauseMediaEnabled ?? false}
              onCheckedChange={(value) => {
                saveConfig({
                  isPauseMediaEnabled: value,
                })
              }}
            />
          </Control>
        </ControlGroup>
      )}

      <ControlGroup
        title={t("settings.general.startup")}
        endDescription={
          supportsAutoLaunch
            ? t("settings.general.launchOnLoginDesc")
            : t("settings.general.launchOnLoginUnavailable")
        }
      >
        <Control label={t("settings.general.launchOnLogin")} className="px-3">
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
