import { globalShortcut, dialog, clipboard } from 'electron'
import { state } from './state'
import { writeText } from './keyboard'

export class GlobalShortcutManager {
  private isRegistered: boolean = false

  /**
   * Registers the Ctrl+V global shortcut for pasting last transcription
   */
  registerPasteLastTranscription(): boolean {
    try {
      // Unregister if already registered
      if (this.isRegistered) {
        this.unregisterAll()
      }

      const success = globalShortcut.register('Control+V', () => {
        this.handlePasteLastTranscription()
      })

      if (success) {
        this.isRegistered = true
        console.log('Successfully registered Ctrl+V global shortcut')
        return true
      } else {
        console.error('Failed to register Ctrl+V global shortcut')
        return false
      }
    } catch (error) {
      console.error('Error registering global shortcut:', error)
      return false
    }
  }

  /**
   * Handles the paste last transcription action
   */
  async handlePasteLastTranscription(): Promise<void> {
    try {
      const transcript = state.lastTranscription
      if (!transcript || transcript.trim() === '') {
        await dialog.showMessageBox({
          type: 'info',
          title: 'No Transcription Available',
          message: 'No transcription available to paste.',
          buttons: ['OK']
        })
        return
      }

      // Delay to allow modifier keys to be released
      setTimeout(async () => {
        try {
          // Use writeText to type the transcription directly
          await writeText(transcript)
        } catch (error) {
          console.error('[GlobalShortcut] Error during writeText:', error)
          await dialog.showErrorBox(
            'Paste Error',
            'Failed to paste the last transcription. Please try again.'
          )
        }
      }, 150)
    } catch (error) {
      console.error('[GlobalShortcut] Error in handlePasteLastTranscription:', error)
      await dialog.showErrorBox(
        'Paste Error',
        'Failed to paste the last transcription. Please try again.'
      )
    }
  }

  /**
   * Unregisters all global shortcuts
   */
  unregisterAll(): void {
    try {
      globalShortcut.unregisterAll()
      this.isRegistered = false
      console.log('Unregistered all global shortcuts')
    } catch (error) {
      console.error('Error unregistering global shortcuts:', error)
    }
  }
}

// Export singleton instance
export const globalShortcutManager = new GlobalShortcutManager()
