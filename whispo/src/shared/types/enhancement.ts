// Enhancement system types

export type EnhancementMode = 'off' | 'light' | 'medium' | 'heavy'

export type PromptCategory =
  | 'default'
  | 'custom'
  | 'business'
  | 'technical'
  | 'creative'
  | 'academic'
  | 'legal'
  | 'medical'

export interface CustomPrompt {
  id: string
  title: string
  description?: string
  category: PromptCategory
  icon: string // Icon identifier (e.g., 'i-mingcute-sparkles-line')
  promptText: string
  triggerWords?: string[] // Keywords to auto-select this prompt
  useSystemInstructions: boolean
  createdAt: number
  updatedAt: number
}

export interface EnhancementResult {
  id: string
  originalText: string
  enhancedText: string
  promptId: string
  provider: string
  timestamp: number
  processingTime: number
  contextUsed?: {
    clipboard?: string
    selectedText?: string
    screenCapture?: string
  }
  error?: string // Error message if enhancement failed
}

export interface EnhancementConfig {
  enabled: boolean
  selectedPromptId?: string
  customPrompts: CustomPrompt[]
  contextSettings: {
    useClipboard: boolean
    useSelectedText: boolean
    useScreenCapture: boolean
  }
  provider: 'openai' | 'groq' | 'gemini'
  model?: string
  timeout: number
  maxRetries: number
}

export interface ContextCapture {
  clipboard?: string
  selectedText?: string
  screenCapture?: string
  timestamp: number
}
