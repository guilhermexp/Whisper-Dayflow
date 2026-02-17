import { logger } from "../logger"

type OllamaTag = {
  name: string
  size?: number
  modified_at?: string
  details?: {
    parameter_size?: string
    quantization_level?: string
  }
}

type OllamaTagsResponse = {
  models?: OllamaTag[]
}

export type OllamaEmbeddingCatalogItem = {
  name: string
  dimensions: number
  sizeLabel: string
  quality: "fast" | "balanced"
  installed: boolean
}

export type OllamaPullProgress = {
  model: string
  status: "idle" | "pulling" | "success" | "error"
  phase?: string
  completed?: number
  total?: number
  percentage?: number
  error?: string
  updatedAt: number
}

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"
export const DEFAULT_RAG_EMBEDDING_MODEL = "qwen3-embedding:0.6b"

const RECOMMENDED_EMBEDDING_MODELS: Array<Omit<OllamaEmbeddingCatalogItem, "installed">> = [
  {
    name: "qwen3-embedding:0.6b",
    dimensions: 1024,
    sizeLabel: "~639 MB",
    quality: "fast",
  },
  {
    name: "qwen3-embedding:4b",
    dimensions: 2560,
    sizeLabel: "~3.1 GB",
    quality: "balanced",
  },
]

const pullProgress = new Map<string, OllamaPullProgress>()

const normalizeBaseUrl = (baseUrl?: string) => {
  const value = (baseUrl || DEFAULT_OLLAMA_BASE_URL).trim()
  return value.replace(/\/+$/, "")
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    throw new Error(`Ollama request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

export async function checkOllamaStatus(baseUrl?: string) {
  const root = normalizeBaseUrl(baseUrl)
  try {
    await fetchJson<OllamaTagsResponse>(`${root}/api/tags`)
    return {
      ok: true,
      baseUrl: root,
    }
  } catch (error: any) {
    return {
      ok: false,
      baseUrl: root,
      error: error?.message || "Failed to connect to Ollama",
    }
  }
}

export async function listOllamaEmbeddingModels(baseUrl?: string): Promise<OllamaEmbeddingCatalogItem[]> {
  const root = normalizeBaseUrl(baseUrl)
  const data = await fetchJson<OllamaTagsResponse>(`${root}/api/tags`)

  const installedSet = new Set(
    (data.models || [])
      .map((m) => m.name)
      .filter((name) => /embed|embedding/i.test(name)),
  )

  return RECOMMENDED_EMBEDDING_MODELS.map((item) => ({
    ...item,
    installed: installedSet.has(item.name),
  }))
}

const updatePullState = (model: string, next: Partial<OllamaPullProgress>) => {
  const prev = pullProgress.get(model)
  const merged: OllamaPullProgress = {
    model,
    status: prev?.status || "idle",
    ...prev,
    ...next,
    updatedAt: Date.now(),
  }
  pullProgress.set(model, merged)
  return merged
}

const parsePullChunk = (model: string, chunk: string) => {
  const lines = chunk.split("\n").map((line) => line.trim()).filter(Boolean)
  for (const line of lines) {
    try {
      const payload = JSON.parse(line)
      const completed = typeof payload.completed === "number" ? payload.completed : undefined
      const total = typeof payload.total === "number" ? payload.total : undefined
      const percentage = completed != null && total ? Math.min(100, Math.round((completed / total) * 100)) : undefined

      updatePullState(model, {
        status: "pulling",
        phase: typeof payload.status === "string" ? payload.status : "pulling",
        completed,
        total,
        percentage,
      })

      if (payload.status === "success") {
        updatePullState(model, {
          status: "success",
          phase: "success",
          percentage: 100,
        })
      }

      if (payload.error) {
        updatePullState(model, {
          status: "error",
          error: String(payload.error),
        })
      }
    } catch {
      // Ignore non-JSON lines from stream
    }
  }
}

export function getOllamaPullProgress(model: string): OllamaPullProgress {
  return (
    pullProgress.get(model) || {
      model,
      status: "idle",
      updatedAt: Date.now(),
    }
  )
}

export async function pullOllamaEmbeddingModel(model: string, baseUrl?: string) {
  const root = normalizeBaseUrl(baseUrl)
  const current = pullProgress.get(model)
  if (current?.status === "pulling") return current

  updatePullState(model, {
    status: "pulling",
    phase: "starting",
    error: undefined,
    percentage: 0,
    completed: 0,
    total: undefined,
  })

  const abortController = new AbortController()
  const pullTimeout = setTimeout(() => abortController.abort(), 10 * 60 * 1000) // 10 min timeout

  let response: Response
  try {
    response = await fetch(`${root}/api/pull`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, stream: true }),
      signal: abortController.signal,
    })
  } catch (error: any) {
    clearTimeout(pullTimeout)
    const message = abortController.signal.aborted
      ? "Ollama pull timed out after 10 minutes"
      : error?.message || "Ollama pull failed"
    updatePullState(model, { status: "error", error: message })
    throw new Error(message)
  }

  if (!response.ok || !response.body) {
    clearTimeout(pullTimeout)
    const message = `Ollama pull failed (${response.status})`
    updatePullState(model, {
      status: "error",
      error: message,
    })
    throw new Error(message)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pendingChunk = ""

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (!value) continue

      pendingChunk += decoder.decode(value, { stream: true })
      const lines = pendingChunk.split("\n")
      pendingChunk = lines.pop() || ""
      parsePullChunk(model, lines.join("\n"))
    }

    if (pendingChunk.trim().length > 0) {
      parsePullChunk(model, pendingChunk)
    }

    clearTimeout(pullTimeout)

    const latest = pullProgress.get(model)
    if (latest?.status !== "success") {
      updatePullState(model, {
        status: "success",
        phase: "success",
        percentage: 100,
      })
    }
  } catch (error: any) {
    clearTimeout(pullTimeout)
    updatePullState(model, {
      status: "error",
      error: error?.message || "Unknown pull error",
    })
    throw error
  }

  return getOllamaPullProgress(model)
}

export async function ensureDefaultOllamaEmbeddingSetup(options?: {
  baseUrl?: string
  model?: string
}) {
  const model = options?.model || DEFAULT_RAG_EMBEDDING_MODEL
  const baseUrl = options?.baseUrl

  const status = await checkOllamaStatus(baseUrl)
  if (!status.ok) {
    return {
      ok: false,
      ensured: false,
      reason: status.error || "ollama_unavailable",
      baseUrl: status.baseUrl,
      model,
    }
  }

  const models = await listOllamaEmbeddingModels(baseUrl)
  const target = models.find((item) => item.name === model)

  if (target?.installed) {
    return {
      ok: true,
      ensured: true,
      alreadyInstalled: true,
      baseUrl: status.baseUrl,
      model,
    }
  }

  await pullOllamaEmbeddingModel(model, baseUrl)
  return {
    ok: true,
    ensured: true,
    alreadyInstalled: false,
    baseUrl: status.baseUrl,
    model,
  }
}
