import fs from "fs"
import os from "os"
import path from "path"
import { spawn } from "child_process"
import type { AnyModel, ImportedLocalModel, LocalModel } from "@shared/index"
import { modelManager } from "./model-manager"
import { LIV_RS_BINARY_PATH } from "./native-binary"
import { transcribeWithSherpa } from "./sherpa-transcriber"
import { audioProcessingService } from "./services/audio-processing-service"

type LocalTranscriptionOptions = {
  audioBuffer: Buffer
  modelId: string
  language?: string | null
  threads?: number | null
  signal?: AbortSignal
}

type ChildProcessResult = {
  stdout: string
}

const createSilentWav = (durationSeconds: number, sampleRate = 16000): Buffer => {
  const numSamples = Math.max(1, Math.floor(durationSeconds * sampleRate))
  const dataSize = numSamples * 2 // 16-bit PCM mono
  const buffer = Buffer.alloc(44 + dataSize)

  // RIFF header
  buffer.write("RIFF", 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write("WAVE", 8)
  buffer.write("fmt ", 12)
  buffer.writeUInt32LE(16, 16) // Subchunk1Size
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(1, 22) // Mono
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28) // Byte rate
  buffer.writeUInt16LE(2, 32) // Block align
  buffer.writeUInt16LE(16, 34) // Bits per sample
  buffer.write("data", 36)
  buffer.writeUInt32LE(dataSize, 40)

  // Samples are already zeroed (silence)
  return buffer
}

const ensureLocalModelPath = (model: AnyModel | undefined): string => {
  if (!model) {
    throw new Error("Local model not found. Please download it again.")
  }

  if (model.provider === "local-imported") {
    return (model as ImportedLocalModel).localPath
  }

  if (
    model.provider === "local" &&
    (model as LocalModel).localPath &&
    (model as LocalModel).isDownloaded
  ) {
    return (model as LocalModel).localPath as string
  }

  throw new Error("Selected local model is not downloaded yet.")
}

const assertSupportedModelFormat = (modelPath: string) => {
  const lower = modelPath.toLowerCase()
  if (lower.endsWith(".bin") || lower.endsWith(".ggml") || lower.endsWith(".gguf")) {
    return
  }

  throw new Error(
    `Unsupported model format (${modelPath}). Local inference currently supports Whisper GGML/GGUF binaries (.bin/.ggml/.gguf).`,
  )
}

const runChildProcess = (
  command: string,
  args: string[],
  signal?: AbortSignal,
): Promise<ChildProcessResult> => {
  console.log(`[local-transcriber] Spawning child process: ${command}`)
  console.log(`[local-transcriber] Args:`, args)

  return new Promise((resolve, reject) => {
    if (!fs.existsSync(command)) {
      const err = new Error(`Local inference binary not found at ${command}. Reinstall the app or run \`npm run build-rs\` in development.`)
      reject(err)
      return
    }
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    let didAbort = false

    console.log(`[local-transcriber] Child process spawned with PID: ${child.pid}`)

    const abortHandler = () => {
      if (didAbort) return
      didAbort = true
      console.log(`[local-transcriber] Aborting child process ${child.pid}`)
      const abortError = new Error("Transcription aborted")
      abortError.name = "AbortError"
      child.kill()
      reject(abortError)
    }

    if (signal) {
      if (signal.aborted) {
        abortHandler()
        return
      }
      signal.addEventListener("abort", abortHandler, { once: true })
    }

    child.stdout.on("data", (data) => {
      const chunk = data.toString()
      stdout += chunk
      console.log(`[local-transcriber] [stdout] ${chunk.trim()}`)
    })

    child.stderr.on("data", (data) => {
      const chunk = data.toString()
      stderr += chunk
      console.log(`[local-transcriber] [stderr] ${chunk.trim()}`)
    })

    child.on("close", (code) => {
      console.log(`[local-transcriber] Child process exited with code: ${code}`)

      if (signal) {
        signal.removeEventListener("abort", abortHandler)
      }

      if (didAbort) {
        return
      }

      if (code === 0) {
        console.log(`[local-transcriber] Success! stdout length: ${stdout.length}`)
        resolve({ stdout })
      } else {
        console.error(`[local-transcriber] Process failed with code ${code}`)
        console.error(`[local-transcriber] stderr:`, stderr.trim())
        reject(
          new Error(
            stderr.trim() ||
              `Command ${command} exited with code ${code ?? "unknown"}`,
          ),
        )
      }
    })

    child.on("error", (error) => {
      console.error(`[local-transcriber] Child process error:`, error)
      reject(error)
    })
  })
}

const runLocalInference = async (
  modelPath: string,
  wavPath: string,
  options: { language?: string | null; threads?: number | null },
  signal?: AbortSignal,
) => {
  const payload = JSON.stringify({
    language: options.language ?? "auto",
    threads: options.threads ?? undefined,
  })
  const { stdout } = await runChildProcess(
    LIV_RS_BINARY_PATH,
    ["transcribe", modelPath, wavPath, payload],
    signal,
  )
  return stdout.trim()
}

