import { app } from "electron"
import path from "path"
import fs from "fs"
import { Config } from "@shared/types"
import {
  getSystemAutoLaunchPreference,
  syncAutoLaunchSetting,
} from "./auto-launch"

export const dataFolder = path.join(app.getPath("appData"), process.env.APP_ID)

export const recordingsFolder = path.join(dataFolder, "recordings")

export const configPath = path.join(dataFolder, "config.json")

const LOCAL_PROVIDER_PREFIX = "local:"

const getConfig = () => {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8")) as Config
  } catch {
    return {}
  }
}

const withDefaults = (config?: Config): Config => {
  return {
    enableAudioCues: true,
    launchOnStartup: getSystemAutoLaunchPreference(),
    preferLocalModels: config?.preferLocalModels ?? false,
    ...config,
  }
}

const applyConfigMigrations = (config: Config): { config: Config; modified: boolean } => {
  let modified = false
  const nextConfig = { ...config }

  if (nextConfig.defaultLocalModel && !nextConfig.sttProviderId) {
    nextConfig.sttProviderId = `${LOCAL_PROVIDER_PREFIX}${nextConfig.defaultLocalModel}`
    modified = true
  }

  if (nextConfig.defaultLocalModel && nextConfig.preferLocalModels === undefined) {
    nextConfig.preferLocalModels = true
    modified = true
  }

  return { config: nextConfig, modified }
}

class ConfigStore {
  config: Config | undefined

  constructor() {
    const initialConfig = withDefaults(getConfig())
    const { config: migratedConfig, modified } = applyConfigMigrations(initialConfig)
    this.config = migratedConfig
    syncAutoLaunchSetting(this.config.launchOnStartup ?? false)
    if (modified) {
      this.persist()
    }
  }

  get() {
    return this.config || {}
  }

  save(config: Config) {
    const next = withDefaults(config)
    const { config: migratedConfig } = applyConfigMigrations(next)
    this.config = migratedConfig
    syncAutoLaunchSetting(this.config.launchOnStartup ?? false)
    this.persist()
  }

  private persist() {
    fs.mkdirSync(dataFolder, { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify(this.config))
  }
}

export const configStore = new ConfigStore()
