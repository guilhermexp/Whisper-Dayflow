import styles from "./Chat.module.scss"
import layoutStyles from "../PileLayout.module.scss"
import {
  CrossIcon,
  RefreshIcon,
  ChatIcon,
  SettingsIcon,
  DownloadIcon,
  ColorsIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  HomeIcon,
  NotebookIcon,
} from "renderer/icons"
import { useEffect, useState, useMemo, useCallback, useRef } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { Link } from "react-router-dom"
import { useAIContext } from "renderer/context/AIContext"
import { useTranslation } from "react-i18next"
import { availableThemes, usePilesContext } from "renderer/context/PilesContext"
import TextareaAutosize from "react-textarea-autosize"
import Thinking from "../Toasts/Toast/Loaders/Thinking"
import Status from "./Status"
import VirtualList from "./VirtualList"
import Blobs from "./Blobs"
import useChat from "renderer/hooks/useChat"
import { AnimatePresence, motion } from "framer-motion"
import Search from "../Search"
import Settings from "../Settings"
import Dashboard from "../Dashboard"

export default function Chat() {
  const { t } = useTranslation()
  const { validKey, model, openrouterModel, pileAIProvider } = useAIContext()
  const { currentTheme, setTheme } = usePilesContext()

  // Get current model display name
  const currentModelDisplay = useMemo(() => {
    if (pileAIProvider === "openrouter") return openrouterModel || "openrouter"
    if (pileAIProvider === "ollama") return model || "ollama"
    return model || "gpt-5.1"
  }, [pileAIProvider, model, openrouterModel])
  const { getAIResponse, addMessage, resetMessages, relevantEntries } =
    useChat()
  const [ready, setReady] = useState(false)
  const [text, setText] = useState("")
  const [querying, setQuerying] = useState(false)
  const [history, setHistory] = useState([])
  const [aiApiKeyValid, setAiApiKeyValid] = useState(false)
  const [showContext, setShowContext] = useState(false)
  const [showThemeSelector, setShowThemeSelector] = useState(false)

  // Refs for batching streaming tokens
  const tokenBufferRef = useRef("")
  const flushTimeoutRef = useRef(null)

  // Check if the AI API key is valid
  useEffect(() => {
    const checkApiKeyValid = async () => {
      const valid = await validKey()
      setAiApiKeyValid(valid)
    }
    checkApiKeyValid()
  }, [validKey])

  const onChangeText = (e) => {
    setText(e.target.value)
  }

  const onResetConversation = () => {
    setText("")
    setHistory([])
    resetMessages()
    tokenBufferRef.current = ""
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current)
      flushTimeoutRef.current = null
    }
  }

  // Flush buffered tokens to state
  const flushTokenBuffer = useCallback(() => {
    if (tokenBufferRef.current) {
      const bufferedContent = tokenBufferRef.current
      tokenBufferRef.current = ""

      setHistory((history) => {
        if (!history || history.length === 0) return []
        const last = history[history.length - 1]
        if (last?.role === "system") {
          // Replace @@PENDING@@ or append to existing content
          const currentContent =
            last.content === "@@PENDING@@" ? "" : last.content
          return [
            ...history.slice(0, -1),
            { role: "system", content: currentContent + bufferedContent },
          ]
        }
        return history
      })
    }
    flushTimeoutRef.current = null
  }, [])

  // Batched token appending - collects tokens and flushes ~8 fps to reduce re-render flicker
  const appendToLastSystemMessage = useCallback(
    (token) => {
      tokenBufferRef.current += token ?? ""

      if (!flushTimeoutRef.current) {
        flushTimeoutRef.current = setTimeout(flushTokenBuffer, 120)
      }
    },
    [flushTokenBuffer],
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current)
      }
    }
  }, [])

  const onSubmit = async () => {
    if (text === "") return
    setQuerying(true)
    const message = `${text}`
    setText("")
    setHistory((history) => [...history, { role: "user", content: message }])
    const messages = await addMessage(message)
    setHistory((history) => [
      ...history,
      { role: "system", content: "@@PENDING@@" },
    ])
    await getAIResponse(messages, appendToLastSystemMessage)
    // Flush any remaining tokens after streaming completes
    flushTokenBuffer()
    setQuerying(false)
  }

  const handleKeyPress = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      onSubmit()
      event.preventDefault()
      return false
    }
  }

  const exportChat = useCallback(() => {
    if (history.length === 0) return

    const chatContent = history
      .map((msg, index) => {
        const role = msg.role === "user" ? "You" : "AI"
        return `[${role}]\n${msg.content}\n`
      })
      .join("\n---\n\n")

    const blob = new Blob([chatContent], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `chat-export-${new Date().toISOString().split("T")[0]}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [history])

  const handleThemeChange = (theme) => {
    setTheme(theme)
    setShowThemeSelector(false)
  }

  const osStyles = useMemo(
    () => (window.electron.isMac ? styles.mac : styles.win),
    [],
  )

  const themeColors = {
    light: "#ffffff",
    blue: "#3b82f6",
    purple: "#8b5cf6",
    yellow: "#eab308",
    green: "#22c55e",
    liquid: "#1f2937", // novo tema dark glass
  }

  return (
    <>
      <Dialog.Root>
        <Dialog.Trigger asChild>
          <div className={layoutStyles.iconHolder}>
            <ChatIcon />
          </div>
        </Dialog.Trigger>
        <Dialog.Portal container={document.getElementById("dialog")}>
          <Dialog.Overlay className={styles.DialogOverlay} />
          <Dialog.Content
            className={styles.DialogContent}
            aria-describedby={undefined}
          >
            <div className={styles.scroller}>
              <div className={styles.header}>
                <div className={styles.wrapper}>
                  {/* Disable animated blobs during streaming to avoid GPU-heavy flicker */}
                  <Blobs show={false} />
                  <Dialog.Title className={styles.DialogTitle}>
                    <Status setReady={setReady} />
                  </Dialog.Title>
                  <div className={styles.buttons}>
                    {/* Theme Selector Button */}
                    <div className={styles.buttonGroup}>
                      <div
                        className={styles.button}
                        onClick={() => setShowThemeSelector(!showThemeSelector)}
                        title={t("chat.changeTheme")}
                      >
                        <ColorsIcon className={styles.icon} />
                      </div>
                      <AnimatePresence>
                        {showThemeSelector && (
                          <motion.div
                            className={styles.themeSelector}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                          >
                            {Object.keys(availableThemes).map((theme) => (
                              <div
                                key={theme}
                                className={`${styles.themeOption} ${currentTheme === theme ? styles.active : ""}`}
                                onClick={() => handleThemeChange(theme)}
                                style={{ backgroundColor: themeColors[theme] }}
                                title={theme}
                              />
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Export Button */}
                    <div
                      className={`${styles.button} ${history.length === 0 ? styles.disabled : ""}`}
                      onClick={exportChat}
                      title={t("chat.exportChat")}
                    >
                      <DownloadIcon className={styles.icon} />
                    </div>

                    {/* Clear Chat Button */}
                    <div
                      className={styles.button}
                      onClick={onResetConversation}
                    >
                      <RefreshIcon className={styles.icon} />
                      {t("chat.clearChat")}
                    </div>

                    {/* Close Button */}
                    <Dialog.Close asChild>
                      <button
                        className={`${styles.close} ${osStyles}`}
                        aria-label="Close Chat"
                      >
                        <CrossIcon />
                      </button>
                    </Dialog.Close>
                  </div>
                </div>
              </div>

              <div className={styles.mainContent}>
                {/* Context Panel Toggle */}
                {relevantEntries.length > 0 && (
                  <motion.div
                    className={styles.contextToggle}
                    onClick={() => setShowContext(!showContext)}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    {showContext ? (
                      <ChevronLeftIcon className={styles.chevron} />
                    ) : (
                      <ChevronRightIcon className={styles.chevron} />
                    )}
                    <span className={styles.contextCount}>
                      {relevantEntries.length} {t("chat.relevantEntries")}
                    </span>
                  </motion.div>
                )}

                {/* Context Panel */}
                <AnimatePresence>
                  {showContext && relevantEntries.length > 0 && (
                    <motion.div
                      className={styles.contextPanel}
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 250, opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className={styles.contextHeader}>
                        {t("chat.contextUsed")}
                      </div>
                      <div className={styles.contextList}>
                        {relevantEntries.map((entry, index) => (
                          <div key={entry.path} className={styles.contextItem}>
                            <div className={styles.contextIndex}>
                              {index + 1}
                            </div>
                            <div className={styles.contextPath}>
                              {entry.path.split("/").pop().replace(".md", "")}
                            </div>
                            <div className={styles.contextScore}>
                              {Math.round(entry.score * 100)}%
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Chat Messages */}
                <div className={styles.answer}>
                  <VirtualList data={history} isStreaming={querying} />
                </div>
              </div>

              <div className={styles.inputBar}>
                <div className={styles.holder}>
                  <div className={styles.inputbaroverlay}></div>
                  <div className={styles.bar}>
                    <TextareaAutosize
                      value={text}
                      onChange={onChangeText}
                      className={styles.textarea}
                      onKeyDown={handleKeyPress}
                      placeholder={t("chat.placeholder")}
                      autoFocus
                    />

                    <button
                      className={`${styles.ask} ${
                        querying && styles.processing
                      }`}
                      onClick={onSubmit}
                      disabled={querying}
                    >
                      {querying ? (
                        <Thinking className={styles.spinner} />
                      ) : (
                        t("chat.ask")
                      )}
                    </button>
                  </div>
                  <div className={styles.disclaimer}>
                    {t("chat.disclaimer")} ·{" "}
                    <span style={{ opacity: 0.6 }}>{currentModelDisplay}</span>
                  </div>
                </div>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
