import { ElectronAPI } from '@electron-toolkit/preload'
import { ElectronHandler } from './index'

declare global {
  interface Window {
    electron: ElectronHandler
    api: unknown
  }
}
