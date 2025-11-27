export const state = {
  isRecording: false,
  isTranscribing: false,
  lastTranscription: null as string | null,
  transcriptionAbortController: null as AbortController | null,
}

export const abortOngoingTranscription = () => {
  if (state.transcriptionAbortController) {
    state.transcriptionAbortController.abort()
    state.transcriptionAbortController = null
  }
}

/**
 * Reset all transcription-related state
 * Use after errors or cancellation to ensure clean state
 */
export const resetTranscriptionState = () => {
  console.log("[State] Resetting transcription state", {
    wasRecording: state.isRecording,
    wasTranscribing: state.isTranscribing,
  })
  state.isRecording = false
  state.isTranscribing = false
  state.transcriptionAbortController = null
}
