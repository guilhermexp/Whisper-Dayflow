// IMPORTANT: Logger must be imported first to catch early crashes
import { logger, getLogFilePath } from "./logger"

// Import performance monitor early to track startup timing
import { markPhase } from "./performance-monitor"

import { app, Menu } from "electron"
import path from "path"
import { electronApp, optimizer } from "@electron-toolkit/utils"
import {
  createMainWindow,
  createPanelWindow,
  createSetupWindow,
  makePanelWindowClosable,
  WINDOWS,
} from "./window"
import { listenToKeyboardEvents } from "./keyboard"
import { registerIpcMain } from "@egoist/tipc/main"
import { router } from "./tipc"
import { registerServeProtocol, registerServeSchema } from "./serve"
import { createAppMenu } from "./menu"
import { initTray } from "./tray"
import { isAccessibilityGranted } from "./utils"
import { globalShortcutManager } from "./global-shortcut"
import { mediaController } from "./services/media-controller"
import { configStore } from "./config"
import { startAutoJournalScheduler } from "./services/auto-journal-service"
import { startPeriodicScreenshotScheduler } from "./services/periodic-screenshot-service"
import { ipcMain } from "electron"
import { warmupParakeetModel } from "./local-transcriber"

// Configure library paths for sherpa-onnx native bindings
const configureSherpaLibraryPaths = () => {
  try {
    const platform = process.platform
    const arch = process.arch
    const platformArch =
      platform === "win32" ? `win-${arch}` : `${platform}-${arch}`

    let sherpaLibPath = ""

    if (app.isPackaged) {
      // Production: use unpacked node_modules
      const nodeModulesPath = path.join(
        process.resourcesPath,
        "app.asar.unpacked",
        "node_modules",
      )
      sherpaLibPath = path.join(nodeModulesPath, `sherpa-onnx-${platformArch}`)
    } else {
      // Development: use pnpm structure - need to find the actual path
      const fs = require("fs")
      const baseNodeModules = path.join(__dirname, "..", "..", "node_modules")

      // First try direct path (for non-pnpm or hoisted)
      const directPath = path.join(
        baseNodeModules,
        `sherpa-onnx-${platformArch}`,
      )

      if (fs.existsSync(directPath)) {
        // Check if it's a symlink and resolve it
        const realPath = fs.realpathSync(directPath)
        sherpaLibPath = realPath
      } else {
        // Fallback to pnpm .pnpm structure
        const pnpmPath = path.join(
          baseNodeModules,
          ".pnpm",
          `sherpa-onnx-${platformArch}@1.12.17`,
          "node_modules",
          `sherpa-onnx-${platformArch}`,
        )
        if (fs.existsSync(pnpmPath)) {
          sherpaLibPath = pnpmPath
        }
      }
    }

    if (sherpaLibPath) {
      if (platform === "darwin") {
        const current = process.env.DYLD_LIBRARY_PATH || ""
        process.env.DYLD_LIBRARY_PATH = current
          ? `${sherpaLibPath}:${current}`
          : sherpaLibPath
        logger.info(`[sherpa] Set DYLD_LIBRARY_PATH: ${sherpaLibPath}`)
      } else if (platform === "linux") {
        const current = process.env.LD_LIBRARY_PATH || ""
        process.env.LD_LIBRARY_PATH = current
          ? `${sherpaLibPath}:${current}`
          : sherpaLibPath
        logger.info(`[sherpa] Set LD_LIBRARY_PATH: ${sherpaLibPath}`)
      } else if (platform === "win32") {
        const current = process.env.PATH || ""
        process.env.PATH = `${sherpaLibPath};${current}`
        logger.info(`[sherpa] Added to PATH: ${sherpaLibPath}`)
      }
    } else {
      logger.warn(
        `[sherpa] Could not find sherpa-onnx-${platformArch} library path`,
      )
    }
  } catch (error) {
    logger.warn("[sherpa] Failed to configure library paths:", error)
  }
}

// Configure sherpa paths before app is ready
configureSherpaLibraryPaths()

// Register Pile IPC handlers
import "./pile-ipc"

registerServeSchema()

