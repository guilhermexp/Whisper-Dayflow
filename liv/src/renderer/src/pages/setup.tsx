import { useMicrphoneStatusQuery, useConfigQuery, useSaveConfigMutation } from "@renderer/lib/query-client"
import { Button } from "@renderer/components/ui/button"
import { tipcClient } from "@renderer/lib/tipc-client"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

const LANGUAGES = [
  { code: "pt-BR", label: "Português (Brasil)", flag: "🇧🇷" },
  { code: "en-US", label: "English (US)", flag: "🇺🇸" },
] as const

export function Component() {
  const { t, i18n } = useTranslation()
  const configQuery = useConfigQuery()
  const saveConfigMutation = useSaveConfigMutation()
  const microphoneStatusQuery = useMicrphoneStatusQuery()
  const isAccessibilityGrantedQuery = useQuery({
    queryKey: ["setup-isAccessibilityGranted"],
    queryFn: () => tipcClient.isAccessibilityGranted(),
  })
  const screenRecordingStatusQuery = useQuery({
    queryKey: ["setup-screenRecordingStatus"],
    queryFn: () => tipcClient.getScreenRecordingStatus(),
  })

  const handleLanguageChange = (lang: "en-US" | "pt-BR") => {
    i18n.changeLanguage(lang)
    saveConfigMutation.mutate({
      config: { ...configQuery.data, language: lang },
    })
  }

  return (
    <div className="app-drag-region flex h-dvh items-center justify-center p-10">
      <div className="-mt-20">
        <h1 className="text-center text-3xl font-extrabold">
          {t("onboarding.title")}
        </h1>
        <h2 className="mb-10 text-center text-neutral-500 dark:text-neutral-400">
          {t("onboarding.permissionsNeeded")}
        </h2>
        <div className="mx-auto max-w-screen-md">
          <div className="grid divide-y rounded-lg border">
            {process.env.IS_MAC && (
              <PermissionBlock
                title={t("onboarding.accessibility.title")}
                description={t("onboarding.accessibility.description")}
                actionText={t("onboarding.accessibility.action")}
                actionHandler={() => {
                  tipcClient.requestAccessibilityAccess()
                }}
                enabled={isAccessibilityGrantedQuery.data}
                grantedLabel={t("onboarding.granted")}
              />
            )}

            <PermissionBlock
              title={t("onboarding.microphone.title")}
              description={t("onboarding.microphone.description")}
              actionText={
                microphoneStatusQuery.data === "denied"
                  ? t("onboarding.accessibility.action")
                  : t("onboarding.microphone.action")
              }
              actionHandler={async () => {
                const granted = await tipcClient.requestMicrophoneAccess()
                if (!granted) {
                  tipcClient.openMicrophoneInSystemPreferences()
                }
              }}
              enabled={microphoneStatusQuery.data === "granted"}
              grantedLabel={t("onboarding.granted")}
            />

            {process.env.IS_MAC && (
              <PermissionBlock
                title={t("onboarding.screenRecording.title")}
                description={t("onboarding.screenRecording.description")}
                actionText={
                  screenRecordingStatusQuery.data === "denied"
                    ? t("onboarding.accessibility.action")
                    : t("onboarding.screenRecording.action")
                }
                actionHandler={async () => {
                  const granted = await tipcClient.requestScreenRecordingAccess()
                  if (!granted) {
                    tipcClient.openScreenRecordingInSystemPreferences()
                  }
                }}
                enabled={screenRecordingStatusQuery.data === "granted"}
                grantedLabel={t("onboarding.granted")}
              />
            )}
          </div>
        </div>

        <div className="mt-10 flex items-center justify-center gap-3">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              tipcClient.restartApp()
            }}
          >
            <span className="i-mingcute-refresh-2-line"></span>
            <span>{t("onboarding.restart", "Reiniciar App")}</span>
          </Button>

          {LANGUAGES.map((lang) => (
            <Button
              key={lang.code}
              variant={i18n.language === lang.code ? "default" : "outline"}
              className="gap-2"
              onClick={() => handleLanguageChange(lang.code)}
            >
              <span>{lang.flag}</span>
              <span>{lang.label}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}

const PermissionBlock = ({
  title,
  description,
  actionHandler,
  actionText,
  enabled,
  grantedLabel,
}: {
  title: React.ReactNode
  description: React.ReactNode
  actionText: string
  actionHandler: () => void
  enabled?: boolean
  grantedLabel?: string
}) => {
  return (
    <div className="grid grid-cols-2 gap-5 p-3">
      <div>
        <div className="text-lg font-bold">{title}</div>
        <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          {description}
        </div>
      </div>
      <div className="flex items-center justify-end">
        {enabled ? (
          <div className="inline-flex items-center gap-1 text-green-500">
            <span className="i-mingcute-check-fill"></span>
            <span>{grantedLabel ?? "Concedido"}</span>
          </div>
        ) : (
          <Button type="button" onClick={actionHandler}>
            {actionText}
          </Button>
        )}
      </div>
    </div>
  )
}
