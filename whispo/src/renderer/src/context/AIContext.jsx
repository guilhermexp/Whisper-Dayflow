import {
  useState,
  createContext,
  useContext,
  useEffect,
  useCallback,
} from "react"
import OpenAI from "openai"
import { usePilesContext } from "./PilesContext"
import { useElectronStore } from "renderer/hooks/useElectronStore"

const OLLAMA_URL = "http://localhost:11434/api"
const OPENAI_URL = "https://api.openai.com/v1"
const OPENROUTER_URL = "https://openrouter.ai/api/v1"
const DEFAULT_PROMPT =
  "You are an AI within a journaling app. Your job is to help the user reflect on their thoughts in a thoughtful and kind manner. The user can never directly address you or directly respond to you. Try not to repeat what the user said, instead try to seed new ideas, encourage or debate. Keep your responses concise, but meaningful."

export const AIContext = createContext()

export const AIContextProvider = ({ children }) => {
  const { currentPile, updateCurrentPile } = usePilesContext()
  const [ai, setAi] = useState(null)
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [pileAIProvider, setPileAIProvider] = useElectronStore(
    "pileAIProvider",
    "openai",
  )
  const [model, setModel] = useElectronStore("model", "gpt-5.1")
  const [openrouterModel, setOpenrouterModel] = useElectronStore(
    "openrouterModel",
    "x-ai/grok-4-fast",
  )
  const [embeddingModel, setEmbeddingModel] = useElectronStore(
    "embeddingModel",
    "mxbai-embed-large",
  )
  const [baseUrl, setBaseUrl] = useElectronStore("baseUrl", OPENAI_URL)

  const setupAi = useCallback(async () => {
    const key = await window.electron.ipc.invoke("get-ai-key")
    const openrouterKey = await window.electron.ipc.invoke("get-openrouter-key")

    if (pileAIProvider === "ollama") {
      console.log("[AIContext] Setting up Ollama provider")
      setAi({ type: "ollama" })
    } else if (pileAIProvider === "openrouter") {
      if (!openrouterKey) {
        console.warn("[AIContext] No OpenRouter API key configured.")
        setAi(null)
        return
      }
      console.log("[AIContext] Setting up OpenRouter provider")
      const openrouterInstance = new OpenAI({
        baseURL: OPENROUTER_URL,
        apiKey: openrouterKey,
        dangerouslyAllowBrowser: true,
      })
      setAi({ type: "openrouter", instance: openrouterInstance })
    } else {
      if (!key) {
        console.warn(
          "[AIContext] No API key configured. AI features will be disabled.",
        )
        setAi(null)
        return
      }
      console.log(
        "[AIContext] Setting up OpenAI provider with baseUrl:",
        baseUrl,
      )
      const openaiInstance = new OpenAI({
        baseURL: baseUrl,
        apiKey: key,
        dangerouslyAllowBrowser: true,
      })
      setAi({ type: "openai", instance: openaiInstance })
    }
  }, [pileAIProvider, baseUrl])

  useEffect(() => {
    if (currentPile) {
      console.log("🧠 Syncing current pile")
      if (currentPile.AIPrompt) setPrompt(currentPile.AIPrompt)
      setupAi()
    }
  }, [currentPile, baseUrl, setupAi])

  const generateCompletion = useCallback(
    async (context, callback) => {
      console.log("[Chat] ========== CHAT REQUEST ==========")
      console.log("[Chat] AI configured:", !!ai)
      console.log("[Chat] AI type:", ai?.type)
      console.log("[Chat] pileAIProvider:", pileAIProvider)

      if (!ai) {
        console.error(
          "[Chat] ❌ Cannot generate completion: AI is not configured",
        )
        console.error("[Chat] Please set up an API key in Settings > Journal")
        return
      }

      const currentModel = ai.type === "openrouter" ? openrouterModel : model
      console.log("[Chat] Provider:", ai.type)
      console.log("[Chat] Model:", currentModel)
      console.log("[Chat] Context messages:", context.length)
      console.log(
        "[Chat] Last message:",
        context[context.length - 1]?.content?.substring(0, 100),
      )

      try {
        if (ai.type === "ollama") {
          console.log("[Chat] Using Ollama API at:", OLLAMA_URL)
          const response = await fetch(`${OLLAMA_URL}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model, messages: context }),
          })

          if (!response.ok) {
            console.error("[Chat] ❌ Ollama HTTP error:", response.status)
            throw new Error(`HTTP error! status: ${response.status}`)
          }

          const reader = response.body.getReader()
          const decoder = new TextDecoder()

          while (true) {
            const { value, done } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value)
            const lines = chunk.split("\n")

            for (const line of lines) {
              if (line.trim() !== "") {
                const jsonResponse = JSON.parse(line)
                if (!jsonResponse.done) {
                  callback(jsonResponse.message.content)
                }
              }
            }
          }
          console.log("[Chat] ✅ Ollama response completed")
        } else {
          console.log("[Chat] Using OpenAI-compatible API")
          console.log("[Chat] BaseURL:", ai.instance?.baseURL)
          console.log("[Chat] Creating chat completion...")

          // Newer models (gpt-4o, gpt-4-turbo, gpt-5, o1) use max_completion_tokens
          const useNewTokenParam =
            currentModel.startsWith("gpt-4o") ||
            currentModel.startsWith("gpt-4-turbo") ||
            currentModel.startsWith("gpt-5") ||
            currentModel.startsWith("o1")

          const stream = await ai.instance.chat.completions.create({
            model: currentModel,
            stream: true,
            ...(useNewTokenParam
              ? { max_completion_tokens: 500 }
              : { max_tokens: 500 }),
            messages: context,
          })

          console.log("[Chat] Stream created, receiving chunks...")
          let chunkCount = 0
          let totalContent = ""
          for await (const part of stream) {
            chunkCount++
            const content = part.choices[0]?.delta?.content
            if (content) {
              totalContent += content
              callback(content)
            }
          }
          console.log(
            "[Chat] ✅ Response completed, chunks received:",
            chunkCount,
          )
          console.log("[Chat] Total content length:", totalContent.length)
          console.log("[Chat] Content preview:", totalContent.substring(0, 100))
        }
      } catch (error) {
        console.error("[Chat] ❌ AI request failed:", error.message)
        console.error("[Chat] Error details:", error)
        if (error.response) {
          console.error("[Chat] Response status:", error.response.status)
          console.error("[Chat] Response data:", error.response.data)
        }
        throw error
      }
    },
    [ai, model, openrouterModel, pileAIProvider],
  )

  const prepareCompletionContext = useCallback(
    (thread) => {
      return [
        { role: "system", content: prompt },
        {
          role: "system",
          content: "You can only respond in plaintext, do NOT use HTML.",
        },
        ...thread.map((post) => ({ role: "user", content: post.content })),
      ]
    },
    [prompt],
  )

  const checkApiKeyValidity = useCallback(async () => {
    // Check the correct key based on provider
    if (pileAIProvider === "ollama") {
      // Ollama doesn't need an API key
      return true
    } else if (pileAIProvider === "openrouter") {
      const key = await window.electron.ipc.invoke("get-openrouter-key")
      return key !== null && key !== ""
    } else {
      // OpenAI or custom
      const key = await window.electron.ipc.invoke("get-ai-key")
      return key !== null && key !== ""
    }
  }, [pileAIProvider])

  const AIContextValue = {
    ai,
    baseUrl,
    setBaseUrl,
    prompt,
    setPrompt,
    setKey: (secretKey) => window.electron.ipc.invoke("set-ai-key", secretKey),
    getKey: () => window.electron.ipc.invoke("get-ai-key"),
    setOpenrouterKey: (secretKey) =>
      window.electron.ipc.invoke("set-openrouter-key", secretKey),
    getOpenrouterKey: () => window.electron.ipc.invoke("get-openrouter-key"),
    validKey: checkApiKeyValidity,
    deleteKey: () => window.electron.ipc.invoke("delete-ai-key"),
    updateSettings: (newPrompt) =>
      updateCurrentPile({ ...currentPile, AIPrompt: newPrompt }),
    model,
    setModel,
    openrouterModel,
    setOpenrouterModel,
    embeddingModel,
    setEmbeddingModel,
    generateCompletion,
    prepareCompletionContext,
    pileAIProvider,
    setPileAIProvider,
  }

  return (
    <AIContext.Provider value={AIContextValue}>{children}</AIContext.Provider>
  )
}

export const useAIContext = () => useContext(AIContext)
