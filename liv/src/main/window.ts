import {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  shell,
  screen,
  app,
} from "electron"
import path from "path"
import { getRendererHandlers } from "@egoist/tipc/main"
import {
  makeKeyWindow,
  makePanel,
  makeWindow,
} from "@egoist/electron-panel-window"
import { RendererHandlers } from "./renderer-handlers"
import { configStore } from "./config"
import { mediaController } from "./services/media-controller"
import { logger } from "./logger"

const isMacOS = process.platform === "darwin"

type WINDOW_ID = "main" | "panel" | "setup" | "timer"

export const WINDOWS = new Map<WINDOW_ID, BrowserWindow>()

function createBaseWindow({
  id,
  url,
  showWhenReady = true,
  windowOptions,
}: {
  id: WINDOW_ID
  url?: string
  showWhenReady?: boolean
  windowOptions?: BrowserWindowConstructorOptions
}) {
  // Get screen dimensions for centering
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

  // Default window size - larger for better UX
  const defaultWidth = Math.min(1200, Math.floor(screenWidth * 0.8))
  const defaultHeight = Math.min(800, Math.floor(screenHeight * 0.85))

  // Center position
  const defaultX = Math.floor((screenWidth - defaultWidth) / 2)
  const defaultY = Math.floor((screenHeight - defaultHeight) / 2)

  // Create the browser window.
  const win = new BrowserWindow({
    width: defaultWidth,
    height: defaultHeight,
    x: defaultX,
    y: defaultY,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    ...windowOptions,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      ...windowOptions?.webPreferences,
    },
  })

  WINDOWS.set(id, win)

  if (showWhenReady) {
    win.on("ready-to-show", () => {
      win.show()
    })
  }

  win.on("close", () => {
    logger.info(`[Window] Window "${id}" closed`)
    WINDOWS.delete(id)
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: "deny" }
  })

  const baseUrl = import.meta.env.PROD
    ? "assets://app"
    : process.env["ELECTRON_RENDERER_URL"]

  win.loadURL(`${baseUrl}${url || ""}`)

  return win
}

export function createMainWindow({ url }: { url?: string } = {}) {
  const win = createBaseWindow({
    id: "main",
    url,
    windowOptions: {
      titleBarStyle: "hiddenInset",
    },
  })

  if (isMacOS && app.dock) {
    win.on("close", () => {
      const hideDockIcon = configStore.get().hideDockIcon
      logger.info(`[Window] Main window closed. hideDockIcon=${hideDockIcon}`)
      if (hideDockIcon) {
        logger.info("[Window] Hiding dock icon (setActivationPolicy: accessory)")
        app.setActivationPolicy("accessory")
        app.dock?.hide()
      }
    })

    win.on("show", () => {
      const hideDockIcon = configStore.get().hideDockIcon
      const dockVisible = app.dock?.isVisible()
      logger.info(`[Window] Main window shown. hideDockIcon=${hideDockIcon}, dockVisible=${dockVisible}`)
      if (hideDockIcon && !dockVisible) {
        logger.info("[Window] Showing dock icon temporarily")
        app.dock?.show()
      }
    })
  }

  return win
}

export function createSetupWindow() {
  const win = createBaseWindow({
    id: "setup",
    url: "/setup",
    windowOptions: {
      titleBarStyle: "hiddenInset",
      width: 800,
      height: 600,
      resizable: false,
    },
  })

  return win
}

export function showMainWindow(url?: string) {
  const win = WINDOWS.get("main")

  if (win && !win.isDestroyed()) {
    win.show()
    if (url) {
      getRendererHandlers<RendererHandlers>(win.webContents).navigate.send(url)
    }
  } else {
    createMainWindow({ url })
  }
}

const panelWindowSize = {
  width: 200,
  height: 36,
}

const getPanelWindowPosition = () => {
  // position the window bottom center
  const currentScreen = screen.getDisplayNearestPoint(
    screen.getCursorScreenPoint(),
  )
  const screenSize = currentScreen.workArea
  const position = {
    x: Math.floor(
      screenSize.x + (screenSize.width - panelWindowSize.width) / 2,
    ),
    y: screenSize.y + screenSize.height - panelWindowSize.height - 60,
  }

  return position
}