export const transcribeWithLocalModel = async ({
  audioBuffer,
  modelId,
  language,
  threads,
  signal,
}: LocalTranscriptionOptions) => {
  console.log(`[local-transcriber] Starting transcription with modelId=${modelId}, language=${language}, threads=${threads}`)

  const models = await modelManager.listAllModels()
  console.log(`[local-transcriber] Found ${models.length} total models`)

  const targetModel = models.find(
    (model) =>
      (model.provider === "local" || model.provider === "local-imported") &&
      model.id === modelId,
  )

  if (!targetModel) {
    console.error(`[local-transcriber] Model not found: ${modelId}`)
    console.error(`[local-transcriber] Available models:`, models.map(m => ({ id: m.id, provider: m.provider, name: m.displayName })))
    throw new Error(`Model ${modelId} not found`)
  }

  console.log(`[local-transcriber] Found target model: ${targetModel.displayName} (${targetModel.provider})`)

  const modelPath = ensureLocalModelPath(targetModel)
  console.log(`[local-transcriber] Model path: ${modelPath}`)
  console.log(`[local-transcriber] Model path exists: ${fs.existsSync(modelPath)}`)

  // Check if this is a sherpa model (Parakeet)
  const engine = (targetModel as LocalModel).engine
  if (engine === "sherpa") {
    console.log(`[local-transcriber] Using sherpa-onnx engine for ${targetModel.displayName}`)

    // Align behavior to the VoiceInk implementation:
    // - No normalization for Parakeet (let the model handle levels)
    // - Only run VAD on longer clips (>=20s) with a stricter threshold
    const processedAudio = await audioProcessingService.processAudio(audioBuffer, {
      enableVad: true,
      vadThreshold: 0.7,
      vadMinDurationForProcessing: 20, // Match VoiceInk: only VAD on long audio
      enableNormalization: false,
    })

    return transcribeWithSherpa({
      audioBuffer: processedAudio.wasProcessed ? processedAudio.buffer : audioBuffer,
      modelPath,
      language,
      threads,
      signal,
    })
  }

  // Default to whisper engine
  console.log(`[local-transcriber] Using whisper engine for ${targetModel.displayName}`)

  assertSupportedModelFormat(modelPath)
  console.log(`[local-transcriber] Model format validated`)

  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "liv-local-"),
  )
  const wavPath = path.join(tempDir, "input.wav")
  console.log(`[local-transcriber] Created temp directory: ${tempDir}`)

  try {
    // Process audio with VAD and normalization
    const processedAudio = await audioProcessingService.processAudio(audioBuffer, {
      enableVad: true,
      vadThreshold: 0.01,
      vadMinDurationForProcessing: 5, // Only apply VAD for audio > 5s
      enableNormalization: true,
      targetRms: 0.1,
    })

    const bufferToWrite = processedAudio.wasProcessed ? processedAudio.buffer : audioBuffer
    await fs.promises.writeFile(wavPath, bufferToWrite)
    console.log(`[local-transcriber] Wrote ${bufferToWrite.length} bytes to ${wavPath}`)

    // Debug audio copy is only enabled with explicit DEBUG_AUDIO=1 environment variable
    if (process.env.DEBUG_AUDIO === "1") {
      try {
        const debugPath = path.join(require('os').homedir(), 'Desktop', `debug-audio-${Date.now()}.wav`)
        await fs.promises.copyFile(wavPath, debugPath)
        console.log(`[local-transcriber] DEBUG: Audio saved to ${debugPath} for inspection`)
      } catch (debugError) {
        console.warn(`[local-transcriber] Failed to save debug audio:`, debugError)
      }
    }

    console.log(`[local-transcriber] Starting inference with liv-rs...`)
    const startTime = Date.now()

    const transcript = await runLocalInference(
      modelPath,
      wavPath,
      { language, threads },
      signal,
    )

    const duration = Date.now() - startTime
    console.log(`[local-transcriber] Inference completed in ${duration}ms`)
    console.log(`[local-transcriber] Transcript length: ${transcript.length} chars`)
    console.log(`[local-transcriber] Transcript preview: "${transcript.slice(0, 100)}${transcript.length > 100 ? '...' : ''}"`)

    return transcript
  } catch (error) {
    console.error(`[local-transcriber] Error during transcription:`, error)
    throw error
  } finally {
    console.log(`[local-transcriber] Cleaning up temp directory: ${tempDir}`)
    fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

export const warmupParakeetModel = async (modelId: string, threads?: number | null) => {
  try {
    const models = await modelManager.listAllModels()
    const targetModel = models.find(
      (model) =>
        (model.provider === "local" || model.provider === "local-imported") &&
        model.id === modelId,
    ) as LocalModel | undefined

    if (!targetModel || targetModel.engine !== "sherpa") {
      return
    }

    const modelPath = ensureLocalModelPath(targetModel)
    if (!fs.existsSync(modelPath)) {
      console.warn(`[local-transcriber] Warmup skipped, model not on disk: ${modelPath}`)
      return
    }

    console.log(`[local-transcriber] Warmup: preloading Parakeet recognizer for ${targetModel.displayName}`)
    const silentWav = createSilentWav(0.3) // ~300ms of silence to trigger recognizer creation

    await transcribeWithSherpa({
      audioBuffer: silentWav,
      modelPath,
      threads,
      signal: undefined,
    })

    console.log("[local-transcriber] Warmup complete")
  } catch (error) {
    console.warn("[local-transcriber] Warmup failed (non-fatal):", error)
  }
}
