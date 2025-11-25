import fs from "fs"
import path from "path"
import { spawn } from "child_process"
import {
  AnyModel,
  CustomModel,
  DownloadProgress,
  ImportedLocalModel,
  LocalModel,
  PREDEFINED_LOCAL_MODELS,
} from "@shared/index"
import { dataFolder } from "./config"

type ModelRegistry = {
  importedModels: ImportedLocalModel[]
  customModels: CustomModel[]
}

type CreateCustomModelInput = {
  displayName: string
  description: string
  endpoint: string
  modelIdentifier: string
  language: "english" | "multilingual"
  requiresApiKey: boolean
}

const DEFAULT_REGISTRY: ModelRegistry = {
  importedModels: [],
  customModels: [],
}

const DOWNLOAD_STATUS_COMPLETE: DownloadProgress["status"] = "complete"

const extractTarBz2 = async (archivePath: string, destinationDir: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    console.log(`[model-manager] Extracting ${archivePath} to ${destinationDir}`)

    // Use tar command which works on macOS, Linux, and Windows (with Git Bash/WSL)
    const child = spawn("tar", ["-xjf", archivePath, "-C", destinationDir], {
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stderr = ""
    child.stderr.on("data", (data) => {
      stderr += data.toString()
    })

    child.on("close", (code) => {
      if (code === 0) {
        console.log(`[model-manager] Extraction completed successfully`)
        resolve()
      } else {
        console.error(`[model-manager] Extraction failed with code ${code}: ${stderr}`)
        reject(new Error(`Failed to extract archive: ${stderr || `exit code ${code}`}`))
      }
    })

    child.on("error", (error) => {
      console.error(`[model-manager] Extraction error:`, error)
      reject(error)
    })
  })
}

export class ModelManager {
  private modelsDirectory: string
  private registryPath: string
  private registry: ModelRegistry
  private downloadProgressMap = new Map<string, DownloadProgress>()
  private loggedCatalogModels = new Set<string>()
  private loggedSummary = false

  constructor() {
    this.modelsDirectory = path.join(dataFolder, "models")
    this.registryPath = path.join(this.modelsDirectory, "registry.json")
    this.ensureModelsDirectory()
    this.registry = this.loadRegistry()
    this.pruneMissingImportedModels()
  }

  private ensureModelsDirectory() {
    fs.mkdirSync(this.modelsDirectory, { recursive: true })
  }

  private loadRegistry(): ModelRegistry {
    try {
      const content = fs.readFileSync(this.registryPath, "utf8")
      const parsed = JSON.parse(content) as ModelRegistry
      return {
        importedModels: parsed.importedModels || [],
        customModels: parsed.customModels || [],
      }
    } catch {
      return { ...DEFAULT_REGISTRY }
    }
  }

  private saveRegistry() {
    fs.mkdirSync(this.modelsDirectory, { recursive: true })
    fs.writeFileSync(this.registryPath, JSON.stringify(this.registry, null, 2))
  }

  private pruneMissingImportedModels() {
    const before = this.registry.importedModels.length
    this.registry.importedModels = this.registry.importedModels.filter((model) =>
      fs.existsSync(model.localPath),
    )
    if (before !== this.registry.importedModels.length) {
      this.saveRegistry()
    }
  }

  private getCatalogModels(): LocalModel[] {
    const models = PREDEFINED_LOCAL_MODELS.map((model) => {
      const modelPath = path.join(this.modelsDirectory, model.filename)

      // For sherpa models, check if the directory exists and contains the required files
      let isDownloaded = false
      if (model.engine === "sherpa") {
        const tokensPath = path.join(modelPath, "tokens.txt")
        isDownloaded = fs.existsSync(modelPath) && fs.existsSync(tokensPath)
      } else {
        isDownloaded = fs.existsSync(modelPath)
      }

      if (isDownloaded && !this.loggedCatalogModels.has(model.id)) {
        if (model.engine === "sherpa") {
          console.log(`[model-manager] Found catalog model: ${model.displayName} (${model.id}) [sherpa]`)
          console.log(`[model-manager]   Path: ${modelPath}`)
        } else {
          const stats = fs.statSync(modelPath)
          console.log(`[model-manager] Found catalog model: ${model.displayName} (${model.id})`)
          console.log(`[model-manager]   Path: ${modelPath}`)
          console.log(`[model-manager]   Size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`)
        }
        this.loggedCatalogModels.add(model.id)
      }

      return {
        ...model,
        isDownloaded,
        localPath: isDownloaded ? modelPath : undefined,
      }
    })

    if (!this.loggedSummary) {
      console.log(`[model-manager] Catalog models: ${models.filter(m => m.isDownloaded).length} downloaded, ${models.filter(m => !m.isDownloaded).length} not downloaded`)
      this.loggedSummary = true
    }
    return models
  }

