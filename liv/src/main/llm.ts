import { GoogleGenerativeAI } from "@google/generative-ai"
import { configStore } from "./config"
import { enhancementService } from "./services/enhancement-service"
import { getKey, getOpenrouterKey, getGeminiKey, getGroqKey, getCustomKey } from "./pile-utils/store"
import settings from "electron-settings"
import type { AutoJournalSummary, RecordingHistoryItem } from "../shared/types"
import { logWithContext } from "./logger"

const llmLog = logWithContext("LLM")

const DEFAULT_CHAT_MODEL = "gpt-5.2"
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-5.2"
const DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview"
const FALLBACK_GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"]

const normalizePileProvider = (provider?: string) => {
  const supportedProviders = new Set([
    "openai",
    "openrouter",
    "ollama",
    "gemini",
    "groq",
    "custom",
  ])
  if (provider === "subscription") return "openai"
  if (!provider || !supportedProviders.has(provider)) return "openai"
  return provider
}

const stripMarkdownCodeFences = (text: string) => {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fenceMatch?.[1]) return fenceMatch[1].trim()
  return trimmed
}

const extractFirstJsonObject = (text: string): string | null => {
  const start = text.indexOf("{")
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i += 1) {
    const char = text[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === "{") {
      depth += 1
      continue
    }

    if (char === "}") {
      depth -= 1
      if (depth === 0) {
        return text.slice(start, i + 1)
      }
    }
  }

  return null
}

const tryParseAutoJournalJson = (raw: string): any | null => {
  if (!raw || typeof raw !== "string") return null

  const candidates = [
    raw.trim(),
    stripMarkdownCodeFences(raw),
    stripMarkdownCodeFences(raw)
      .replace(/^json\s*/i, "")
      .trim(),
  ].filter(Boolean)

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed
      }
    } catch {}

    const embedded = extractFirstJsonObject(candidate)
    if (!embedded) continue
    try {
      const parsed = JSON.parse(embedded)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed
      }
    } catch {}
  }

  return null
}

