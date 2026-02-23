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
  ChatIcon,
  ClockIcon,
  PlusIcon,
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
import { tipcClient } from "renderer/lib/tipc-client"

const formatRelativeTime = (isoString) => {
  if (!isoString) return ""
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "agora"
  if (diffMin < 60) return `${diffMin}min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 30) return `${diffD}d`
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

const parseSessionLabel = (key) => {
  if (!key) return key
  const parts = key.split(":")
  if (parts.length >= 2) {
    const channel = parts[0]
    const chatId = parts.slice(1).join(":")
    const channelLabels = {
      liv: "Liv",
      cli: "CLI",
      telegram: "Telegram",
      discord: "Discord",
      slack: "Slack",
      whatsapp: "WhatsApp",
      email: "Email",
      cron: "Cron",
    }
    return `${channelLabels[channel] || channel} · ${chatId}`
  }
  return key
}

function Chat() {
  const { t } = useTranslation()
  const { validKey } = useAIContext()
  const { currentTheme, setTheme } = usePilesContext()

  const {
    getAIResponse,
    addMessage,
    resetMessages,
    relevantEntries,
    toolCalls,
    isNanobotActive,
  } = useChat()
  const navigate = useNavigate()
  const [text, setText] = useState("")
  const [querying, setQuerying] = useState(false)
  const [history, setHistory] = useState([])
  const [aiApiKeyValid, setAiApiKeyValid] = useState(false)
  const [requestError, setRequestError] = useState("")
  const [showContext, setShowContext] = useState(false)
  const [showThemeSelector, setShowThemeSelector] = useState(false)
  const [showSessions, setShowSessions] = useState(false)
  const [sessions, setSessions] = useState([])
  const [currentSessionKey, setCurrentSessionKey] = useState("liv:chat")
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [slashMenuOpen, setSlashMenuOpen] = useState(false)

  const tokenBufferRef = useRef("")
  const flushTimeoutRef = useRef(null)

  useEffect(() => {
    const checkApiKeyValid = async () => {
      const valid = await validKey()
      setAiApiKeyValid(valid)
    }
    checkApiKeyValid()
  }, [validKey])

  const loadSessions = useCallback(async () => {
    if (!isNanobotActive) return
    setLoadingSessions(true)
    try {
      const list = await tipcClient.getNanobotSessions()
      setSessions(list || [])
    } catch {
      setSessions([])
    } finally {
      setLoadingSessions(false)
    }
  }, [isNanobotActive])

  useEffect(() => {
    if (showSessions && isNanobotActive) {
      loadSessions()
    }
  }, [showSessions, isNanobotActive, loadSessions])

  const switchSession = useCallback(
    async (sessionKey) => {
      if (sessionKey === currentSessionKey) return
      setCurrentSessionKey(sessionKey)
      try {
        const data = await tipcClient.getNanobotSessionMessages({ sessionKey })
        const loadedHistory = (data.messages || []).map((m) => ({
          role: m.role === "assistant" ? "system" : m.role,
          content: m.content,
        }))
        setHistory(loadedHistory)
        resetMessages()
      } catch (err) {
        console.error("[Chat] Failed to load session:", err)
      }
    },
    [currentSessionKey, resetMessages],
  )

  const onNewSession = useCallback(async () => {
    setText("")
    setHistory([])
    resetMessages()
    setCurrentSessionKey("liv:chat")
    tokenBufferRef.current = ""
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current)
      flushTimeoutRef.current = null
    }
    if (isNanobotActive) {
      try {
        await tipcClient.sendNanobotMessage({ content: "/new", sessionId: currentSessionKey })
      } catch { /* ignore */ }
      loadSessions()
    }
  }, [isNanobotActive, currentSessionKey, resetMessages, loadSessions])

  const SLASH_COMMANDS = [
    { cmd: "/new", label: "Nova sessao", desc: "Limpa a sessao atual e arquiva na memoria" },
    { cmd: "/help", label: "Ajuda", desc: "Lista comandos disponiveis do agente" },
  ]

  const onChangeText = (e) => {
    if (requestError) {
      setRequestError("")
    }
    const val = e.target.value
    setText(val)
    if (isNanobotActive && val.startsWith("/") && val.length <= 6) {
      setSlashMenuOpen(true)
    } else {
      setSlashMenuOpen(false)
    }
  }

  const onResetConversation = () => {
    if (isNanobotActive) {
      onNewSession()
      return
    }
    setText("")
    setHistory([])
    resetMessages()
    tokenBufferRef.current = ""
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current)
      flushTimeoutRef.current = null
    }
  }

  const flushTokenBuffer = useCallback(() => {
    if (tokenBufferRef.current) {
      const bufferedContent = tokenBufferRef.current
      tokenBufferRef.current = ""

      setHistory((messages) => {
        if (!messages || messages.length === 0) return []
        const last = messages[messages.length - 1]
        if (last?.role === "system") {
          const currentContent =
            last.content === PENDING_MESSAGE_MARKER ? "" : last.content
          return [
            ...messages.slice(0, -1),
            { role: "system", content: currentContent + bufferedContent },
          ]
        }
        return messages
      })
    }
    flushTimeoutRef.current = null
  }, [])

  const appendToLastSystemMessage = useCallback(
    (token) => {
      tokenBufferRef.current += token ?? ""

      if (!flushTimeoutRef.current) {
        flushTimeoutRef.current = setTimeout(flushTokenBuffer, 120)
      }
    },
    [flushTokenBuffer],
  )

  useEffect(() => {
    return () => {
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current)
      }
    }
  }, [])

  const onSubmit = async () => {
    const message = text.trim()
    if (message === "" || querying || !aiApiKeyValid) return

    setSlashMenuOpen(false)

    // Handle /new slash command locally
    if (isNanobotActive && message === "/new") {
      onNewSession()
      return
    }

    setQuerying(true)
    setRequestError("")
    setText("")
    setHistory((messages) => [...messages, { role: "user", content: message }])
    try {
      const messages = await addMessage(message)
      setHistory((current) => [
        ...current,
        { role: "system", content: PENDING_MESSAGE_MARKER },
      ])
      await getAIResponse(messages, appendToLastSystemMessage)
      flushTokenBuffer()
    } catch (error) {
      console.error("[Chat] Request failed:", error)
      setRequestError(
        error?.message ||
          "Nao foi possivel gerar resposta agora. Tente novamente.",
      )
      setHistory((messages) =>
        messages.filter((m) => m.content !== PENDING_MESSAGE_MARKER),
      )
    } finally {
      setQuerying(false)
    }
  }

  const handleSuggestionClick = (suggestion) => {
    setText(suggestion)
    setTimeout(() => {
      onSubmit()
    }, 100)
  }

  const handleKeyPress = (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !querying &&
      aiApiKeyValid &&
      text.trim() !== ""
    ) {
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

  const canSubmit = text.trim() !== "" && !querying && aiApiKeyValid

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

  const isMac = window.electron?.isMac
  const osLayoutStyles = isMac ? layoutStyles.macOS : layoutStyles.windows
  const showIntro = history.length === 0

  return (
    <div className={`${layoutStyles.frame} ${themeStyles} ${osLayoutStyles}`}>
      <div className={layoutStyles.bg}></div>
      <div className={styles.pageContainer}>
        <div className={styles.header}>
          <div className={styles.wrapper}>
            <h1 className={styles.DialogTitle}>
              <Status />
              {isNanobotActive && (
                <span className={styles.agentBadge}>Agent</span>
              )}
            </h1>
            <div className={styles.headerActions}>
              <div className={styles.buttonGroup}>
                <button
                  type="button"
                  className={styles.headerBtnIcon}
                  onClick={() => setShowThemeSelector(!showThemeSelector)}
                  title={t("chat.changeTheme")}
                  aria-label={t("chat.changeTheme")}
                >
                  <ColorsIcon className={styles.icon} />
                </button>
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

              {isNanobotActive && (
                <button
                  type="button"
                  className={`${styles.headerBtnIcon} ${showSessions ? styles.activeBtn : ""}`}
                  onClick={() => setShowSessions(!showSessions)}
                  title="Sessoes"
                  aria-label="Sessoes"
                >
                  <ClockIcon className={styles.icon} />
                </button>
              )}

              <button
                type="button"
                className={`${styles.headerBtnIcon} ${history.length === 0 ? styles.disabled : ""}`}
                onClick={exportChat}
                title={t("chat.exportChat")}
                aria-label={t("chat.exportChat")}
                disabled={history.length === 0}
              >
                <DownloadIcon className={styles.icon} />
              </button>

              <button
                type="button"
                className={`${styles.headerBtnIcon} ${history.length === 0 ? styles.disabled : ""}`}
                onClick={onResetConversation}
                title={t("chat.clearChat")}
                aria-label={t("chat.clearChat")}
                disabled={history.length === 0}
              >
                <RefreshIcon className={styles.icon} />
              </button>
            </div>
            <button className={styles.close} aria-label="Close Chat" onClick={() => navigate(-1)}>
              <CrossIcon />
            </button>
          </div>
        </div>

        <div className={styles.scroller}>
          <div className={styles.mainContent}>
            <div className={styles.contentColumn}>
              {relevantEntries.length > 0 && !showIntro && (
                <motion.button
                  type="button"
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
                </motion.button>
              )}

              <div className={styles.chatStage}>
                <AnimatePresence initial={false}>
                  {showContext && relevantEntries.length > 0 && (
                    <motion.aside
                      className={styles.contextPanel}
                      initial={{ width: 0, opacity: 0, x: -12 }}
                      animate={{ width: 250, opacity: 1, x: 0 }}
                      exit={{ width: 0, opacity: 0, x: -12 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className={styles.contextHeader}>
                        {t("chat.contextUsed")}
                      </div>
                      <div className={styles.contextList}>
                        {relevantEntries.map((entry, index) => (
                          <div key={entry.path} className={styles.contextItem}>
                            <div className={styles.contextIndex}>{index + 1}</div>
                            <div className={styles.contextPath}>
                              {entry.path.split("/").pop().replace(".md", "")}
                            </div>
                            <div className={styles.contextScore}>
                              {Math.round(entry.score * 100)}%
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.aside>
                  )}
                </AnimatePresence>

                <div className={styles.answer}>
                  {showIntro ? (
                    <Intro onSuggestionClick={handleSuggestionClick} />
                  ) : (
                    <VirtualList data={history} isStreaming={querying} />
                  )}
                </div>

                <AnimatePresence initial={false}>
                  {showSessions && isNanobotActive && (
                    <motion.aside
                      className={styles.sessionsPanel}
                      initial={{ width: 0, opacity: 0, x: 12 }}
                      animate={{ width: 260, opacity: 1, x: 0 }}
                      exit={{ width: 0, opacity: 0, x: 12 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className={styles.sessionsPanelHeader}>
                        <span>Sessoes</span>
                        <button
                          type="button"
                          className={styles.sessionsNewBtn}
                          onClick={onNewSession}
                          title="Nova sessao"
                        >
                          <PlusIcon className={styles.sessionsNewIcon} />
                        </button>
                      </div>
                      <div className={styles.sessionsList}>
                        {loadingSessions && sessions.length === 0 && (
                          <div className={styles.sessionsEmpty}>Carregando...</div>
                        )}
                        {!loadingSessions && sessions.length === 0 && (
                          <div className={styles.sessionsEmpty}>Nenhuma sessao</div>
                        )}
                        {sessions.map((s) => (
                          <div
                            key={s.key}
                            className={`${styles.sessionItem} ${s.key === currentSessionKey ? styles.sessionActive : ""}`}
                            onClick={() => switchSession(s.key)}
                          >
                            <div className={styles.sessionIcon}>
                              <ChatIcon />
                            </div>
                            <div className={styles.sessionInfo}>
                              <div className={styles.sessionLabel}>
                                {parseSessionLabel(s.key)}
                              </div>
                              <div className={styles.sessionTime}>
                                {formatRelativeTime(s.updated_at)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.aside>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className={styles.inputBar}>
            <AnimatePresence>
              {slashMenuOpen && isNanobotActive && (
                <motion.div
                  className={styles.slashMenu}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.12 }}
                >
                  {SLASH_COMMANDS.filter((c) =>
                    c.cmd.startsWith(text.trim().toLowerCase() || "/"),
                  ).map((c) => (
                    <div
                      key={c.cmd}
                      className={styles.slashMenuItem}
                      onClick={() => {
                        setSlashMenuOpen(false)
                        if (c.cmd === "/new") {
                          onNewSession()
                        } else {
                          // Send the slash command as a regular message
                          setText("")
                          setHistory((prev) => [...prev, { role: "user", content: c.cmd }])
                          setQuerying(true)
                          tipcClient
                            .sendNanobotMessage({ content: c.cmd, sessionId: currentSessionKey })
                            .then((res) => {
                              setHistory((prev) => [
                                ...prev,
                                { role: "system", content: res?.content || "" },
                              ])
                            })
                            .catch((err) => {
                              setRequestError(err?.message || "Comando falhou")
                            })
                            .finally(() => setQuerying(false))
                        }
                      }}
                    >
                      <span className={styles.slashCmd}>{c.cmd}</span>
                      <span className={styles.slashLabel}>{c.label}</span>
                      <span className={styles.slashDesc}>{c.desc}</span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            {querying && toolCalls.length > 0 && (
              <div className={styles.toolCallsBar}>
                {toolCalls.map((tc, i) => (
                  <span key={i} className={styles.toolCallBadge}>
                    {typeof tc === 'string' ? tc : tc.name}
                  </span>
                ))}
              </div>
            )}
            <div className={styles.holder}>
              <div className={styles.bar}>
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
                  placeholder={
                    aiApiKeyValid
                      ? t("chat.placeholder")
                      : "Configure a chave da OpenAI em Settings para usar o chat."
                  }
                  autoFocus
                />

                <button
                  type="button"
                  className={`${styles.ask} ${querying ? styles.processing : ""}`}
                  onClick={onSubmit}
                  disabled={!canSubmit}
                >
                  {querying ? (
                    <Thinking className={styles.spinner} />
                  ) : (
                    <ArrowRightIcon className={styles.sendIcon} />
                  )}
                </button>
              </div>
              {!aiApiKeyValid && (
                <div className={`${styles.statusLine} ${styles.warningText}`}>
                  Chave de API nao configurada.
                </div>
              )}
              {requestError && (
                <div className={`${styles.statusLine} ${styles.errorText}`}>
                  {requestError}
                </div>
              )}
              <div className={styles.disclaimer}>{t("chat.disclaimer")}</div>
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
