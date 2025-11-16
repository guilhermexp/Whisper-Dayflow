import { dialog } from "electron"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { configStore } from "./config"
import { enhancementService } from "./services/enhancement-service"

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
          : config.enhancementProvider === "openai" ? "gpt-4o-mini"
          : config.enhancementProvider === "groq" ? "llama-3.1-70b-versatile"
          : config.enhancementProvider === "gemini" ? "gemini-1.5-flash-002"
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
    const gModel = gai.getGenerativeModel({ model: "gemini-1.5-flash-002" })

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
  const result = chatJson.choices[0].message.content.trim()
  return result
}
