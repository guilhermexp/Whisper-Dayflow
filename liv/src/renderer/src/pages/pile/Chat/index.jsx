import styles from "./Chat.module.scss"
import layoutStyles from "../PileLayout.module.scss"
import {
  CrossIcon,
  RefreshIcon,
  DownloadIcon,
  ColorsIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  ArrowRightIcon,
} from "renderer/icons"
import { useEffect, useState, useMemo, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useAIContext } from "renderer/context/AIContext"
import { useTranslation } from "react-i18next"
import { availableThemes, usePilesContext } from "renderer/context/PilesContext"
import TextareaAutosize from "react-textarea-autosize"
import Thinking from "../Toasts/Toast/Loaders/Thinking"
import Status from "./Status"
import VirtualList from "./VirtualList"
import Intro from "./Intro"
import useChat from "renderer/hooks/useChat"
import { AnimatePresence, motion } from "framer-motion"
import { PENDING_MESSAGE_MARKER } from "@shared/constants"
import Navigation from "../Navigation"

function Chat() {
  const { t } = useTranslation()
  const { validKey, model, openrouterModel, pileAIProvider } = useAIContext()
  const { currentTheme, setTheme } = usePilesContext()

  // Get current model display name
  const currentModelDisplay = useMemo(() => {
    if (pileAIProvider === "openrouter") return openrouterModel || "openrouter"
    if (pileAIProvider === "ollama") return model || "ollama"
    return model || "gpt-5.3"
  }, [pileAIProvider, model, openrouterModel])

  const { getAIResponse, addMessage, resetMessages, relevantEntries } =
    useChat()
  const navigate = useNavigate()
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
          const currentContent = last.content === PENDING_MESSAGE_MARKER ? "" : last.content
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

  // Batched token appending
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
      { role: "system", content: PENDING_MESSAGE_MARKER },
    ])
    await getAIResponse(messages, appendToLastSystemMessage)
    flushTokenBuffer()
    setQuerying(false)
  }

  const handleSuggestionClick = (suggestion) => {
    setText(suggestion)
    // Auto-submit after a brief delay
    setTimeout(() => {
      onSubmit()
    }, 100)
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
      .map((msg) => {
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

  const themeStyles = useMemo(
    () => (currentTheme ? `${currentTheme}Theme` : ""),
    [currentTheme],
  )

  const themeColors = {
    light: "#ffffff",
    blue: "#3b82f6",
    purple: "#8b5cf6",
    yellow: "#eab308",
    green: "#22c55e",
    liquid: "#1f2937",
  }

  const handleClose = () => {
    navigate(-1)
  }

  // Detect platform
  const isMac = window.electron?.isMac
  const osLayoutStyles = isMac ? layoutStyles.macOS : layoutStyles.windows

  // Show intro when no history
  const showIntro = history.length === 0

  return (
    <div className={`${layoutStyles.frame} ${themeStyles} ${osLayoutStyles}`}>
      <div className={layoutStyles.bg}></div>
      <div className={styles.pageContainer}>
        <div className={styles.scroller}>
          {/* Minimal header */}
          <div className={styles.header}>
            <div className={styles.wrapper}>
              <h1 className={styles.DialogTitle}>
                <Status setReady={setReady} />
              </h1>
              <div className={styles.buttons}>
                {/* Theme Selector */}
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

                {/* Export */}
                <div
                  className={`${styles.button} ${history.length === 0 ? styles.disabled : ""}`}
                  onClick={exportChat}
                  title={t("chat.exportChat")}
                >
                  <DownloadIcon className={styles.icon} />
                </div>

                {/* Clear */}
                <div
                  className={`${styles.button} ${history.length === 0 ? styles.disabled : ""}`}
                  onClick={onResetConversation}
                  title={t("chat.clearChat")}
                >
                  <RefreshIcon className={styles.icon} />
                </div>

                {/* Close */}
                <button
                  className={`${styles.close} ${osStyles}`}
                  aria-label="Close Chat"
                  onClick={handleClose}
                >
                  <CrossIcon />
                </button>
              </div>
            </div>
          </div>

          <div className={styles.mainContent}>
            {/* Context toggle */}
            {relevantEntries.length > 0 && !showIntro && (
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

            {/* Chat Messages or Intro */}
            <div className={styles.answer}>
              {showIntro ? (
                <Intro onSuggestionClick={handleSuggestionClick} />
              ) : (
                <VirtualList data={history} isStreaming={querying} />
              )}
            </div>
          </div>

          {/* Input bar - pill style */}
          <div className={styles.inputBar}>
            <div className={styles.holder}>
              <div className={styles.bar}>
                {/* Context badge */}
                {relevantEntries.length > 0 && (
                  <div className={styles.contextBadge}>
                    {relevantEntries.length} {t("chat.relevantEntries")}
                  </div>
                )}

                <TextareaAutosize
                  value={text}
                  onChange={onChangeText}
                  className={styles.textarea}
                  onKeyDown={handleKeyPress}
                  placeholder={t("chat.placeholder")}
                  autoFocus
                />

                <button
                  className={`${styles.ask} ${querying ? styles.processing : ""}`}
                  onClick={onSubmit}
                  disabled={querying}
                >
                  {querying ? (
                    <Thinking className={styles.spinner} />
                  ) : (
                    <ArrowRightIcon className={styles.sendIcon} />
                  )}
                </button>
              </div>
              <div className={styles.disclaimer}>
                {t("chat.disclaimer")} · {currentModelDisplay}
              </div>
            </div>
          </div>
        </div>
      </div>
      <Navigation />
    </div>
  )
}

export default Chat
export const Component = Chat
