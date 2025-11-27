import { UpdateDownloadedEvent } from "electron-updater"

export type ErrorNotification = {
  type: "error" | "warning" | "info"
  title: string
  message: string
  code?: string
}

export type RendererHandlers = {
  startRecording: () => void
  finishRecording: () => void
  stopRecording: () => void
  startOrFinishRecording: () => void
  refreshRecordingHistory: () => void
  updateAvailable: (e: UpdateDownloadedEvent) => void
  navigate: (url: string) => void
  showNotification: (notification: ErrorNotification) => void
}
