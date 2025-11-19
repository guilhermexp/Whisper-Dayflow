import {
  getWindowRendererHandlers,
  showPanelWindowAndStartRecording,
  stopRecordingAndHidePanelWindow,
  WINDOWS,
} from "./window"
import { systemPreferences, shell } from "electron"
import { configStore } from "./config"
import { abortOngoingTranscription, state } from "./state"
import { showEscHintToast } from "./hint-window"
import { spawn } from "child_process"
import { WHISPO_RS_BINARY_PATH } from "./native-binary"

export const openAccessibilitySettings = async () => {
  if (process.env.IS_MAC) {
    // Open System Preferences to Accessibility pane
    await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
  }
}

type RdevEvent = {
  event_type: "KeyPress" | "KeyRelease"
  data: {
    key: "ControlLeft" | "BackSlash" | string
  }
  time: {
    secs_since_epoch: number
  }
}

export const writeText = (text: string) => {
  return new Promise<void>((resolve, reject) => {
    // Check accessibility permissions on macOS
    if (process.env.IS_MAC) {
      if (!systemPreferences.isTrustedAccessibilityClient(false)) {
        const error = new Error(
          "O Whispo precisa de permissão de Acessibilidade para colar o texto automaticamente.\n\nClique em 'Abrir Configurações' para permitir.",
        )
        error.name = "AccessibilityPermissionError"
        reject(error)
        return
      }
    }

    const child = spawn(WHISPO_RS_BINARY_PATH, ["write", text])

    child.stdout.on("data", (data) => {
      console.log(`stdout: ${data}`)
    })

    child.stderr.on("data", (data) => {
      console.error(`stderr: ${data}`)
    })

    child.on("close", (code) => {
      // WORKAROUND: The whispo-rs writeText operation triggers spurious KeyPress
      // events (particularly 'A' key) after text simulation completes. This appears
      // to be a side effect of the text simulation process in the Rust binary.
      // Clearing the keysPressed map prevents these phantom key events from
      // interfering with subsequent recording operations.
      // TODO: Investigate root cause in whispo-rs text simulation logic
      keysPressed.clear()

      if (code === 0) {
        resolve()
      } else if (code === null) {
        const error = new Error(
          "O Whispo precisa de permissão de Acessibilidade para colar o texto automaticamente.\n\nClique em 'Abrir Configurações' para permitir.",
        )
        error.name = "AccessibilityPermissionError"
        reject(error)
      } else {
        reject(new Error(`Erro ao colar texto (código ${code})`))
      }
    })
  })
}

const parseEvent = (event: any) => {
  try {
    const e = JSON.parse(String(event))
    e.data = JSON.parse(e.data)
    return e as RdevEvent
  } catch {
    return null
  }
}

// keys that are currently pressed down without releasing
// excluding ctrl
// when other keys are pressed, pressing ctrl will not start recording
const keysPressed = new Map<string, number>()

const hasRecentKeyPress = () => {
  if (keysPressed.size === 0) return false

  const now = Date.now() / 1000
  return [...keysPressed.values()].some((time) => {
    // 10 seconds
    // for some weird reasons sometime KeyRelease event is missing for some keys
    // so they stay in the map
    // therefore we have to check if the key was pressed in the last 10 seconds
    return now - time < 10
  })
}

