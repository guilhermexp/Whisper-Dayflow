import { resolve } from "path"
import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import react from "@vitejs/plugin-react"
import tsconfigPaths from "vite-tsconfig-paths"
import pkg from "./package.json"

const builderConfig = require("./electron-builder.config.cjs")

const define = {
  "process.env.APP_ID": JSON.stringify(builderConfig.appId),
  "process.env.PRODUCT_NAME": JSON.stringify(builderConfig.productName),
  "process.env.APP_VERSION": JSON.stringify(pkg.version),
  "process.env.IS_MAC": JSON.stringify(process.platform === "darwin"),
}

export default defineConfig({
  main: {
    plugins: [tsconfigPaths(), externalizeDepsPlugin()],
    define,
    build: {
      rollupOptions: {
        external: [
          'sherpa-onnx-node',
          'sherpa-onnx-darwin-arm64',
          'sherpa-onnx-darwin-x64',
          'sherpa-onnx-linux-x64',
          'sherpa-onnx-linux-arm64',
          'sherpa-onnx-win-x64',
        ],
      },
    },
  },
  preload: {
    plugins: [tsconfigPaths(), externalizeDepsPlugin()],
  },
  renderer: {
    define,
    plugins: [tsconfigPaths(), react()],
    resolve: {
      alias: {
        'renderer': resolve(__dirname, 'src/renderer/src'),
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
        },
      },
    },
  },
})
