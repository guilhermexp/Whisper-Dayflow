import { BrowserWindow } from "electron"
import { WINDOWS } from "./window"

let escHintWindow: BrowserWindow | null = null
let hideTimer: NodeJS.Timeout | null = null

const HINT_WIDTH = 240
const HINT_HEIGHT = 30
const HIDE_DELAY = 1500

const createHintHtml = () => {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-radius: 15px;
      font-family: -apple-system, system-ui, sans-serif;
      color: white;
      font-size: 11px;
      font-weight: 500;
      padding: 0 12px;
      height: 100vh;
      overflow: hidden;
    }
  </style>
</head>
<body>Press ESC again to cancel</body>
</html>
  `)}`
}

export const showEscHintToast = () => {
  const panel = WINDOWS.get("panel")
  if (!panel) return

  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }

  if (!escHintWindow) {
    escHintWindow = new BrowserWindow({
      width: HINT_WIDTH,
      height: HINT_HEIGHT,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      resizable: false,
      movable: false,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    })
    escHintWindow.setIgnoreMouseEvents(true)
    escHintWindow.loadURL(createHintHtml())
    escHintWindow.on("closed", () => {
      escHintWindow = null
    })
  }

  const bounds = panel.getBounds()
  const x = Math.round(bounds.x + bounds.width / 2 - HINT_WIDTH / 2)
  const y = Math.round(bounds.y - HINT_HEIGHT - 12)
  escHintWindow.setPosition(x, y)
  escHintWindow.showInactive()

  hideTimer = setTimeout(() => {
    escHintWindow?.hide()
    hideTimer = null
  }, HIDE_DELAY)
}
