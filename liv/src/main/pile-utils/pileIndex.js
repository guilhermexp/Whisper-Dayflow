import fs from "fs"
import path from "path"
import matter from "gray-matter"
import pileSearchIndex from "./pileSearchIndex"
import pileEmbeddings from "./pileEmbeddings"
import { walk, convertHTMLToPlainText } from "../pile-util"
import { configStore } from "../config"
import { GoogleGenerativeAI } from "@google/generative-ai"

class PileIndex {
  constructor() {
    this.fileName = "index.json"
    this.pilePath = null
    this.index = new Map()
  }

  sortMap(map) {
    let sortedMap = new Map(
      [...map.entries()].sort(
        (a, b) => new Date(b[1].createdAt) - new Date(a[1].createdAt),
      ),
    )

    return sortedMap
  }

  resetIndex() {
    this.index.clear()
  }

  async load(pilePath) {
    if (!pilePath) return

    // a different pile is being loaded
    if (pilePath !== this.pilePath) {
      this.resetIndex()
    }

    this.pilePath = pilePath
    const indexFilePath = path.join(this.pilePath, this.fileName)

    if (fs.existsSync(indexFilePath)) {
      const data = fs.readFileSync(indexFilePath)
      const loadedIndex = new Map(JSON.parse(data))
      const sortedIndex = this.sortMap(loadedIndex)
      this.index = sortedIndex
      // Clean up orphaned entries (files that no longer exist)
      this.cleanupOrphanedEntries()
    } else {
      // init empty index
      this.save()
      // try to recreate index by walking the folder system
      const index = await this.walkAndGenerateIndex(pilePath)
      this.index = index
      this.save()
    }

    pileSearchIndex.initialize(this.pilePath, this.index)
    console.log("📍 SEARCH INDEX LOADED")
    await pileEmbeddings.initialize(this.pilePath, this.index)
    console.log("📍 VECTOR INDEX LOADED")

    // Generate summaries for entries that don't have them (background, non-blocking)
    this.generateMissingSummaries().catch(err => {
      console.error("[pileIndex] Failed to generate missing summaries:", err.message)
    })

    return this.index
  }

