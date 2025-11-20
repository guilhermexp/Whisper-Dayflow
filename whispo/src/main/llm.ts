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
    console.log("[enhancement] Selected prompt ID:", config.selectedPromptId || "default")
    console.log("[enhancement] Provider:", config.enhancementProvider || "openai")

    try {
      const result = await enhancementService.enhanceTranscript(transcript, {
        signal: options.signal,
      })

      // Log error if enhancement failed but returned original
      if (result.error) {
        console.log("[enhancement] ⚠️  Enhancement failed, using original transcript")
        console.log("[enhancement] Error:", result.error)
        console.log("[enhancement] Processing time:", result.processingTime, "ms")
        console.log("[enhancement] Provider used:", result.provider || "none")
        console.log("[enhancement] Prompt used:", result.promptId || "none")
      } else {
        console.log("[enhancement] ✅ Enhancement completed successfully")
        console.log("[enhancement] Original length:", result.originalText.length, "chars")
        console.log("[enhancement] Enhanced length:", result.enhancedText.length, "chars")
        console.log("[enhancement] Processing time:", result.processingTime, "ms")
        console.log("[enhancement] Provider used:", result.provider)
        console.log("[enhancement] Model used:", config.enhancementProvider === "openrouter"
          ? config.openrouterModel || "openai/gpt-4o-mini"
          : config.enhancementProvider === "openai" ? config.openaiModel || "gpt-4o-mini"
          : config.enhancementProvider === "groq" ? config.groqModel || "llama-3.1-70b-versatile"
          : config.enhancementProvider === "gemini" ? config.geminiModel || "gemini-1.5-flash-002"
          : config.customEnhancementModel || "gpt-4o-mini"
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
      console.error("[enhancement] ❌ Enhancement service threw exception:", error)
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
    const gModel = gai.getGenerativeModel({ model: config.geminiModel || "gemini-1.5-flash-002" })

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
  if (!chatJson.choices || !Array.isArray(chatJson.choices) || chatJson.choices.length === 0) {
    throw new Error("Invalid API response: missing or empty choices array")
  }

  if (!chatJson.choices[0].message || typeof chatJson.choices[0].message.content !== "string") {
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

  // Build a compact, human-readable log of the window
  const formatClock = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const lines = windowItems.map((item) => {
    const start = formatClock(item.createdAt)
    const end = formatClock(item.createdAt + (item.duration || 0))
    const transcript = item.transcript.replace(/\s+/g, " ").trim()
    return `[${start} - ${end}]: ${transcript}`
  })

  const logText = lines.join("\n")

  // Prompt: condensed version of the Dayflow "digital anthropologist" concept,
  // tuned for text-only observations (no screen/video).
  const basePrompt = `
You are a digital anthropologist observing a user's raw speech transcripts over a short period of time.
Your goal is to synthesize this log into a small set of high‑level activity blocks that describe what they were working on.

CRITICAL RULES:
- Focus on factual, observable activity only (what they did, which tools/projects, major decisions).
- Do not invent tasks, feelings, or future plans.
- Prefer a few long, meaningful blocks (15–60 minutes) over many tiny ones.

OUTPUT FORMAT:
You must return ONLY a single JSON object with this exact shape:
{
  "summary": "one short paragraph summarizing the whole window in first-person style without using 'I'",
  "activities": [
    {
      "startTs": 1732042800000,
      "endTs": 1732045500000,
      "title": "Short, concrete title of the block",
      "summary": "1-3 short sentences describing what happened in this block.",
      "category": "Work" // optional coarse label like Work, Meeting, Study, Admin, Browsing, Personal, Idle
    }
  ]
}

TIMING RULES:
- startTs and endTs must be UNIX epoch milliseconds within the provided window.
- Activities must collectively cover as much of the observed time as possible without overlapping.
- You can merge small gaps/interruptions into the nearest meaningful block.

STYLE GUIDELINES:
- Titles: write like a quick note to a colleague ("Debugging auth bug in app", "Writing email to client about contract").
- Summaries: 1–3 short factual sentences, no fluff, no metaphors, no narrative intros.
- Categories: use a small set of coarse labels; omit the field if you're unsure.

INPUT LOG:
${logText}

Return ONLY the JSON object, with no extra text or explanation.
`

  // Use the same provider configuration as enhancement, since this is
  // conceptually another "meta" AI feature on top of transcripts.
  const provider = config.enhancementProvider ?? "openai"

  const callWithGemini = async (): Promise<string> => {
    if (!config.geminiApiKey) {
      throw new Error("Gemini API key is required for auto-journal when provider=gemini")
    }

    const gai = new GoogleGenerativeAI(config.geminiApiKey)
    const modelId = config.geminiModel || "gemini-1.5-flash-002"
    const gModel = gai.getGenerativeModel({ model: modelId })

    ensureNotAborted()
    const result = await gModel.generateContent([basePrompt], {
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
              content: basePrompt,
            },
          ],
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        let errorDetails = ""
        try {
          const data = await response.json()
          errorDetails = data.error?.message || data.message || JSON.stringify(data)
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
        throw new Error("Invalid API response: missing or invalid message content")
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
    console.error("[auto-journal] Failed to parse model response as JSON:", error)
    console.error("[auto-journal] Raw response:", raw.slice(0, 500))
    throw error
  }

  const summary =
    typeof parsed.summary === "string" && parsed.summary.trim().length
      ? parsed.summary.trim()
      : "No summary generated."

  const activities: AutoJournalSummary["activities"] = Array.isArray(
    parsed.activities,
  )
    ? parsed.activities
        .map((a: any) => ({
          startTs:
            typeof a.startTs === "number" ? a.startTs : windowStartTs,
          endTs: typeof a.endTs === "number" ? a.endTs : windowEndTs,
          title: typeof a.title === "string" ? a.title : "Untitled activity",
          summary:
            typeof a.summary === "string"
              ? a.summary
              : "No summary provided.",
          category:
            typeof a.category === "string" && a.category.trim().length
              ? a.category
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
  }
}
