import { app } from "electron"

const supportsLoginItemSettings =
  process.platform === "darwin" || process.platform === "win32"

const applySetting = (enabled: boolean) => {
  if (!supportsLoginItemSettings) return

  const setSetting = () => {
    const options: Parameters<typeof app.setLoginItemSettings>[0] = {
      openAtLogin: enabled,
    }

    if (process.platform === "darwin") {
      options.openAsHidden = true
    }

    app.setLoginItemSettings(options)
  }

  if (app.isReady()) {
    setSetting()
  } else {
    app.once("ready", setSetting)
  }
}

export const syncAutoLaunchSetting = (enabled: boolean) => {
  applySetting(enabled)
}

export const getSystemAutoLaunchPreference = () => {
  if (!supportsLoginItemSettings) return false
  try {
    return app.getLoginItemSettings().openAtLogin
  } catch (error) {
    console.error("Failed to read login item settings", error)
    return false
  }
}
