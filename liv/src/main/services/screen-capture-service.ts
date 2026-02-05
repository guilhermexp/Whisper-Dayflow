import { desktopCapturer, app, powerMonitor, BrowserWindow } from "electron"
import { createWorker, type Worker as TesseractWorker } from "tesseract.js"
import fs from "fs"
import path from "path"

// ============================================================================
// ERROR CLASSIFICATION (inspired by Dayflow)
// ============================================================================

enum ScreenCaptureErrorCode {
  NoDisplayFound = "NO_DISPLAY",
  PermissionDenied = "PERMISSION_DENIED",
  DisplayNotReady = "DISPLAY_NOT_READY",
  UserStopped = "USER_STOPPED",
  SystemBusy = "SYSTEM_BUSY",
  Unknown = "UNKNOWN",
}

interface ErrorMetadata {
  code: ScreenCaptureErrorCode
  retryable: boolean
  delay?: number // ms
  message: string
}

// ============================================================================
// STATE MACHINE (inspired by Dayflow)
// ============================================================================

enum CaptureState {
  Idle = "idle",
  Starting = "starting",
  Capturing = "capturing",
  Paused = "paused",
  Finishing = "finishing",
}

// ============================================================================
// TYPES
// ============================================================================

export interface ScreenCaptureResult {
  text: string
  windowTitle: string
  appName: string
  timestamp: number
  imagePath?: string
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class ScreenCaptureService {
  private tesseractWorker: TesseractWorker | null = null
  private workerReady = false
  private lastCaptureResult: ScreenCaptureResult | null = null

  // State management
  private state: CaptureState = CaptureState.Idle
  private pauseReason: string | null = null

  // Retry tracking
  private retryAttempt = 0
  private maxRetries = 4

  constructor() {
    this.registerSystemEvents()
  }

  // ==========================================================================
  // STATE MACHINE
  // ==========================================================================

  private transition(to: CaptureState, context?: string): void {
    const old = this.state
    this.state = to
    console.log(`[ScreenCapture] State: ${old} → ${to}${context ? ` (${context})` : ""}`)
  }

  private canStart(): boolean {
    return this.state === CaptureState.Idle || this.state === CaptureState.Paused
  }

  // ==========================================================================
  // ERROR CLASSIFICATION (inspired by Dayflow)
  // ==========================================================================

  private classifyError(error: any): ErrorMetadata {
    const errorStr = error?.message?.toLowerCase() || String(error).toLowerCase()

    // Permission denied
    if (errorStr.includes("permission") || errorStr.includes("denied") || errorStr.includes("access")) {
      return {
        code: ScreenCaptureErrorCode.PermissionDenied,
        retryable: false,
        message: "Screen recording permission denied by user",
      }
    }

    // No display found (transient)
    if (errorStr.includes("no display") || errorStr.includes("no source") || errorStr.includes("no screen")) {
      return {
        code: ScreenCaptureErrorCode.NoDisplayFound,
        retryable: true,
        delay: 2000,
        message: "No display found - likely transient error",
      }
    }

    // Display not ready (after wake/unlock)
    if (errorStr.includes("not ready") || errorStr.includes("unavailable")) {
      return {
        code: ScreenCaptureErrorCode.DisplayNotReady,
        retryable: true,
        delay: 5000,
        message: "Display not ready - waiting for system",
      }
    }

    // System busy
    if (errorStr.includes("busy") || errorStr.includes("in use")) {
      return {
        code: ScreenCaptureErrorCode.SystemBusy,
        retryable: true,
        delay: 3000,
        message: "System busy - retrying",
      }
    }

    // Unknown error (conservative: treat as retryable with delay)
    return {
      code: ScreenCaptureErrorCode.Unknown,
      retryable: true,
      delay: 2000,
      message: errorStr || "Unknown error",
    }
  }

  // ==========================================================================
  // RETRY LOGIC (inspired by Dayflow - exponential backoff)
  // ==========================================================================

  private async attemptCaptureWithRetry(
    saveImagePath?: string,
    attempt = 1,
  ): Promise<ScreenCaptureResult | null> {
    if (!this.canStart()) {
      console.warn(`[ScreenCapture] Cannot start from state: ${this.state}`)
      return null
    }

    this.transition(CaptureState.Starting, `attempt ${attempt}/${this.maxRetries}`)

    try {
      const result = await this.captureInternal(saveImagePath)
      this.transition(CaptureState.Idle, "success")
      this.retryAttempt = 0 // Reset on success
      return result
    } catch (error) {
      const errorMeta = this.classifyError(error)
      console.error(`[ScreenCapture] Error (attempt ${attempt}):`, errorMeta.message)

      // Not retryable - give up immediately
      if (!errorMeta.retryable) {
        console.error(`[ScreenCapture] Fatal error - not retryable:`, errorMeta.code)
        this.transition(CaptureState.Idle, "fatal error")
        return null
      }

      // Reached max retries - give up
      if (attempt >= this.maxRetries) {
        console.error(`[ScreenCapture] Max retries reached (${this.maxRetries}) - giving up`)
        this.transition(CaptureState.Idle, "max retries")
        return null
      }

      // Retry with exponential backoff
      const delay = errorMeta.delay || Math.pow(2, attempt - 1) * 1000 // 1s, 2s, 4s, 8s
      console.log(`[ScreenCapture] Retrying in ${delay}ms...`)

      await new Promise((resolve) => setTimeout(resolve, delay))
      return this.attemptCaptureWithRetry(saveImagePath, attempt + 1)
    }
  }

  // ==========================================================================
  // CORE CAPTURE LOGIC
  // ==========================================================================

  private async captureInternal(saveImagePath?: string): Promise<ScreenCaptureResult | null> {
    this.transition(CaptureState.Capturing)

    // Get all window sources with error handling
    let sources
    try {
      sources = await desktopCapturer.getSources({
        types: ["window"],
        thumbnailSize: { width: 1920, height: 1080 },
        fetchWindowIcons: false,
      })
    } catch (captureError) {
      // Re-throw to let retry logic handle it
      throw new Error(`desktopCapturer.getSources failed: ${captureError}`)
    }

    if (!sources || sources.length === 0) {
      throw new Error("No sources found")
    }

    // Find the active/focused window (not our app)
    const appName = app.getName()
    const targetSource =
      sources.find(
        (source) =>
          !source.name.includes(appName) &&
          !source.name.includes("Liv"),
      ) || sources[0]

    if (!targetSource) {
      throw new Error("No suitable window found")
    }

    // Extract window info
    const windowInfo = this.parseWindowName(targetSource.name)

    // Get screenshot as data URL
    const thumbnail = targetSource.thumbnail
    const dataUrl = thumbnail.toDataURL()

    // Save image if path provided
    let imagePath: string | undefined
    if (saveImagePath) {
      try {
        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "")
        const imageBuffer = Buffer.from(base64Data, "base64")
        fs.mkdirSync(path.dirname(saveImagePath), { recursive: true })
        fs.writeFileSync(saveImagePath, imageBuffer)
        imagePath = saveImagePath
      } catch (saveError) {
        console.warn("[ScreenCapture] Failed to save image:", saveError)
        // Continue without saving - not critical
      }
    }

    // Perform OCR (best effort - don't fail if OCR fails)
    let extractedText = ""
    try {
      await this.ensureWorkerReady()
      if (this.tesseractWorker) {
        const result = await this.tesseractWorker.recognize(dataUrl)
        extractedText = result.data.text.trim()
      }
    } catch (ocrError) {
      console.warn("[ScreenCapture] OCR failed (non-critical):", ocrError)
      // Continue without OCR text
    }

    const result: ScreenCaptureResult = {
      text: extractedText,
      windowTitle: windowInfo.title,
      appName: windowInfo.appName,
      timestamp: Date.now(),
      imagePath,
    }

    this.lastCaptureResult = result
    return result
  }

