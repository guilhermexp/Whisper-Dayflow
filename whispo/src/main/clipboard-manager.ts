import { clipboard } from 'electron'

export class ClipboardManager {
  private savedClipboard: string | null = null
  private restoreTimeout: NodeJS.Timeout | null = null

  /**
   * Saves the current clipboard content
   */
  saveClipboard(): void {
    try {
      this.savedClipboard = clipboard.readText()
    } catch (error) {
      console.error('Failed to save clipboard:', error)
      this.savedClipboard = null
    }
  }

  /**
   * Restores the previously saved clipboard content
   */
  restoreClipboard(): void {
    if (this.savedClipboard !== null) {
      try {
        clipboard.writeText(this.savedClipboard)
        this.savedClipboard = null
      } catch (error) {
        console.error('Failed to restore clipboard:', error)
      }
    }
  }

  /**
   * Schedules clipboard restoration after a delay
   * @param delayMs - Delay in milliseconds before restoration
   */
  scheduleRestore(delayMs: number = 100): void {
    this.cancelRestore()
    this.restoreTimeout = setTimeout(() => {
      this.restoreClipboard()
      this.restoreTimeout = null
    }, delayMs)
  }

  /**
   * Cancels any scheduled clipboard restoration
   */
  cancelRestore(): void {
    if (this.restoreTimeout) {
      clearTimeout(this.restoreTimeout)
      this.restoreTimeout = null
    }
  }
}

// Export singleton instance
export const clipboardManager = new ClipboardManager()