  async generateMissingSummaries() {
    const entriesWithoutSummary = []

    for (const [filePath, metadata] of this.index) {
      if (metadata.isReply) continue
      if (metadata.timelineSummary) continue

      entriesWithoutSummary.push(filePath)
    }

    if (entriesWithoutSummary.length === 0) {
      console.log("[pileIndex] All entries have summaries")
      return
    }

    console.log(`[pileIndex] Generating summaries for ${entriesWithoutSummary.length} entries...`)

    // Process in batches to avoid overwhelming the API
    const BATCH_SIZE = 5
    for (let i = 0; i < entriesWithoutSummary.length; i += BATCH_SIZE) {
      const batch = entriesWithoutSummary.slice(i, i + BATCH_SIZE)

      await Promise.all(batch.map(async (filePath) => {
        try {
          const fullPath = path.join(this.pilePath, filePath)
          const fileContent = fs.readFileSync(fullPath, "utf8")
          const { content } = matter(fileContent)
          await this.generateEntrySummary(filePath, content)
        } catch (error) {
          console.error(`[pileIndex] Failed to generate summary for ${filePath}:`, error.message)
        }
      }))

      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < entriesWithoutSummary.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    console.log("[pileIndex] Finished generating missing summaries")
  }

  cleanupOrphanedEntries() {
    let removedCount = 0
    const entriesToRemove = []

    for (const [filePath] of this.index) {
      const fullPath = path.join(this.pilePath, filePath)
      if (!fs.existsSync(fullPath)) {
        entriesToRemove.push(filePath)
      }
    }

    for (const filePath of entriesToRemove) {
      this.index.delete(filePath)
      removedCount++
    }

    if (removedCount > 0) {
      console.log(`🧹 Cleaned up ${removedCount} orphaned entries from index`)
      this.save()
    }
  }

  walkAndGenerateIndex = (pilePath) => {
    return walk(pilePath).then((files) => {
      files.forEach((filePath) => {
        const relativeFilePath = path.relative(pilePath, filePath)
        const fileContent = fs.readFileSync(filePath, "utf8")
        const { data } = matter(fileContent)
        this.index.set(relativeFilePath, data)
      })

      this.index = this.sortMap(this.index)
      return this.index
    })
  }

  search(query) {
    let results = []
    try {
      console.time("search-time")
      const entries = pileSearchIndex.search(query)
      results = entries.map((entry) => {
        const res = { ref: entry.ref, ...this.index.get(entry.ref) }
        return res
      })
      console.timeEnd("search-time")
    } catch (error) {
      console.log("failed to search", error)
    }

    return results
  }

  async vectorSearch(query, topN = 50) {
    let results = []
    try {
      console.time("vector-search-time")
      const entries = await pileEmbeddings.search(query, topN)
      results = entries.map((entry) => {
        // entry is now { entryPath, score }
        const res = {
          ref: entry.entryPath,
          score: entry.score,
          ...this.index.get(entry.entryPath)
        }
        return res
      })
      console.timeEnd("vector-search-time")
    } catch (error) {
      console.log("failed to vector search", error)
    }
    return results
  }

  get() {
    return this.index
  }

  add(relativeFilePath) {
    const filePath = path.join(this.pilePath, relativeFilePath)
    const fileContent = fs.readFileSync(filePath, "utf8")
    const { data, content } = matter(fileContent)
    this.index.set(relativeFilePath, data)
    // add to search and vector index
    pileSearchIndex.initialize(this.pilePath, this.index)
    pileEmbeddings.addDocument(relativeFilePath, data)
    this.save()

    // Generate timeline summary in background (non-blocking)
    if (!data.isReply && !data.timelineSummary) {
      this.generateEntrySummary(relativeFilePath, content).catch(err => {
        console.error("[pileIndex] Failed to generate entry summary:", err.message)
      })
    }

    return this.index
  }

  async generateEntrySummary(relativeFilePath, content) {
    const config = configStore.get()
    const provider = config.enhancementProvider ?? "openai"

    const plainContent = convertHTMLToPlainText(content).slice(0, 500)
    if (!plainContent || plainContent.trim().length < 10) return

    const prompt = `Resuma esta entrada de diário em NO MÁXIMO 8 palavras.
Formato: "Verbo no passado + o que foi feito + contexto"

Exemplos:
- "Corrigiu CSS e UUID no Supermemory"
- "Integrou OpenRouter como provider"
- "Debugou bordas do WebContentsView"

Entrada:
${plainContent}

Responda APENAS com o resumo, sem aspas nem explicações.`

    try {
      let summary

      if (provider === "gemini") {
        if (!config.geminiApiKey) return
        const gai = new GoogleGenerativeAI(config.geminiApiKey)
        const model = gai.getGenerativeModel({
          model: config.geminiModel || "gemini-1.5-flash-002"
        })
        const result = await model.generateContent([prompt], {
          baseUrl: config.geminiBaseUrl,
        })
        summary = result.response.text().trim()
      } else {
        const apiKey = provider === "custom" ? config.customEnhancementApiKey
          : provider === "openrouter" ? config.openrouterApiKey
          : provider === "groq" ? config.groqApiKey
          : config.openaiApiKey

        const baseUrl = provider === "custom" ? (config.customEnhancementBaseUrl || "https://api.example.com/v1")
          : provider === "openrouter" ? (config.openrouterBaseUrl || "https://openrouter.ai/api/v1")
          : provider === "groq" ? (config.groqBaseUrl || "https://api.groq.com/openai/v1")
          : (config.openaiBaseUrl || "https://api.openai.com/v1")

        const model = provider === "custom" ? (config.customEnhancementModel || "gpt-5.2")
          : provider === "openrouter" ? (config.openrouterModel || "openai/gpt-5.2")
          : provider === "groq" ? (config.groqModel || "llama-3.1-70b-versatile")
          : (config.openaiModel || "gpt-5.2")

        if (!apiKey) return

        const fetchResponse = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            temperature: 0.3,
            max_tokens: 50,
            messages: [{ role: "user", content: prompt }],
          }),
        })

