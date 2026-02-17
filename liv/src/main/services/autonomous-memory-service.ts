import fs from "fs"
import path from "path"
import crypto from "crypto"
import { createRequire } from "module"
import { configStore, recordingsFolder } from "../config"
import { getKey } from "../pile-utils/store"
import settings from "electron-settings"
import { logger } from "../logger"

const AUTO_AGENT_DIR = path.join(recordingsFolder, "auto-agent")
const MEMORY_FILE = path.join(AUTO_AGENT_DIR, "MEMORY.md")
const DAILY_MEMORY_DIR = path.join(AUTO_AGENT_DIR, "memory")
const DB_FILE = path.join(AUTO_AGENT_DIR, "memory_index.db")

type MemoryChunk = {
  id: number
  filePath: string
  lineStart: number
  lineEnd: number
  content: string
  tokens: number
}

export type MemorySearchResult = {
  id: number
  filePath: string
  lineStart: number
  lineEnd: number
  content: string
  score: number
  lexicalScore: number
  semanticScore: number
}

const CHUNK_TOKENS = 400
const CHUNK_OVERLAP_TOKENS = 80
const VECTOR_WEIGHT = 0.7
const KEYWORD_WEIGHT = 0.3

const require = createRequire(import.meta.url)

let sqlite3Module: any = null
const loadSqlite3 = () => {
  if (sqlite3Module) return sqlite3Module

  const candidates = [
    "sqlite3",
    path.join(process.resourcesPath || "", "app.asar.unpacked", "node_modules", "sqlite3"),
    path.join(process.resourcesPath || "", "node_modules", "sqlite3"),
  ]

  for (const candidate of candidates) {
    try {
      sqlite3Module = require(candidate)
      return sqlite3Module
    } catch {
      continue
    }
  }

  throw new Error(
    "sqlite3 module not found. Checked default and packaged fallback paths.",
  )
}

let db: any = null
let initialized = false
let syncInterval: NodeJS.Timeout | null = null

const estimateTokens = (text: string) => Math.max(1, Math.ceil(text.length / 4))

const sha1 = (value: string) => crypto.createHash("sha1").update(value).digest("hex")

const run = (sql: string, params: Array<string | number | null> = []) =>
  new Promise<void>((resolve, reject) => {
    if (!db) {
      reject(new Error("memory db not initialized"))
      return
    }
    db.run(sql, params, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })

const all = <T>(sql: string, params: Array<string | number> = []) =>
  new Promise<T[]>((resolve, reject) => {
    if (!db) {
      reject(new Error("memory db not initialized"))
      return
    }
    db.all(sql, params, (error, rows: T[]) => {
      if (error) reject(error)
      else resolve(rows)
    })
  })

const get = <T>(sql: string, params: Array<string | number> = []) =>
  new Promise<T | undefined>((resolve, reject) => {
    if (!db) {
      reject(new Error("memory db not initialized"))
      return
    }
    db.get(sql, params, (error, row: T) => {
      if (error) reject(error)
      else resolve(row)
    })
  })

const formatDate = (d = new Date()) => d.toISOString().slice(0, 10)

const buildDailyFile = (d = new Date()) => path.join(DAILY_MEMORY_DIR, `${formatDate(d)}.md`)

const ensureFiles = () => {
  fs.mkdirSync(AUTO_AGENT_DIR, { recursive: true })
  fs.mkdirSync(DAILY_MEMORY_DIR, { recursive: true })
  if (!fs.existsSync(MEMORY_FILE)) {
    fs.writeFileSync(
      MEMORY_FILE,
      [
        "# Long-term Memory",
        "",
        "## Durable Decisions",
        "",
        "## User Preferences",
        "",
        "## Stable Patterns",
        "",
      ].join("\n"),
      "utf8",
    )
  }
  const daily = buildDailyFile()
  if (!fs.existsSync(daily)) {
    fs.writeFileSync(daily, `# ${formatDate()}\n`, "utf8")
  }
}

const splitIntoChunks = (content: string) => {
  const lines = content.split("\n")
  const chunks: Array<{ content: string; lineStart: number; lineEnd: number; tokens: number }> = []

  let currentLines: string[] = []
  let currentTokens = 0
  let lineStart = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineTokens = estimateTokens(line)

    if (currentLines.length > 0 && currentTokens + lineTokens > CHUNK_TOKENS) {
      chunks.push({
        content: currentLines.join("\n"),
        lineStart,
        lineEnd: i - 1,
        tokens: currentTokens,
      })

      const overlapLines: string[] = []
      let overlapTokens = 0
      for (let j = currentLines.length - 1; j >= 0; j--) {
        overlapLines.unshift(currentLines[j])
        overlapTokens += estimateTokens(currentLines[j])
        if (overlapTokens >= CHUNK_OVERLAP_TOKENS) break
      }

      currentLines = [...overlapLines, line]
      currentTokens = overlapTokens + lineTokens
      lineStart = Math.max(0, i - overlapLines.length)
    } else {
      currentLines.push(line)
      currentTokens += lineTokens
    }
  }

  if (currentLines.length > 0) {
    chunks.push({
      content: currentLines.join("\n"),
      lineStart,
      lineEnd: lines.length - 1,
      tokens: currentTokens,
    })
  }

  return chunks.filter((chunk) => chunk.content.trim().length > 0)
}

