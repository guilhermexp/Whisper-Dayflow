import { resolve } from "path"
import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
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
          "sherpa-onnx-node",
          "sherpa-onnx-darwin-arm64",
          "sherpa-onnx-darwin-x64",
          "sherpa-onnx-linux-x64",
          "sherpa-onnx-linux-arm64",
          "sherpa-onnx-win-x64",
        ],
      },
    },
  },
  preload: {
    plugins: [tsconfigPaths(), externalizeDepsPlugin()],
  },
  renderer: {
    define,
    plugins: [tsconfigPaths(), react(), tailwindcss()],
    server: {
      port: 5000,
      strictPort: true,
      host: "127.0.0.1",
    },
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: {
        renderer: resolve(__dirname, "src/renderer/src"),
        "@shared": resolve(__dirname, "src/shared"),
        react: resolve(__dirname, "node_modules/react"),
        "react-dom": resolve(__dirname, "node_modules/react-dom"),
        "react/jsx-runtime": resolve(
          __dirname,
          "node_modules/react/jsx-runtime.js",
        ),
        "react/jsx-dev-runtime": resolve(
          __dirname,
          "node_modules/react/jsx-dev-runtime.js",
        ),
        "react-dom/client": resolve(__dirname, "node_modules/react-dom/client.js"),
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          // api: 'modern-compiler', // Removed - not supported in Vite 7
        },
      },
    },
  },
})
