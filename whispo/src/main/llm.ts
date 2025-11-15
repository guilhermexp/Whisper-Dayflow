import { dialog } from "electron"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { configStore } from "./config"

export async function postProcessTranscript(
  transcript: string,
  options: { signal?: AbortSignal } = {},
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
