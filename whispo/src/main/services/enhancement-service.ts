import { GoogleGenerativeAI } from "@google/generative-ai"
import { configStore } from "../config"
import { PREDEFINED_PROMPTS } from "../../shared/data/predefined-prompts"
import { wrapPromptWithSystemInstructions } from "../../shared/data/system-instructions"
import type {
  ContextCapture,
  CustomPrompt,
  EnhancementResult,
} from "../../shared/types/enhancement"

export class EnhancementService {
  private history: EnhancementResult[] = []

  /**
   * Main enhancement function that processes transcript with AI
   */
  async enhanceTranscript(
    rawText: string,
    options?: {
      promptId?: string
      skipContext?: boolean
      signal?: AbortSignal
    },
  ): Promise<EnhancementResult> {
    const startTime = Date.now()
    const config = configStore.get()

    // Check if aborted
    const ensureNotAborted = () => {
      if (options?.signal?.aborted) {
        const error = new Error("Aborted")
        error.name = "AbortError"
        throw error
      }
    }

    ensureNotAborted()

    // Get configuration
    const promptId = options?.promptId ?? config.selectedPromptId ?? "default"

    console.log("[enhancement-service] Starting enhancement process")
    console.log("[enhancement-service] Input text length:", rawText.length, "chars")
    console.log("[enhancement-service] Prompt ID:", promptId)

    // If enhancement is disabled, return passthrough
    if (!config.enhancementEnabled) {
      console.log("[enhancement-service] Enhancement is disabled, returning original")
      return this.createPassthroughResult(rawText, startTime)
    }

    try {
      // Build prompt with context
      console.log("[enhancement-service] Building prompt with context...")
      const { prompt, context } = await this.buildPrompt(
        rawText,
        promptId,
        options?.skipContext,
      )
      console.log("[enhancement-service] Prompt built successfully")
      console.log("[enhancement-service] Context captured:", context ? "Yes" : "No")

      ensureNotAborted()

      // Call LLM provider
      const provider = config.enhancementProvider ?? "openai"
      const model = this.getModelForProvider(provider)
      console.log("[enhancement-service] Calling LLM provider:", provider)
      console.log("[enhancement-service] Model:", model)
      const enhancedText = await this.callLLM(prompt, options?.signal)
      console.log("[enhancement-service] LLM response received, length:", enhancedText.length, "chars")

      ensureNotAborted()

      // Filter output (remove common AI wrapper phrases)
      console.log("[enhancement-service] Filtering output...")
      const filteredText = this.filterOutput(enhancedText)
      console.log("[enhancement-service] Output filtered, final length:", filteredText.length, "chars")

      // Create result
      const result: EnhancementResult = {
        id: crypto.randomUUID(),
        originalText: rawText,
        enhancedText: filteredText,
        promptId,
        provider: config.enhancementProvider ?? "openai",
        timestamp: Date.now(),
        processingTime: Date.now() - startTime,
        contextUsed: context,
      }

      // Save to history
      this.history.push(result)
      this.trimHistory()

      console.log("[enhancement-service] ✅ Enhancement completed successfully in", result.processingTime, "ms")
      return result
    } catch (error) {
      // On error, return original text with error info
      let errorMessage = "Unknown error"

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          errorMessage = "Request timeout - API took too long to respond (>30s)"
          console.error("[enhancement-service] ❌ Enhancement timeout:", errorMessage)
        } else if (error.message.includes("API key")) {
          errorMessage = error.message
          console.error("[enhancement-service] ❌ API key error:", errorMessage)
        } else if (error.message.includes("Enhancement failed")) {
          errorMessage = error.message
          console.error("[enhancement-service] ❌ API error:", errorMessage)
        } else {
          errorMessage = error.message
          console.error("[enhancement-service] ❌ Enhancement failed:", error)
        }
      } else {
        console.error("[enhancement-service] ❌ Enhancement failed:", error)
      }

