import { logger } from "../logger"
import { startNanobotCallbackServer, stopNanobotCallbackServer } from "./nanobot-callback-server"
import { nanobotBridge } from "./nanobot-bridge-service"
import { destroyClients, initClients } from "./nanobot-gateway-client"

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
  const callbackPort = await startNanobotCallbackServer()
  await nanobotBridge.start(callbackPort)
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