  private loggedImportedSummary = false

  private getImportedModels(): ImportedLocalModel[] {
    this.pruneMissingImportedModels()

    // Filter out incompatible formats like .nemo
    const compatible = this.registry.importedModels.filter((model) => {
      const lower = model.localPath.toLowerCase()
      const isCompatible = lower.endsWith(".bin") || lower.endsWith(".ggml") || lower.endsWith(".gguf")

      if (!isCompatible && !this.loggedImportedSummary) {
        console.warn(`[model-manager] Skipping incompatible imported model: ${model.displayName} (${model.localPath})`)
      }

      return isCompatible
    })

    // Only log once to avoid spam
    if (!this.loggedImportedSummary && (compatible.length > 0 || this.registry.importedModels.length > compatible.length)) {
      console.log(`[model-manager] Imported models: ${compatible.length} compatible, ${this.registry.importedModels.length - compatible.length} incompatible`)
      this.loggedImportedSummary = true
    }
    return compatible
  }

  private getCustomModels(): CustomModel[] {
    return [...this.registry.customModels]
  }

  private resolveDestinationPath(filename: string) {
    const ext = path.extname(filename) || ".bin"
    const base = filename.replace(ext, "")
    let candidate = path.join(this.modelsDirectory, filename)
    let counter = 1
    while (fs.existsSync(candidate)) {
      candidate = path.join(
        this.modelsDirectory,
        `${base}-${counter}${ext}`,
      )
      counter++
    }
    return candidate
  }

  async listAllModels(): Promise<AnyModel[]> {
    const catalog = this.getCatalogModels()
    const imported = this.getImportedModels()
    const custom = this.getCustomModels()
    return [...catalog, ...imported, ...custom]
  }

  async listDownloadedModels(): Promise<LocalModel[]> {
    return this.getCatalogModels().filter((model) => model.isDownloaded)
  }

  getDownloadProgress(modelId: string): DownloadProgress | null {
    return this.downloadProgressMap.get(modelId) || null
  }