      console.log("[enhancement-service] Falling back to original transcript")

      const result = this.createPassthroughResult(rawText, startTime)
      result.error = errorMessage
      return result
    }
  }

  /**
   * Build the prompt with system instructions, user prompt, and context
   */
  private async buildPrompt(
    text: string,
    promptId: string,
    skipContext?: boolean,
  ): Promise<{ prompt: string; context?: ContextCapture }> {
    const config = configStore.get()

    // Get prompt template
    const prompt = this.getPrompt(promptId)

    // Capture contexts if enabled
    let context: ContextCapture | undefined

    if (!skipContext) {
      context = await this.captureContext()
    }

    // Build context sections
    let contextSections = ""

    if (context?.clipboard && config.useClipboardContext) {
      contextSections += `\n\nCLIPBOARD CONTENT:\n${context.clipboard}`
    }

    if (context?.selectedText && config.useSelectedTextContext) {
      contextSections += `\n\nCURRENTLY SELECTED TEXT:\n${context.selectedText}`
    }

    if (context?.screenCapture && config.useScreenCaptureContext) {
      contextSections += `\n\nVISIBLE SCREEN CONTENT:\n${context.screenCapture}`
    }

    // Add context to prompt text if available
    let customPromptWithContext = prompt.promptText
    if (contextSections) {
      customPromptWithContext += `\n\nADDITIONAL CONTEXT:${contextSections}`
    }

    // Wrap with system instructions template (prevents prompt injection)
    const finalPrompt = prompt.useSystemInstructions
      ? wrapPromptWithSystemInstructions(customPromptWithContext, text)
      : `${customPromptWithContext}\n\n${text}`

    return { prompt: finalPrompt, context }
  }

  /**
   * Call the LLM provider to enhance the text
   */
  private async callLLM(
    prompt: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const config = configStore.get()
    const provider = config.enhancementProvider ?? "openai"

    // Get model based on provider
    const model = this.getModelForProvider(provider)

    // Gemini has different API
    if (provider === "gemini") {
      if (!config.geminiApiKey) throw new Error("Gemini API key is required")

      const gai = new GoogleGenerativeAI(config.geminiApiKey)
      const gModel = gai.getGenerativeModel({ model })

      const result = await gModel.generateContent([prompt], {
        baseUrl: config.geminiBaseUrl,
      })
      return result.response.text()
    }

    // OpenAI-compatible providers (OpenAI, Groq, OpenRouter, and Custom)
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
      throw new Error(`${provider === "custom" ? "Custom provider" : provider} API key is required`)
    }

    const timeout = config.enhancementTimeout ?? 30000
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    // Combine external signal with timeout
    const abortHandler = () => controller.abort()
    if (signal) {
      signal.addEventListener("abort", abortHandler)
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
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.3,
          max_tokens: 4000,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        let errorDetails = ""
        try {
          const errorData = await response.json()
          errorDetails = errorData.error?.message || errorData.message || JSON.stringify(errorData)
        } catch {
          errorDetails = await response.text()
        }

        // Provide user-friendly error messages
        if (response.status === 401) {
          throw new Error("Invalid API key - please check your configuration")
        } else if (response.status === 429) {
          throw new Error("Rate limit exceeded - please try again later")
        } else if (response.status === 403) {
          throw new Error("Access forbidden - check API key permissions")
        } else if (response.status >= 500) {
          throw new Error(`${provider} API is temporarily unavailable (${response.status})`)
        } else {
          throw new Error(
            `Enhancement failed (${response.status}): ${errorDetails.slice(0, 300)}`,
          )
        }
      }

      const data = await response.json()

      // Validate API response structure
      if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
        throw new Error("Invalid API response: missing or empty choices array")
      }

      if (!data.choices[0].message || typeof data.choices[0].message.content !== "string") {
        throw new Error("Invalid API response: missing or invalid message content")
      }

      return data.choices[0].message.content
    } finally {
      clearTimeout(timeoutId)
      // Clean up abort handler to prevent memory leak
      if (signal) {
        signal.removeEventListener("abort", abortHandler)
      }
    }
  }

  /**
   * Get the appropriate model for the provider
   */
  private getModelForProvider(provider: string): string {
    const config = configStore.get()

    const models = {
      openai: config.openaiModel ?? "gpt-4o-mini",
      groq: config.groqModel ?? "llama-3.1-70b-versatile",
      gemini: config.geminiModel ?? "gemini-1.5-flash-002",
      openrouter: config.openrouterModel ?? "openai/gpt-4o-mini",
      custom: config.customEnhancementModel ?? "gpt-4o-mini",
    }

    return models[provider] ?? "gpt-4o-mini"
  }

  /**
   * Get the prompt template
   */
  private getPrompt(promptId: string): CustomPrompt {
    const config = configStore.get()

    // Check custom prompts first
    const customPrompt = config.customPrompts?.find((p) => p.id === promptId)
    if (customPrompt) return customPrompt

    // Fallback to predefined prompts
    const predefinedPrompt = PREDEFINED_PROMPTS.find((p) => p.id === promptId)
    if (predefinedPrompt) return predefinedPrompt

    // Ultimate fallback to default
    return (
      PREDEFINED_PROMPTS.find((p) => p.id === "default") ||
      PREDEFINED_PROMPTS[0]
    )
  }

  /**
   * Capture context from clipboard, selected text, and screen
   */
  private async captureContext(): Promise<ContextCapture | undefined> {
    const config = configStore.get()
    const context: ContextCapture = {
      timestamp: Date.now(),
    }

    let hasContext = false

    // Capture clipboard
    if (config.useClipboardContext) {
      try {
        const { clipboard } = await import("electron")
        const clipboardText = clipboard.readText()
        if (clipboardText && clipboardText.length > 0) {
          context.clipboard = clipboardText.slice(0, 2000) // Limit to 2000 chars
          hasContext = true
        }
      } catch (error) {
        console.error("Failed to capture clipboard:", error)
      }
    }

    // Note: Selected text and screen capture would require additional native modules
    // For now, we'll skip them and implement later

    return hasContext ? context : undefined
  }

  /**
   * Filter common AI wrapper phrases from output
   */
  private filterOutput(text: string): string {
    let filtered = text
      .replace(/^Here is the enhanced .*?:\s*/i, "")
      .replace(/^Here's the .*?:\s*/i, "")
      .replace(/^Enhanced version:\s*/i, "")
      .replace(/^Enhanced transcript:\s*/i, "")
      .replace(/^Enhanced text:\s*/i, "")
      .trim()

    // Remove surrounding quotes if present
    if (
      (filtered.startsWith('"') && filtered.endsWith('"')) ||
      (filtered.startsWith("'") && filtered.endsWith("'"))
    ) {
      filtered = filtered.slice(1, -1)
    }

    return filtered
  }

  /**
   * Create a passthrough result (no enhancement)
   */
  private createPassthroughResult(
    text: string,
    startTime: number,
  ): EnhancementResult {
    return {
      id: crypto.randomUUID(),
      originalText: text,
      enhancedText: text,
      promptId: "none",
      provider: "none",
      timestamp: Date.now(),
      processingTime: Date.now() - startTime,
    }
  }

  /**
   * Trim history to stay within limits
   */
  private trimHistory(): void {
    const limit = 100

    if (this.history.length > limit) {
      this.history = this.history.slice(-limit)
    }
  }

  /**
   * Get enhancement history
   */
  getHistory(): EnhancementResult[] {
    return [...this.history]
  }

  /**
   * Clear enhancement history
   */
  clearHistory(): void {
    this.history = []
  }

  /**
   * Get a specific enhancement result by ID
   */
  getResult(id: string): EnhancementResult | undefined {
    return this.history.find((r) => r.id === id)
  }
}

// Singleton instance
export const enhancementService = new EnhancementService()