export async function postProcessTranscript(
  transcript: string,
  options: { signal?: AbortSignal; returnMetadata?: boolean } = {},
) {
  const config = configStore.get()

  const ensureNotAborted = () => {
    if (options.signal?.aborted) {
      const error = new Error("Aborted")
      error.name = "AbortError"
      throw error
    }
  }

  ensureNotAborted()

  // NEW: Use enhancement service if enabled
  if (config.enhancementEnabled) {
    console.log("[enhancement] Enhancement ENABLED")
    console.log(
      "[enhancement] Selected prompt ID:",
      config.selectedPromptId || "default",
    )
    console.log(
      "[enhancement] Provider:",
      config.enhancementProvider || "openai",
    )

    try {
      const result = await enhancementService.enhanceTranscript(transcript, {
        signal: options.signal,
      })

      // Log error if enhancement failed but returned original
      if (result.error) {
        console.log(
          "[enhancement] ⚠️  Enhancement failed, using original transcript",
        )
        console.log("[enhancement] Error:", result.error)
        console.log(
          "[enhancement] Processing time:",
          result.processingTime,
          "ms",
        )
        console.log("[enhancement] Provider used:", result.provider || "none")
        console.log("[enhancement] Prompt used:", result.promptId || "none")
      } else {
        console.log("[enhancement] ✅ Enhancement completed successfully")
        console.log(
          "[enhancement] Original length:",
          result.originalText.length,
          "chars",
        )
        console.log(
          "[enhancement] Enhanced length:",
          result.enhancedText.length,
          "chars",
        )
        console.log(
          "[enhancement] Processing time:",
          result.processingTime,
          "ms",
        )
        console.log("[enhancement] Provider used:", result.provider)
        console.log(
          "[enhancement] Model used:",
          config.enhancementProvider === "openrouter"
            ? config.enhancementOpenrouterModel || ""
            : config.enhancementProvider === "openai"
              ? config.enhancementOpenaiModel || "gpt-5-mini"
              : config.enhancementProvider === "groq"
                ? config.enhancementGroqModel || "llama-3.1-70b-versatile"
                : config.enhancementProvider === "gemini"
                  ? config.enhancementGeminiModel || "gemini-1.5-flash"
                  : config.customEnhancementModel || "gpt-5-mini",
        )
        console.log("[enhancement] Prompt used:", result.promptId)
      }

      // Return with metadata if requested
      if (options.returnMetadata) {
        return {
          text: result.enhancedText,
          metadata: {
            originalTranscript: result.originalText,
            enhancementPromptId: result.promptId,
            enhancementProvider: result.provider,
            enhancementProcessingTime: result.processingTime,
            enhancementError: result.error,
          },
        }
      }

      return result.enhancedText
    } catch (error) {
      console.error(
        "[enhancement] ❌ Enhancement service threw exception:",
        error,
      )
      // Fallback to original transcript on error
      if (options.returnMetadata) {
        return { text: transcript, metadata: {} }
      }
      return transcript
    }
  } else {
    console.log("[enhancement] Enhancement DISABLED")
  }

  // LEGACY: Use old post-processing if enabled
  if (
    !config.transcriptPostProcessingEnabled ||
    !config.transcriptPostProcessingPrompt
  ) {
    return transcript
  }

  const prompt = config.transcriptPostProcessingPrompt.replace(
    "{transcript}",
    transcript,
  )

  const chatProviderId = config.transcriptPostProcessingProviderId

  if (chatProviderId === "gemini") {
    const geminiApiKey = config.geminiApiKey
    if (!geminiApiKey) throw new Error("Gemini API key is required")

    const gai = new GoogleGenerativeAI(geminiApiKey)
    const modelCandidates = Array.from(
      new Set([config.geminiModel || DEFAULT_GEMINI_MODEL, ...FALLBACK_GEMINI_MODELS]),
    )

    let lastError: unknown = null
    for (const modelCandidate of modelCandidates) {
      try {
        const gModel = gai.getGenerativeModel({ model: modelCandidate })
        ensureNotAborted()
        const result = await gModel.generateContent([prompt], {
          baseUrl: config.geminiBaseUrl,
        })
        return result.response.text().trim()
      } catch (error) {
        llmLog.warn(`[Gemini] Model ${modelCandidate} failed, trying next...`, error)
        lastError = error
      }
    }

    throw lastError || new Error("Gemini request failed")
  }

  ensureNotAborted()
  const chatBaseUrl =
    chatProviderId === "groq"
      ? config.groqBaseUrl || "https://api.groq.com/openai/v1"
      : config.openaiBaseUrl || "https://api.openai.com/v1"

  const chatResponse = await fetch(`${chatBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${chatProviderId === "groq" ? config.groqApiKey : config.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      temperature: 0,
      model:
        chatProviderId === "groq" ? "llama-3.1-70b-versatile" : "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: prompt,
        },
      ],
    }),
    signal: options.signal,
  })

  if (!chatResponse.ok) {
    const message = `${chatResponse.statusText} ${(await chatResponse.text()).slice(0, 300)}`

    throw new Error(message)
  }

  ensureNotAborted()
  const chatJson = await chatResponse.json()
  if (import.meta.env.DEV) {
    console.log(chatJson)
  }

  // Validate API response structure
  if (
    !chatJson.choices ||
    !Array.isArray(chatJson.choices) ||
    chatJson.choices.length === 0
  ) {
    throw new Error("Invalid API response: missing or empty choices array")
  }

  if (
    !chatJson.choices[0].message ||
    typeof chatJson.choices[0].message.content !== "string"
  ) {
    throw new Error("Invalid API response: missing or invalid message content")
  }

  const result = chatJson.choices[0].message.content.trim()
  return result
}

/**
 * Generate an auto-journal style summary of recent recordings.
 *
 * This is the first step of the "Dayflow-style" pipeline:
 * it looks at a sliding time window of RecordingHistoryItem,
 * feeds them to an LLM with a structured prompt, and returns
 * a JSON summary with activity blocks.
 */
export async function generateAutoJournalSummaryFromHistory(
  history: RecordingHistoryItem[],
  options: {
    /**
     * Size of the lookback window in minutes (default: 60).
     * Only recordings whose createdAt fall in [now - window, now] are used.
     */
    windowMinutes?: number
    signal?: AbortSignal
    promptOverride?: string
    pipeline?: "default" | "video"
  } = {},
): Promise<AutoJournalSummary> {
  const config = configStore.get()
  const now = Date.now()
  const windowMinutes = options.windowMinutes ?? 60
  const windowMs = windowMinutes * 60 * 1000
  const windowStartTs = now - windowMs
  const windowEndTs = now

  const ensureNotAborted = () => {
    if (options.signal?.aborted) {
      const error = new Error("Aborted")
      error.name = "AbortError"
      throw error
    }
  }

  ensureNotAborted()

  // Filter recordings in the time window, oldest → newest
  const windowItems = history
    .filter(
      (item) =>
        typeof item.createdAt === "number" &&
        item.createdAt >= windowStartTs &&
        item.createdAt <= windowEndTs &&
        item.transcript &&
        item.transcript.trim().length > 0,
    )
    .sort((a, b) => a.createdAt - b.createdAt)

  if (windowItems.length === 0) {
    return {
      windowStartTs,
      windowEndTs,
      summary: "Nenhuma transcrição encontrada na janela de tempo selecionada.",
      activities: [],
    }
  }

  // Build a compact, human-readable log of the window with timestamps
  const formatClock = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const lines = windowItems.map((item) => {
    const startTs = item.createdAt
    const endTs = item.createdAt + (item.duration || 0)
    const start = formatClock(startTs)
    const end = formatClock(endTs)
    const transcript = item.transcript.replace(/\s+/g, " ").trim()
    const screenText =
      (config.autoJournalIncludeScreenCapture &&
        item.contextScreenText &&
        item.contextScreenText.replace(/\s+/g, " ").trim()) ||
      ""
    const screenApp = item.contextScreenAppName || "window"
    const screenTitle = item.contextScreenWindowTitle || ""
    const screenSnippet = screenText
      ? `SCREEN (${screenApp}${
          screenTitle ? ` – ${screenTitle}` : ""
        }): ${screenText.slice(0, 800)}`
      : ""
    // Include epoch timestamps so LLM can use them directly
    const baseLine = `[${start} - ${end}] (${startTs} - ${endTs}): ${transcript}`
    return screenSnippet ? `${baseLine}\n${screenSnippet}` : baseLine
  })

  const MAX_LOG_CHARS = 8000
  const joinedLog = lines.join("\n")
  const truncated = joinedLog.length > MAX_LOG_CHARS
  const logText = truncated ? joinedLog.slice(0, MAX_LOG_CHARS) : joinedLog

  // Prompt: follows exact Dayflow guidelines for card generation
  // Build prompt dynamically based on user customization settings

  // Default title guidelines
  const defaultTitleGuidelines = `## TITLE GUIDELINES
Write titles like you're texting a friend about what you did. Natural, conversational, direct, specific.

Rules:
- Be specific and clear (not creative or vague)
- Keep it short - aim for 5-10 words
- Don't reference other activities or assume context
- Include specific app/tool/project names, not generic activities
- Use specific verbs: "Debugged Python script" not "Worked on code"

Good examples:
- "Debugando fluxo de autenticação no React"
- "Análise de orçamento no Excel para Q4"
- "Reunião no Zoom com equipe de design"
- "Respondendo emails de clientes"
- "Pesquisa sobre opções de integração de API"

Bad examples:
- "Sessão produtiva da manhã" (muito vago)
- "Trabalhei no projeto" (não específico)
- "Várias tarefas e atividades" (sem sentido)
- "Continuando do anterior" (referencia outros cards)`

  // Default summary guidelines
  const defaultSummaryGuidelines = `## SUMMARY GUIDELINES
Write brief factual summaries optimized for quick scanning. First person perspective without "I".

Critical rules - NEVER:
- Use third person ("The session", "The work", "The user")
- Assume future actions, mental states, or unverifiable details
- Add filler phrases like "kicked off", "dove into", "started with", "began by"
- Write more than 2-3 short sentences
- Repeat the same phrases across summaries

Style guidelines:
- State what happened directly - no lead-ins
- List activities and tools concisely
- Mention major interruptions or context switches briefly
- Keep technical terms simple

Content rules:
- Maximum 2-3 sentences
- Just the facts: what you did, which tools/projects, major blockers
- Include specific names (apps, tools, files) not generic terms
- Note pattern interruptions without elaborating

Good example:
"Refatorou módulo de autenticação no React, adicionou suporte OAuth. Debugou problemas de CORS com API backend por uma hora. Postou pergunta no Stack Overflow quando a correção não funcionou."

Bad examples:
- "Começou a manhã entrando em trabalho de design antes de fazer transição para tarefas de desenvolvimento. A sessão foi bastante produtiva no geral." (Muito vago, frases de preenchimento)
- "Começou refatorando o sistema de autenticação antes de passar a debugar alguns problemas que surgiram. Acabou gastando tempo pesquisando soluções online." (Prolixo, falta especificidade)`

  // Use custom prompts if enabled, otherwise use defaults
  const titleGuidelines =
    config.autoJournalTitlePromptEnabled &&
    config.autoJournalTitlePrompt?.trim()
      ? `## TITLE GUIDELINES\n${config.autoJournalTitlePrompt.trim()}`
      : defaultTitleGuidelines

  const summaryGuidelines =
    config.autoJournalSummaryPromptEnabled &&
    config.autoJournalSummaryPrompt?.trim()
      ? `## SUMMARY GUIDELINES\n${config.autoJournalSummaryPrompt.trim()}`
      : defaultSummaryGuidelines

  const userPrompt =
    options.promptOverride?.trim() || config.autoJournalPrompt?.trim() || ""
  const basePrompt = `
You are analyzing a user's voice transcriptions to create a structured activity timeline.
Your job is to synthesize these transcripts into meaningful activity blocks.

**IMPORTANT: Generate ALL content (titles, summaries, descriptions) in PORTUGUESE (Brazilian Portuguese).**
**NEVER write any sentence in English.**
**If there are no useful transcriptions, return empty activities and a short Portuguese summary saying there was no usable content.**

## GOLDEN RULE: Aim for 1-3 activity blocks per time window (fewer is better)

Group by PURPOSE, not by tool. "Pesquisando projeto em múltiplas fontes" = ONE block, not many.

## OUTPUT FORMAT
Return ONLY a JSON object with this exact shape:
{
  "summary": "2-3 sentence overview of the entire period",
  "highlight": "Highlight" | "Do later" | "New idea" | null,
  "activities": [
    {
      "startTs": 1732042800000,
      "endTs": 1732045500000,
      "title": "5-10 word conversational title",
      "summary": "2-3 factual sentences",
      "category": "Work",
      "detailedSummary": [
        {
          "startTs": 1732042800000,
          "endTs": 1732043100000,
          "description": "Brief description of this moment"
        }
      ]
    }
  ]
}

## HIGHLIGHT DETECTION
Analyze the content and assign ONE highlight type (or null if none apply):
- "Highlight" (orange): Important moments, achievements, breakthroughs, key decisions, memorable events
- "Do later" (green): Tasks mentioned but not completed, follow-ups needed, reminders, things to revisit
- "New idea" (blue): Creative ideas, new concepts, brainstorming, innovative thoughts, suggestions to explore
- null: Regular activities that don't need special attention

${titleGuidelines}

${summaryGuidelines}

## CATEGORY RULES
Use exactly one of: Work, Personal, Distraction, Idle
- Work: productive tasks, projects, meetings, emails
- Personal: personal errands, health, family
- Distraction: unrelated browsing, social media rabbit holes
- Idle: breaks, waiting, no activity

## DETAILED SUMMARY
For each activity, create a granular breakdown using the EXACT timestamps from the input transcriptions.
- Each transcription entry in the input has timestamps in parentheses (startTs - endTs)
- Create one detailedSummary entry per transcription, using those exact epoch timestamps
- The description should summarize what that specific transcription was about (10-20 words)
- This creates a timeline of exactly what happened and when

## TIMING RULES
- startTs and endTs must be UNIX epoch milliseconds
- Window start: ${windowStartTs}
- Window end: ${windowEndTs}
- Activities should cover the observed time without overlapping
- Merge small gaps into nearest meaningful block

## INPUT TRANSCRIPTIONS
${logText}

Return ONLY the JSON object. No markdown, no explanation, no extra text.
`
  const finalPrompt = userPrompt ? `${userPrompt}\n\n${basePrompt}` : basePrompt

  // Use the same provider as the Chat page (reads from electron-settings,
  // where pileAIProvider, model, openrouterModel and baseUrl are stored).
  // This ensures auto-journal uses the same working configuration as Chat.
  const pileAIProvider = (await settings.get("pileAIProvider")) as
    | string
    | undefined
  const defaultProvider = normalizePileProvider(pileAIProvider)
  const provider =
    options.pipeline === "video"
      ? normalizePileProvider(config.autoJournalVideoProvider || "gemini")
      : defaultProvider
  let debugModel = "unknown"
  let debugProvider = provider

  const callWithGemini = async (promptText = finalPrompt): Promise<string> => {
    const geminiApiKey = await getGeminiKey() || config.geminiApiKey
    if (!geminiApiKey) {
      throw new Error(
        "Gemini API key is required for auto-journal when provider=gemini",
      )
    }

    const gai = new GoogleGenerativeAI(geminiApiKey)
    const preferredGeminiModel =
      options.pipeline === "video"
        ? config.autoJournalVideoModel || DEFAULT_GEMINI_MODEL
        : config.geminiModel || DEFAULT_GEMINI_MODEL
    const modelCandidates = Array.from(
      new Set([preferredGeminiModel, ...FALLBACK_GEMINI_MODELS]),
    )

    let lastError: unknown = null
    for (const modelCandidate of modelCandidates) {
      try {
        debugModel = modelCandidate
        const gModel = gai.getGenerativeModel({ model: modelCandidate })
        ensureNotAborted()
        const result = await gModel.generateContent([promptText], {
          baseUrl: config.geminiBaseUrl,
        })
        return result.response.text()
      } catch (error) {
        llmLog.warn(`[Gemini] Model ${modelCandidate} failed, trying next...`, error)
        lastError = error
      }
    }

    throw lastError || new Error("Gemini request failed")
  }

  const callWithOpenAICompatible = async (
    promptText = finalPrompt,
  ): Promise<string> => {
    let effectiveProvider = provider

    // For OpenAI and OpenRouter, use the secure storage keys (same as Chat)
    // For other providers, use config values
    let apiKey: string | null = null
    if (effectiveProvider === "openai") {
      apiKey = await getKey()
      // Fallback: if OpenAI key is missing, use OpenRouter key to avoid hard failure.
      if (!apiKey) {
        const openrouterKey = await getOpenrouterKey()
        if (openrouterKey) {
          console.warn(
            "[auto-journal] OpenAI key missing. Falling back to OpenRouter provider.",
          )
          apiKey = openrouterKey
          effectiveProvider = "openrouter"
        }
      }
    } else if (effectiveProvider === "openrouter") {
      apiKey = await getOpenrouterKey()
    } else if (effectiveProvider === "custom") {
      apiKey = await getCustomKey() || config.customEnhancementApiKey || null
    } else if (effectiveProvider === "groq") {
      apiKey = await getGroqKey() || config.groqApiKey || null
    }

    // Read base URL from electron-settings for openai (same as Chat/AIContext)
    const settingsBaseUrl = (await settings.get("baseUrl")) as
      | string
      | undefined
    const baseUrl =
      effectiveProvider === "custom"
        ? config.customEnhancementBaseUrl || "https://api.example.com/v1"
        : effectiveProvider === "openrouter"
          ? "https://openrouter.ai/api/v1"
          : effectiveProvider === "groq"
            ? config.groqBaseUrl || "https://api.groq.com/openai/v1"
            : settingsBaseUrl || "https://api.openai.com/v1"

    if (!apiKey) {
      throw new Error(
        `${effectiveProvider === "custom" ? "Custom provider" : effectiveProvider} API key is required for auto-journal`,
      )
    }

    // Read model from electron-settings for openai/openrouter (same as Chat/AIContext)
    const settingsModel = (await settings.get("model")) as string | undefined
    const settingsOpenrouterModel = (await settings.get("openrouterModel")) as
      | string
      | undefined
    const videoModel = options.pipeline === "video" ? config.autoJournalVideoModel : undefined
    const defaultModelForProvider =
      effectiveProvider === "custom"
        ? config.customEnhancementModel || DEFAULT_CHAT_MODEL
        : effectiveProvider === "openrouter"
          ? settingsOpenrouterModel || DEFAULT_OPENROUTER_MODEL
          : effectiveProvider === "groq"
            ? config.groqModel || "llama-3.1-70b-versatile"
            : settingsModel || DEFAULT_CHAT_MODEL
    const model = videoModel || defaultModelForProvider
    debugModel = model
    debugProvider = effectiveProvider

    const timeout = config.enhancementTimeout ?? 30000
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const abortHandler = () => controller.abort()
    if (options.signal) {
      options.signal.addEventListener("abort", abortHandler)
    }

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          ...(effectiveProvider === "openai" || effectiveProvider === "groq"
            ? { response_format: { type: "json_object" } }
            : {}),
          // Novos modelos OpenAI (gpt-4o, gpt-4o-mini, gpt-5.1, o1, o3) usam max_completion_tokens
          ...(model.startsWith("gpt-4o") || model.startsWith("gpt-5") || model.startsWith("o1") || model.startsWith("o3")
            ? { max_completion_tokens: 1200 }
            : { max_tokens: 1200 }),
          messages: [
            {
              role: "system",
              content:
                "Return only one valid JSON object with keys summary, highlight, activities. Do not use markdown fences or extra text.",
            },
            {
              role: "user",
              content: promptText,
            },
          ],
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        let errorDetails = ""
        try {
          const data = await response.json()
          errorDetails =
            data.error?.message || data.message || JSON.stringify(data)
        } catch {
          errorDetails = await response.text()
        }

        throw new Error(
          `Auto-journal failed (${response.status}): ${errorDetails.slice(0, 300)}`,
        )
      }

      const data = await response.json()
      if (
        !data.choices ||
        !Array.isArray(data.choices) ||
        data.choices.length === 0 ||
        !data.choices[0].message ||
        typeof data.choices[0].message.content !== "string"
      ) {
        throw new Error(
          "Invalid API response: missing or invalid message content",
        )
      }

      return data.choices[0].message.content as string
    } finally {
      clearTimeout(timeoutId)
      if (options.signal) {
        options.signal.removeEventListener("abort", abortHandler)
      }
    }
  }

  const callWithOllama = async (promptText = finalPrompt): Promise<string> => {
    const ollamaModel =
      (options.pipeline === "video"
        ? config.autoJournalVideoModel
        : undefined) ||
      ((await settings.get("model")) as string | undefined) ||
      "llama3"
    const ollamaBaseUrl =
      ((await settings.get("ollamaBaseUrl")) as string | undefined) ||
      "http://localhost:11434"
    const normalizedBaseUrl = ollamaBaseUrl.replace(/\/+$/, "")
    debugModel = ollamaModel

    ensureNotAborted()
    const response = await fetch(`${normalizedBaseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel,
        messages: [
          {
            role: "system",
            content:
              "Return only one valid JSON object with keys summary, highlight, activities. No markdown.",
          },
          { role: "user", content: promptText },
        ],
        stream: false,
      }),
    })

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status}`)
    }

    const data = await response.json()
    return data.message?.content || ""
  }

  let raw: string
  if (provider === "gemini") {
    raw = await callWithGemini()
  } else if (provider === "ollama") {
    raw = await callWithOllama()
  } else {
    raw = await callWithOpenAICompatible()
  }

  ensureNotAborted()

  // Try to parse the JSON. If parsing fails, throw a clear error so callers
  // can decide how to surface this in the UI.
  let parsed: any | null = tryParseAutoJournalJson(raw)

  if (!parsed) {
    console.warn(
      "[auto-journal] Model returned non-JSON output; retrying with repair prompt",
    )
    console.warn("[auto-journal] Raw response preview:", raw.slice(0, 500))

    const repairPrompt = `
The previous answer was not valid JSON.

Return ONLY one valid JSON object using this exact shape:
{
  "summary": "string",
  "highlight": "Highlight" | "Do later" | "New idea" | null,
  "activities": [
    {
      "startTs": number,
      "endTs": number,
      "title": "string",
      "summary": "string",
      "category": "Work" | "Personal" | "Distraction" | "Idle",
      "detailedSummary": [
        { "startTs": number, "endTs": number, "description": "string" }
      ]
    }
  ]
}

IMPORTANT:
- Generate ALL strings in Portuguese (Brazilian Portuguese).
- NEVER write content in English.
- If there is no useful content, return activities as [].

Window start: ${windowStartTs}
Window end: ${windowEndTs}
Input transcriptions:
${logText}
`

    try {
      const repairedRaw =
        provider === "gemini"
          ? await callWithGemini(repairPrompt)
          : provider === "ollama"
            ? await callWithOllama(repairPrompt)
            : await callWithOpenAICompatible(repairPrompt)

      parsed = tryParseAutoJournalJson(repairedRaw)
      if (!parsed) {
        console.warn(
          "[auto-journal] Repair attempt still returned invalid JSON; using deterministic fallback summary",
        )
      }
    } catch (repairError) {
      console.error(
        "[auto-journal] Repair attempt failed; using deterministic fallback summary:",
        repairError,
      )
    }
  }

  if (!parsed) {
    const fallbackStartTs = windowItems[0]?.createdAt ?? windowStartTs
    const fallbackEndTs =
      (windowItems[windowItems.length - 1]?.createdAt ?? windowEndTs) +
      (windowItems[windowItems.length - 1]?.duration ?? 0)
    const fallbackSummary = `Resumo automático parcial. Foram detectadas ${windowItems.length} gravações no período, mas o modelo não retornou JSON válido.`

    return {
      windowStartTs,
      windowEndTs,
      summary: fallbackSummary,
      highlight: null,
      activities: [
        {
          startTs: fallbackStartTs,
          endTs: Math.max(fallbackStartTs, fallbackEndTs),
          title: "Resumo automático",
          summary: fallbackSummary,
          category: "Work",
          detailedSummary: windowItems.slice(0, 20).map((item) => ({
            startTs: item.createdAt,
            endTs: item.createdAt + (item.duration || 0),
            description: item.transcript
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 160),
          })),
        },
      ],
      debug: {
        provider: debugProvider,
        model: debugModel,
        windowStartTs,
        windowEndTs,
        windowMinutes,
        itemsUsed: windowItems.length,
        truncated,
        logChars: logText.length,
      },
    }
  }

  const validHighlights = ["Highlight", "Do later", "New idea"]

  const summary =
    typeof parsed.summary === "string" && parsed.summary.trim().length
      ? parsed.summary.trim()
      : "Resumo não gerado."

  const validCategories = ["Work", "Personal", "Distraction", "Idle"]

  const activities: AutoJournalSummary["activities"] = Array.isArray(
    parsed.activities,
  )
    ? parsed.activities
        .map((a: any) => ({
          startTs: typeof a.startTs === "number" ? a.startTs : windowStartTs,
          endTs: typeof a.endTs === "number" ? a.endTs : windowEndTs,
          title: typeof a.title === "string" ? a.title : "Untitled activity",
          summary:
            typeof a.summary === "string" ? a.summary : "No summary provided.",
          category:
            typeof a.category === "string" &&
            validCategories.includes(a.category)
              ? a.category
              : undefined,
          detailedSummary: Array.isArray(a.detailedSummary)
            ? a.detailedSummary
                .filter(
                  (d: any) =>
                    typeof d.startTs === "number" &&
                    typeof d.endTs === "number" &&
                    typeof d.description === "string",
                )
                .map((d: any) => ({
                  startTs: d.startTs,
                  endTs: d.endTs,
                  description: d.description,
                }))
            : undefined,
        }))
        .filter(
          (a) =>
            a.startTs >= windowStartTs &&
            a.startTs <= windowEndTs &&
            a.endTs >= a.startTs,
        )
    : []

  const highlight =
    typeof parsed.highlight === "string" &&
    validHighlights.includes(parsed.highlight)
      ? (parsed.highlight as AutoJournalSummary["highlight"])
      : null

  return {
    windowStartTs,
    windowEndTs,
    summary,
    activities,
    highlight,
    debug: {
      provider: debugProvider,
      model: debugModel,
      windowStartTs,
      windowEndTs,
      windowMinutes,
      itemsUsed: windowItems.length,
      truncated,
      logChars: logText.length,
    },
  }
}
