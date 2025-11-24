import { GoogleGenerativeAI } from "@google/generative-ai"
import { configStore } from "../config"
import { PREDEFINED_PROMPTS } from "../../shared/data/predefined-prompts"
import { wrapPromptWithSystemInstructions } from "../../shared/data/system-instructions"
import { screenCaptureService } from "./screen-capture-service"
import type {
  ContextCapture,
  CustomPrompt,
  EnhancementResult,
} from "../../shared/types/enhancement"

export class EnhancementService {
  private history: EnhancementResult[] = []

  /**
   * Retry helper with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    options: {
      maxRetries?: number
      initialDelay?: number
      maxDelay?: number
      shouldRetry?: (error: Error) => boolean
    } = {},
  ): Promise<T> {
    const {
      maxRetries = 3,
      initialDelay = 1000,
      maxDelay = 8000,
      shouldRetry = (error: Error) => {
        // Retry on network errors or 5xx server errors
        const message = error.message.toLowerCase()
        return (
          message.includes("network") ||
          message.includes("fetch") ||
          message.includes("econnrefused") ||
          message.includes("timeout") ||
          message.includes("temporarily unavailable") ||
          message.includes("500") ||
          message.includes("502") ||
          message.includes("503") ||
          message.includes("504")
        )
      },
    } = options

    let lastError: Error
    let delay = initialDelay

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Don't retry on abort
        if (lastError.name === "AbortError") {
          throw lastError
        }

        // Check if we should retry
        if (attempt < maxRetries && shouldRetry(lastError)) {
          console.log(
            `[enhancement-service] Attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms...`,
            lastError.message,
          )
          await new Promise((resolve) => setTimeout(resolve, delay))
          delay = Math.min(delay * 2, maxDelay)
        } else {
          throw lastError
        }
      }
    }

    throw lastError!
  }

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
    console.log(
      "[enhancement-service] Input text length:",
      rawText.length,
      "chars",
    )
    console.log("[enhancement-service] Prompt ID:", promptId)

    // If enhancement is disabled, return passthrough
    if (!config.enhancementEnabled) {
      console.log(
        "[enhancement-service] Enhancement is disabled, returning original",
      )
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
      console.log(
        "[enhancement-service] Context captured:",
        context ? "Yes" : "No",
      )

      ensureNotAborted()

      // Call LLM provider with retry
      const provider = config.enhancementProvider ?? "openai"
      const model = this.getModelForProvider(provider)
      console.log("[enhancement-service] Calling LLM provider:", provider)
      console.log("[enhancement-service] Model:", model)
      const enhancedText = await this.retryWithBackoff(
        () => this.callLLM(prompt, options?.signal),
        { maxRetries: 3, initialDelay: 1000 },
      )
      console.log(
        "[enhancement-service] LLM response received, length:",
        enhancedText.length,
        "chars",
      )

      ensureNotAborted()

      // Filter output (remove common AI wrapper phrases)
      console.log("[enhancement-service] Filtering output...")
      const filteredText = this.filterOutput(enhancedText)
      console.log(
        "[enhancement-service] Output filtered, final length:",
        filteredText.length,
        "chars",
      )

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

      console.log(
        "[enhancement-service] ✅ Enhancement completed successfully in",
        result.processingTime,
        "ms",
      )
      return result
    } catch (error) {
      // On error, return original text with error info
      let errorMessage = "Unknown error"

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          errorMessage = "Request timeout - API took too long to respond (>30s)"
          console.error(
            "[enhancement-service] ❌ Enhancement timeout:",
            errorMessage,
          )
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

      // Debug logging to verify which contexts were actually captured
      if (context) {
        const parts: string[] = []
        if (context.clipboard) {
          parts.push(`clipboard(len=${context.clipboard.length})`)
        }
        if (context.selectedText) {
          parts.push(`selectedText(len=${context.selectedText.length})`)
        }
        if (context.screenCapture) {
          parts.push(`screenCapture(len=${context.screenCapture.length})`)
        }
        console.log(
          "[enhancement-service] Context details:",
          parts.length ? parts.join(", ") : "empty context object",
        )
      } else {
        console.log("[enhancement-service] No context captured")
      }
    }

    // Build context sections
    let contextSections = ""

    // Add custom vocabulary if configured
    if (config.customVocabulary && config.customVocabulary.length > 0) {
      const vocabularyList = config.customVocabulary.join(", ")
      contextSections += `\n\nCUSTOM VOCABULARY (preserve these terms exactly as spelled):\n${vocabularyList}`
    }

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
  private async callLLM(prompt: string, signal?: AbortSignal): Promise<string> {
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
      throw new Error(
        `${provider === "custom" ? "Custom provider" : provider} API key is required`,
      )
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
      const useNewTokenParam =
        model.startsWith("gpt-4o") ||
        model.startsWith("gpt-4-turbo") ||
        model.startsWith("gpt-5") ||
        model.startsWith("o1")

      // Reasoning models (o1, o3, gpt-5) don't support temperature parameter
      const isReasoningModel =
        model.startsWith("o1") ||
        model.startsWith("o3") ||
        model.startsWith("gpt-5")

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
          // Reasoning models don't support temperature - omit for them
          ...(isReasoningModel ? {} : { temperature: 0.3 }),
          ...(useNewTokenParam
            ? { max_completion_tokens: 800 }
            : { max_tokens: 800 }),
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        let errorDetails = ""
        try {
          const errorData = await response.json()
          errorDetails =
            errorData.error?.message ||
            errorData.message ||
            JSON.stringify(errorData)
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
          throw new Error(
            `${provider} API is temporarily unavailable (${response.status})`,
          )
        } else {
          throw new Error(
            `Enhancement failed (${response.status}): ${errorDetails.slice(0, 300)}`,
          )
        }
      }

      const data = await response.json()

      // Validate API response structure
      if (
        !data.choices ||
        !Array.isArray(data.choices) ||
        data.choices.length === 0
      ) {
        throw new Error("Invalid API response: missing or empty choices array")
      }

      if (
        !data.choices[0].message ||
        typeof data.choices[0].message.content !== "string"
      ) {
        throw new Error(
          "Invalid API response: missing or invalid message content",
        )
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
      openai: config.enhancementOpenaiModel ?? "gpt-5-mini",
      groq: config.enhancementGroqModel ?? "llama-3.1-70b-versatile",
      gemini: config.enhancementGeminiModel ?? "gemini-1.5-flash",
      openrouter: config.enhancementOpenrouterModel ?? "",
      custom: config.customEnhancementModel ?? "gpt-5-mini",
    }

    return models[provider] ?? "gpt-5-mini"
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

    // Screen capture + OCR (optional, behind config flag)
    if (config.useScreenCaptureContext) {
      try {
        const screenText = await this.captureScreenText()
        if (screenText && screenText.length > 0) {
          // Limit to a reasonable size to keep prompts fast
          context.screenCapture = screenText.slice(0, 4000)
          hasContext = true
        }
      } catch (error) {
        console.error(
          "[enhancement-service] Failed to capture screen text:",
          error,
        )
      }
    }

    // Note: Selected text capture still requires additional native integration

    return hasContext ? context : undefined
  }

  /**
   * Capture active window content and extract text via local OCR (Tesseract.js).
   *
   * Implementation notes:
   * - Uses Electron's desktopCapturer to capture the active window (not full screen).
   * - Uses Tesseract.js for local OCR (no API key required).
   * - Returns formatted context with window title, app name, and extracted text.
   * - Fully optional: requires `useScreenCaptureContext` to be enabled.
   * - On any error, returns undefined so it never breaks the core flow.
   */
  private async captureScreenText(): Promise<string | undefined> {
    const config = configStore.get()

    // Require explicit opt-in
    if (!config.useScreenCaptureContext) return undefined

    try {
      const result = await screenCaptureService.captureAndExtractText()

      if (!result) {
        console.warn("[enhancement-service] Screen capture returned no result")
        return undefined
      }

      // Format the result with metadata
      return screenCaptureService.formatForContext(result)
    } catch (error) {
      console.error(
        "[enhancement-service] Error during screen capture OCR:",
        error,
      )
      return undefined
    }
  }

  /**
   * Filter common AI wrapper phrases and thinking tags from output
   */
  private filterOutput(text: string): string {
    let filtered = text

    // Remove thinking/reasoning tags (used by some models for chain-of-thought)
    const thinkingPatterns = [
      /<thinking>[\s\S]*?<\/thinking>/gi,
      /<think>[\s\S]*?<\/think>/gi,
      /<reasoning>[\s\S]*?<\/reasoning>/gi,
      /<reflection>[\s\S]*?<\/reflection>/gi,
      /<analysis>[\s\S]*?<\/analysis>/gi,
      /<internal>[\s\S]*?<\/internal>/gi,
      /<scratchpad>[\s\S]*?<\/scratchpad>/gi,
    ]

    for (const pattern of thinkingPatterns) {
      filtered = filtered.replace(pattern, "")
    }

    // Remove common AI wrapper phrases
    filtered = filtered
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
