import { useEffect, useState } from "react"
import { rendererHandlers } from "~/lib/tipc-client"
import type { ErrorNotification } from "../../../main/renderer-handlers"
import { AnimatePresence, motion } from "framer-motion"

type NotificationItem = ErrorNotification & { id: number }

export function NotificationHandler() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])

  useEffect(() => {
    const unlisten = rendererHandlers.showNotification.listen((notification) => {
      const id = Date.now()
      setNotifications((prev) => [...prev, { ...notification, id }])

      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== id))
      }, 5000)
    })

    return unlisten
  }, [])

  const dismiss = (id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
      <AnimatePresence>
        {notifications.map((notification) => (
          <motion.div
            key={notification.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className={`pointer-events-auto flex min-w-[300px] max-w-[400px] cursor-pointer items-start gap-3 rounded-lg border p-4 shadow-lg backdrop-blur-sm ${
              notification.type === "error"
                ? "border-red-500/30 bg-red-950/90 text-red-100"
                : notification.type === "warning"
                  ? "border-yellow-500/30 bg-yellow-950/90 text-yellow-100"
                  : "border-blue-500/30 bg-blue-950/90 text-blue-100"
            }`}
            onClick={() => dismiss(notification.id)}
          >
            <div
              className={`mt-0.5 flex-shrink-0 ${
                notification.type === "error"
                  ? "text-red-400"
                  : notification.type === "warning"
                    ? "text-yellow-400"
                    : "text-blue-400"
              }`}
            >
              {notification.type === "error" && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              )}
              {notification.type === "warning" && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              )}
              {notification.type === "info" && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              )}
            </div>
            <div className="flex-1">
              <div className="font-medium">{notification.title}</div>
              <div className="mt-1 text-sm opacity-80">{notification.message}</div>
              {notification.code && (
                <div className="mt-1 font-mono text-xs opacity-60">
                  Code: {notification.code}
                </div>
              )}
            </div>
            <button
              className="flex-shrink-0 opacity-50 transition-opacity hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation()
                dismiss(notification.id)
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
