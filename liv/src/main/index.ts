// IMPORTANT: Logger must be imported first to catch early crashes
import { logger, getLogFilePath } from "./logger"

// Import performance monitor early to track startup timing
import { markPhase } from "./performance-monitor"

import { app, Menu } from "electron"
import path from "path"
import { electronApp, optimizer } from "@electron-toolkit/utils"
import settings from "electron-settings"
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
import { isAccessibilityGranted } from "./utils"
import { globalShortcutManager } from "./global-shortcut"
import { mediaController } from "./services/media-controller"
import { configStore } from "./config"
import { startAutoJournalScheduler } from "./services/auto-journal-service"
import { startPeriodicScreenshotScheduler } from "./services/periodic-screenshot-service"
import {
  stopScreenSessionRecording,
  syncScreenSessionRecordingWithConfig,
} from "./services/screen-session-recording-service"
import {
  ensureDefaultOllamaEmbeddingSetup,
  DEFAULT_RAG_EMBEDDING_MODEL,
} from "./services/ollama-embedding-service"
import { shutdownAutonomousMemory } from "./services/autonomous-memory-service"
import { setGeminiKey, getGeminiKey, setGroqKey, getGroqKey, setDeepgramKey, getDeepgramKey, setCustomKey, getCustomKey } from "./pile-utils/store"
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

  // Panel window is created lazily on first use for faster startup

  markPhase("windows-created")

  logger.info("[App] About to start keyboard listener...")
  listenToKeyboardEvents()
  logger.info("[App] Keyboard listener started")

  markPhase("keyboard-listener-ready")

  // Initialize global shortcuts
  const shortcutSuccess = globalShortcutManager.registerPasteLastTranscription()
  if (shortcutSuccess) {
    logger.info("Global shortcuts initialized successfully")
  } else {
    logger.error("Failed to initialize global shortcuts")
  }

  markPhase("shortcuts-registered")

  // Migrate plain-text API keys to encrypted storage
  const migrateApiKeysToEncryptedStore = async () => {
    const cfg = configStore.get()
    const migrations: Array<{ label: string; plainKey: string | undefined; getter: () => Promise<string | null>; setter: (k: string) => Promise<boolean>; configField: string }> = [
      { label: "Gemini", plainKey: cfg.geminiApiKey, getter: getGeminiKey, setter: setGeminiKey, configField: "geminiApiKey" },
      { label: "Groq", plainKey: cfg.groqApiKey, getter: getGroqKey, setter: setGroqKey, configField: "groqApiKey" },
      { label: "Deepgram", plainKey: cfg.deepgramApiKey, getter: getDeepgramKey, setter: setDeepgramKey, configField: "deepgramApiKey" },
      { label: "Custom", plainKey: cfg.customEnhancementApiKey, getter: getCustomKey, setter: setCustomKey, configField: "customEnhancementApiKey" },
    ]

    for (const m of migrations) {
      if (m.plainKey && m.plainKey.trim()) {
        const existing = await m.getter()
        if (!existing) {
          const ok = await m.setter(m.plainKey.trim())
          if (ok) {
            logger.info(`[KeyMigration] Migrated ${m.label} key to encrypted store`)
            configStore.save({ [m.configField]: "" } as any)
          }
        }
      }
    }
  }
  migrateApiKeysToEncryptedStore().catch((err) => logger.error("[KeyMigration] Failed:", err))

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

    // Auto-journal scheduler (skip if nanobot cron handles it)
    const cfg = configStore.get()
    if (cfg.nanobotEnabled) {
      logger.info("[Schedulers] Nanobot enabled — skipping auto-journal setInterval (nanobot cron handles it)")
    } else {
      startAutoJournalScheduler()
    }

    // Periodic screenshot scheduler (independent of recordings)
    startPeriodicScreenshotScheduler()

    // Continuous screen session recording (timelapse) based on config
    void syncScreenSessionRecordingWithConfig()

    markPhase("schedulers-started")
  }

  // Defer FFmpeg verification until after window is shown for faster startup
  const performDeferredFfmpegVerification = () => {
    logger.info("[FFmpeg] Starting deferred FFmpeg verification...")

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
  }

  // Defer updater initialization until after window is shown for faster startup
  const performDeferredUpdaterInit = () => {
    logger.info("[Updater] Starting deferred updater initialization...")
    import("./updater")
      .then((res) => {
        res.init()
        markPhase("updater-initialized")
      })
      .catch((err) => logger.error("[updater] Init failed:", err))
  }

  // Ensure local RAG embeddings are available by default without user intervention.
  const performDeferredRagEmbeddingBootstrap = async () => {
    try {
      // Read from electron-settings first (canonical source for RAG settings),
      // then fall back to configStore for backwards compatibility.
      const cfg = configStore.get()

      const rawBaseUrl = (await settings.get("ollamaBaseUrl")) as string | undefined
      const baseUrl =
        (typeof rawBaseUrl === "string" && rawBaseUrl.trim().length > 0
          ? rawBaseUrl
          : cfg.ollamaBaseUrl) || "http://localhost:11434"

      const rawForceLocal = (await settings.get("forceLocalRagEmbeddings")) as boolean | undefined
      const forceLocal = rawForceLocal ?? cfg.forceLocalRagEmbeddings ?? true

      const rawProvider = (await settings.get("ragEmbeddingProvider")) as string | undefined
      const embeddingProvider = rawProvider || cfg.ragEmbeddingProvider || "ollama"

      const rawModel = (await settings.get("embeddingModel")) as string | undefined
      const embeddingModel = rawModel || cfg.embeddingModel || DEFAULT_RAG_EMBEDDING_MODEL

      // Persist defaults into electron-settings so future reads are consistent
      if (rawProvider == null) await settings.set("ragEmbeddingProvider", embeddingProvider)
      if (rawForceLocal == null) await settings.set("forceLocalRagEmbeddings", forceLocal)
      if (rawModel == null) await settings.set("embeddingModel", embeddingModel)
      if (rawBaseUrl == null) await settings.set("ollamaBaseUrl", baseUrl)

      if (!forceLocal || embeddingProvider !== "ollama") {
        logger.info(
          `[RAG] Local embedding bootstrap skipped (forceLocal=${String(forceLocal)}, provider=${embeddingProvider})`,
        )
        return
      }

      logger.info(
        `[RAG] Ensuring local embedding model '${embeddingModel}' on ${baseUrl}`,
      )
      const result = await ensureDefaultOllamaEmbeddingSetup({
        baseUrl,
        model: embeddingModel,
      })
      if (result.ok) {
        logger.info(
          `[RAG] Local embedding model ready (${embeddingModel})${result.alreadyInstalled ? " [already installed]" : " [downloaded now]"}`,
        )
      } else {
        logger.warn(
          `[RAG] Local embedding bootstrap failed: ${result.reason || "unknown_error"}`,
        )
      }
    } catch (error) {
      logger.error("[RAG] Local embedding bootstrap error", error)
    }
  }

  // Defer nanobot agent initialization until after window is shown
  const performDeferredNanobotInit = async () => {
    const cfg = configStore.get()
    if (!cfg.nanobotEnabled) {
      logger.info("[Nanobot] Disabled in config, skipping init")
      return
    }
    logger.info("[Nanobot] Starting deferred nanobot agent initialization...")
    try {
      const { startNanobotCallbackServer } = await import("./services/nanobot-callback-server")
      const callbackPort = await startNanobotCallbackServer()

      const { nanobotBridge } = await import("./services/nanobot-bridge-service")
      const { initClients } = await import("./services/nanobot-gateway-client")

      await nanobotBridge.start(callbackPort)
      initClients(nanobotBridge.port)

      logger.info(`[Nanobot] Agent ready on port ${nanobotBridge.port}, callback on port ${callbackPort}`)
      markPhase("nanobot-ready")
    } catch (err) {
      logger.error("[Nanobot] Init failed:", err)
    }
  }

  // Defer tray initialization until after window is shown for faster startup
  const performDeferredTrayInit = () => {
    logger.info("[Tray] Starting deferred tray initialization...")
    import("./tray")
      .then(({ initTray }) => {
        initTray()
        markPhase("tray-initialized")
      })
      .catch((err) => logger.error("[Tray] Init failed:", err))
  }

  // Set up one-time deferred initialization after window is shown
  const primaryWindow = WINDOWS.get("main") || WINDOWS.get("setup")
  if (primaryWindow) {
    primaryWindow.once("show", () => {
      // Mark startup complete as soon as window is visible
      markPhase("startup-complete")

      // Defer tray, warmup, schedulers, FFmpeg verification, and updater slightly to ensure window is fully rendered
      setTimeout(performDeferredTrayInit, 50)
      setTimeout(performDeferredModelWarmup, 100)
      setTimeout(performDeferredSchedulersInit, 150)
      setTimeout(performDeferredFfmpegVerification, 200)
      setTimeout(performDeferredUpdaterInit, 250)
      setTimeout(() => {
        void performDeferredRagEmbeddingBootstrap()
      }, 300)
      setTimeout(() => {
        void performDeferredNanobotInit()
      }, 400)
    })
  } else {
    logger.warn("[App] No primary window found, running deferred initializations immediately")
    markPhase("startup-complete")
    performDeferredTrayInit()
    performDeferredModelWarmup()
    performDeferredSchedulersInit()
    performDeferredFfmpegVerification()
    performDeferredUpdaterInit()
    void performDeferredRagEmbeddingBootstrap()
    void performDeferredNanobotInit()
  }

  markPhase("background-services-started")

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
    void stopScreenSessionRecording()
  })

  app.on("will-quit", () => {
    globalShortcutManager.unregisterAll()
    shutdownAutonomousMemory()
    // Stop nanobot if running
    import("./services/nanobot-bridge-service").then(({ nanobotBridge }) => {
      void nanobotBridge.stop()
    }).catch(() => {})
    import("./services/nanobot-gateway-client").then(({ destroyClients }) => {
      destroyClients()
    }).catch(() => {})
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
