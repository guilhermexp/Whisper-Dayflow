/**
 * Screen Capture Service
 * Captures active window and extracts text using local OCR (Tesseract.js)
 */

import { desktopCapturer, BrowserWindow } from "electron"
import Tesseract from "tesseract.js"
import path from "path"
import { app } from "electron"

export type ScreenCaptureResult = {
  text: string
  windowTitle: string
  appName: string
  timestamp: number
}

export class ScreenCaptureService {
  private isCapturing = false
  private lastCaptureResult: ScreenCaptureResult | null = null
  private worker: Tesseract.Worker | null = null

  /**
   * Initialize Tesseract worker for faster subsequent OCR
   */
  private async getWorker(): Promise<Tesseract.Worker> {
    if (!this.worker) {
      // Configure Tesseract to use local cache
      const cachePath = path.join(app.getPath("userData"), "tesseract-cache")

      this.worker = await Tesseract.createWorker("eng+por", 1, {
        cachePath,
        // Use CDN for language data (will be cached locally)
        langPath: "https://tessdata.projectnaptha.com/4.0.0",
      })
    }
    return this.worker
  }

  /**
   * Capture and extract text from active window
   */
  async captureAndExtractText(): Promise<ScreenCaptureResult | null> {
    if (this.isCapturing) {
      console.log("[screen-capture] Already capturing, skipping")
      return this.lastCaptureResult
    }

    this.isCapturing = true
    const startTime = Date.now()

    try {
      // Get all window sources
      const sources = await desktopCapturer.getSources({
        types: ["window"],
        thumbnailSize: { width: 1920, height: 1080 },
        fetchWindowIcons: false,
      })

      if (sources.length === 0) {
        console.log("[screen-capture] No windows found")
        return null
      }

      // Find the active/focused window
      // In Electron, we need to find the frontmost window
      // We'll use the first non-VoiceFlow window as the target
      const appName = app.getName()
      const targetSource = sources.find(
        (source) => !source.name.includes(appName) && !source.name.includes("VoiceFlow")
      ) || sources[0]

      if (!targetSource) {
        console.log("[screen-capture] No suitable window found")
        return null
      }

      // Extract window info from source name
      // Format is usually "Window Title - App Name" or just "Window Title"
      const windowInfo = this.parseWindowName(targetSource.name)

      console.log(
        `[screen-capture] Capturing: "${windowInfo.title}" (${windowInfo.appName})`
      )

      // Get the thumbnail as PNG buffer
      const image = targetSource.thumbnail
      if (image.isEmpty()) {
        console.log("[screen-capture] Window thumbnail is empty")
        return null
      }

      const pngBuffer = image.toPNG()

      // Perform OCR with Tesseract.js
      const worker = await this.getWorker()
      const ocrResult = await worker.recognize(pngBuffer)

      const extractedText = ocrResult.data.text.trim()

      const captureTime = Date.now() - startTime
      console.log(
        `[screen-capture] OCR completed in ${captureTime}ms, ` +
        `extracted ${extractedText.length} chars`
      )

      // Build result with metadata
      const result: ScreenCaptureResult = {
        text: extractedText,
        windowTitle: windowInfo.title,
        appName: windowInfo.appName,
        timestamp: Date.now(),
      }

      this.lastCaptureResult = result
      return result

    } catch (error) {
      console.error("[screen-capture] Error:", error)
      return null
    } finally {
      this.isCapturing = false
    }
  }

  /**
   * Parse window name to extract title and app name
   */
  private parseWindowName(name: string): { title: string; appName: string } {
    // Common patterns:
    // "Document - App Name"
    // "App Name"
    // "Tab Title - Browser Name"

    const separators = [" - ", " — ", " | "]

    for (const sep of separators) {
      if (name.includes(sep)) {
        const parts = name.split(sep)
        if (parts.length >= 2) {
          // Last part is usually the app name
          const appName = parts[parts.length - 1].trim()
          const title = parts.slice(0, -1).join(sep).trim()
          return { title: title || name, appName }
        }
      }
    }

    // No separator found, use name as both
    return { title: name, appName: name }
  }

  /**
   * Get last capture result
   */
  getLastCapture(): ScreenCaptureResult | null {
    return this.lastCaptureResult
  }

  /**
   * Clear last capture
   */
  clearLastCapture(): void {
    this.lastCaptureResult = null
  }

  /**
   * Format capture result for context injection
   */
  formatForContext(result: ScreenCaptureResult): string {
    let formatted = `Active Window: ${result.windowTitle}\n`
    formatted += `Application: ${result.appName}\n\n`

    if (result.text && result.text.length > 0) {
      formatted += `Window Content:\n${result.text}`
    } else {
      formatted += `Window Content:\nNo text detected via OCR`
    }

    return formatted
  }

  /**
   * Cleanup worker when done
   */
  async cleanup(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate()
      this.worker = null
    }
  }
}

// Singleton instance
export const screenCaptureService = new ScreenCaptureService()
