import { RouterProvider } from "react-router-dom"
import { router } from "./router"
import { lazy, Suspense } from "react"
import { LanguageSync } from "./components/language-sync"
import { NotificationHandler } from "./components/notification-handler"

const Updater = lazy(() => import("./components/updater"))

function App(): React.ReactNode {
  return (
    <>
      <LanguageSync />
      <RouterProvider router={router}></RouterProvider>

      <Suspense>
        <Updater />
      </Suspense>

      <NotificationHandler />
    </>
  )
}

export default App
