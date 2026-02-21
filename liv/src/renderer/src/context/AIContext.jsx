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

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"
const DEFAULT_OLLAMA_CHAT_MODEL = "llama3.1:8b"
const OPENAI_URL = "https://api.openai.com/v1"
const OPENROUTER_URL = "https://openrouter.ai/api/v1"
const DEFAULT_CHAT_MODEL = "gpt-5.2"
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-5.2"
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
  const [model, setModel] = useElectronStore("model", DEFAULT_CHAT_MODEL)
  const [openrouterModel, setOpenrouterModel] = useElectronStore(
    "openrouterModel",
    DEFAULT_OPENROUTER_MODEL,
  )
  const [embeddingModel, setEmbeddingModel] = useElectronStore(
    "embeddingModel",
    "qwen3-embedding:0.6b",
  )
  const [ollamaBaseUrl, setOllamaBaseUrl] = useElectronStore(
    "ollamaBaseUrl",
    DEFAULT_OLLAMA_BASE_URL,
  )
  const [baseUrl, setBaseUrl] = useElectronStore("baseUrl", OPENAI_URL)
  const isOpenAIModelName = useCallback(
    (value) => typeof value === "string" && /^gpt-|^o1|^o3/i.test(value),
    [],
  )

  useEffect(() => {
    if (pileAIProvider === "subscription") {
      setPileAIProvider("openai")
    }
    // Chat provider should remain OpenAI/OpenRouter.
    // Ollama is used for local embeddings/RAG by default.
    if (pileAIProvider === "ollama") {
      setPileAIProvider("openai")
    }
    if (model === "gpt-5.1" || model === "gpt-5.3") {
      setModel(DEFAULT_CHAT_MODEL)
    }
    if (!openrouterModel || openrouterModel === "x-ai/grok-4-fast") {
      setOpenrouterModel(DEFAULT_OPENROUTER_MODEL)
    }
    if (pileAIProvider === "openai" && (!model || !isOpenAIModelName(model))) {
      setModel(DEFAULT_CHAT_MODEL)
    }
  }, [
    pileAIProvider,
    model,
    openrouterModel,
    isOpenAIModelName,
    setPileAIProvider,
    setModel,
    setOpenrouterModel,
  ])

  const setupAi = useCallback(async () => {
    const key = await window.electron.ipc.invoke("get-ai-key")
    const openrouterKey = await window.electron.ipc.invoke("get-openrouter-key")
    const provider =
      pileAIProvider === "subscription" ? "openai" : pileAIProvider

    if (provider === "ollama") {
      console.log("[AIContext] Setting up Ollama provider")
      setAi({ type: "ollama" })
    } else if (provider === "openrouter") {
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

      const currentModel =
        ai.type === "openrouter"
          ? openrouterModel || DEFAULT_OPENROUTER_MODEL
          : ai.type === "openai"
            ? (model && isOpenAIModelName(model) ? model : DEFAULT_CHAT_MODEL)
            : (model && !isOpenAIModelName(model) ? model : DEFAULT_OLLAMA_CHAT_MODEL)
      console.log("[Chat] Provider:", ai.type)
      console.log("[Chat] Model:", currentModel)
      console.log("[Chat] Context messages:", context.length)
      console.log(
        "[Chat] Last message:",
        context[context.length - 1]?.content?.substring(0, 100),
      )

      try {
        if (ai.type === "ollama") {
          const normalizedOllamaBaseUrl = (ollamaBaseUrl || DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, "")
          const ollamaModel =
            model && !isOpenAIModelName(model)
              ? model
              : DEFAULT_OLLAMA_CHAT_MODEL
          console.log("[Chat] Using Ollama API at:", normalizedOllamaBaseUrl)
          const response = await fetch(`${normalizedOllamaBaseUrl}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: ollamaModel, messages: context }),
          })

          if (!response.ok) {
            let details = ""
            try {
              const payload = await response.json()
              details = payload?.error || payload?.message || ""
            } catch {}
            console.error("[Chat] ❌ Ollama HTTP error:", response.status, details)
            throw new Error(`Ollama error ${response.status}${details ? `: ${details}` : ""}`)
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
    [ai, model, openrouterModel, pileAIProvider, ollamaBaseUrl, isOpenAIModelName],
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
    const provider =
      pileAIProvider === "subscription" ? "openai" : pileAIProvider
    // Check the correct key based on provider
    if (provider === "ollama") {
      // Ollama doesn't need an API key
      return true
    } else if (provider === "openrouter") {
      const key = await window.electron.ipc.invoke("get-openrouter-key")
      return key !== null && key !== ""
    } else {
      // OpenAI or custom
      const key = await window.electron.ipc.invoke("get-ai-key")
      return key !== null && key !== ""
    }
  }, [pileAIProvider])

  // --- Nanobot agent mode ---
  const [nanobotEnabled, setNanobotEnabled] = useState(false)
  const [nanobotStatus, setNanobotStatus] = useState(null)

  // Check nanobot status on mount and periodically
  useEffect(() => {
    let cancelled = false
    const checkNanobot = async () => {
      try {
        const config = await window.electron.ipcRenderer.invoke("getConfig")
        if (cancelled) return
        setNanobotEnabled(config?.nanobotEnabled === true)

        if (config?.nanobotEnabled) {
          const status = await window.electron.ipcRenderer.invoke("getNanobotStatus")
          if (!cancelled) setNanobotStatus(status)
        }
      } catch {
        // IPC not available yet
      }
    }
    checkNanobot()
    const interval = setInterval(checkNanobot, 10_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  /**
   * Generate completion via nanobot WebSocket streaming.
   * Falls back to direct LLM if nanobot is not connected.
   */
  const generateNanobotCompletion = useCallback(
    async (content, callback, onToolCall) => {
      // Use tipc to send message and get response
      // For now, use HTTP endpoint (non-streaming) as MVP
      // WebSocket streaming will be added in a follow-up
      try {
        const result = await window.electron.ipcRenderer.invoke(
          "sendNanobotMessage",
          { content, sessionId: "liv:chat" },
        )
        if (result?.content) {
          // Simulate streaming by sending the full response as one token
          callback(result.content)
        }
        return result
      } catch (err) {
        console.error("[AIContext] Nanobot message error:", err)
        throw err
      }
    },
    [],
  )

  const isNanobotActive =
    nanobotEnabled && nanobotStatus?.state === "connected"

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
    ollamaBaseUrl,
    setOllamaBaseUrl,
    generateCompletion,
    prepareCompletionContext,
    pileAIProvider,
    setPileAIProvider,
    // Nanobot
    nanobotEnabled,
    isNanobotActive,
    nanobotStatus,
    generateNanobotCompletion,
  }

  return (
    <AIContext.Provider value={AIContextValue}>{children}</AIContext.Provider>
  )
}

export const useAIContext = () => useContext(AIContext)
