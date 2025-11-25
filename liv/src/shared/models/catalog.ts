import type { LocalModel } from "./types"

export const PREDEFINED_LOCAL_MODELS: LocalModel[] = [
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
    engine: "whisper",
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
    engine: "whisper",
  },
  // Parakeet models (sherpa-onnx engine)
  {
    id: "local-parakeet-tdt-v3",
    name: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8",
    displayName: "Parakeet TDT v3 (Multilingual)",
    description:
      "NVIDIA's state-of-the-art ASR model. Supports 25 European languages including Portuguese. Excellent accuracy and speed.",
    language: "multilingual",
    provider: "local",
    size: "330 MB",
    sizeBytes: 330 * 1024 * 1024,
    speed: 9.5,
    accuracy: 9.2,
    ramUsage: 1.0,
    downloadURL:
      "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2",
    filename: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8",
    isDownloaded: false,
    engine: "sherpa",
  },
]

export const RECOMMENDED_MODEL_IDS = [
  "local-large-v3-turbo-q5",
  "local-large-v3-turbo",
  "local-parakeet-tdt-v3",
]
