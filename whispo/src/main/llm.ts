import { GoogleGenerativeAI } from "@google/generative-ai"
import { configStore } from "./config"
import { enhancementService } from "./services/enhancement-service"
import type { AutoJournalSummary, RecordingHistoryItem } from "../shared/types"

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
            ? config.openrouterModel || "openai/gpt-4o-mini"
            : config.enhancementProvider === "openai"
              ? config.openaiModel || "gpt-4o-mini"
              : config.enhancementProvider === "groq"
                ? config.groqModel || "llama-3.1-70b-versatile"
                : config.enhancementProvider === "gemini"
                  ? config.geminiModel || "gemini-1.5-flash-002"
                  : config.customEnhancementModel || "gpt-4o-mini",
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
    if (!config.geminiApiKey) throw new Error("Gemini API key is required")

    const gai = new GoogleGenerativeAI(config.geminiApiKey)
    const gModel = gai.getGenerativeModel({
      model: config.geminiModel || "gemini-1.5-flash-002",
    })

    ensureNotAborted()
    const result = await gModel.generateContent([prompt], {
      baseUrl: config.geminiBaseUrl,
    })
    return result.response.text().trim()
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
      summary: "No recordings found in the selected time window.",
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
    // Include epoch timestamps so LLM can use them directly
    return `[${start} - ${end}] (${startTs} - ${endTs}): ${transcript}`
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
  const titleGuidelines = config.autoJournalTitlePromptEnabled && config.autoJournalTitlePrompt?.trim()
    ? `## TITLE GUIDELINES\n${config.autoJournalTitlePrompt.trim()}`
    : defaultTitleGuidelines

  const summaryGuidelines = config.autoJournalSummaryPromptEnabled && config.autoJournalSummaryPrompt?.trim()
    ? `## SUMMARY GUIDELINES\n${config.autoJournalSummaryPrompt.trim()}`
    : defaultSummaryGuidelines

  const userPrompt =
    options.promptOverride?.trim() || config.autoJournalPrompt?.trim() || ""
  const basePrompt = `
You are analyzing a user's voice transcriptions to create a structured activity timeline.
Your job is to synthesize these transcripts into meaningful activity blocks.

**IMPORTANT: Generate ALL content (titles, summaries, descriptions) in PORTUGUESE (Brazilian Portuguese).**

## GOLDEN RULE: Aim for 1-3 activity blocks per time window (fewer is better)

Group by PURPOSE, not by tool. "Pesquisando projeto em múltiplas fontes" = ONE block, not many.

## OUTPUT FORMAT
Return ONLY a JSON object with this exact shape:
{
  "summary": "2-3 sentence overview of the entire period",
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

  // Use the same provider configuration as enhancement, since this is
  // conceptually another "meta" AI feature on top of transcripts.
  const provider = config.enhancementProvider ?? "openai"
  let debugModel = "unknown"
  const debugProvider = provider

  const callWithGemini = async (): Promise<string> => {
    if (!config.geminiApiKey) {
      throw new Error(
        "Gemini API key is required for auto-journal when provider=gemini",
      )
    }

    const gai = new GoogleGenerativeAI(config.geminiApiKey)
    const modelId = config.geminiModel || "gemini-1.5-flash-002"
    debugModel = modelId
    const gModel = gai.getGenerativeModel({ model: modelId })

    ensureNotAborted()
    const result = await gModel.generateContent([finalPrompt], {
      baseUrl: config.geminiBaseUrl,
    })
    return result.response.text()
  }

  const callWithOpenAICompatible = async (): Promise<string> => {
    const apiKey =
      provider === "custom"
        ? config.customEnhancementApiKey
        : provider === "openrouter"
          ? config.openrouterApiKey
          : provider === "groq"
            ? config.groqApiKey
            : config.openaiApiKey

    const baseUrl =
      provider === "custom"
        ? config.customEnhancementBaseUrl || "https://api.example.com/v1"
        : provider === "openrouter"
          ? config.openrouterBaseUrl || "https://openrouter.ai/api/v1"
          : provider === "groq"
            ? config.groqBaseUrl || "https://api.groq.com/openai/v1"
            : config.openaiBaseUrl || "https://api.openai.com/v1"

    if (!apiKey) {
      throw new Error(
        `${provider === "custom" ? "Custom provider" : provider} API key is required for auto-journal`,
      )
    }

    const model =
      provider === "custom"
        ? config.customEnhancementModel || "gpt-4o-mini"
        : provider === "openrouter"
          ? config.openrouterModel || "openai/gpt-4o-mini"
          : provider === "groq"
            ? config.groqModel || "llama-3.1-70b-versatile"
            : config.openaiModel || "gpt-4o-mini"
    debugModel = model

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
          max_tokens: 1200,
          messages: [
            {
              role: "user",
              content: finalPrompt,
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

  let raw: string
  if (provider === "gemini") {
    raw = await callWithGemini()
  } else {
    raw = await callWithOpenAICompatible()
  }

  ensureNotAborted()

  // Try to parse the JSON. If parsing fails, throw a clear error so callers
  // can decide how to surface this in the UI.
  let parsed: any
  try {
    const trimmed = raw.trim()
    const jsonStart = trimmed.indexOf("{")
    const jsonEnd = trimmed.lastIndexOf("}")
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      throw new Error("No JSON object found in model response")
    }
    parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1))
  } catch (error) {
    console.error(
      "[auto-journal] Failed to parse model response as JSON:",
      error,
    )
    console.error("[auto-journal] Raw response:", raw.slice(0, 500))
    throw error
  }

  const summary =
    typeof parsed.summary === "string" && parsed.summary.trim().length
      ? parsed.summary.trim()
      : "No summary generated."

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
            typeof a.category === "string" && validCategories.includes(a.category)
              ? a.category
              : undefined,
          detailedSummary: Array.isArray(a.detailedSummary)
            ? a.detailedSummary
                .filter(
                  (d: any) =>
                    typeof d.startTs === "number" &&
                    typeof d.endTs === "number" &&
                    typeof d.description === "string"
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

  return {
    windowStartTs,
    windowEndTs,
    summary,
    activities,
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
