import fs from "fs"
import os from "os"
import path from "path"
import { app } from "electron"
import { createRequire } from "module"
import { execSync } from "child_process"

// Create a CommonJS require function for loading native modules
const require = createRequire(import.meta.url)

// Get the Module class for cache manipulation
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module")

type SherpaTranscriptionOptions = {
  audioBuffer: Buffer
  modelPath: string
  language?: string | null
  threads?: number | null
  signal?: AbortSignal
}

// Lazy load sherpa-onnx-node to avoid issues if not installed
let sherpaOnnx: typeof import("sherpa-onnx-node") | null = null

// Cache for recognizers to avoid expensive re-initialization
// Key is modelPath, value is the recognizer instance
const recognizerCache = new Map<string, { recognizer: any; config: any }>()

// Fix rpath in the native module on macOS (needed because sherpa-onnx uses hardcoded CI paths)
const fixMacOSRpath = (nativeModulePath: string): void => {
  if (process.platform !== "darwin") return

  const nodeFilePath = path.join(nativeModulePath, "sherpa-onnx.node")

  try {
    // Check if rpath already includes the correct path
    const output = execSync(`otool -l "${nodeFilePath}" | grep -A2 LC_RPATH`, { encoding: "utf8" })
    if (output.includes(nativeModulePath)) {
      console.log("[sherpa-transcriber] Rpath already configured correctly")
      return
    }

    // Add the correct rpath
    console.log(`[sherpa-transcriber] Adding rpath to native module: ${nativeModulePath}`)
    execSync(`install_name_tool -add_rpath "${nativeModulePath}" "${nodeFilePath}"`, { encoding: "utf8" })
    console.log("[sherpa-transcriber] Rpath added successfully")
  } catch (error) {
    // Ignore errors - rpath might already exist or other issues
    // The module loading will fail with a clearer error if this doesn't work
    console.warn("[sherpa-transcriber] Could not add rpath (may already exist):", error instanceof Error ? error.message : String(error))
  }
}

const findNativeModulePath = (): string | null => {
  const platform = process.platform
  const arch = process.arch
  const platformArch = platform === "win32" ? `win-${arch}` : `${platform}-${arch}`
  const packageName = `sherpa-onnx-${platformArch}`

  if (app.isPackaged) {
    // Production: use unpacked node_modules
    const nodeModulesPath = path.join(process.resourcesPath, "app.asar.unpacked", "node_modules")
    const nativeModulePath = path.join(nodeModulesPath, packageName)
    if (fs.existsSync(path.join(nativeModulePath, "sherpa-onnx.node"))) {
      return nativeModulePath
    }
  } else {
    // Development: find in pnpm structure
    // Try direct path first (for hoisted or non-pnpm)
    const baseNodeModules = path.join(__dirname, "..", "..", "node_modules")
    const directPath = path.join(baseNodeModules, packageName)

    if (fs.existsSync(directPath)) {
      // Resolve symlink to get real path
      const realPath = fs.realpathSync(directPath)
      if (fs.existsSync(path.join(realPath, "sherpa-onnx.node"))) {
        return realPath
      }
    }

    // Try pnpm .pnpm structure
    const pnpmGlob = path.join(baseNodeModules, ".pnpm", `${packageName}@*`, "node_modules", packageName)
    const pnpmDir = path.join(baseNodeModules, ".pnpm")
    if (fs.existsSync(pnpmDir)) {
      const entries = fs.readdirSync(pnpmDir)
      for (const entry of entries) {
        if (entry.startsWith(`${packageName}@`)) {
          const fullPath = path.join(pnpmDir, entry, "node_modules", packageName)
          if (fs.existsSync(path.join(fullPath, "sherpa-onnx.node"))) {
            return fullPath
          }
        }
      }
    }
  }

  return null
}

