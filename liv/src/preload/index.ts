import { contextBridge, ipcRenderer, IpcRendererEvent, shell } from "electron"
import { electronAPI } from "@electron-toolkit/preload"
import fs from "fs"
import path from "path"

export type Channels = 'ipc-example';

// Dynamically check filesystem access against Piles roots (config location + pile paths)
// Re-reads config on each check to support newly created piles
const getAllowedRoots = (): Set<string> => {
  const roots = new Set<string>()
  try {
    const homeDir = process.env.HOME || process.env.USERPROFILE || ""
    const configPath = path.join(homeDir, "Piles", "piles.json")
    const configRoot = path.dirname(configPath)
    roots.add(path.resolve(configRoot))

    // Allow ~/Documents/Liv for default journal creation
    if (homeDir) {
      const defaultLivFolder = path.join(homeDir, "Documents", "Liv")
      roots.add(path.resolve(defaultLivFolder))
    }

    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8")
      const piles = JSON.parse(raw)
      if (Array.isArray(piles)) {
        for (const pile of piles) {
          if (pile?.path) {
            roots.add(path.resolve(String(pile.path)))
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return roots
}

const isPathAllowed = (candidatePath: string) => {
  if (!candidatePath) return false
  const resolved = path.resolve(candidatePath)
  const allowedRoots = getAllowedRoots()
  for (const root of allowedRoots) {
    if (resolved === root || resolved.startsWith(root + path.sep)) {
      return true
    }
  }
  return false
}

const assertAllowedPath = (candidatePath: string) => {
  if (!isPathAllowed(candidatePath)) {
    throw new Error("[preload] Path outside allowed root")
  }
}

// Pile-specific APIs for file system, path operations, and settings
const pileAPI = {
  ipc: {
    sendMessage(channel: Channels, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
    invoke: ipcRenderer.invoke,
    removeAllListeners(channel: Channels) {
      ipcRenderer.removeAllListeners(channel);
    },
    removeListener(channel: Channels, func: any) {
      ipcRenderer.removeListener(channel, func);
    },
  },
  setupPilesFolder: (path: string) => {
    assertAllowedPath(path);
    fs.existsSync(path);
  },
  openFolder: (folderPath: string) => {
    try {
      assertAllowedPath(folderPath);
      if (fs.existsSync(folderPath)) {
        shell.openPath(folderPath);
      }
    } catch (_err) {}
  },
  existsSync: (path: string) => {
    assertAllowedPath(path);
    return fs.existsSync(path)
  },
  readDir: (path: string, callback: any) => {
    assertAllowedPath(path);
    fs.readdir(path, callback)
  },
  isDirEmpty: (dirPath: string) => {
    try {
      assertAllowedPath(dirPath);
      const files = fs.readdirSync(dirPath);
      return files.length === 0;
    } catch (_err) {
      return true;
    }
  },
  readFile: (path: string, callback: any) => {
    assertAllowedPath(path);
    fs.readFile(path, 'utf-8', callback)
  },
  deleteFile: (path: string, callback: any) => {
    assertAllowedPath(path);
    fs.unlink(path, callback)
  },
  writeFile: (path: string, data: any, callback: any) => {
    assertAllowedPath(path);
    fs.writeFile(path, data, 'utf-8', callback)
  },
  mkdir: (path: string) => {
    assertAllowedPath(path);
    return fs.promises.mkdir(path, {
      recursive: true,
    })
  },
  joinPath: (...args: any) => path.join(...args),
  isMac: process.platform === 'darwin',
  isWindows: process.platform === 'win32',
  pathSeparator: path.sep,
  getSystemLocale: () => navigator.language || "en-US",
};

// Custom APIs for renderer
const api = {}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    // Liv's electronAPI
    contextBridge.exposeInMainWorld("electron", {
      ...electronAPI,
      ...pileAPI
    })
    contextBridge.exposeInMainWorld("api", api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = { ...electronAPI, ...pileAPI }
  // @ts-ignore (define in dts)
  window.api = api
}

export type ElectronHandler = typeof electronAPI & typeof pileAPI;
