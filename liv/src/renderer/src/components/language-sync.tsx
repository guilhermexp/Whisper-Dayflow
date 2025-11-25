import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { useConfigQuery } from "@renderer/lib/query-client"

/**
 * Component that syncs i18n language with user config
 */
export function LanguageSync() {
  const { i18n } = useTranslation()
  const configQuery = useConfigQuery()

  useEffect(() => {
    const configLanguage = configQuery.data?.language
    if (configLanguage && i18n.language !== configLanguage) {
      i18n.changeLanguage(configLanguage)
    }
  }, [configQuery.data?.language, i18n])

  return null
}
