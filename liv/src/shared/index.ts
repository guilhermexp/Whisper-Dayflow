export const STT_PROVIDERS = [
  {
    label: "OpenAI",
    value: "openai",
  },
  {
    label: "Groq",
    value: "groq",
  },
  {
    label: "OpenRouter",
    value: "openrouter",
  },
] as const

export type CloudSTTProviderId = (typeof STT_PROVIDERS)[number]["value"]
export type LocalSTTProviderId = `local:${string}`
export type STT_PROVIDER_ID = CloudSTTProviderId | LocalSTTProviderId

export const CHAT_PROVIDERS = [
  {
    label: "OpenAI",
    value: "openai",
  },
  {
    label: "Groq",
    value: "groq",
  },
  {
    label: "Gemini",
    value: "gemini",
  },
] as const

export type CHAT_PROVIDER_ID = (typeof CHAT_PROVIDERS)[number]["value"]

export * from "./models/types"
export * from "./models/catalog"
