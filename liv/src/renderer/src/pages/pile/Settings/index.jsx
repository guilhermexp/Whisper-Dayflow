import styles from "./Settings.module.scss"
import layoutStyles from "../PileLayout.module.scss"
import {
  CrossIcon,
  ChevronRightIcon,
  NotebookIcon,
  AudiowaveIcon,
  AIIcon,
} from "renderer/icons"
import { useEffect, useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"
import * as Tabs from "@radix-ui/react-tabs"
import { Switch } from "../../../components/ui/switch"
import { tipcClient } from "renderer/lib/tipc-client"
import { useAIContext } from "renderer/context/AIContext"
import { useTranslation } from "react-i18next"
import { availableThemes, usePilesContext } from "renderer/context/PilesContext"
import AISettingTabs from "./AISettingsTabs"
import TranscriptionSettingsTabs from "./TranscriptionSettingsTabs"
import { useIndexContext } from "renderer/context/IndexContext"
import {
  useConfigQuery,
  useSaveConfigMutation,
} from "renderer/lib/query-client"
import { PREDEFINED_PROMPTS } from "../../../../../shared/data/predefined-prompts"
import Navigation from "../Navigation"

function Settings() {
  const { t } = useTranslation()
  const { regenerateEmbeddings } = useIndexContext()
  const {
    ai,
    prompt,
    setPrompt,
    updateSettings,
    setBaseUrl,
    getKey,
    setKey,
    deleteKey,
    model,
    setModel,
    ollama,
    baseUrl,
  } = useAIContext()
  const [APIkey, setCurrentKey] = useState("")
  const [originalAPIkey, setOriginalAPIkey] = useState("")
  const { currentTheme, setTheme, currentPile, isPilesLoaded } = usePilesContext()

  // Track original theme to detect changes
  const [originalTheme, setOriginalTheme] = useState(null)
  const [pendingTheme, setPendingTheme] = useState(null)

  // Initialize originalTheme when currentTheme loads
  useEffect(() => {
    if (currentTheme && originalTheme === null) {
      setOriginalTheme(currentTheme)
    }
  }, [currentTheme, originalTheme])

  const [mainTab, setMainTab] = useState("journal")
  const navigate = useNavigate()

  // Liv configuration hooks
  const livConfigQuery = useConfigQuery()
  const saveLivConfigMutation = useSaveConfigMutation()
  const [expandedSection, setExpandedSection] = useState(null)

  // Prompt editor states
  const [promptEditorOpen, setPromptEditorOpen] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState(null)
  const [viewingPrompt, setViewingPrompt] = useState(null)
  const [promptForm, setPromptForm] = useState({
    title: "",
    description: "",
    promptText: "",
  })

  // The displayed theme (pending or current)
  const displayedTheme = pendingTheme ?? currentTheme

  // Detect if there are unsaved changes
  const hasChanges = useMemo(() => {
    const apiKeyChanged = APIkey !== originalAPIkey
    const themeChanged = pendingTheme !== null && pendingTheme !== originalTheme
    return apiKeyChanged || themeChanged
  }, [APIkey, originalAPIkey, pendingTheme, originalTheme])

  const themeStyles = useMemo(
    () => (displayedTheme ? `${displayedTheme}Theme` : ""),
    [displayedTheme],
  )

  const renderThemes = () => {
    if (!currentPile || !isPilesLoaded) {
      return (
        <div style={{
          padding: '20px',
          textAlign: 'center',
          color: 'var(--secondary)',
          fontSize: '13px'
        }}>
          Carregando configuração do diário...
        </div>
      )
    }

    return Object.keys(availableThemes).map((theme, index) => {
      const colors = availableThemes[theme]
      const isSelected = displayedTheme === theme
      return (
        <button
          key={`theme-${theme}`}
          className={`${styles.theme} ${isSelected && styles.current}`}
          onClick={() => {
            // Set pending theme (will be saved when user clicks Save)
            setPendingTheme(theme)
          }}
          title={theme.charAt(0).toUpperCase() + theme.slice(1)}
        >
          <div
            className={styles.color1}
            style={{ background: colors.primary }}
          ></div>
        </button>
      )
    })
  }

  const handleViewPrompt = (prompt) => {
    setViewingPrompt(prompt)
    setEditingPrompt(null)
    setPromptForm({
      title: prompt.title,
      description: prompt.description || "",
      promptText: prompt.promptText,
    })
    setPromptEditorOpen(true)
  }

  // OpenRouter models state
  const [openrouterModels, setOpenrouterModels] = useState([])
  const [loadingOpenrouterModels, setLoadingOpenrouterModels] = useState(false)

  const saveLivConfig = (config) => {
    saveLivConfigMutation.mutate({
      config: {
        ...livConfigQuery.data,
        ...config,
      },
    })
  }

  const handleFetchOpenrouterModels = async () => {
    setLoadingOpenrouterModels(true)
    try {
      const models = await tipcClient.fetchOpenRouterModels()
      setOpenrouterModels(models.map((m) => ({ id: m.id, name: m.name })))
    } catch (error) {
      console.error("Failed to fetch OpenRouter models:", error)
    } finally {
      setLoadingOpenrouterModels(false)
    }
  }

  const handleCreatePrompt = () => {
    setEditingPrompt(null)
    setPromptForm({ title: "", description: "", promptText: "" })
    setPromptEditorOpen(true)
  }

  const handleEditPrompt = (prompt) => {
    setEditingPrompt(prompt)
    setViewingPrompt(null)
    setPromptForm({
      title: prompt.title,
      description: prompt.description || "",
      promptText: prompt.promptText,
    })
    setPromptEditorOpen(true)
  }

  const handleSavePrompt = () => {
    if (!promptForm.title || !promptForm.promptText) return

    const customPrompts = livConfigQuery.data?.customPrompts || []

    if (editingPrompt) {
      // Update existing
      const updated = customPrompts.map((p) =>
        p.id === editingPrompt.id
          ? { ...p, ...promptForm, updatedAt: Date.now() }
          : p,
      )
      saveLivConfig({ customPrompts: updated })
    } else {
      // Create new
      const newPrompt = {
        id: `custom-${Date.now()}`,
        ...promptForm,
        category: "custom",
        icon: "i-mingcute-edit-line",
        triggerWords: [],
        useSystemInstructions: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      saveLivConfig({ customPrompts: [...customPrompts, newPrompt] })
    }

    setPromptEditorOpen(false)
    setEditingPrompt(null)
    setPromptForm({ title: "", description: "", promptText: "" })
  }

  const handleDeletePrompt = (promptId) => {
    const customPrompts = livConfigQuery.data?.customPrompts || []
    const filtered = customPrompts.filter((p) => p.id !== promptId)
    saveLivConfig({ customPrompts: filtered })
  }

  const retrieveKey = async () => {
    const k = await getKey()
    setCurrentKey(k)
    setOriginalAPIkey(k)
  }

  useEffect(() => {
    retrieveKey()
  }, [])

  const handleOnChangeBaseUrl = (e) => {
    setBaseUrl(e.target.value)
  }

  const handleOnChangeModel = (e) => {
    setModel(e.target.value)
  }

  const handleOnChangeKey = (e) => {
    setCurrentKey(e.target.value)
  }

  const handleOnChangePrompt = (e) => {
    const p = e.target.value ?? ""
    setPrompt(p)
  }

  const [saveStatus, setSaveStatus] = useState(null)

  const handleSaveChanges = async () => {
    try {
      if (!APIkey || APIkey == "") {
        deleteKey()
      } else {
        setKey(APIkey)
      }

      updateSettings(prompt)
      // regenerateEmbeddings();

      // Save pending theme if changed
      if (pendingTheme !== null && pendingTheme !== originalTheme) {
        console.log("[Settings] Saving theme:", pendingTheme)
        setTheme(pendingTheme)
        setOriginalTheme(pendingTheme)
        setPendingTheme(null)
      }

      // Update original value to match saved value
      setOriginalAPIkey(APIkey)

      setSaveStatus("success")
      setTimeout(() => setSaveStatus(null), 2000)
    } catch (error) {
      console.error("Failed to save settings:", error)
      setSaveStatus("error")
      setTimeout(() => setSaveStatus(null), 3000)
    }
  }

  const handleClose = () => {
    navigate(-1)
  }

  // Detect platform
  const isMac = window.electron?.isMac
  const osStyles = isMac ? layoutStyles.macOS : layoutStyles.windows

  return (
    <div className={`${layoutStyles.frame} ${themeStyles} ${osStyles}`}>
      <div className={layoutStyles.bg}></div>
      <div className={styles.pageContainer}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.wrapper}>
            <h1 className={styles.DialogTitle}>
              {t("settingsDialog.title")}
            </h1>
            <button className={styles.close} aria-label="Close" onClick={handleClose}>
              <CrossIcon style={{ height: 14, width: 14 }} />
            </button>
          </div>
        </div>

          {/* Main Content */}
          <div className={styles.mainContent}>
            <div className={styles.Container}>
              <Tabs.Root
                value={mainTab}
                onValueChange={setMainTab}
                className={styles.tabsRoot}
              >
                <Tabs.List className={styles.TabsList}>
                  <Tabs.Trigger value="journal" className={styles.TabTrigger}>
                    <NotebookIcon style={{ height: "16px", width: "16px" }} />
                    {t("settingsDialog.tabs.journal")}
                  </Tabs.Trigger>
                  <Tabs.Trigger value="whisper" className={styles.TabTrigger}>
                    <AudiowaveIcon style={{ height: "16px", width: "16px" }} />
                    {t("settingsDialog.tabs.whisper")}
                  </Tabs.Trigger>
                  <Tabs.Trigger
                    value="enhancement"
                    className={styles.TabTrigger}
                  >
                    <AIIcon style={{ height: "16px", width: "16px" }} />
                    {t("settingsDialog.tabs.enhancement")}
                  </Tabs.Trigger>
                </Tabs.List>

                {/* Journal Tab */}
                <Tabs.Content value="journal">
                  <fieldset className={styles.Fieldset}>
                    <label className={styles.Label}>
                      {t("settingsDialog.journal.appearance")}
                    </label>
                    <div className={styles.themes}>{renderThemes()}</div>
                  </fieldset>

                  <fieldset className={styles.Fieldset}>
                    <label className={styles.Label}>
                      {t("settingsDialog.journal.selectProvider")}
                    </label>
                    <AISettingTabs
                      APIkey={APIkey}
                      setCurrentKey={setCurrentKey}
                    />
                  </fieldset>

                  <fieldset className={styles.Fieldset}>
                    <label className={styles.Label}>
                      {t("settingsDialog.journal.aiPrompt")}
                    </label>
                    <textarea
                      className={styles.Textarea}
                      placeholder={t(
                        "settingsDialog.journal.promptPlaceholder",
                      )}
                      value={prompt}
                      onChange={handleOnChangePrompt}
                    />
                  </fieldset>
                </Tabs.Content>

                {/* Whisper Tab */}
                <Tabs.Content value="whisper">
                  <fieldset className={styles.Fieldset}>
                    <label className={styles.Label}>
                      {t("settingsDialog.whisper.transcriptionProvider")}
                    </label>
                    <TranscriptionSettingsTabs />
                  </fieldset>

                  {/* Liv Configuration Section */}
                  {livConfigQuery.data && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                        marginTop: "14px",
                      }}
                    >
                      {/* Recording Settings */}
                      <div className={styles.ExpandableSection}>
                        <button
                          className={styles.ExpandableHeader}
                          onClick={() =>
                            setExpandedSection(
                              expandedSection === "recording"
                                ? null
                                : "recording",
                            )
                          }
                        >
                          <span>{t("settingsDialog.whisper.recording")}</span>
                          <ChevronRightIcon
                            style={{
                              height: "14px",
                              width: "14px",
                              transform:
                                expandedSection === "recording"
                                  ? "rotate(90deg)"
                                  : "rotate(0deg)",
                              transition: "transform 0.2s ease",
                            }}
                          />
                        </button>
                        {expandedSection === "recording" && (
                          <div className={styles.ExpandableContent}>
                            <fieldset
                              className={styles.Fieldset}
                              style={{ marginTop: 0 }}
                            >
                              <label className={styles.Label}>
                                {t("settingsDialog.whisper.shortcut")}
                              </label>
                              <select
                                className={styles.Select}
                                value={
                                  livConfigQuery.data.shortcut || "hold-ctrl"
                                }
                                onChange={(e) =>
                                  saveLivConfig({ shortcut: e.target.value })
                                }
                              >
                                <option value="hold-ctrl">
                                  {t(
                                    "settingsDialog.whisper.shortcuts.holdCtrl",
                                  )}
                                </option>
                                <option value="instant-ctrl">
                                  {t(
                                    "settingsDialog.whisper.shortcuts.instantCtrl",
                                  )}
                                </option>
                                <option value="fn-key">
                                  {t("settingsDialog.whisper.shortcuts.fnKey")}
                                </option>
                                <option value="ctrl-slash">
                                  {t(
                                    "settingsDialog.whisper.shortcuts.ctrlSlash",
                                  )}
                                </option>
                              </select>
                            </fieldset>
                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "12px",
                                marginTop: "12px",
                                cursor: "pointer",
                              }}
                            >
                              <Switch
                                checked={
                                  livConfigQuery.data.enableAudioCues ?? true
                                }
                                onCheckedChange={(checked) =>
                                  saveLivConfig({ enableAudioCues: checked })
                                }
                              />
                              <span
                                style={{
                                  fontSize: "13px",
                                  color: "var(--secondary)",
                                }}
                              >
                                {t("settingsDialog.whisper.audioCues")}
                              </span>
                            </label>
                            {window.electron?.isMac && (
                              <label
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "12px",
                                  marginTop: "10px",
                                  cursor: "pointer",
                                }}
                              >
                                <Switch
                                  checked={
                                    livConfigQuery.data
                                      .isPauseMediaEnabled ?? false
                                  }
                                  onCheckedChange={(checked) =>
                                    saveLivConfig({
                                      isPauseMediaEnabled: checked,
                                    })
                                  }
                                />
                                <span
                                  style={{
                                    fontSize: "13px",
                                    color: "var(--secondary)",
                                  }}
                                >
                                  {t("settingsDialog.whisper.muteSystemAudio")}
                                </span>
                              </label>
                            )}
                          </div>
                        )}
                      </div>

                      {/* App Settings */}
                      <div className={styles.ExpandableSection}>
                        <button
                          className={styles.ExpandableHeader}
                          onClick={() =>
                            setExpandedSection(
                              expandedSection === "app" ? null : "app",
                            )
                          }
                        >
                          <span>{t("settingsDialog.whisper.app")}</span>
                          <ChevronRightIcon
                            style={{
                              height: "14px",
                              width: "14px",
                              transform:
                                expandedSection === "app"
                                  ? "rotate(90deg)"
                                  : "rotate(0deg)",
                              transition: "transform 0.2s ease",
                            }}
                          />
                        </button>
                        {expandedSection === "app" && (
                          <div className={styles.ExpandableContent}>
                            <fieldset
                              className={styles.Fieldset}
                              style={{ marginTop: 0 }}
                            >
                              <label className={styles.Label}>
                                {t("settingsDialog.whisper.language")}
                              </label>
                              <select
                                className={styles.Select}
                                value={
                                  livConfigQuery.data.language || "en-US"
                                }
                                onChange={(e) =>
                                  saveLivConfig({ language: e.target.value })
                                }
                              >
                                <option value="en-US">English (US)</option>
                                <option value="pt-BR">
                                  Português (Brasil)
                                </option>
                              </select>
                            </fieldset>
                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "12px",
                                marginTop: "12px",
                                cursor: "pointer",
                              }}
                            >
                              <Switch
                                checked={
                                  livConfigQuery.data.launchOnStartup ??
                                  false
                                }
                                onCheckedChange={(checked) =>
                                  saveLivConfig({ launchOnStartup: checked })
                                }
                              />
                              <span
                                style={{
                                  fontSize: "13px",
                                  color: "var(--secondary)",
                                }}
                              >
                                {t("settingsDialog.whisper.launchOnStartup")}
                              </span>
                            </label>
                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "12px",
                                marginTop: "10px",
                                cursor: "pointer",
                              }}
                            >
                              <Switch
                                checked={
                                  livConfigQuery.data.preserveClipboard ??
                                  true
                                }
                                onCheckedChange={(checked) =>
                                  saveLivConfig({
                                    preserveClipboard: checked,
                                  })
                                }
                              />
                              <span
                                style={{
                                  fontSize: "13px",
                                  color: "var(--secondary)",
                                }}
                              >
                                {t("settingsDialog.whisper.preserveClipboard")}
                              </span>
                            </label>
                            {window.electron?.isMac && (
                              <label
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "12px",
                                  marginTop: "10px",
                                  cursor: "pointer",
                                }}
                              >
                                <Switch
                                  checked={
                                    livConfigQuery.data.hideDockIcon ?? false
                                  }
                                  onCheckedChange={(checked) =>
                                    saveLivConfig({ hideDockIcon: checked })
                                  }
                                />
                                <span
                                  style={{
                                    fontSize: "13px",
                                    color: "var(--secondary)",
                                  }}
                                >
                                  {t("settingsDialog.whisper.hideDockIcon")}
                                </span>
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </Tabs.Content>

                {/* Enhancement Tab */}
                <Tabs.Content value="enhancement">
                  {livConfigQuery.data && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "14px",
                      }}
                    >
                      {/* Enable Enhancement */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "12px",
                          background: "var(--bg-tertiary)",
                          borderRadius: "8px",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: "13px",
                              fontWeight: "500",
                              color: "var(--primary)",
                            }}
                          >
                            {t("settingsDialog.enhancement.enableAI")}
                          </div>
                          <div
                            style={{
                              fontSize: "11px",
                              color: "var(--secondary)",
                              marginTop: "2px",
                            }}
                          >
                            {t("settingsDialog.enhancement.enableDesc")}
                          </div>
                        </div>
                        <label
                          style={{
                            position: "relative",
                            display: "inline-block",
                            width: "40px",
                            height: "22px",
                            flexShrink: 0,
                          }}
                        >
                          <input
                            type="checkbox"
                            style={{
                              opacity: 0,
                              width: 0,
                              height: 0,
                            }}
                            checked={
                              livConfigQuery.data.enhancementEnabled ?? false
                            }
                            onChange={(e) =>
                              saveLivConfig({
                                enhancementEnabled: e.target.checked,
                              })
                            }
                          />
                          <span
                            style={{
                              position: "absolute",
                              cursor: "pointer",
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              backgroundColor: livConfigQuery.data
                                .enhancementEnabled
                                ? "var(--active)"
                                : "var(--secondary-bg)",
                              borderRadius: "22px",
                              transition: "0.3s",
                            }}
                          >
                            <span
                              style={{
                                position: "absolute",
                                content: '""',
                                height: "16px",
                                width: "16px",
                                left: livConfigQuery.data.enhancementEnabled
                                  ? "21px"
                                  : "3px",
                                bottom: "3px",
                                backgroundColor: "white",
                                borderRadius: "50%",
                                transition: "0.3s",
                              }}
                            ></span>
                          </span>
                        </label>
                      </div>

                      {livConfigQuery.data.enhancementEnabled && (
                        <>
                          {/* Enhancement Provider */}
                          <fieldset
                            className={styles.Fieldset}
                            style={{ marginTop: 0 }}
                          >
                            <label className={styles.Label}>
                              {t("settingsDialog.enhancement.provider")}
                            </label>
                            <select
                              className={styles.Select}
                              value={
                                livConfigQuery.data.enhancementProvider ||
                                "openai"
                              }
                              onChange={(e) =>
                                saveLivConfig({
                                  enhancementProvider: e.target.value,
                                })
                              }
                            >
                              <option value="openai">
                                {t("providers.openai")}
                              </option>
                              <option value="groq">
                                {t("providers.groq")}
                              </option>
                              <option value="gemini">
                                {t("providers.gemini")}
                              </option>
                              <option value="openrouter">
                                {t("providers.openrouter")}
                              </option>
                              <option value="custom">
                                {t("providers.custom")}
                              </option>
                            </select>
                          </fieldset>

                          {/* OpenAI Model Selector */}
                          {livConfigQuery.data.enhancementProvider ===
                            "openai" && (
                            <fieldset
                              className={styles.Fieldset}
                              style={{ marginTop: 0 }}
                            >
                              <label className={styles.Label}>
                                {t("settingsDialog.journal.model")}
                              </label>
                              <select
                                className={styles.Select}
                                value={
                                  livConfigQuery.data
                                    .enhancementOpenaiModel || "gpt-5-mini"
                                }
                                onChange={(e) =>
                                  saveLivConfig({
                                    enhancementOpenaiModel: e.target.value,
                                  })
                                }
                              >
                                <option value="gpt-5-mini">gpt-5-mini</option>
                                <option value="gpt-5.1">gpt-5.1</option>
                                <option value="gpt-5">gpt-5</option>
                                <option value="gpt-4o">gpt-4o</option>
                              </select>
                            </fieldset>
                          )}

                          {/* Groq Model Selector */}
                          {livConfigQuery.data.enhancementProvider ===
                            "groq" && (
                            <fieldset
                              className={styles.Fieldset}
                              style={{ marginTop: 0 }}
                            >
                              <label className={styles.Label}>
                                {t("settingsDialog.journal.model")}
                              </label>
                              <select
                                className={styles.Select}
                                value={
                                  livConfigQuery.data.enhancementGroqModel ||
                                  "llama-3.1-70b-versatile"
                                }
                                onChange={(e) =>
                                  saveLivConfig({
                                    enhancementGroqModel: e.target.value,
                                  })
                                }
                              >
                                <option value="llama-3.3-70b-versatile">
                                  llama-3.3-70b-versatile
                                </option>
                                <option value="llama-3.1-70b-versatile">
                                  llama-3.1-70b-versatile
                                </option>
                                <option value="llama-3.1-8b-instant">
                                  llama-3.1-8b-instant
                                </option>
                                <option value="mixtral-8x7b-32768">
                                  mixtral-8x7b-32768
                                </option>
                                <option value="gemma2-9b-it">
                                  gemma2-9b-it
                                </option>
                              </select>
                            </fieldset>
                          )}

                          {/* Gemini Model Selector */}
                          {livConfigQuery.data.enhancementProvider ===
                            "gemini" && (
                            <fieldset
                              className={styles.Fieldset}
                              style={{ marginTop: 0 }}
                            >
                              <label className={styles.Label}>
                                {t("settingsDialog.journal.model")}
                              </label>
                              <select
                                className={styles.Select}
                                value={
                                  livConfigQuery.data
                                    .enhancementGeminiModel ||
                                  "gemini-1.5-flash"
                                }
                                onChange={(e) =>
                                  saveLivConfig({
                                    enhancementGeminiModel: e.target.value,
                                  })
                                }
                              >
                                <option value="gemini-1.5-flash">
                                  gemini-1.5-flash
                                </option>
                                <option value="gemini-1.5-pro">
                                  gemini-1.5-pro
                                </option>
                                <option value="gemini-2.0-flash-exp">
                                  gemini-2.0-flash-exp
                                </option>
                              </select>
                            </fieldset>
                          )}

                          {/* Custom Provider Settings */}
                          {livConfigQuery.data.enhancementProvider ===
                            "custom" && (
                            <div
                              style={{
                                padding: "12px",
                                background: "var(--bg-tertiary)",
                                borderRadius: "8px",
                              }}
                            >
                              <fieldset
                                className={styles.Fieldset}
                                style={{ marginTop: 0 }}
                              >
                                <label className={styles.Label}>
                                  {t("settingsDialog.enhancement.customApiKey")}
                                </label>
                                <input
                                  className={styles.Input}
                                  type="password"
                                  value={
                                    livConfigQuery.data
                                      .customEnhancementApiKey || ""
                                  }
                                  onChange={(e) =>
                                    saveLivConfig({
                                      customEnhancementApiKey: e.target.value,
                                    })
                                  }
                                  placeholder="sk-..."
                                />
                              </fieldset>
                              <fieldset className={styles.Fieldset}>
                                <label className={styles.Label}>
                                  {t(
                                    "settingsDialog.enhancement.customBaseUrl",
                                  )}
                                </label>
                                <input
                                  className={styles.Input}
                                  value={
                                    livConfigQuery.data
                                      .customEnhancementBaseUrl || ""
                                  }
                                  onChange={(e) =>
                                    saveLivConfig({
                                      customEnhancementBaseUrl: e.target.value,
                                    })
                                  }
                                  placeholder="https://api.example.com/v1"
                                />
                              </fieldset>
                              <fieldset className={styles.Fieldset}>
                                <label className={styles.Label}>
                                  {t("settingsDialog.enhancement.customModel")}
                                </label>
                                <input
                                  className={styles.Input}
                                  value={
                                    livConfigQuery.data
                                      .customEnhancementModel || ""
                                  }
                                  onChange={(e) =>
                                    saveLivConfig({
                                      customEnhancementModel: e.target.value,
                                    })
                                  }
                                  placeholder="model-name"
                                />
                              </fieldset>
                            </div>
                          )}

                          {/* OpenRouter Model Selector */}
                          {livConfigQuery.data.enhancementProvider ===
                            "openrouter" && (
                            <div
                              style={{
                                padding: "12px",
                                background: "var(--bg-tertiary)",
                                borderRadius: "8px",
                              }}
                            >
                              <label className={styles.Label}>
                                {t(
                                  "settingsDialog.enhancement.openrouterModel",
                                )}
                              </label>
                              {openrouterModels.length === 0 ? (
                                <button
                                  className={styles.Button}
                                  style={{ width: "100%", marginTop: "8px" }}
                                  onClick={handleFetchOpenrouterModels}
                                  disabled={loadingOpenrouterModels}
                                >
                                  {loadingOpenrouterModels
                                    ? t(
                                        "settingsDialog.enhancement.loadingModels",
                                      )
                                    : t(
                                        "settingsDialog.enhancement.fetchModels",
                                      )}
                                </button>
                              ) : (
                                <select
                                  className={styles.Select}
                                  value={
                                    livConfigQuery.data.openrouterModel || ""
                                  }
                                  onChange={(e) =>
                                    saveLivConfig({
                                      openrouterModel: e.target.value,
                                    })
                                  }
                                >
                                  <option value="">
                                    {t(
                                      "settingsDialog.enhancement.selectModel",
                                    )}
                                  </option>
                                  {openrouterModels.map((model) => (
                                    <option key={model.id} value={model.id}>
                                      {model.name}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          )}

                          {/* Prompts */}
                          <div className={styles.ExpandableSection}>
                            <button
                              className={styles.ExpandableHeader}
                              onClick={() =>
                                setExpandedSection(
                                  expandedSection === "prompts"
                                    ? null
                                    : "prompts",
                                )
                              }
                            >
                              <span>
                                {t("settingsDialog.enhancement.prompts")}
                              </span>
                              <ChevronRightIcon
                                style={{
                                  height: "14px",
                                  width: "14px",
                                  transform:
                                    expandedSection === "prompts"
                                      ? "rotate(90deg)"
                                      : "rotate(0deg)",
                                  transition: "transform 0.2s ease",
                                }}
                              />
                            </button>
                            {expandedSection === "prompts" && (
                              <div className={styles.ExpandableContent}>
                                {/* Predefined Prompts */}
                                <div
                                  style={{
                                    fontSize: "10px",
                                    color: "var(--secondary)",
                                    marginBottom: "6px",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                  }}
                                >
                                  {t("settingsDialog.enhancement.predefined")}
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "6px",
                                  }}
                                >
                                  {PREDEFINED_PROMPTS.map((prompt) => {
                                    const isActive =
                                      livConfigQuery.data
                                        .selectedPromptId === prompt.id ||
                                      (!livConfigQuery.data
                                        .selectedPromptId &&
                                        prompt.id === "default")
                                    return (
                                      <div
                                        key={prompt.id}
                                        className={`${styles.PromptItem} ${isActive ? styles.active : ""}`}
                                      >
                                        <div
                                          className={styles.PromptInfo}
                                          onClick={() =>
                                            saveLivConfig({
                                              selectedPromptId: prompt.id,
                                            })
                                          }
                                        >
                                          <div className={styles.PromptTitle}>
                                            {prompt.title}
                                          </div>
                                          <div className={styles.PromptDesc}>
                                            {prompt.description}
                                          </div>
                                        </div>
                                        <div className={styles.PromptActions}>
                                          {isActive && (
                                            <span
                                              style={{
                                                fontSize: "10px",
                                                background:
                                                  "var(--active-text)",
                                                color: "var(--active)",
                                                padding: "2px 6px",
                                                borderRadius: "4px",
                                              }}
                                            >
                                              {t(
                                                "settingsDialog.enhancement.active",
                                              )}
                                            </span>
                                          )}
                                          <button
                                            className={styles.ActionButton}
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleViewPrompt(prompt)
                                            }}
                                          >
                                            {t(
                                              "settingsDialog.enhancement.view",
                                            )}
                                          </button>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>

                                {/* Custom Prompts */}
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    marginTop: "12px",
                                    marginBottom: "6px",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: "10px",
                                      color: "var(--secondary)",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.5px",
                                    }}
                                  >
                                    {t("settingsDialog.enhancement.custom")}
                                  </div>
                                  <button
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "4px",
                                      padding: "4px 8px",
                                      background: "var(--active)",
                                      color: "var(--active-text)",
                                      border: "none",
                                      borderRadius: "4px",
                                      cursor: "pointer",
                                      fontSize: "10px",
                                    }}
                                    onClick={handleCreatePrompt}
                                  >
                                    +{" "}
                                    {t(
                                      "settingsDialog.enhancement.promptEditor.newPrompt",
                                    )}
                                  </button>
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "6px",
                                  }}
                                >
                                  {(livConfigQuery.data.customPrompts || [])
                                    .length === 0 ? (
                                    <div
                                      style={{
                                        fontSize: "11px",
                                        color: "var(--secondary)",
                                        textAlign: "center",
                                        padding: "12px",
                                      }}
                                    >
                                      {t(
                                        "settingsDialog.enhancement.noCustomPrompts",
                                      )}
                                    </div>
                                  ) : (
                                    (
                                      livConfigQuery.data.customPrompts || []
                                    ).map((prompt) => (
                                      <div
                                        key={prompt.id}
                                        className={`${styles.PromptItem} ${livConfigQuery.data.selectedPromptId === prompt.id ? styles.active : ""}`}
                                      >
                                        <div
                                          className={styles.PromptInfo}
                                          onClick={() =>
                                            saveLivConfig({
                                              selectedPromptId: prompt.id,
                                            })
                                          }
                                        >
                                          <div className={styles.PromptTitle}>
                                            {prompt.title}
                                          </div>
                                          {prompt.description && (
                                            <div className={styles.PromptDesc}>
                                              {prompt.description}
                                            </div>
                                          )}
                                        </div>
                                        <div className={styles.PromptActions}>
                                          {livConfigQuery.data
                                            .selectedPromptId === prompt.id && (
                                            <span
                                              style={{
                                                fontSize: "10px",
                                                background:
                                                  "var(--active-text)",
                                                color: "var(--active)",
                                                padding: "2px 6px",
                                                borderRadius: "4px",
                                                marginRight: "4px",
                                              }}
                                            >
                                              {t(
                                                "settingsDialog.enhancement.active",
                                              )}
                                            </span>
                                          )}
                                          <button
                                            className={styles.ActionButton}
                                            onClick={() =>
                                              handleEditPrompt(prompt)
                                            }
                                            title={t("common.edit")}
                                          >
                                            {t("common.edit")}
                                          </button>
                                          <button
                                            className={`${styles.ActionButton} ${styles.delete}`}
                                            onClick={() =>
                                              handleDeletePrompt(prompt.id)
                                            }
                                            title={t("common.delete")}
                                          >
                                            {t("common.delete")}
                                          </button>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Context Capture */}
                          <div className={styles.ExpandableSection}>
                            <button
                              className={styles.ExpandableHeader}
                              onClick={() =>
                                setExpandedSection(
                                  expandedSection === "context"
                                    ? null
                                    : "context",
                                )
                              }
                            >
                              <span>
                                {t("settingsDialog.enhancement.contextCapture")}
                              </span>
                              <ChevronRightIcon
                                style={{
                                  height: "14px",
                                  width: "14px",
                                  transform:
                                    expandedSection === "context"
                                      ? "rotate(90deg)"
                                      : "rotate(0deg)",
                                  transition: "transform 0.2s ease",
                                }}
                              />
                            </button>
                            {expandedSection === "context" && (
                              <div className={styles.ExpandableContent}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    marginBottom: "8px",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    style={{
                                      width: 14,
                                      height: 14,
                                      cursor: "pointer",
                                    }}
                                    checked={
                                      livConfigQuery.data
                                        .useClipboardContext ?? false
                                    }
                                    onChange={(e) =>
                                      saveLivConfig({
                                        useClipboardContext: e.target.checked,
                                      })
                                    }
                                  />
                                  <div>
                                    <span
                                      style={{
                                        fontSize: "12px",
                                        color: "var(--primary)",
                                      }}
                                    >
                                      {t(
                                        "settingsDialog.enhancement.useClipboard",
                                      )}
                                    </span>
                                    <div
                                      style={{
                                        fontSize: "10px",
                                        color: "var(--secondary)",
                                      }}
                                    >
                                      {t(
                                        "settingsDialog.enhancement.clipboardDesc",
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    marginBottom: "8px",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    style={{
                                      width: 14,
                                      height: 14,
                                      cursor: "pointer",
                                    }}
                                    checked={
                                      livConfigQuery.data
                                        .useSelectedTextContext ?? false
                                    }
                                    onChange={(e) =>
                                      saveLivConfig({
                                        useSelectedTextContext:
                                          e.target.checked,
                                      })
                                    }
                                  />
                                  <div>
                                    <span
                                      style={{
                                        fontSize: "12px",
                                        color: "var(--primary)",
                                      }}
                                    >
                                      {t(
                                        "settingsDialog.enhancement.useSelectedText",
                                      )}
                                    </span>
                                    <div
                                      style={{
                                        fontSize: "10px",
                                        color: "var(--secondary)",
                                      }}
                                    >
                                      {t(
                                        "settingsDialog.enhancement.selectedTextDesc",
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    style={{
                                      width: 14,
                                      height: 14,
                                      cursor: "pointer",
                                    }}
                                    checked={
                                      livConfigQuery.data
                                        .useScreenCaptureContext ?? false
                                    }
                                    onChange={(e) =>
                                      saveLivConfig({
                                        useScreenCaptureContext:
                                          e.target.checked,
                                      })
                                    }
                                  />
                                  <div>
                                    <span
                                      style={{
                                        fontSize: "12px",
                                        color: "var(--primary)",
                                      }}
                                    >
                                      {t(
                                        "settingsDialog.enhancement.useScreenCapture",
                                      )}
                                    </span>
                                    <div
                                      style={{
                                        fontSize: "10px",
                                        color: "var(--secondary)",
                                      }}
                                    >
                                      {t(
                                        "settingsDialog.enhancement.screenCaptureDesc",
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--secondary)",
                          padding: "8px 0",
                          textAlign: "center",
                        }}
                      >
                        {t("settingsDialog.enhancement.description")}
                      </div>
                    </div>
                  )}
                </Tabs.Content>
              </Tabs.Root>
            </div>
          </div>

          <AnimatePresence>
            {(hasChanges || saveStatus) && (
              <motion.div
                className={styles.footer}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.2 }}
              >
                <button
                  className={styles.Button}
                  onClick={handleSaveChanges}
                  disabled={!hasChanges && !saveStatus}
                  style={{
                    background:
                      saveStatus === "success"
                        ? "var(--success, #22c55e)"
                        : saveStatus === "error"
                          ? "var(--error, #ef4444)"
                          : undefined,
                    transition: "background 0.3s ease",
                  }}
                >
                  {saveStatus === "success"
                    ? "✓ " + t("settingsDialog.saved")
                    : saveStatus === "error"
                      ? "✗ " + t("settingsDialog.saveError")
                      : t("settingsDialog.saveChanges")}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Prompt Editor Dialog - Inside Dialog.Content for proper z-index */}
          {promptEditorOpen && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0, 0, 0, 0.7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 100,
              }}
            >
              <div
                style={{
                  background: "var(--bg-primary)",
                  borderRadius: "12px",
                  padding: "20px",
                  width: "400px",
                  maxWidth: "90vw",
                  maxHeight: "80vh",
                  overflow: "auto",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 16px",
                    fontSize: "16px",
                    fontWeight: "600",
                  }}
                >
                  {viewingPrompt
                    ? t("settingsDialog.enhancement.promptEditor.editPrompt")
                    : editingPrompt
                      ? t("settingsDialog.enhancement.promptEditor.editPrompt")
                      : t("settingsDialog.enhancement.promptEditor.newPrompt")}
                </h3>

                <fieldset className={styles.Fieldset}>
                  <label className={styles.Label}>
                    {t("settingsDialog.enhancement.promptEditor.title")}
                  </label>
                  <input
                    className={styles.Input}
                    value={promptForm.title}
                    onChange={(e) =>
                      setPromptForm({ ...promptForm, title: e.target.value })
                    }
                    placeholder={t(
                      "settingsDialog.enhancement.promptEditor.titlePlaceholder",
                    )}
                  />
                </fieldset>

                <fieldset className={styles.Fieldset}>
                  <label className={styles.Label}>
                    {t("settingsDialog.enhancement.promptEditor.description")}
                  </label>
                  <input
                    className={styles.Input}
                    value={promptForm.description}
                    onChange={(e) =>
                      setPromptForm({
                        ...promptForm,
                        description: e.target.value,
                      })
                    }
                    placeholder={t(
                      "settingsDialog.enhancement.promptEditor.descPlaceholder",
                    )}
                  />
                </fieldset>

                <fieldset className={styles.Fieldset}>
                  <label className={styles.Label}>
                    {t("settingsDialog.enhancement.promptEditor.promptText")}
                  </label>
                  <textarea
                    className={styles.Textarea}
                    value={promptForm.promptText}
                    onChange={(e) =>
                      setPromptForm({
                        ...promptForm,
                        promptText: e.target.value,
                      })
                    }
                    placeholder={t(
                      "settingsDialog.enhancement.promptEditor.promptPlaceholder",
                    )}
                    rows={8}
                  />
                </fieldset>

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    justifyContent: "flex-end",
                    marginTop: "16px",
                  }}
                >
                  <button
                    className={styles.Button}
                    style={{
                      background: "var(--secondary-bg)",
                      color: "var(--primary)",
                    }}
                    onClick={() => {
                      setPromptEditorOpen(false)
                      setEditingPrompt(null)
                      setViewingPrompt(null)
                      setPromptForm({
                        title: "",
                        description: "",
                        promptText: "",
                      })
                    }}
                  >
                    {t("settingsDialog.enhancement.promptEditor.cancel") ||
                      "Cancelar"}
                  </button>
                  <button
                    className={styles.Button}
                    onClick={async (e) => {
                      const button = e.target
                      const originalText = button.textContent

                      if (viewingPrompt) {
                        // Save as new custom prompt when editing a predefined one
                        const newPrompt = {
                          id: `custom-${Date.now()}`,
                          title: promptForm.title,
                          description: promptForm.description,
                          promptText: promptForm.promptText,
                        }
                        const currentPrompts =
                          livConfigQuery.data.customPrompts || []
                        await saveLivConfig({
                          customPrompts: [...currentPrompts, newPrompt],
                        })
                      } else if (editingPrompt) {
                        // Update existing custom prompt
                        const currentPrompts =
                          livConfigQuery.data.customPrompts || []
                        const updatedPrompts = currentPrompts.map((p) =>
                          p.id === editingPrompt.id
                            ? {
                                ...p,
                                title: promptForm.title,
                                description: promptForm.description,
                                promptText: promptForm.promptText,
                              }
                            : p,
                        )
                        await saveLivConfig({
                          customPrompts: updatedPrompts,
                        })
                      } else {
                        // Create new custom prompt
                        const newPrompt = {
                          id: `custom-${Date.now()}`,
                          title: promptForm.title,
                          description: promptForm.description,
                          promptText: promptForm.promptText,
                        }
                        const currentPrompts =
                          livConfigQuery.data.customPrompts || []
                        await saveLivConfig({
                          customPrompts: [...currentPrompts, newPrompt],
                        })
                      }

                      // Show saved confirmation
                      button.textContent = "✓ Salvo"
                      button.style.background = "var(--success, #22c55e)"
                      setTimeout(() => {
                        button.textContent = originalText
                        button.style.background = ""
                      }, 1500)
                    }}
                    disabled={!promptForm.title || !promptForm.promptText}
                  >
                    {t("settingsDialog.enhancement.promptEditor.save") ||
                      "Salvar"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        <Navigation />
      </div>
  )
}

export default Settings
export const Component = Settings
