import type {
  Config,
  RecordingAnalyticsSnapshot,
  RecordingHistoryItem,
  RecordingHistorySearchFilters,
  RecordingHistorySearchResult,
} from "./types"

export type ModuleInfo = {
  name: string
  path: string
  exports?: string[]
}

export type IpcProcedure = {
  name: string
  input?: string
  output?: string
  file: string
}

export type AppDataModel = {
  entities: {
    Config: string
    RecordingHistoryItem: string
    RecordingAnalyticsSnapshot: string
    AutoJournalSummary: string
  }
  modules: ModuleInfo[]
  ipc: IpcProcedure[]
  uiRoutes: string[]
  protocols: string[]
  dataPaths: {
    dataFolder: string
    recordingsFolder: string
    configPath: string
  }
}

export const DATA_MODEL: AppDataModel = {
  entities: {
    Config: "src/shared/types.ts:115",
    RecordingHistoryItem: "src/shared/types.ts:14",
    RecordingAnalyticsSnapshot: "src/shared/types.ts:74",
    AutoJournalSummary: "src/shared/types.ts:104",
  },
  modules: [
    { name: "main/index", path: "src/main/index.ts", exports: [] },
    { name: "main/tipc", path: "src/main/tipc.ts", exports: ["router"] },
    { name: "main/window", path: "src/main/window.ts", exports: ["WINDOWS", "createMainWindow", "createPanelWindow", "createSetupWindow", "showPanelWindow", "showPanelWindowAndStartRecording", "stopRecordingAndHidePanelWindow", "getWindowRendererHandlers", "makePanelWindowClosable"] },
    { name: "main/model-manager", path: "src/main/model-manager.ts", exports: ["ModelManager", "modelManager"] },
    { name: "main/keyboard", path: "src/main/keyboard.ts", exports: ["listenToKeyboardEvents", "writeText"] },
    { name: "main/config", path: "src/main/config.ts", exports: ["configStore", "dataFolder", "recordingsFolder", "configPath"] },
    { name: "main/llm", path: "src/main/llm.ts", exports: ["postProcessTranscript"] },
    { name: "main/tray", path: "src/main/tray.ts", exports: ["initTray", "updateTrayIcon"] },
    { name: "main/serve", path: "src/main/serve.ts", exports: ["registerServeSchema", "registerServeProtocol"] },
    { name: "renderer/tipc-client", path: "src/renderer/src/lib/tipc-client.ts", exports: ["tipcClient", "rendererHandlers"] },
    { name: "renderer/recorder", path: "src/renderer/src/lib/recorder.ts", exports: ["Recorder"] },
    { name: "shared/types", path: "src/shared/types.ts", exports: ["Config", "RecordingHistoryItem", "RecordingAnalyticsSnapshot", "RecordingHistorySearchFilters", "RecordingHistorySearchResult", "AutoJournalSummary", "AutoJournalActivity"] },
    { name: "main/history-store", path: "src/main/history-store.ts", exports: ["historyStore", "normalizeRecordingHistoryItem"] },
    { name: "main/history-analytics", path: "src/main/history-analytics.ts", exports: ["buildAnalyticsSnapshot", "runHistorySearch"] },
  ],
  ipc: [
    { name: "restartApp", file: "src/main/tipc.ts" },
    { name: "getUpdateInfo", file: "src/main/tipc.ts" },
    { name: "quitAndInstall", file: "src/main/tipc.ts" },
    { name: "checkForUpdatesAndDownload", file: "src/main/tipc.ts" },
    { name: "openMicrophoneInSystemPreferences", file: "src/main/tipc.ts" },
    { name: "openScreenRecordingInSystemPreferences", file: "src/main/tipc.ts" },
    { name: "hidePanelWindow", file: "src/main/tipc.ts" },
    { name: "showContextMenu", file: "src/main/tipc.ts", input: "{ x: number; y: number; selectedText?: string }" },
    { name: "getMicrophoneStatus", file: "src/main/tipc.ts", output: "string" },
    { name: "getScreenRecordingStatus", file: "src/main/tipc.ts", output: "string" },
    { name: "isAccessibilityGranted", file: "src/main/tipc.ts", output: "boolean" },
    { name: "requestAccessibilityAccess", file: "src/main/tipc.ts", output: "boolean" },
    { name: "requestMicrophoneAccess", file: "src/main/tipc.ts", output: "boolean" },
    { name: "requestScreenRecordingAccess", file: "src/main/tipc.ts", output: "boolean" },
    { name: "showPanelWindow", file: "src/main/tipc.ts" },
    { name: "displayError", file: "src/main/tipc.ts", input: "{ title?: string; message: string }" },
    { name: "createRecording", file: "src/main/tipc.ts", input: "{ recording: ArrayBuffer; duration: number; mimeType: string }" },
    { name: "cancelTranscription", file: "src/main/tipc.ts" },
    { name: "getRecordingHistory", file: "src/main/tipc.ts", output: "RecordingHistoryItem[]" },
    { name: "searchRecordingHistory", file: "src/main/tipc.ts", input: "RecordingHistorySearchFilters", output: "RecordingHistorySearchResult" },
    { name: "getRecordingAnalytics", file: "src/main/tipc.ts", output: "RecordingAnalyticsSnapshot" },
    { name: "captureRecordingScreenshot", file: "src/main/tipc.ts", output: "{ path: string; capturedAt: number }" },
    { name: "generateAutoJournalSummary", file: "src/main/tipc.ts", input: "{ windowMinutes?: number }", output: "AutoJournalSummary" },
    { name: "deleteRecordingItem", file: "src/main/tipc.ts", input: "{ id: string }" },
    { name: "updateRecordingItem", file: "src/main/tipc.ts", input: "{ id: string; patch: Partial<Pick<RecordingHistoryItem, 'tags' | 'accuracyScore' | 'confidenceScore'>> }", output: "RecordingHistoryItem | null" },
    { name: "deleteRecordingHistory", file: "src/main/tipc.ts" },
    { name: "listModels", file: "src/main/tipc.ts", output: "AnyModel[]" },
    { name: "listDownloadedModels", file: "src/main/tipc.ts", output: "LocalModel[]" },
    { name: "downloadModel", file: "src/main/tipc.ts", input: "{ modelId: string }" },
    { name: "deleteModel", file: "src/main/tipc.ts", input: "{ modelId: string }" },
    { name: "importLocalModel", file: "src/main/tipc.ts", input: "{ filePath: string }", output: "ImportedLocalModel" },
    { name: "showModelImportDialog", file: "src/main/tipc.ts", output: "string | null" },
    { name: "addCustomModel", file: "src/main/tipc.ts", input: "{ displayName: string; description: string; endpoint: string; modelIdentifier: string; language: 'english' | 'multilingual'; requiresApiKey: boolean }", output: "CustomModel" },
    { name: "setDefaultLocalModel", file: "src/main/tipc.ts", input: "{ modelId: string }" },
    { name: "getModelDownloadProgress", file: "src/main/tipc.ts", input: "{ modelId: string }", output: "DownloadProgress | null" },
    { name: "revealModelInFolder", file: "src/main/tipc.ts", input: "{ filePath: string }" },
    { name: "getConfig", file: "src/main/tipc.ts", output: "Config" },
    { name: "saveConfig", file: "src/main/tipc.ts", input: "{ config: Config }" },
    { name: "recordEvent", file: "src/main/tipc.ts", input: "{ type: 'start' | 'end' }" },
  ],
  uiRoutes: ["/", "/dashboard", "/settings", "/settings/about", "/settings/models", "/settings/data", "/setup", "/panel"],
  protocols: ["assets://app", "assets://recording", "assets://file"],
  dataPaths: {
    dataFolder: "app.getPath('appData')/<APP_ID>",
    recordingsFolder: "dataFolder/recordings",
    configPath: "dataFolder/config.json",
  },
}

export type { Config, RecordingHistoryItem }