  async downloadModel(modelId: string): Promise<void> {
    const model = PREDEFINED_LOCAL_MODELS.find((item) => item.id === modelId)
    if (!model) {
      throw new Error("Model not found in catalog")
    }

    const destinationPath = path.join(this.modelsDirectory, model.filename)
    const isArchive = model.downloadURL.endsWith(".tar.bz2")

    // For sherpa models (directories), check if already extracted
    if (model.engine === "sherpa") {
      const tokensPath = path.join(destinationPath, "tokens.txt")
      if (fs.existsSync(destinationPath) && fs.existsSync(tokensPath)) {
        return
      }
    } else if (fs.existsSync(destinationPath)) {
      return
    }

    const tmpPath = isArchive
      ? path.join(this.modelsDirectory, `${model.filename}.tar.bz2.download`)
      : `${destinationPath}.download`

    const progress: DownloadProgress = {
      modelId,
      progress: 0,
      downloadedBytes: 0,
      totalBytes: model.sizeBytes,
      speed: 0,
      eta: 0,
      status: "downloading",
    }
    this.downloadProgressMap.set(modelId, progress)

    const response = await fetch(model.downloadURL)
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download model: ${response.statusText}`)
    }

    const totalBytes =
      Number(response.headers.get("content-length")) || model.sizeBytes
    const fileStream = fs.createWriteStream(tmpPath)
    const reader = response.body.getReader()
    const startTime = Date.now()

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue

        fileStream.write(Buffer.from(value))
        progress.downloadedBytes += value.length
        progress.totalBytes = totalBytes
        progress.progress = Math.min(
          100,
          (progress.downloadedBytes / totalBytes) * 100,
        )
        const elapsedSeconds = (Date.now() - startTime) / 1000
        progress.speed =
          elapsedSeconds > 0
            ? progress.downloadedBytes / elapsedSeconds
            : progress.downloadedBytes
        const remainingBytes = totalBytes - progress.downloadedBytes
        progress.eta =
          progress.speed > 0 ? remainingBytes / progress.speed : Number.POSITIVE_INFINITY
        this.downloadProgressMap.set(modelId, { ...progress })
      }

      await new Promise<void>((resolve, reject) => {
        fileStream.on("error", reject)
        fileStream.end(() => {
          // Ensure file is fully written before resolving
          fileStream.close(() => resolve())
        })
      })

      if (isArchive) {
        // Extract the tar.bz2 archive
        progress.status = "verifying"
        this.downloadProgressMap.set(modelId, { ...progress })

        // Remove .download suffix to get archive path
        const archivePath = tmpPath.slice(0, -9) // Remove ".download"

        // Verify the download file exists before renaming
        if (!fs.existsSync(tmpPath)) {
          throw new Error(`Download file not found: ${tmpPath}`)
        }

        fs.renameSync(tmpPath, archivePath)

        try {
          await extractTarBz2(archivePath, this.modelsDirectory)
          // Remove the archive after extraction
          fs.unlinkSync(archivePath)
        } catch (extractError) {
          // Cleanup on extraction failure
          if (fs.existsSync(archivePath)) {
            fs.unlinkSync(archivePath)
          }
          throw extractError
        }
      } else {
        fs.renameSync(tmpPath, destinationPath)
      }

      progress.status = DOWNLOAD_STATUS_COMPLETE
      progress.progress = 100
      this.downloadProgressMap.set(modelId, { ...progress })
    } catch (error) {
      progress.status = "error"
      progress.error = (error as Error).message
      this.downloadProgressMap.set(modelId, { ...progress })
      fileStream.destroy()
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath)
      }
      throw error
    }
  }

  async deleteModel(modelId: string): Promise<void> {
    this.downloadProgressMap.delete(modelId)
    const catalogModel = PREDEFINED_LOCAL_MODELS.find(
      (item) => item.id === modelId,
    )
    if (catalogModel) {
      const modelPath = path.join(this.modelsDirectory, catalogModel.filename)
      if (fs.existsSync(modelPath)) {
        // For sherpa models (directories), use recursive delete
        const stat = fs.statSync(modelPath)
        if (stat.isDirectory()) {
          fs.rmSync(modelPath, { recursive: true, force: true })
        } else {
          fs.unlinkSync(modelPath)
        }
      }
      return
    }

    const importedIndex = this.registry.importedModels.findIndex(
      (model) => model.id === modelId,
    )
    if (importedIndex >= 0) {
      const [removed] = this.registry.importedModels.splice(importedIndex, 1)
      if (removed && fs.existsSync(removed.localPath)) {
        fs.unlinkSync(removed.localPath)
      }
      this.saveRegistry()
      return
    }

    const customIndex = this.registry.customModels.findIndex(
      (model) => model.id === modelId,
    )
    if (customIndex >= 0) {
      this.registry.customModels.splice(customIndex, 1)
      this.saveRegistry()
      return
    }
  }

  async importModel(filePath: string): Promise<ImportedLocalModel> {
    console.log(`[model-manager] Importing model from: ${filePath}`)

    if (!fs.existsSync(filePath)) {
      throw new Error("File not found")
    }

    const lower = filePath.toLowerCase()
    const validExtensions = [".bin", ".ggml", ".gguf"]
    const isValid = validExtensions.some(ext => lower.endsWith(ext))

    if (!isValid) {
      console.error(`[model-manager] Invalid file format: ${filePath}`)
      throw new Error(`Invalid file format. Expected .bin, .ggml, or .gguf file (Whisper models only). Got: ${path.extname(filePath)}`)
    }

    console.log(`[model-manager] File format validated: ${path.extname(filePath)}`)

    const originalFilename = path.basename(filePath)
    const destination = this.resolveDestinationPath(originalFilename)
    fs.copyFileSync(filePath, destination)

    const id = `imported-${Date.now()}`
    const storedFilename = path.basename(destination)
    const baseName = path.parse(storedFilename).name
    const displayName = baseName.replace(/[-_]/g, " ")
    const importedModel: ImportedLocalModel = {
      id,
      name: baseName,
      displayName,
      description: "Imported local model",
      language: "multilingual",
      provider: "local-imported",
      localPath: destination,
      importedAt: Date.now(),
      originalFilename,
    }

    this.registry.importedModels.push(importedModel)
    this.saveRegistry()
    return importedModel
  }

  async addCustomModel(input: CreateCustomModelInput): Promise<CustomModel> {
    const customModel: CustomModel = {
      id: `custom-${Date.now()}`,
      name: input.displayName.toLowerCase().replace(/\s+/g, "-"),
      displayName: input.displayName,
      description: input.description,
      language: input.language,
      provider: "custom",
      endpoint: input.endpoint,
      modelIdentifier: input.modelIdentifier,
      requiresApiKey: input.requiresApiKey,
      isMultilingual: input.language === "multilingual",
      userCreated: true,
      createdAt: Date.now(),
    }

    this.registry.customModels.push(customModel)
    this.saveRegistry()
    return customModel
  }
}

export const modelManager = new ModelManager()