const getEmbeddingApiKey = async () => {
  const cfg = configStore.get()
  if (cfg.openaiApiKey) return cfg.openaiApiKey
  const key = await getKey()
  return key
}

const generateEmbedding = async (text: string): Promise<number[] | null> => {
  try {
    const ragEmbeddingProvider = (await settings.get("ragEmbeddingProvider")) as string | undefined
    const forceLocalRagEmbeddings = (await settings.get("forceLocalRagEmbeddings")) as boolean | undefined
    const embeddingModel = (await settings.get("embeddingModel")) as string | undefined
    const ollamaBaseUrl = (await settings.get("ollamaBaseUrl")) as string | undefined

    if (forceLocalRagEmbeddings !== false && (!ragEmbeddingProvider || ragEmbeddingProvider === "ollama")) {
      try {
        const normalizedBaseUrl =
          typeof ollamaBaseUrl === "string" && ollamaBaseUrl.trim().length > 0
            ? ollamaBaseUrl.replace(/\/+$/, "")
            : "http://localhost:11434"

        const response = await fetch(`${normalizedBaseUrl}/api/embed`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: embeddingModel || "qwen3-embedding:0.6b",
            input: text.slice(0, 8000),
          }),
        })

        if (response.ok) {
          const data = await response.json()
          const embedding = data?.embeddings?.[0]
          if (Array.isArray(embedding)) return embedding
        }
      } catch {
        // Fallback to OpenAI-compatible embeddings below.
      }
    }

    const apiKey = await getEmbeddingApiKey()
    if (!apiKey) return null

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text.slice(0, 8000),
      }),
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    const embedding = data?.data?.[0]?.embedding
    return Array.isArray(embedding) ? embedding : null
  } catch {
    return null
  }
}

