import "./css/spinner.css"
import "./lib/i18n"
import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { tipcClient } from "./lib/tipc-client"
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "./lib/query-client"

// Load Tailwind CSS before rendering to prevent FOUC
import("./css/tailwind.css")
  .then(() => {
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </React.StrictMode>,
    )
  })
  .catch((err) => console.error("Failed to load styles:", err))

document.addEventListener("contextmenu", (e) => {
  e.preventDefault()

  const selectedText = window.getSelection()?.toString()

  tipcClient.showContextMenu({
    x: e.clientX,
    y: e.clientY,
    selectedText,
  })
})
