import crypto from "crypto"
import { logger } from "../logger"
import { startNanobotCallbackServer, stopNanobotCallbackServer } from "./nanobot-callback-server"
import { nanobotBridge } from "./nanobot-bridge-service"
import { destroyClients, initClients } from "./nanobot-gateway-client"
import { ensureAutomationWorkspaceFiles } from "./automation-workspace-config"

const LOG_PREFIX = "[NanobotRuntime]"

let listenersBound = false

function bindBridgeLifecycleListeners() {
  if (listenersBound) return
  listenersBound = true

  nanobotBridge.on("ready", () => {
    initClients(nanobotBridge.port)
  })

  nanobotBridge.on("stopped", () => {
    destroyClients()
  })

  nanobotBridge.on("error", () => {
    destroyClients()
  })
}

export async function startNanobotRuntime() {
  bindBridgeLifecycleListeners()
  ensureAutomationWorkspaceFiles()
  const callbackToken = crypto.randomBytes(24).toString("hex")
  const callbackPort = await startNanobotCallbackServer({
    authToken: callbackToken,
  })
  await nanobotBridge.start(callbackPort, callbackToken)
  logger.info(
    `${LOG_PREFIX} Started (gateway=${nanobotBridge.port}, callback=${callbackPort})`,
  )
  return nanobotBridge.status
}

export async function stopNanobotRuntime() {
  destroyClients()
  await nanobotBridge.stop()
  stopNanobotCallbackServer()
  logger.info(`${LOG_PREFIX} Stopped`)
  return nanobotBridge.status
}

export async function restartNanobotRuntime() {
  await stopNanobotRuntime()
  return startNanobotRuntime()
}