const loadSherpaOnnx = async () => {
  if (sherpaOnnx) return sherpaOnnx

  try {
    // Find the native module path
    const nativeModulePath = findNativeModulePath()
    if (!nativeModulePath) {
      throw new Error(`Could not find sherpa-onnx native module for ${process.platform}-${process.arch}`)
    }

    console.log(`[sherpa-transcriber] Found native module at: ${nativeModulePath}`)

    // Fix rpath on macOS before loading
    fixMacOSRpath(nativeModulePath)

    // Set library path for dynamic libraries (fallback, may not work in all cases)
    const platform = process.platform
    if (platform === "darwin") {
      const current = process.env.DYLD_LIBRARY_PATH || ""
      if (!current.includes(nativeModulePath)) {
        process.env.DYLD_LIBRARY_PATH = current ? `${nativeModulePath}:${current}` : nativeModulePath
        console.log(`[sherpa-transcriber] Updated DYLD_LIBRARY_PATH: ${process.env.DYLD_LIBRARY_PATH}`)
      }
    } else if (platform === "linux") {
      const current = process.env.LD_LIBRARY_PATH || ""
      if (!current.includes(nativeModulePath)) {
        process.env.LD_LIBRARY_PATH = current ? `${nativeModulePath}:${current}` : nativeModulePath
        console.log(`[sherpa-transcriber] Updated LD_LIBRARY_PATH: ${process.env.LD_LIBRARY_PATH}`)
      }
    } else if (platform === "win32") {
      const current = process.env.PATH || ""
      if (!current.includes(nativeModulePath)) {
        process.env.PATH = `${nativeModulePath};${current}`
        console.log(`[sherpa-transcriber] Updated PATH with: ${nativeModulePath}`)
      }
    }

    // Load the native .node module directly
    const nodeFilePath = path.join(nativeModulePath, "sherpa-onnx.node")
    console.log(`[sherpa-transcriber] Loading native module: ${nodeFilePath}`)

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nativeAddon = require(nodeFilePath)
    console.log(`[sherpa-transcriber] Native module loaded successfully`)

    // Find sherpa-onnx-node package location
    let sherpaNodePath: string
    if (app.isPackaged) {
      sherpaNodePath = path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "sherpa-onnx-node")
    } else {
      const baseNodeModules = path.join(__dirname, "..", "..", "node_modules")
      const directPath = path.join(baseNodeModules, "sherpa-onnx-node")
      if (fs.existsSync(directPath)) {
        sherpaNodePath = fs.realpathSync(directPath)
      } else {
        // Find in pnpm
        const pnpmDir = path.join(baseNodeModules, ".pnpm")
        const entries = fs.readdirSync(pnpmDir)
        let found = ""
        for (const entry of entries) {
          if (entry.startsWith("sherpa-onnx-node@")) {
            found = path.join(pnpmDir, entry, "node_modules", "sherpa-onnx-node")
            break
          }
        }
        if (!found) {
          throw new Error("Could not find sherpa-onnx-node package")
        }
        sherpaNodePath = found
      }
    }

    console.log(`[sherpa-transcriber] sherpa-onnx-node package at: ${sherpaNodePath}`)

    // Patch the require cache so addon.js returns our pre-loaded native module
    const addonPath = path.join(sherpaNodePath, "addon.js")
    const addonModule = new Module(addonPath)
    addonModule.filename = addonPath
    addonModule.paths = Module._nodeModulePaths(path.dirname(addonPath))
    addonModule.exports = nativeAddon
    addonModule.loaded = true
    Module._cache[addonPath] = addonModule

    // Now require the main sherpa-onnx.js which will use our cached addon
    sherpaOnnx = require(path.join(sherpaNodePath, "sherpa-onnx.js"))
    console.log(`[sherpa-transcriber] sherpa-onnx-node loaded successfully, version: ${sherpaOnnx.version}`)

    return sherpaOnnx
  } catch (error) {
    console.error("[sherpa-transcriber] Failed to load sherpa-onnx-node:", error)
    throw new Error(
      `Failed to load sherpa-onnx-node: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// Parse WAV file header and extract samples
// This bypasses sherpa.readWave which has issues with external buffers
const parseWavFile = (filePath: string): { sampleRate: number; samples: Float32Array } => {
  const buffer = fs.readFileSync(filePath)

  // WAV file format:
  // Bytes 0-3: "RIFF"
  // Bytes 4-7: file size - 8
  // Bytes 8-11: "WAVE"
  // Bytes 12-15: "fmt "
  // Bytes 16-19: format chunk size (usually 16)
  // Bytes 20-21: audio format (1 = PCM)
  // Bytes 22-23: number of channels
  // Bytes 24-27: sample rate
  // Bytes 28-31: byte rate
  // Bytes 32-33: block align
  // Bytes 34-35: bits per sample
  // Then "data" chunk...

  const riff = buffer.toString("ascii", 0, 4)
  const wave = buffer.toString("ascii", 8, 12)

  if (riff !== "RIFF" || wave !== "WAVE") {
    throw new Error("Invalid WAV file format")
  }

  // Find fmt chunk
  let offset = 12
  let sampleRate = 0
  let numChannels = 0
  let bitsPerSample = 0

  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString("ascii", offset, offset + 4)
    const chunkSize = buffer.readUInt32LE(offset + 4)

    if (chunkId === "fmt ") {
      numChannels = buffer.readUInt16LE(offset + 10)
      sampleRate = buffer.readUInt32LE(offset + 12)
      bitsPerSample = buffer.readUInt16LE(offset + 22)
    } else if (chunkId === "data") {
      // Found data chunk
      const dataOffset = offset + 8
      const dataSize = chunkSize

      // Convert to Float32Array
      const bytesPerSample = bitsPerSample / 8
      const numSamples = dataSize / bytesPerSample / numChannels

      const samples = new Float32Array(numSamples)

      if (bitsPerSample === 16) {
        // 16-bit PCM
        for (let i = 0; i < numSamples; i++) {
          // If stereo, average the channels
          let sum = 0
          for (let ch = 0; ch < numChannels; ch++) {
            const sampleOffset = dataOffset + (i * numChannels + ch) * 2
            const sample = buffer.readInt16LE(sampleOffset)
            sum += sample / 32768.0
          }
          samples[i] = sum / numChannels
        }
      } else if (bitsPerSample === 32) {
        // 32-bit float
        for (let i = 0; i < numSamples; i++) {
          let sum = 0
          for (let ch = 0; ch < numChannels; ch++) {
            const sampleOffset = dataOffset + (i * numChannels + ch) * 4
            const sample = buffer.readFloatLE(sampleOffset)
            sum += sample
          }
          samples[i] = sum / numChannels
        }
      } else {
        throw new Error(`Unsupported bits per sample: ${bitsPerSample}`)
      }

      return { sampleRate, samples }
    }

    offset += 8 + chunkSize
    // Align to 2 bytes
    if (chunkSize % 2 !== 0) offset++
  }

  throw new Error("Could not find data chunk in WAV file")
}

const findModelFiles = (modelDir: string) => {
  // Sherpa-onnx Parakeet models have encoder, decoder, joiner, and tokens
  const files = {
    encoder: "",
    decoder: "",
    joiner: "",
    tokens: "",
  }

  const contents = fs.readdirSync(modelDir)

  for (const file of contents) {
    const lower = file.toLowerCase()
    if (lower.includes("encoder") && lower.endsWith(".onnx")) {
      files.encoder = path.join(modelDir, file)
    } else if (lower.includes("decoder") && lower.endsWith(".onnx")) {
      files.decoder = path.join(modelDir, file)
    } else if (lower.includes("joiner") && lower.endsWith(".onnx")) {
      files.joiner = path.join(modelDir, file)
    } else if (lower === "tokens.txt") {
      files.tokens = path.join(modelDir, file)
    }
  }

  return files
}

export const transcribeWithSherpa = async ({
  audioBuffer,
  modelPath,
  threads,
  signal,
}: SherpaTranscriptionOptions): Promise<string> => {
  console.log(`[sherpa-transcriber] Starting transcription with modelPath=${modelPath}`)

  // Check if aborted before starting
  if (signal?.aborted) {
    const error = new Error("Transcription aborted")
    error.name = "AbortError"
    throw error
  }

  const sherpa = await loadSherpaOnnx()

  // Find model files in the directory
  const modelFiles = findModelFiles(modelPath)

  if (!modelFiles.encoder || !modelFiles.decoder || !modelFiles.joiner || !modelFiles.tokens) {
    console.error("[sherpa-transcriber] Missing model files:", modelFiles)
    throw new Error(
      `Incomplete Sherpa model. Missing files in ${modelPath}. ` +
      `Found: encoder=${!!modelFiles.encoder}, decoder=${!!modelFiles.decoder}, ` +
      `joiner=${!!modelFiles.joiner}, tokens=${!!modelFiles.tokens}`
    )
  }

  console.log("[sherpa-transcriber] Model files found:", modelFiles)

  // Write audio buffer to temporary WAV file
  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "voiceflow-sherpa-")
  )
  const wavPath = path.join(tempDir, "input.wav")

  try {
    await fs.promises.writeFile(wavPath, audioBuffer)
    console.log(`[sherpa-transcriber] Wrote ${audioBuffer.length} bytes to ${wavPath}`)

    // Calculate optimal thread count (like VoiceInk: cpuCount - 2, max 8, min 1)
    const cpuCount = os.cpus().length
    const optimalThreads = threads ?? Math.max(1, Math.min(8, cpuCount - 2))

    // Configure the recognizer
    const config = {
      featConfig: {
        sampleRate: 16000,
        featureDim: 80,
      },
      modelConfig: {
        transducer: {
          encoder: modelFiles.encoder,
          decoder: modelFiles.decoder,
          joiner: modelFiles.joiner,
        },
        tokens: modelFiles.tokens,
        numThreads: optimalThreads,
        // CPU provider - CoreML requires converted models which we don't have
        provider: "cpu",
        modelType: "nemo_transducer",
      },
    }

    const startTime = Date.now()

    // Check if we have a cached recognizer for this model
    let recognizer
    const cached = recognizerCache.get(modelPath)
    if (cached) {
      console.log("[sherpa-transcriber] Using cached recognizer")
      recognizer = cached.recognizer
    } else {
      console.log("[sherpa-transcriber] Creating new OfflineRecognizer with config:", {
        ...config,
        modelConfig: {
          ...config.modelConfig,
          transducer: {
            encoder: path.basename(config.modelConfig.transducer.encoder),
            decoder: path.basename(config.modelConfig.transducer.decoder),
            joiner: path.basename(config.modelConfig.transducer.joiner),
          },
          tokens: path.basename(config.modelConfig.tokens),
        },
      })

      recognizer = new sherpa.OfflineRecognizer(config)
      // Cache the recognizer for future use
      recognizerCache.set(modelPath, { recognizer, config })
      console.log("[sherpa-transcriber] Recognizer cached for future use")
    }

    const stream = recognizer.createStream()

    // Read the WAV file using our custom parser to avoid "External buffers are not allowed" error
    // The native sherpa.readWave returns external buffers that can't be used in Electron's context
    const wave = parseWavFile(wavPath)
    console.log(`[sherpa-transcriber] Audio loaded: sampleRate=${wave.sampleRate}, samples=${wave.samples.length}`)

    // Check for abort again before inference
    if (signal?.aborted) {
      const error = new Error("Transcription aborted")
      error.name = "AbortError"
      throw error
    }

    // Process audio
    stream.acceptWaveform({ sampleRate: wave.sampleRate, samples: wave.samples })
    recognizer.decode(stream)

    // Get result
    const result = recognizer.getResult(stream)
    const transcript = result.text?.trim() || ""

    const duration = Date.now() - startTime
    console.log(`[sherpa-transcriber] Inference completed in ${duration}ms`)
    console.log(`[sherpa-transcriber] Transcript length: ${transcript.length} chars`)
    console.log(`[sherpa-transcriber] Transcript preview: "${transcript.slice(0, 100)}${transcript.length > 100 ? "..." : ""}"`)

    return transcript
  } catch (error) {
    console.error(`[sherpa-transcriber] Error during transcription:`, error)
    throw error
  } finally {
    // Cleanup temporary files
    console.log(`[sherpa-transcriber] Cleaning up temp directory: ${tempDir}`)
    fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}