export function listenToKeyboardEvents() {
  let isHoldingShortcutKey = false
  let startRecordingTimer: NodeJS.Timeout | undefined
  let isPressedCtrlKey = false
  let escHintTimer: NodeJS.Timeout | undefined
  let isEscPrimed = false
  const ESC_DOUBLE_PRESS_THRESHOLD = 1500

  if (process.env.IS_MAC) {
    if (!systemPreferences.isTrustedAccessibilityClient(false)) {
      return
    }
  }

  const cancelRecordingTimer = () => {
    if (startRecordingTimer) {
      clearTimeout(startRecordingTimer)
      startRecordingTimer = undefined
    }
  }

  const handleEvent = async (e: RdevEvent) => {
    if (e.event_type === "KeyPress") {
      const shortcut = configStore.get().shortcut || "hold-ctrl"
      const isFnShortcut = shortcut === "fn-key"

      if (e.data.key === "ControlLeft" && !isFnShortcut) {
        isPressedCtrlKey = true
      }

      if (e.data.key === "Escape") {
        if (state.isRecording || state.isTranscribing) {
          if (isEscPrimed) {
            isEscPrimed = false
            if (escHintTimer) {
              clearTimeout(escHintTimer)
              escHintTimer = undefined
            }

            if (state.isRecording) {
              await stopRecordingAndHidePanelWindow()
            } else if (state.isTranscribing) {
              abortOngoingTranscription()
              WINDOWS.get("panel")?.hide()
            }
          } else {
            isEscPrimed = true
            showEscHintToast()
            escHintTimer = setTimeout(() => {
              isEscPrimed = false
              escHintTimer = undefined
            }, ESC_DOUBLE_PRESS_THRESHOLD)
          }
          return
        }
      }

      const isShortcutKey = (key: string) => {
        if (isFnShortcut) {
          return key === "Function"
        }
        return key === "ControlLeft"
      }

      if (shortcut === "ctrl-slash") {
        if (e.data.key === "Slash" && isPressedCtrlKey) {
          getWindowRendererHandlers("panel")?.startOrFinishRecording.send()
        }
      } else {
        if (isShortcutKey(e.data.key)) {
          if (hasRecentKeyPress()) {
            console.log("ignore ctrl because other keys are pressed", [
              ...keysPressed.keys(),
            ])
            return
          }

          if (shortcut === "instant-ctrl" || shortcut === "fn-key") {
            if (isHoldingShortcutKey) return

            isHoldingShortcutKey = true
            console.log("start recording (instant)")
            showPanelWindowAndStartRecording()
            return
          }

          if (startRecordingTimer) {
            // console.log('already started recording timer')
            return
          }

          startRecordingTimer = setTimeout(() => {
            isHoldingShortcutKey = true

            console.log("start recording")

            showPanelWindowAndStartRecording()
          }, 800)
        } else {
          keysPressed.set(e.data.key, e.time.secs_since_epoch)
          cancelRecordingTimer()

          // when holding ctrl key, pressing any other key will stop recording
          if (isHoldingShortcutKey) {
            await stopRecordingAndHidePanelWindow()
          }

          isHoldingShortcutKey = false
        }
      }
    } else if (e.event_type === "KeyRelease") {
      keysPressed.delete(e.data.key)

      const shortcut = configStore.get().shortcut || "hold-ctrl"
      const isFnShortcut = shortcut === "fn-key"

      if (e.data.key === "ControlLeft" && !isFnShortcut) {
        isPressedCtrlKey = false
      }

      if (shortcut === "ctrl-slash") return

      cancelRecordingTimer()

      const isShortcutKey = (key: string) => {
        if (shortcut === "fn-key") {
          return key === "Function"
        }
        return key === "ControlLeft"
      }

      if (isShortcutKey(e.data.key)) {
        console.log("release ctrl")
        if (isHoldingShortcutKey) {
          getWindowRendererHandlers("panel")?.finishRecording.send()
        } else {
          await stopRecordingAndHidePanelWindow()
        }

        isHoldingShortcutKey = false
      }
    }
  }

  const child = spawn(WHISPO_RS_BINARY_PATH, ["listen"], {})

  child.stdout.on("data", (data) => {
    const event = parseEvent(data)
    if (!event) return

    // Log only relevant shortcut keys in dev mode
    if (import.meta.env.DEV) {
      const relevantKeys = ["ControlLeft", "Function", "Escape", "Slash"]
      if (relevantKeys.includes(event.data.key)) {
        console.log(`[Keyboard] ${event.event_type}: ${event.data.key}`)
      }
    }

    handleEvent(event)
  })
}
