import type { LocalModel } from "./types"

export const PREDEFINED_LOCAL_MODELS: LocalModel[] = [
  {
    id: "local-tiny-en",
    name: "ggml-tiny.en",
    displayName: "Tiny (English)",
    description: "Fastest model for simple English transcription tasks.",
    language: "english",
    provider: "local",
    size: "75 MB",
    sizeBytes: 75 * 1024 * 1024,
    speed: 6,
    accuracy: 5.5,
    ramUsage: 0.3,
    downloadURL:
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
    filename: "ggml-tiny.en.bin",
    isDownloaded: false,
  },
  {
    id: "local-base-en",
    name: "ggml-base.en",
    displayName: "Base (English)",
    description: "Fast and accurate for English transcription.",
    language: "english",
    provider: "local",
    size: "142 MB",
    sizeBytes: 142 * 1024 * 1024,
    speed: 7.5,
    accuracy: 8.2,
    ramUsage: 0.5,
    downloadURL:
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
    filename: "ggml-base.en.bin",
    isDownloaded: false,
  },
  {
    id: "local-large-v3-turbo",
    name: "ggml-large-v3-turbo",
    displayName: "Large v3 Turbo",
    description: "Best balance of speed and accuracy for most use cases.",
    language: "multilingual",
    provider: "local",
    size: "1.5 GB",
    sizeBytes: Math.round(1.5 * 1024 * 1024 * 1024),
    speed: 9.2,
    accuracy: 8.8,
    ramUsage: 1.8,
    downloadURL:
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin",
    filename: "ggml-large-v3-turbo.bin",
    isDownloaded: false,
  },
  {
    id: "local-large-v3-turbo-q5",
    name: "ggml-large-v3-turbo-q5_0",
    displayName: "Large v3 Turbo (Quantized)",
    description:
      "Compressed version with minimal quality loss, optimized for laptops.",
    language: "multilingual",
    provider: "local",
    size: "547 MB",
    sizeBytes: 547 * 1024 * 1024,
    speed: 9,
    accuracy: 8.6,
    ramUsage: 0.8,
    downloadURL:
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin",
    filename: "ggml-large-v3-turbo-q5_0.bin",
    isDownloaded: false,
  },
  
]

export const RECOMMENDED_MODEL_IDS = [
  "local-base-en",
  "local-large-v3-turbo-q5",
  "local-large-v3-turbo",
]
