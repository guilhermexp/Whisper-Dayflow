/**
 * Predefined models for each cloud provider
 * Based on known working models from each service
 */

export const PREDEFINED_MODELS = {
  openai: [
    { id: "whisper-1", name: "Whisper v1" },
  ],
  groq: [
    { id: "whisper-large-v3", name: "Whisper Large v3" },
    { id: "whisper-large-v3-turbo", name: "Whisper Large v3 Turbo" },
    { id: "distil-whisper-large-v3-en", name: "Distil Whisper Large v3 (English)" },
  ],
  gemini: [
    { id: "gemini-2.0-flash-exp", name: "Gemini 2.0 Flash (Experimental)" },
    { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
    { id: "gemini-1.5-flash-8b", name: "Gemini 1.5 Flash 8B" },
    { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
  ],
} as const

export type PredefinedModelProvider = keyof typeof PREDEFINED_MODELS
