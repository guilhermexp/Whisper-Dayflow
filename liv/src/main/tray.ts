import { Menu, Tray, MenuItemConstructorOptions } from "electron"
import path from "path"
import {
  getWindowRendererHandlers,
  showMainWindow,
  showPanelWindowAndStartRecording,
  stopRecordingAndHidePanelWindow,
} from "./window"
import { state } from "./state"
import { configStore } from "./config"
import {
  getScreenSessionRecordingStatus,
  stopScreenSessionRecording,
} from "./services/screen-session-recording-service"
import { STT_PROVIDERS, type LocalSTTProviderId } from "../shared"
import { PREDEFINED_LOCAL_MODELS } from "../shared/models/catalog"

const defaultIcon = path.join(__dirname, `../../resources/${process.env.IS_MAC ? 'trayIconTemplate.png' : 'trayIcon.ico'}`)
const stopIcon = path.join(
  __dirname,
  "../../resources/stopTrayIconTemplate.png",
)

const enhancementProviders: Array<{ id: "openai" | "groq" | "gemini" | "openrouter" | "custom", label: string }> = [
  { id: "openai", label: "OpenAI" },
  { id: "groq", label: "Groq" },
  { id: "gemini", label: "Gemini" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "custom", label: "Custom" },
]

const buildTranscriptionSubmenu = (): MenuItemConstructorOptions[] => {
  const config = configStore.get()
  const currentProviderId = config.sttProviderId ?? "openai"

  const submenu: MenuItemConstructorOptions[] = [
    {
      label: "Cloud Providers",
      enabled: false,
    },
  ]

  // Add cloud providers
  STT_PROVIDERS.forEach((provider) => {
    submenu.push({
      label: provider.label,
      type: "radio",
      checked: currentProviderId === provider.value,
      click() {
        configStore.save({
          ...config,
          sttProviderId: provider.value,
        })
      },
    })
  })

  submenu.push({ type: "separator" })
  submenu.push({
    label: "Local Models",
    enabled: false,
  })

  // Add local models
  PREDEFINED_LOCAL_MODELS.forEach((model) => {
    const localId = `local:${model.id}` as LocalSTTProviderId
    submenu.push({
      label: model.displayName,
      type: "radio",
      checked: currentProviderId === localId,
      click() {
        configStore.save({
          ...config,
          sttProviderId: localId,
          defaultLocalModel: model.id,
        })
      },
    })
  })

  return submenu
}

const buildEnhancementSubmenu = (): MenuItemConstructorOptions[] => {
  const config = configStore.get()
  const isEnabled = config.enhancementEnabled ?? false
  const currentProvider = config.enhancementProvider ?? "openai"

  const submenu: MenuItemConstructorOptions[] = [
    {
      label: isEnabled ? "Disable Enhancement" : "Enable Enhancement",
      type: "checkbox",
      checked: isEnabled,
      click() {
        configStore.save({
          ...config,
          enhancementEnabled: !isEnabled,
        })
      },
    },
    { type: "separator" },
  ]

  enhancementProviders.forEach((provider) => {
    submenu.push({
      label: provider.label,
      type: "radio",
      checked: currentProvider === provider.id,
      enabled: isEnabled,
      click() {
        configStore.save({
          ...config,
          enhancementProvider: provider.id,
        })
      },
    })
  })

  return submenu
}

const buildMenu = (tray: Tray) => {
  const screenSessionStatus = getScreenSessionRecordingStatus()
  const isVideoRecording = Boolean(screenSessionStatus.running)

  const template: MenuItemConstructorOptions[] = [
    {
      label: state.isRecording ? "Cancel Recording" : "Start Recording",
      async click() {
        if (state.isRecording) {
          state.isRecording = false
          tray.setImage(defaultIcon)
          await stopRecordingAndHidePanelWindow()
          return
        }
        state.isRecording = true
        tray.setImage(stopIcon)
        await showPanelWindowAndStartRecording()
      },
    },
    {
      label: "Open Liv",
      click() {
        showMainWindow("/")
      },
    },
    ...(isVideoRecording
      ? [
          {
            label: "Stop Video Recording",
            async click() {
              await stopScreenSessionRecording()
            },
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    {
      type: "separator",
    },
    {
      label: "Transcription",
      submenu: buildTranscriptionSubmenu(),
    },
    {
      label: "Enhancement",
      submenu: buildEnhancementSubmenu(),
    },
    {
      type: "separator",
    },
    {
      label: "History",
      click() {
        showMainWindow("/?dialog=analytics&tab=history")
      },
    },
    {
      label: "Settings",
      accelerator: "CmdOrCtrl+,",
      click() {
        showMainWindow("/")
      },
    },
    {
      type: "separator",
    },
    {
      role: "quit",
    },
  ]

  return Menu.buildFromTemplate(template)
}

let _tray: Tray | undefined

export const updateTrayIcon = () => {
  if (!_tray) return

  _tray.setImage(state.isRecording ? stopIcon : defaultIcon)
}

export const initTray = () => {
  const tray = (_tray = new Tray(defaultIcon))

  tray.on("click", () => {
    if (state.isRecording) {
      getWindowRendererHandlers("panel")?.finishRecording.send()
      return
    }

    tray.popUpContextMenu(buildMenu(tray))
  })

  tray.on("right-click", () => {
    tray.popUpContextMenu(buildMenu(tray))
  })
}