// Mark pre-ready initialization complete
markPhase("pre-ready-complete")

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  markPhase("app-ready")

  // Set app user model id for windows
  electronApp.setAppUserModelId(process.env.APP_ID)

  const accessibilityGranted = isAccessibilityGranted()

  Menu.setApplicationMenu(createAppMenu())

  registerIpcMain(router)

  // Timer window IPC handlers
  ipcMain.on("hide-timer-window", () => {
    import("./window").then(({ hideTimerWindow }) => {
      hideTimerWindow()
    })
  })

  ipcMain.on("timer-finished", () => {
    import("./window").then(({ hideTimerWindow }) => {
      hideTimerWindow()
    })
  })

  registerServeProtocol()

  markPhase("protocols-registered")

  if (accessibilityGranted) {
    createMainWindow()
  } else {
    createSetupWindow()
  }

  createPanelWindow()

  markPhase("windows-created")

  logger.info("[App] About to start keyboard listener...")
  listenToKeyboardEvents()
  logger.info("[App] Keyboard listener started")

  markPhase("keyboard-listener-ready")

  initTray()

  markPhase("tray-initialized")

  // Initialize global shortcuts
  const shortcutSuccess = globalShortcutManager.registerPasteLastTranscription()
  if (shortcutSuccess) {
    logger.info("Global shortcuts initialized successfully")
  } else {
    logger.error("Failed to initialize global shortcuts")
  }

  markPhase("shortcuts-registered")

  // Initialize media controller
  const config = configStore.get()
  mediaController.setEnabled(config.isPauseMediaEnabled ?? false)
  logger.info(
    "[MediaController] Initialized, enabled:",
    mediaController.isEnabled(),
  )

  markPhase("media-controller-ready")

  // Defer model warmup until after window is shown for faster startup
  const performDeferredModelWarmup = () => {
    const defaultLocalModel = config.defaultLocalModel
    if (defaultLocalModel?.startsWith("local-parakeet")) {
      logger.info("[ModelWarmup] Starting deferred model warmup...")
      void warmupParakeetModel(defaultLocalModel, config.localInferenceThreads)
      markPhase("model-warmup-started")
    }
  }

  // Defer schedulers initialization until after window is shown for faster startup
  const performDeferredSchedulersInit = () => {
    logger.info("[Schedulers] Starting deferred schedulers initialization...")

    // Auto-journal scheduler (manual runs still available via IPC)
    startAutoJournalScheduler()

    // Periodic screenshot scheduler (independent of recordings)
    startPeriodicScreenshotScheduler()

    markPhase("schedulers-started")
  }

  // Set up one-time deferred initialization after window is shown
  const primaryWindow = WINDOWS.get("main") || WINDOWS.get("setup")
  if (primaryWindow) {
    primaryWindow.once("show", () => {
      // Defer warmup and schedulers slightly to ensure window is fully rendered
      setTimeout(performDeferredModelWarmup, 100)
      setTimeout(performDeferredSchedulersInit, 150)
    })
  }

  // Verify bundled ffmpeg for auto-journal GIF generation
  import("./services/auto-journal-service").then(({ checkFfmpegAvailability }) => {
    checkFfmpegAvailability().then((available) => {
      if (!available) {
        logger.error(
          "[ffmpeg] Bundled binary verification failed!",
          "Auto-journal GIF previews will be unavailable."
        )
      } else {
        logger.info("[ffmpeg] Bundled binary verified - GIF previews enabled for auto-journal")
      }
    }).catch((err) => logger.error("[ffmpeg] Verification failed:", err))
  }).catch((err) => logger.error("[ffmpeg] Import failed:", err))

  import("./updater").then((res) => res.init()).catch((err) => logger.error("[updater] Init failed:", err))

  markPhase("background-services-started")

  // Mark startup complete - app is now fully ready
  markPhase("startup-complete")

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  app.on("activate", function () {
    if (accessibilityGranted) {
      if (!WINDOWS.get("main")) {
        createMainWindow()
      }
    } else {
      if (!WINDOWS.get("setup")) {
        createSetupWindow()
      }
    }
  })

  app.on("before-quit", () => {
    makePanelWindowClosable()
  })

  app.on("will-quit", () => {
    globalShortcutManager.unregisterAll()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
