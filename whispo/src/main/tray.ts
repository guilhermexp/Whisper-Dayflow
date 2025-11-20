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

const buildMenu = (tray: Tray) =>
  Menu.buildFromTemplate([
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
      label: "Open Pile",
      click() {
        showMainWindow("/")
      },
    },
    {
      type: "separator",
    },
    {
      label: "Enhancement",
      submenu: buildEnhancementSubmenu(),
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
  ])

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