  // ==========================================================================
  // SYSTEM EVENT HANDLING (inspired by Dayflow)
  // ==========================================================================

  private registerSystemEvents(): void {
    // System will sleep
    powerMonitor.on("suspend", () => {
      if (this.state === CaptureState.Capturing) {
        this.transition(CaptureState.Paused, "system suspend")
        this.pauseReason = "system_suspend"
      }
    })

    // System did wake (delay 5s like Dayflow)
    powerMonitor.on("resume", () => {
      if (this.state === CaptureState.Paused && this.pauseReason === "system_suspend") {
        console.log("[ScreenCapture] System resumed - ready to capture in 5s")
        setTimeout(() => {
          this.transition(CaptureState.Idle, "system resume")
          this.pauseReason = null
        }, 5000)
      }
    })

    // Screen locked
    powerMonitor.on("lock-screen", () => {
      if (this.state === CaptureState.Capturing) {
        this.transition(CaptureState.Paused, "screen locked")
        this.pauseReason = "screen_locked"
      }
    })

    // Screen unlocked (immediate resume)
    powerMonitor.on("unlock-screen", () => {
      if (this.state === CaptureState.Paused && this.pauseReason === "screen_locked") {
        console.log("[ScreenCapture] Screen unlocked - ready to capture")
        setTimeout(() => {
          this.transition(CaptureState.Idle, "screen unlocked")
          this.pauseReason = null
        }, 500) // Small delay
      }
    })

    console.log("[ScreenCapture] System event handlers registered")
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private parseWindowName(name: string): { title: string; appName: string } {
    // Format: "Window Title - App Name" or "Window Title"
    const parts = name.split(" - ")
    if (parts.length >= 2) {
      const title = parts.slice(0, -1).join(" - ")
      const appName = parts[parts.length - 1]
      return { title, appName }
    }
    return { title: name, appName: "Unknown" }
  }

  private async ensureWorkerReady(): Promise<void> {
    if (this.workerReady && this.tesseractWorker) {
      return
    }

    try {
      console.log("[ScreenCapture] Initializing Tesseract worker...")

      const cachePath = path.join(app.getPath("userData"), "tesseract-cache")
      fs.mkdirSync(cachePath, { recursive: true })

      this.tesseractWorker = await createWorker("eng+por", 1, {
        cachePath,
        cacheMethod: "write",
      })

      this.workerReady = true
      console.log("[ScreenCapture] Tesseract worker ready")
    } catch (error) {
      console.error("[ScreenCapture] Failed to initialize Tesseract:", error)
      this.tesseractWorker = null
      this.workerReady = false
      // Don't throw - OCR is optional
    }
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Capture and extract text from active window
   * WITH RETRY LOGIC AND ERROR HANDLING
   */
  async captureAndExtractText(
    saveImagePath?: string,
  ): Promise<ScreenCaptureResult | null> {
    // Guard: ReplayKit crashes (NSException in [NSWindow setStyleMask:]) when
    // there is no visible BrowserWindow.  This happens when the user closes the
    // main window and the app is running only from the system tray.
    const hasVisibleWindow = BrowserWindow.getAllWindows().some(
      (w) => !w.isDestroyed() && w.isVisible(),
    )
    if (!hasVisibleWindow) {
      console.warn(
        "[ScreenCapture] No visible BrowserWindow — skipping capture to avoid ReplayKit crash",
      )
      return null
    }

    // Check if we're paused due to system event
    if (this.state === CaptureState.Paused) {
      console.log(`[ScreenCapture] Paused due to: ${this.pauseReason} - skipping`)
      return this.lastCaptureResult // Return last successful capture
    }

    // Attempt capture with automatic retry
    return this.attemptCaptureWithRetry(saveImagePath)
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.tesseractWorker) {
      await this.tesseractWorker.terminate()
      this.tesseractWorker = null
      this.workerReady = false
      console.log("[ScreenCapture] Tesseract worker terminated")
    }
  }

  /**
   * Get current state (for debugging)
   */
  getState(): { state: CaptureState; pauseReason: string | null } {
    return {
      state: this.state,
      pauseReason: this.pauseReason,
    }
  }

  /**
   * Format capture result for LLM context
   */
  formatForContext(result: ScreenCaptureResult): string {
    const lines: string[] = []

    lines.push("=== SCREEN CONTEXT ===")

    if (result.appName && result.appName !== "Unknown") {
      lines.push(`Application: ${result.appName}`)
    }

    if (result.windowTitle) {
      lines.push(`Window: ${result.windowTitle}`)
    }

    if (result.text && result.text.trim()) {
      lines.push("\nVisible Text (OCR):")
      lines.push(result.text.trim())
    }

    lines.push("=== END SCREEN CONTEXT ===")

    return lines.join("\n")
  }
}

// Singleton instance
export const screenCaptureService = new ScreenCaptureService()

// Cleanup on app quit
app.on("before-quit", () => {
  screenCaptureService.cleanup()
})
