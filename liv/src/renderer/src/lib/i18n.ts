import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import enUS from "../locales/en-US.json"
import ptBR from "../locales/pt-BR.json"

export const resources = {
  "en-US": { translation: enUS },
  "pt-BR": { translation: ptBR },
} as const

export type Language = keyof typeof resources

const getDefaultLanguage = (): Language => {
  // Try to get system locale from Electron (most reliable)
  try {
    const systemLocale = window.electron?.getSystemLocale?.()
    if (systemLocale) {
      if (systemLocale.startsWith("pt")) {
        return "pt-BR"
      }
      // Could add more languages here in the future
      return "en-US"
    }
  } catch {
    // Fall through to browser detection
  }

  // Fallback to browser language
  const browserLang = navigator.language

  if (browserLang.startsWith("pt")) {
    return "pt-BR"
  }

  return "en-US"
}

i18n.use(initReactI18next).init({
  resources,
  lng: getDefaultLanguage(),
  fallbackLng: "en-US",
  interpolation: {
    escapeValue: false, // React already escapes
  },
})

export default i18n
