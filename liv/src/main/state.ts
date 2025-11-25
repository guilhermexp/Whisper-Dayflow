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