        if (!fetchResponse.ok) return

        const data = await fetchResponse.json()
        summary = data.choices[0].message.content.trim()
      }

      if (summary) {
        // Update the entry with the summary
        const filePath = path.join(this.pilePath, relativeFilePath)
        const fileContent = fs.readFileSync(filePath, "utf8")
        const { data: metadata, content: fileBody } = matter(fileContent)

        metadata.timelineSummary = summary
        const newContent = matter.stringify(fileBody, metadata)
        fs.writeFileSync(filePath, newContent)

        // Update index
        this.index.set(relativeFilePath, metadata)
        this.save()
        console.log("[pileIndex] Generated summary for:", relativeFilePath, "->", summary)
      }
    } catch (error) {
      console.error("[pileIndex] Summary generation failed:", error.message)
    }
  }

  getThreadAsText(filePath) {
    try {
      let fullPath = path.join(this.pilePath, filePath)
      let fileContent = fs.readFileSync(fullPath, "utf8")
      let { content, data: metedata } = matter(fileContent)

      content =
        `First entry at ${new Date(metedata.createdAt).toString()}:\n ` +
        convertHTMLToPlainText(content)

      // concat the contents of replies
      const replies = metedata.replies || []
      for (let replyPath of replies) {
        try {
          let replyFullPath = path.join(this.pilePath, replyPath)
          let replyFileContent = fs.readFileSync(replyFullPath, "utf8")
          let { content: replyContent, data: replyMetadata } =
            matter(replyFileContent)
          content += `\n\n Reply at ${new Date(
            replyMetadata.createdAt,
          ).toString()}:\n  ${convertHTMLToPlainText(replyContent)}`
        } catch (error) {
          continue
        }
      }
      return content
    } catch (error) {
      console.log("Failed to get thread as text:", filePath, error.message)
      return null
    }
  }

  // reply's parent needs to be found by checking every non isReply entry and
  // see if it's included in the replies array of the parent
  updateParentOfReply(replyPath) {
    const reply = this.index.get(replyPath)
    if (reply.isReply) {
      for (let [filePath, metadata] of this.index) {
        if (!metadata.isReply) {
          if (metadata.replies.includes(replyPath)) {
            // this is the parent
            metadata.replies = metadata.replies.filter((p) => {
              return p !== replyPath
            })
            metadata.replies.push(filePath)
            this.index.set(filePath, metadata)
            this.save()
          }
        }
      }
    }
  }

  regenerateEmbeddings() {
    pileEmbeddings.regenerateEmbeddings(this.index)
    this.save()
    return
  }

  update(relativeFilePath, data) {
    this.index.set(relativeFilePath, data)
    pileSearchIndex.initialize(this.pilePath, this.index)
    pileEmbeddings.addDocument(relativeFilePath, data)
    this.save()
    return this.index
  }

  remove(relativeFilePath) {
    this.index.delete(relativeFilePath)
    this.save()

    return this.index
  }

  save() {
    if (!this.pilePath) return
    if (!fs.existsSync(this.pilePath)) {
      fs.mkdirSync(this.pilePath, { recursive: true })
    }

    const sortedIndex = this.sortMap(this.index)
    this.index = sortedIndex
    const filePath = path.join(this.pilePath, this.fileName)
    const entries = this.index.entries()

    if (!entries) return

    let strMap = JSON.stringify(Array.from(entries))
    fs.writeFileSync(filePath, strMap)
  }
}

const instance = new PileIndex()
export default instance