const getCachedEmbedding = async (hash: string): Promise<number[] | null> => {
  const row = await get<{ embedding: string }>(
    `SELECT embedding FROM embedding_cache WHERE hash = ? LIMIT 1`,
    [hash],
  )

  if (!row?.embedding) return null
  try {
    const parsed = JSON.parse(row.embedding)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

const putCachedEmbedding = async (hash: string, embedding: number[]) => {
  await run(
    `INSERT INTO embedding_cache (hash, embedding, provider, model, dimensions, updated_at)
     VALUES (?, ?, 'openai', 'text-embedding-3-small', ?, CURRENT_TIMESTAMP)
     ON CONFLICT(hash) DO UPDATE SET
       embedding = excluded.embedding,
       provider = excluded.provider,
       model = excluded.model,
       dimensions = excluded.dimensions,
       updated_at = CURRENT_TIMESTAMP`,
    [hash, JSON.stringify(embedding), embedding.length],
  )
}

const syncFile = async (filePath: string) => {
  if (!fs.existsSync(filePath)) return

  const content = fs.readFileSync(filePath, "utf8")
  const relPath = path.relative(AUTO_AGENT_DIR, filePath)
  const chunks = splitIntoChunks(content)

  await run(`DELETE FROM memory_fts WHERE chunk_id IN (SELECT id FROM memory_chunks WHERE file_path = ?)`, [relPath])
  await run(`DELETE FROM memory_chunks WHERE file_path = ?`, [relPath])

  for (const chunk of chunks) {
    const hash = sha1(`${relPath}:${chunk.lineStart}:${chunk.lineEnd}:${chunk.content}`)
    let embedding = await getCachedEmbedding(hash)
    if (!embedding) {
      embedding = await generateEmbedding(chunk.content)
      if (embedding) {
        await putCachedEmbedding(hash, embedding)
      }
    }

    await run(
      `INSERT INTO memory_chunks (file_path, line_start, line_end, content, tokens, content_hash, embedding)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        relPath,
        chunk.lineStart,
        chunk.lineEnd,
        chunk.content,
        chunk.tokens,
        hash,
        embedding ? JSON.stringify(embedding) : null,
      ],
    )

    const row = await get<{ id: number }>(`SELECT id FROM memory_chunks WHERE content_hash = ? LIMIT 1`, [hash])
    if (row?.id) {
      await run(`INSERT INTO memory_fts (content, file_path, chunk_id) VALUES (?, ?, ?)`, [
        chunk.content,
        relPath,
        row.id,
      ])
    }
  }
}

const syncAllMemoryFiles = async () => {
  await syncFile(MEMORY_FILE)

  const dailyFiles = fs
    .readdirSync(DAILY_MEMORY_DIR)
    .filter((name) => name.endsWith(".md"))
    .map((name) => path.join(DAILY_MEMORY_DIR, name))

  for (const file of dailyFiles) {
    await syncFile(file)
  }
}

const cosineSimilarity = (a: number[], b: number[]) => {
  if (!a.length || a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const den = Math.sqrt(normA) * Math.sqrt(normB)
  if (!den) return 0
  return dot / den
}

const escapeFtsQuery = (query: string) =>
  query
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}_-]/gu, ""))
    .filter(Boolean)
    .map((token) => `${token}*`)
    .join(" OR ")

export async function initializeAutonomousMemory() {
  if (initialized) return

  ensureFiles()

  const sqlite3 = loadSqlite3()
  db = new sqlite3.Database(DB_FILE)

  try {
    await run(`
      CREATE TABLE IF NOT EXISTS memory_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        line_start INTEGER NOT NULL,
        line_end INTEGER NOT NULL,
        content TEXT NOT NULL,
        tokens INTEGER DEFAULT 0,
        content_hash TEXT NOT NULL UNIQUE,
        embedding TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts
      USING fts5(content, file_path UNINDEXED, chunk_id UNINDEXED)
    `)

    await run(`
      CREATE TABLE IF NOT EXISTS embedding_cache (
        hash TEXT PRIMARY KEY,
        embedding TEXT NOT NULL,
        provider TEXT,
        model TEXT,
        dimensions INTEGER,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await run(`
      CREATE TABLE IF NOT EXISTS index_metadata (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await syncAllMemoryFiles()

    if (!syncInterval) {
      syncInterval = setInterval(() => {
        syncAllMemoryFiles().catch((error) => {
          logger.error("[autonomous-memory] periodic sync failed", error)
        })
      }, 5 * 60 * 1000)
    }

    initialized = true
  } catch (error) {
    logger.error("[autonomous-memory] initialization failed", error)
    throw error
  }
}

export function shutdownAutonomousMemory() {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
  if (db) {
    try {
      db.close()
    } catch {
      // ignore close errors during shutdown
    }
    db = null
  }
  initialized = false
}

export const getAutonomousMemoryPaths = () => ({
  rootDir: AUTO_AGENT_DIR,
  memoryFile: MEMORY_FILE,
  dailyDir: DAILY_MEMORY_DIR,
  dbFile: DB_FILE,
})

export async function writeAutonomousMemory(content: string, options?: {
  persistent?: boolean
  section?: string
}) {
  await initializeAutonomousMemory()

  const normalized = content.trim()
  if (!normalized) return

  if (options?.persistent) {
    const section = options.section?.trim()
    const payload = section ? `\n## ${section}\n${normalized}\n` : `\n${normalized}\n`
    fs.appendFileSync(MEMORY_FILE, payload, "utf8")
    await syncFile(MEMORY_FILE)
    return
  }

  const now = new Date()
  const dailyFile = buildDailyFile(now)
  if (!fs.existsSync(dailyFile)) {
    fs.writeFileSync(dailyFile, `# ${formatDate(now)}\n`, "utf8")
  }

  const stamp = now.toTimeString().slice(0, 5)
  fs.appendFileSync(dailyFile, `\n## ${stamp}\n${normalized}\n`, "utf8")
  await syncFile(dailyFile)
}

export async function searchAutonomousMemory(query: string, maxResults = 6): Promise<MemorySearchResult[]> {
  await initializeAutonomousMemory()

  const trimmed = query.trim()
  if (!trimmed) return []

  const lexicalQuery = escapeFtsQuery(trimmed)
  const lexicalRows = lexicalQuery
    ? await all<{ chunk_id: number; rank: number }>(
        `SELECT chunk_id, bm25(memory_fts) as rank
         FROM memory_fts
         WHERE memory_fts MATCH ?
         ORDER BY rank
         LIMIT ?`,
        [lexicalQuery, Math.max(maxResults * 4, 12)],
      )
    : []

  const lexicalMap = new Map<number, number>()
  for (const row of lexicalRows) {
    const normalizedRank = 1 / (1 + Math.abs(row.rank))
    lexicalMap.set(row.chunk_id, normalizedRank)
  }

  let semanticMap = new Map<number, number>()
  const queryEmbedding = await generateEmbedding(trimmed)
  if (queryEmbedding) {
    const embedded = await all<{ id: number; embedding: string }>(
      `SELECT id, embedding FROM memory_chunks WHERE embedding IS NOT NULL LIMIT 2000`,
    )

    const temp = new Map<number, number>()
    for (const item of embedded) {
      try {
        const emb = JSON.parse(item.embedding) as number[]
        if (!Array.isArray(emb)) continue
        const score = cosineSimilarity(emb, queryEmbedding)
        temp.set(item.id, Math.max(0, (score + 1) / 2))
      } catch {
        continue
      }
    }

    semanticMap = temp
  }

  const candidateIds = new Set<number>([
    ...Array.from(lexicalMap.keys()),
    ...Array.from(semanticMap.keys()),
  ])

  if (candidateIds.size === 0) return []

  const idsSql = Array.from(candidateIds).map(() => "?").join(",")
  const chunks = await all<MemoryChunk>(
    `SELECT id, file_path as filePath, line_start as lineStart, line_end as lineEnd, content, tokens
     FROM memory_chunks WHERE id IN (${idsSql})`,
    Array.from(candidateIds),
  )

  const merged = chunks
    .map((chunk) => {
      const lexicalScore = lexicalMap.get(chunk.id) ?? 0
      const semanticScore = semanticMap.get(chunk.id) ?? 0
      const score = semanticScore * VECTOR_WEIGHT + lexicalScore * KEYWORD_WEIGHT
      return {
        ...chunk,
        score,
        lexicalScore,
        semanticScore,
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)

  return merged
}

export async function getRecentAutonomousContext(maxItems = 6) {
  await initializeAutonomousMemory()

  const rows = await all<{
    id: number
    filePath: string
    lineStart: number
    lineEnd: number
    content: string
  }>(
    `SELECT id, file_path as filePath, line_start as lineStart, line_end as lineEnd, content
     FROM memory_chunks
     ORDER BY id DESC
     LIMIT ?`,
    [maxItems],
  )

  return rows
}

export async function buildAutonomousPromptContext(query: string, maxResults = 4) {
  await initializeAutonomousMemory()

  const [semanticHits, recent] = await Promise.all([
    searchAutonomousMemory(query, maxResults),
    getRecentAutonomousContext(maxResults),
  ])

  const memorySection = semanticHits
    .map(
      (item) =>
        `- (${item.filePath}:${item.lineStart + 1}-${item.lineEnd + 1}) score=${item.score.toFixed(2)}\n${item.content}`,
    )
    .join("\n\n")

  const recentSection = recent
    .map((item) => `- (${item.filePath}:${item.lineStart + 1}-${item.lineEnd + 1})\n${item.content}`)
    .join("\n\n")

  return {
    memorySection,
    recentSection,
  }
}
