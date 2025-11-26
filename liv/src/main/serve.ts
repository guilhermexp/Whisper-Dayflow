import { protocol, ProtocolRequest, ProtocolResponse } from "electron"
import path from "path"
import fs from "fs"
import { recordingsFolder } from "./config"

const rendererDir = path.join(__dirname, "../renderer")

// See https://cs.chromium.org/chromium/src/net/base/net_error_list.h
const FILE_NOT_FOUND = -6

const getPath = async (path_: string) => {
  try {
    const result = await fs.promises.stat(path_)

    if (result.isFile()) {
      return path_
    }

    if (result.isDirectory()) {
      return getPath(path.join(path_, "index.html"))
    }
  } catch (_) {}

  return null
}

const handleApp = async (
  request: ProtocolRequest,
  callback: (response: string | ProtocolResponse) => void,
) => {
  const indexPath = path.join(rendererDir, "index.html")
  const filePath = path.join(
    rendererDir,
    decodeURIComponent(new URL(request.url).pathname),
  )
  const resolvedPath = await getPath(filePath)
  const fileExtension = path.extname(filePath)

  if (
    resolvedPath ||
    !fileExtension ||
    fileExtension === ".html" ||
    fileExtension === ".asar"
  ) {
    callback({
      path: resolvedPath || indexPath,
    })
  } else {
    callback({ error: FILE_NOT_FOUND })
  }
}

export function registerServeSchema() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "assets",
      privileges: {
        standard: true,
        secure: true,
        allowServiceWorkers: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ])
}

export function registerServeProtocol() {
  protocol.registerFileProtocol("assets", (request, callback) => {
    const { host, pathname, searchParams } = new URL(request.url)

    if (host === "recording") {
      const id = pathname.slice(1)
      const wavPath = path.join(recordingsFolder, `${id}.wav`)
      if (fs.existsSync(wavPath)) {
        return callback({ path: wavPath })
      }
      const legacyPath = path.join(recordingsFolder, `${id}.webm`)
      return callback({ path: legacyPath })
    }

    if (host === "screenshot") {
      const id = pathname.slice(1)
      const screenshotPath = path.join(
        recordingsFolder,
        "screenshots",
        `${id}.png`,
      )
      if (fs.existsSync(screenshotPath)) {
        return callback({ path: screenshotPath })
      }
    }

    if (host === "file") {
      const filepath = searchParams.get("path")
      console.log("[serve] assets://file request, path:", filepath)
      if (filepath) {
        const exists = fs.existsSync(filepath)
        console.log("[serve] File exists:", exists, filepath)
        return callback({ path: filepath })
      }
    }

    if (host === "app") {
      return handleApp(request, callback)
    }

    callback({ error: FILE_NOT_FOUND })
  })
}
