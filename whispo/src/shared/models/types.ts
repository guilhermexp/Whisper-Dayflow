export type ModelProvider =
  | "local"
  | "local-imported"
  | "openai"
  | "groq"
  | "gemini"
  | "openrouter"
  | "deepgram"
  | "custom"

export interface BaseModel {
  id: string
  name: string
  displayName: string
  description: string
  language: "english" | "multilingual"
  provider: ModelProvider
}

export interface LocalModel extends BaseModel {
  provider: "local"
  size: string
  sizeBytes: number
  speed: number
  accuracy: number
  ramUsage: number
  downloadURL: string
  filename: string
  isDownloaded: boolean
  localPath?: string
  checksum?: string
}

export interface CloudModel extends BaseModel {
  provider: Exclude<ModelProvider, "local" | "local-imported">
  requiresApiKey: boolean
  endpoint: string
  modelIdentifier: string
}

export interface CustomModel extends CloudModel {
  provider: "custom"
  isMultilingual: boolean
  userCreated: boolean
  createdAt: number
}

export interface ImportedLocalModel extends BaseModel {
  provider: "local-imported"
  localPath: string
  importedAt: number
  originalFilename: string
}

export type AnyModel =
  | LocalModel
  | CloudModel
  | CustomModel
  | ImportedLocalModel

export interface DownloadProgress {
  modelId: string
  progress: number
  downloadedBytes: number
  totalBytes: number
  speed: number
  eta: number
  status: "downloading" | "paused" | "verifying" | "complete" | "error"
  error?: string
}

export interface ModelCatalog {
  models: AnyModel[]
  lastUpdated: number
  version: string
}
