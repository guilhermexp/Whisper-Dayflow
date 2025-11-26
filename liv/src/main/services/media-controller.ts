import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

/**
 * Controls system audio management during recording
 * Mutes system audio when recording starts and unmutes when recording stops
 *
 * Based on VoiceInk's MediaController implementation
 */
class MediaController {
  private didMuteAudio = false
  private wasAudioMutedBeforeRecording = false
  private enabled = false

  /**
   * Enable or disable the media control feature
   */
  setEnabled(enabled: boolean) {
    this.enabled = enabled
  }

  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Checks if the system audio is currently muted using AppleScript
   */
  private async isSystemAudioMuted(): Promise<boolean> {
    if (process.platform !== "darwin") {
      return false
    }

    try {
      const { stdout } = await execAsync(
        'osascript -e "output muted of (get volume settings)"'
      )
      const trimmed = stdout.trim()
      const isMuted = trimmed === "true"
      console.log("[MediaController] isSystemAudioMuted check - stdout:", JSON.stringify(trimmed), "isMuted:", isMuted)
      return isMuted
    } catch (error) {
      console.error("[MediaController] Failed to check mute status:", error)
      return false
    }
  }

  /**
   * Mutes system audio during recording
   * Always mutes if feature is enabled (saves previous state for restore)
   */
  async muteSystemAudio(): Promise<boolean> {
    console.log("[MediaController] muteSystemAudio called", {
      enabled: this.enabled,
      platform: process.platform
    })

    if (!this.enabled || process.platform !== "darwin") {
      console.log("[MediaController] Skipping mute - disabled or wrong platform")
      return false
    }

    try {
      // Only mute if audio is currently unmuted; otherwise skip to avoid stacking
      this.wasAudioMutedBeforeRecording = await this.isSystemAudioMuted()
      console.log("[MediaController] Audio was muted before recording:", this.wasAudioMutedBeforeRecording)

      if (this.wasAudioMutedBeforeRecording) {
        this.didMuteAudio = false
        console.log("[MediaController] Skipping mute: already muted")
        return true
      }

      console.log("[MediaController] Executing mute command...")
      const { stderr } = await execAsync(
        'osascript -e "set volume with output muted"'
      )

      if (stderr) {
        console.error("[MediaController] Mute error:", stderr)
        return false
      }

      // Mark that we executed the mute command
      this.didMuteAudio = true
      console.log("[MediaController] ✅ System audio muted successfully, didMuteAudio =", this.didMuteAudio)
      return true
    } catch (error) {
      console.error("[MediaController] Failed to mute:", error)
      return false
    }
  }

  /**
   * Restores system audio after recording
   * Only unmutes if we actually muted it (and it wasn't already muted)
   * IMPORTANT: Always tries to unmute if we muted, regardless of enabled state
   */
  async unmuteSystemAudio(): Promise<void> {
    console.log("[MediaController] unmuteSystemAudio called", {
      enabled: this.enabled,
      platform: process.platform,
      didMuteAudio: this.didMuteAudio,
      wasAudioMutedBeforeRecording: this.wasAudioMutedBeforeRecording
    })

    if (process.platform !== "darwin") {
      console.log("[MediaController] Skipping unmute - wrong platform")
      return
    }

    try {
      // Only unmute if we actually muted it (and it wasn't already muted)
      // NOTE: We check didMuteAudio regardless of enabled state to ensure we restore audio
      if (this.didMuteAudio && !this.wasAudioMutedBeforeRecording) {
        console.log("[MediaController] Executing unmute command...")
        const { stderr } = await execAsync(
          'osascript -e "set volume without output muted"'
        )

        if (stderr) {
          console.error("[MediaController] Unmute error:", stderr)
        } else {
          console.log("[MediaController] ✅ System audio unmuted successfully")
        }
      } else {
        console.log("[MediaController] Skipping unmute - didMuteAudio:", this.didMuteAudio, "wasAudioMutedBeforeRecording:", this.wasAudioMutedBeforeRecording)
      }

      // Reset state
      this.didMuteAudio = false
      this.wasAudioMutedBeforeRecording = false
    } catch (error) {
      console.error("[MediaController] Failed to unmute:", error)
    }
  }
}

export const mediaController = new MediaController()