export function createPanelWindow() {
  const position = getPanelWindowPosition()

  const win = createBaseWindow({
    id: "panel",
    url: "/panel",
    showWhenReady: false,
    windowOptions: {
      hiddenInMissionControl: true,
      skipTaskbar: true,
      closable: false,
      maximizable: false,
      frame: false,
      // transparent: true,
      paintWhenInitiallyHidden: true,
      // hasShadow: false,
      width: panelWindowSize.width,
      height: panelWindowSize.height,
      maxWidth: panelWindowSize.width,
      maxHeight: panelWindowSize.height,
      minWidth: panelWindowSize.width,
      minHeight: panelWindowSize.height,
      visualEffectState: "active",
      vibrancy: "under-window",
      alwaysOnTop: true,
      x: position.x,
      y: position.y,
    },
  })

  win.on("hide", () => {
    if (!win.isDestroyed()) {
      getRendererHandlers<RendererHandlers>(
        win.webContents,
      ).stopRecording.send()
    }
  })

  makePanel(win)

  return win
}

export function showPanelWindow() {
  let win = WINDOWS.get("panel")

  // Create panel window lazily on first use
  if (!win || win.isDestroyed()) {
    logger.info("[Window] Creating panel window on-demand")
    win = createPanelWindow()
  }

  const position = getPanelWindowPosition()
  win.setPosition(position.x, position.y)
  win.showInactive()
  makeKeyWindow(win)
}

export async function showPanelWindowAndStartRecording() {
  showPanelWindow()

  // Mute system audio if enabled
  console.log("[Window] Calling mediaController.muteSystemAudio()")
  try {
    await mediaController.muteSystemAudio()
  } catch (error) {
    console.warn("[Window] muteSystemAudio failed, continuing anyway", error)
  }

  getWindowRendererHandlers("panel")?.startRecording.send()
}

export function makePanelWindowClosable() {
  const panel = WINDOWS.get("panel")
  if (panel && !panel.isClosable()) {
    makeWindow(panel)
    panel.setClosable(true)
  }
}

export const getWindowRendererHandlers = (id: WINDOW_ID) => {
  const win = WINDOWS.get(id)
  if (!win) return
  return getRendererHandlers<RendererHandlers>(win.webContents)
}

export const stopRecordingAndHidePanelWindow = async () => {
  const win = WINDOWS.get("panel")
  if (win && !win.isDestroyed()) {
    getRendererHandlers<RendererHandlers>(win.webContents).stopRecording.send()

    if (win.isVisible()) {
      win.hide()
    }
  }

  // Unmute system audio if we muted it
  console.log("[Window] Calling mediaController.unmuteSystemAudio()")
  await mediaController.unmuteSystemAudio()
  console.log("[Window] mediaController.unmuteSystemAudio() completed")
}

// Timer floating window
const timerWindowSize = {
  width: 280,
  height: 44,
}

const getTimerWindowPosition = () => {
  // Position near the notch (top center of screen)
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth } = primaryDisplay.workAreaSize
  const { y: workAreaY } = primaryDisplay.workArea

  return {
    x: Math.floor((screenWidth - timerWindowSize.width) / 2),
    y: workAreaY + 8, // 8px from top of work area (below menu bar/notch)
  }
}

export function createTimerWindow() {
  const existing = WINDOWS.get("timer")
  if (existing && !existing.isDestroyed()) {
    return existing
  }

  const position = getTimerWindowPosition()

  const win = createBaseWindow({
    id: "timer",
    url: "/timer-float",
    showWhenReady: false,
    windowOptions: {
      hiddenInMissionControl: true,
      skipTaskbar: true,
      closable: true,
      maximizable: false,
      minimizable: false,
      resizable: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      paintWhenInitiallyHidden: true,
      alwaysOnTop: true,
      width: timerWindowSize.width,
      height: timerWindowSize.height,
      maxWidth: timerWindowSize.width,
      maxHeight: timerWindowSize.height,
      minWidth: timerWindowSize.width,
      minHeight: timerWindowSize.height,
      x: position.x,
      y: position.y,
      roundedCorners: false,
    },
  })

  // Make visible on all workspaces/spaces on macOS
  if (isMacOS) {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  return win
}

export function showTimerWindow() {
  let win = WINDOWS.get("timer")

  if (!win || win.isDestroyed()) {
    win = createTimerWindow()
  }

  const position = getTimerWindowPosition()
  win.setPosition(position.x, position.y)
  win.showInactive()

  logger.info("[Window] Timer window shown")
}

export function hideTimerWindow() {
  const win = WINDOWS.get("timer")
  if (win && !win.isDestroyed() && win.isVisible()) {
    win.hide()
    logger.info("[Window] Timer window hidden")
  }
}

export function isTimerWindowVisible(): boolean {
  const win = WINDOWS.get("timer")
  return win ? !win.isDestroyed() && win.isVisible() : false
}
