import styles from "./Settings.module.scss"
import layoutStyles from "../PileLayout.module.scss"
import {
  CrossIcon,
  ChevronRightIcon,
  NotebookIcon,
  AudiowaveIcon,
  AIIcon,
  GlobeIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
} from "renderer/icons"
import { useEffect, useState, useMemo, useRef } from "react"
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

  const [pendingTheme, setPendingTheme] = useState(null)

  const [mainTab, setMainTab] = useState("journal")
  const navigate = useNavigate()

  // Liv configuration hooks
  const livConfigQuery = useConfigQuery()
  const saveLivConfigMutation = useSaveConfigMutation()
  const [expandedSection, setExpandedSection] = useState(null)

  // Encrypted custom key state
  const [encryptedCustomKey, setEncryptedCustomKey] = useState('')
  useEffect(() => {
    tipcClient.getCustomKey().then((k) => { if (k) setEncryptedCustomKey(k) })
  }, [])

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
    const themeChanged = pendingTheme !== null && pendingTheme !== currentTheme
    return apiKeyChanged || themeChanged
  }, [APIkey, originalAPIkey, pendingTheme, currentTheme])

  const themeStyles = useMemo(
    () => (currentTheme ? `${currentTheme}Theme` : ""),
    [currentTheme],
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

  useEffect(() => {
    // If the persisted theme changed (e.g. after save), clear pending state.
    if (pendingTheme !== null && pendingTheme === currentTheme) {
      setPendingTheme(null)
    }
  }, [pendingTheme, currentTheme])

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
      if (pendingTheme !== null && pendingTheme !== currentTheme) {
        console.log("[Settings] Saving theme:", pendingTheme)
        setTheme(pendingTheme)
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
                  <Tabs.Trigger value="agent" className={styles.TabTrigger}>
                    <AIIcon style={{ height: "16px", width: "16px" }} />
                    Agent
                  </Tabs.Trigger>
                  <Tabs.Trigger value="integrations" className={styles.TabTrigger}>
                    <GlobeIcon style={{ height: "16px", width: "16px" }} />
                    Integracoes
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
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px",
                                marginTop: "12px",
                              }}
                            >
                              <label
                                htmlFor="whisper-audio-volume"
                                style={{
                                  fontSize: "13px",
                                  color: "var(--secondary)",
                                }}
                              >
                                {t("settingsDialog.whisper.audioVolume")}
                              </label>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "12px",
                                }}
                              >
                                <input
                                  id="whisper-audio-volume"
                                  type="range"
                                  min="0"
                                  max="100"
                                  value={
                                    Math.round((livConfigQuery.data.audioVolume ?? 0.7) * 100)
                                  }
                                  onChange={(e) =>
                                    saveLivConfig({
                                      audioVolume: parseInt(e.target.value) / 100,
                                    })
                                  }
                                  style={{
                                    flex: 1,
                                    cursor: "pointer",
                                  }}
                                />
                                <span
                                  style={{
                                    fontSize: "13px",
                                    color: "var(--primary)",
                                    minWidth: "40px",
                                    textAlign: "right",
                                  }}
                                >
                                  {Math.round((livConfigQuery.data.audioVolume ?? 0.7) * 100)}%
                                </span>
                              </div>
                            </div>
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
                                  value={encryptedCustomKey}
                                  onChange={(e) => {
                                    const val = e.target.value
                                    setEncryptedCustomKey(val)
                                    if (val.trim()) {
                                      tipcClient.setCustomKey({ secretKey: val.trim() })
                                    } else {
                                      tipcClient.deleteCustomKey()
                                    }
                                  }}
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

                {/* Agent Tab */}
                <Tabs.Content value="agent">
                  <AgentSettingsTab
                    livConfig={livConfigQuery.data}
                    saveLivConfig={async (partialConfig) =>
                      saveLivConfigMutation.mutateAsync({
                        config: {
                          ...livConfigQuery.data,
                          ...partialConfig,
                        },
                      })
                    }
                  />
                </Tabs.Content>

                <Tabs.Content value="integrations">
                  <IntegrationsTab />
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

// --- Agent Settings Tab (Nanobot) ---

function AgentSettingsTab({ livConfig, saveLivConfig }) {
  const { nanobotStatus, isNanobotActive } = useAIContext()
  const [memory, setMemory] = useState("")
  const [cronJobs, setCronJobs] = useState([])
  const [subagents, setSubagents] = useState({ agents: [], count: 0 })
  const [loadingMemory, setLoadingMemory] = useState(false)
  const [agentSection, setAgentSection] = useState(null)
  const [restarting, setRestarting] = useState(false)
  const [skillsData, setSkillsData] = useState({ tools: [], skills: [] })
  const [loadingSkills, setLoadingSkills] = useState(false)
  const [bootstrapFiles, setBootstrapFiles] = useState({})
  const [editingFile, setEditingFile] = useState(null)
  const [editContent, setEditContent] = useState("")
  const [savingBootstrap, setSavingBootstrap] = useState(false)

  const nanobotEnabled = livConfig?.nanobotEnabled ?? false
  const useSeparateModel = !!(livConfig?.nanobotModel)

  const toggleNanobot = async () => {
    await saveLivConfig({ nanobotEnabled: !nanobotEnabled })
  }

  const handleRestart = async () => {
    setRestarting(true)
    try {
      await tipcClient.restartNanobot()
    } catch { /* ignore */ }
    setRestarting(false)
  }

  const loadMemory = async () => {
    setLoadingMemory(true)
    try {
      const content = await tipcClient.getNanobotMemory()
      setMemory(content || "(vazio)")
    } catch {
      setMemory("(erro ao carregar)")
    }
    setLoadingMemory(false)
  }

  const clearMemory = async () => {
    try {
      await tipcClient.resetNanobotMemory()
      setMemory("(vazio)")
    } catch { /* ignore */ }
  }

  const loadCronJobs = async () => {
    try {
      const jobs = await tipcClient.getNanobotCronJobs()
      setCronJobs(jobs || [])
    } catch {
      setCronJobs([])
    }
  }

  const loadSkills = async () => {
    setLoadingSkills(true)
    try {
      const data = await tipcClient.getNanobotToolsAndSkills()
      setSkillsData(data || { tools: [], skills: [] })
    } catch {
      setSkillsData({ tools: [], skills: [] })
    }
    setLoadingSkills(false)
  }

  const loadSubagents = async () => {
    try {
      const data = await tipcClient.getNanobotSubagents()
      setSubagents(data || { agents: [], count: 0 })
    } catch {
      setSubagents({ agents: [], count: 0 })
    }
  }

  const toggleCronJob = async (jobId) => {
    try {
      await tipcClient.toggleNanobotCronJob({ jobId })
      await loadCronJobs()
    } catch { /* ignore */ }
  }

  const loadBootstrapFiles = async () => {
    try {
      const files = await tipcClient.getNanobotBootstrapFiles()
      setBootstrapFiles(files || {})
    } catch {
      setBootstrapFiles({})
    }
  }

  const startEditing = (filename) => {
    setEditingFile(filename)
    setEditContent(bootstrapFiles[filename] || "")
  }

  const cancelEditing = () => {
    setEditingFile(null)
    setEditContent("")
  }

  const saveBootstrapFile = async () => {
    if (!editingFile) return
    setSavingBootstrap(true)
    try {
      await tipcClient.updateNanobotBootstrapFile({ filename: editingFile, content: editContent })
      setBootstrapFiles((prev) => ({ ...prev, [editingFile]: editContent }))
      setEditingFile(null)
      setEditContent("")
    } catch { /* ignore */ }
    setSavingBootstrap(false)
  }

  useEffect(() => {
    if (isNanobotActive) {
      loadCronJobs()
      loadSkills()
      loadSubagents()
    }
  }, [isNanobotActive])

  // Poll subagents every 10s when agent is active
  useEffect(() => {
    if (!isNanobotActive) return
    const interval = setInterval(loadSubagents, 10000)
    return () => clearInterval(interval)
  }, [isNanobotActive])

  const statusColor =
    nanobotStatus?.state === "connected"
      ? "#22c55e"
      : nanobotStatus?.state === "starting"
        ? "#eab308"
        : nanobotStatus?.state === "error"
          ? "#ef4444"
          : "#6b7280"

  const statusLabel =
    nanobotStatus?.state === "connected"
      ? "Conectado"
      : nanobotStatus?.state === "starting"
        ? "Iniciando..."
        : nanobotStatus?.state === "error"
          ? `Erro: ${nanobotStatus.error || "desconhecido"}`
          : "Desconectado"

  const toggleSection = (name) =>
    setAgentSection((prev) => (prev === name ? null : name))

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>

      {/* ---- Section 1: Agent toggle + status ---- */}
      <div className={styles.ExpandableSection}>
        <button
          className={styles.ExpandableHeader}
          onClick={() => toggleSection("agent")}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>Agente</span>
            {nanobotEnabled && (
              <div
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: statusColor,
                }}
              />
            )}
          </div>
          <ChevronRightIcon
            style={{
              height: "14px",
              width: "14px",
              transform: agentSection === "agent" ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
            }}
          />
        </button>
        {agentSection === "agent" && (
          <div className={styles.ExpandableContent}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "12px",
              }}
            >
              <span style={{ fontSize: "13px", color: "var(--secondary)" }}>
                Ativar agente inteligente
              </span>
              <Switch checked={nanobotEnabled} onCheckedChange={toggleNanobot} />
            </div>

            {nanobotEnabled && (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "13px",
                    marginBottom: "8px",
                  }}
                >
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: statusColor,
                    }}
                  />
                  <span>{statusLabel}</span>
                  {nanobotStatus?.uptime > 0 && (
                    <span style={{ color: "var(--secondary)", fontSize: "11px" }}>
                      (uptime: {Math.floor(nanobotStatus.uptime / 60)}min)
                    </span>
                  )}
                </div>
                <button
                  className={styles.Button}
                  style={{ fontSize: "11px", padding: "4px 12px" }}
                  onClick={handleRestart}
                  disabled={restarting}
                >
                  {restarting ? "Reiniciando..." : "Reiniciar"}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ---- Section 2: Gateway ---- */}
      {nanobotEnabled && (
        <div className={styles.ExpandableSection}>
          <button
            className={styles.ExpandableHeader}
            onClick={() => toggleSection("gateway")}
          >
            <span>Gateway</span>
            <ChevronRightIcon
              style={{
                height: "14px",
                width: "14px",
                transform: agentSection === "gateway" ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
              }}
            />
          </button>
          {agentSection === "gateway" && (
            <div className={styles.ExpandableContent}>
              <fieldset className={styles.Fieldset} style={{ marginTop: 0 }}>
                <label className={styles.Label}>Porta</label>
                <input
                  className={styles.Input}
                  type="number"
                  min="0"
                  max="65535"
                  placeholder="Auto"
                  value={livConfig?.nanobotGatewayPort || ""}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value) : 0
                    saveLivConfig({ nanobotGatewayPort: val })
                  }}
                />
                <span style={{ fontSize: "11px", color: "var(--secondary)" }}>
                  Porta do servidor HTTP interno. Deixe vazio para auto-detectar.
                </span>
              </fieldset>
            </div>
          )}
        </div>
      )}

      {/* ---- Section 3: Model & Parameters ---- */}
      {nanobotEnabled && (
        <div className={styles.ExpandableSection}>
          <button
            className={styles.ExpandableHeader}
            onClick={() => toggleSection("model")}
          >
            <span>Modelo & Parametros</span>
            <ChevronRightIcon
              style={{
                height: "14px",
                width: "14px",
                transform: agentSection === "model" ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
              }}
            />
          </button>
          {agentSection === "model" && (
            <div className={styles.ExpandableContent}>
              {/* Separate model toggle */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "12px",
                }}
              >
                <span style={{ fontSize: "13px", color: "var(--secondary)" }}>
                  Usar modelo separado do Chat
                </span>
                <Switch
                  checked={useSeparateModel}
                  onCheckedChange={(checked) => {
                    if (!checked) {
                      saveLivConfig({ nanobotModel: "" })
                    } else {
                      saveLivConfig({ nanobotModel: "anthropic/claude-sonnet-4-20250514" })
                    }
                  }}
                />
              </div>

              {useSeparateModel ? (
                <fieldset className={styles.Fieldset} style={{ marginTop: 0 }}>
                  <label className={styles.Label}>Modelo</label>
                  <input
                    className={styles.Input}
                    type="text"
                    placeholder="anthropic/claude-sonnet-4-20250514"
                    value={livConfig?.nanobotModel || ""}
                    onChange={(e) => saveLivConfig({ nanobotModel: e.target.value })}
                  />
                </fieldset>
              ) : (
                <div style={{ fontSize: "12px", color: "var(--secondary)", marginBottom: "12px" }}>
                  Usando modelo configurado na aba Journal.
                </div>
              )}

              {/* Temperature slider */}
              <fieldset className={styles.Fieldset} style={{ marginTop: 0 }}>
                <label className={styles.Label}>Temperatura</label>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round((livConfig?.nanobotTemperature ?? 0.7) * 100)}
                    onChange={(e) =>
                      saveLivConfig({ nanobotTemperature: parseInt(e.target.value) / 100 })
                    }
                    style={{ flex: 1, cursor: "pointer" }}
                  />
                  <span style={{ fontSize: "13px", color: "var(--primary)", minWidth: "36px", textAlign: "right" }}>
                    {(livConfig?.nanobotTemperature ?? 0.7).toFixed(2)}
                  </span>
                </div>
              </fieldset>

              {/* Max Tokens */}
              <fieldset className={styles.Fieldset} style={{ marginTop: 0 }}>
                <label className={styles.Label}>Max Tokens</label>
                <input
                  className={styles.Input}
                  type="number"
                  min="256"
                  max="200000"
                  value={livConfig?.nanobotMaxTokens ?? 8192}
                  onChange={(e) =>
                    saveLivConfig({ nanobotMaxTokens: parseInt(e.target.value) || 8192 })
                  }
                />
              </fieldset>

              {/* Max Iterations */}
              <fieldset className={styles.Fieldset} style={{ marginTop: 0 }}>
                <label className={styles.Label}>Max Iteracoes</label>
                <input
                  className={styles.Input}
                  type="number"
                  min="1"
                  max="100"
                  value={livConfig?.nanobotMaxIterations ?? 20}
                  onChange={(e) =>
                    saveLivConfig({ nanobotMaxIterations: parseInt(e.target.value) || 20 })
                  }
                />
              </fieldset>
            </div>
          )}
        </div>
      )}

      {/* ---- Section 4: Integrations ---- */}
      {nanobotEnabled && (
        <div className={styles.ExpandableSection}>
          <button
            className={styles.ExpandableHeader}
            onClick={() => toggleSection("integrations")}
          >
            <span>Integracoes</span>
            <ChevronRightIcon
              style={{
                height: "14px",
                width: "14px",
                transform: agentSection === "integrations" ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
              }}
            />
          </button>
          {agentSection === "integrations" && (
            <div className={styles.ExpandableContent}>

              {/* Telegram */}
              <div style={{ marginBottom: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--primary)" }}>Telegram</span>
                  <Switch
                    checked={livConfig?.nanobotTelegramEnabled ?? false}
                    onCheckedChange={(checked) => saveLivConfig({ nanobotTelegramEnabled: checked })}
                  />
                </div>
                {livConfig?.nanobotTelegramEnabled && (
                  <fieldset className={styles.Fieldset} style={{ marginTop: 0, marginBottom: 0 }}>
                    <label className={styles.Label}>Token</label>
                    <input
                      className={styles.Input}
                      type="password"
                      placeholder="123456:ABC-DEF..."
                      value={livConfig?.nanobotTelegramToken || ""}
                      onChange={(e) => saveLivConfig({ nanobotTelegramToken: e.target.value })}
                    />
                  </fieldset>
                )}
              </div>

              {/* WhatsApp */}
              <div style={{ marginBottom: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--primary)" }}>WhatsApp</span>
                  <Switch
                    checked={livConfig?.nanobotWhatsappEnabled ?? false}
                    onCheckedChange={(checked) => saveLivConfig({ nanobotWhatsappEnabled: checked })}
                  />
                </div>
                {livConfig?.nanobotWhatsappEnabled && (
                  <>
                    <fieldset className={styles.Fieldset} style={{ marginTop: 0 }}>
                      <label className={styles.Label}>Bridge URL</label>
                      <input
                        className={styles.Input}
                        type="text"
                        placeholder="http://localhost:3000"
                        value={livConfig?.nanobotWhatsappBridgeUrl || ""}
                        onChange={(e) => saveLivConfig({ nanobotWhatsappBridgeUrl: e.target.value })}
                      />
                    </fieldset>
                    <fieldset className={styles.Fieldset} style={{ marginTop: 0, marginBottom: 0 }}>
                      <label className={styles.Label}>Bridge Token</label>
                      <input
                        className={styles.Input}
                        type="password"
                        placeholder="Token"
                        value={livConfig?.nanobotWhatsappBridgeToken || ""}
                        onChange={(e) => saveLivConfig({ nanobotWhatsappBridgeToken: e.target.value })}
                      />
                    </fieldset>
                  </>
                )}
              </div>

              {/* Slack */}
              <div style={{ marginBottom: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--primary)" }}>Slack</span>
                  <Switch
                    checked={livConfig?.nanobotSlackEnabled ?? false}
                    onCheckedChange={(checked) => saveLivConfig({ nanobotSlackEnabled: checked })}
                  />
                </div>
                {livConfig?.nanobotSlackEnabled && (
                  <>
                    <fieldset className={styles.Fieldset} style={{ marginTop: 0 }}>
                      <label className={styles.Label}>Bot Token</label>
                      <input
                        className={styles.Input}
                        type="password"
                        placeholder="xoxb-..."
                        value={livConfig?.nanobotSlackBotToken || ""}
                        onChange={(e) => saveLivConfig({ nanobotSlackBotToken: e.target.value })}
                      />
                    </fieldset>
                    <fieldset className={styles.Fieldset} style={{ marginTop: 0, marginBottom: 0 }}>
                      <label className={styles.Label}>App Token</label>
                      <input
                        className={styles.Input}
                        type="password"
                        placeholder="xapp-..."
                        value={livConfig?.nanobotSlackAppToken || ""}
                        onChange={(e) => saveLivConfig({ nanobotSlackAppToken: e.target.value })}
                      />
                    </fieldset>
                  </>
                )}
              </div>

              {/* Discord */}
              <div style={{ marginBottom: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--primary)" }}>Discord</span>
                  <Switch
                    checked={livConfig?.nanobotDiscordEnabled ?? false}
                    onCheckedChange={(checked) => saveLivConfig({ nanobotDiscordEnabled: checked })}
                  />
                </div>
                {livConfig?.nanobotDiscordEnabled && (
                  <fieldset className={styles.Fieldset} style={{ marginTop: 0, marginBottom: 0 }}>
                    <label className={styles.Label}>Token</label>
                    <input
                      className={styles.Input}
                      type="password"
                      placeholder="Bot token"
                      value={livConfig?.nanobotDiscordToken || ""}
                      onChange={(e) => saveLivConfig({ nanobotDiscordToken: e.target.value })}
                    />
                  </fieldset>
                )}
              </div>

              {/* Email */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--primary)" }}>Email</span>
                  <Switch
                    checked={livConfig?.nanobotEmailEnabled ?? false}
                    onCheckedChange={(checked) => saveLivConfig({ nanobotEmailEnabled: checked })}
                  />
                </div>
                {livConfig?.nanobotEmailEnabled && (
                  <>
                    <div style={{ fontSize: "11px", color: "var(--secondary)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      IMAP (receber)
                    </div>
                    <fieldset className={styles.Fieldset} style={{ marginTop: 0 }}>
                      <label className={styles.Label}>Host</label>
                      <input
                        className={styles.Input}
                        type="text"
                        placeholder="imap.gmail.com"
                        value={livConfig?.nanobotEmailImapHost || ""}
                        onChange={(e) => saveLivConfig({ nanobotEmailImapHost: e.target.value })}
                      />
                    </fieldset>
                    <fieldset className={styles.Fieldset} style={{ marginTop: 0 }}>
                      <label className={styles.Label}>Usuario</label>
                      <input
                        className={styles.Input}
                        type="text"
                        placeholder="user@gmail.com"
                        value={livConfig?.nanobotEmailImapUser || ""}
                        onChange={(e) => saveLivConfig({ nanobotEmailImapUser: e.target.value })}
                      />
                    </fieldset>
                    <fieldset className={styles.Fieldset} style={{ marginTop: 0 }}>
                      <label className={styles.Label}>Senha</label>
                      <input
                        className={styles.Input}
                        type="password"
                        placeholder="App password"
                        value={livConfig?.nanobotEmailImapPass || ""}
                        onChange={(e) => saveLivConfig({ nanobotEmailImapPass: e.target.value })}
                      />
                    </fieldset>
                    <div style={{ fontSize: "11px", color: "var(--secondary)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      SMTP (enviar)
                    </div>
                    <fieldset className={styles.Fieldset} style={{ marginTop: 0 }}>
                      <label className={styles.Label}>Host</label>
                      <input
                        className={styles.Input}
                        type="text"
                        placeholder="smtp.gmail.com"
                        value={livConfig?.nanobotEmailSmtpHost || ""}
                        onChange={(e) => saveLivConfig({ nanobotEmailSmtpHost: e.target.value })}
                      />
                    </fieldset>
                    <fieldset className={styles.Fieldset} style={{ marginTop: 0 }}>
                      <label className={styles.Label}>Usuario</label>
                      <input
                        className={styles.Input}
                        type="text"
                        placeholder="user@gmail.com"
                        value={livConfig?.nanobotEmailSmtpUser || ""}
                        onChange={(e) => saveLivConfig({ nanobotEmailSmtpUser: e.target.value })}
                      />
                    </fieldset>
                    <fieldset className={styles.Fieldset} style={{ marginTop: 0, marginBottom: 0 }}>
                      <label className={styles.Label}>Senha</label>
                      <input
                        className={styles.Input}
                        type="password"
                        placeholder="App password"
                        value={livConfig?.nanobotEmailSmtpPass || ""}
                        onChange={(e) => saveLivConfig({ nanobotEmailSmtpPass: e.target.value })}
                      />
                    </fieldset>
                  </>
                )}
              </div>

            </div>
          )}
        </div>
      )}

      {/* ---- Section 5: Skills & Tools ---- */}
      {nanobotEnabled && (
        <div className={styles.ExpandableSection}>
          <button
            className={styles.ExpandableHeader}
            onClick={() => toggleSection("skills")}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span>Skills & Tools</span>
              {skillsData.skills.length > 0 && (
                <span style={{ fontSize: "10px", color: "var(--secondary)" }}>
                  ({skillsData.skills.length})
                </span>
              )}
            </div>
            <ChevronRightIcon
              style={{
                height: "14px",
                width: "14px",
                transform: agentSection === "skills" ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
              }}
            />
          </button>
          {agentSection === "skills" && (
            <div className={styles.ExpandableContent}>
              {/* Refresh button */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <button
                  className={styles.Button}
                  style={{ fontSize: "11px", padding: "4px 10px" }}
                  onClick={loadSkills}
                  disabled={loadingSkills || !isNanobotActive}
                >
                  {loadingSkills ? "..." : "Atualizar"}
                </button>
              </div>

              {/* Skills list */}
              <div style={{ marginBottom: "14px" }}>
                <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--primary)", display: "block", marginBottom: "8px" }}>
                  Skills instaladas
                </span>
                {skillsData.skills.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {skillsData.skills.map((skill) => (
                      <span
                        key={skill}
                        style={{
                          fontSize: "11px",
                          padding: "3px 10px",
                          background: "rgba(0,0,0,0.15)",
                          borderRadius: "12px",
                          color: "var(--primary)",
                        }}
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: "11px", color: "var(--secondary)" }}>
                    {isNanobotActive ? "Nenhuma skill encontrada." : "Agente desconectado."}
                  </span>
                )}
              </div>

              {/* Tools list */}
              <div style={{ marginBottom: "14px" }}>
                <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--primary)", display: "block", marginBottom: "8px" }}>
                  Tools registradas
                </span>
                {skillsData.tools.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {skillsData.tools.map((tool) => (
                      <span
                        key={tool}
                        style={{
                          fontSize: "11px",
                          padding: "3px 10px",
                          background: "rgba(0,0,0,0.15)",
                          borderRadius: "12px",
                          color: "var(--secondary)",
                          fontFamily: "monospace",
                        }}
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: "11px", color: "var(--secondary)" }}>
                    {isNanobotActive ? "Nenhuma tool encontrada." : "Agente desconectado."}
                  </span>
                )}
              </div>

              {/* Skill-creator info */}
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--secondary)",
                  background: "rgba(0,0,0,0.1)",
                  padding: "10px",
                  borderRadius: "8px",
                  lineHeight: "1.5",
                }}
              >
                O agente possui o <strong style={{ color: "var(--primary)" }}>skill-creator</strong> integrado.
                Voce pode pedir no chat para ele criar novas skills — por exemplo:{" "}
                <em>"crie uma skill para resumir emails"</em>. A nova skill sera adicionada
                automaticamente e aparecera aqui apos reiniciar o agente.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- Section 6: Subagentes ---- */}
      {nanobotEnabled && (
        <div className={styles.ExpandableSection}>
          <button
            className={styles.ExpandableHeader}
            onClick={() => toggleSection("subagents")}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span>Subagentes</span>
              {subagents.count > 0 && (
                <span style={{
                  fontSize: "10px",
                  padding: "1px 6px",
                  borderRadius: "8px",
                  background: "rgba(99, 102, 241, 0.2)",
                  color: "#a5b4fc",
                  fontWeight: 600,
                }}>
                  {subagents.count} ativo{subagents.count > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <ChevronRightIcon
              style={{
                height: "14px",
                width: "14px",
                transform: agentSection === "subagents" ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
              }}
            />
          </button>
          {agentSection === "subagents" && (
            <div className={styles.ExpandableContent}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <button
                  className={styles.Button}
                  style={{ fontSize: "11px", padding: "4px 10px" }}
                  onClick={loadSubagents}
                  disabled={!isNanobotActive}
                >
                  Atualizar
                </button>
                <span style={{ fontSize: "11px", color: "var(--secondary)" }}>
                  {subagents.count} rodando
                </span>
              </div>

              {subagents.agents.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {subagents.agents.map((agent) => (
                    <div
                      key={agent.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "12px",
                        padding: "8px 10px",
                        background: "rgba(0,0,0,0.15)",
                        borderRadius: "6px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          background: agent.done ? "#6b7280" : agent.cancelled ? "#ef4444" : "#22c55e",
                        }} />
                        <span style={{ fontFamily: "monospace", fontSize: "11px" }}>{agent.id}</span>
                      </div>
                      <span style={{
                        fontSize: "10px",
                        color: agent.done ? "#6b7280" : agent.cancelled ? "#ef4444" : "#22c55e",
                      }}>
                        {agent.done ? "concluido" : agent.cancelled ? "cancelado" : "rodando"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: "11px", color: "var(--secondary)" }}>
                  {isNanobotActive
                    ? "Nenhum subagente ativo. Peca ao agente no chat para criar um."
                    : "Agente desconectado."}
                </span>
              )}

              <div
                style={{
                  fontSize: "11px",
                  color: "var(--secondary)",
                  background: "rgba(0,0,0,0.1)",
                  padding: "10px",
                  borderRadius: "8px",
                  lineHeight: "1.5",
                  marginTop: "12px",
                }}
              >
                O agente pode criar subagentes via <strong style={{ color: "var(--primary)" }}>spawn</strong>.
                Peca no chat: <em>"crie um agente para monitorar X a cada hora"</em>.
                Subagentes rodam em background e reportam o resultado automaticamente.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- Section 7: Cron Jobs ---- */}
      {nanobotEnabled && (
        <div className={styles.ExpandableSection}>
          <button
            className={styles.ExpandableHeader}
            onClick={() => toggleSection("cron")}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span>Cron Jobs</span>
              {cronJobs.length > 0 && (
                <span style={{ fontSize: "10px", color: "var(--secondary)" }}>
                  ({cronJobs.filter((j) => j.enabled).length}/{cronJobs.length})
                </span>
              )}
            </div>
            <ChevronRightIcon
              style={{
                height: "14px",
                width: "14px",
                transform: agentSection === "cron" ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
              }}
            />
          </button>
          {agentSection === "cron" && (
            <div className={styles.ExpandableContent}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <button
                  className={styles.Button}
                  style={{ fontSize: "11px", padding: "4px 10px" }}
                  onClick={loadCronJobs}
                  disabled={!isNanobotActive}
                >
                  Atualizar
                </button>
              </div>

              {cronJobs.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {cronJobs.map((job) => {
                    const scheduleLabel = job.schedule?.type === "every"
                      ? `cada ${job.schedule.interval >= 3600
                          ? `${Math.round(job.schedule.interval / 3600)}h`
                          : `${Math.round(job.schedule.interval / 60)}min`}`
                      : job.schedule?.type === "cron"
                        ? job.schedule.expression
                        : job.schedule?.type === "at"
                          ? "unica vez"
                          : "—"

                    const lastRunLabel = job.last_run
                      ? new Date(job.last_run).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                      : "nunca"

                    const nextRunLabel = job.next_run
                      ? new Date(job.next_run).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                      : "—"

                    return (
                      <div
                        key={job.id}
                        style={{
                          padding: "8px 10px",
                          background: "rgba(0,0,0,0.15)",
                          borderRadius: "8px",
                          opacity: job.enabled ? 1 : 0.5,
                        }}
                      >
                        <div style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "4px",
                        }}>
                          <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--primary)" }}>
                            {job.name}
                          </span>
                          <Switch
                            checked={job.enabled}
                            onCheckedChange={() => toggleCronJob(job.id)}
                          />
                        </div>
                        <div style={{
                          display: "flex",
                          gap: "12px",
                          fontSize: "10px",
                          color: "var(--secondary)",
                        }}>
                          <span title="Agendamento">{scheduleLabel}</span>
                          <span title="Ultima execucao">ultimo: {lastRunLabel}</span>
                          <span title="Proxima execucao">prox: {nextRunLabel}</span>
                          {job.status && (
                            <span style={{
                              color: job.status === "ok" ? "#22c55e" : job.status === "error" ? "#ef4444" : "#6b7280",
                            }}>
                              {job.status}
                            </span>
                          )}
                        </div>
                        {job.last_error && (
                          <div style={{ fontSize: "10px", color: "#ef4444", marginTop: "4px" }}>
                            {job.last_error}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <span style={{ fontSize: "11px", color: "var(--secondary)" }}>
                  {isNanobotActive
                    ? "Nenhum job encontrado."
                    : "Agente desconectado."}
                </span>
              )}

              <div
                style={{
                  fontSize: "11px",
                  color: "var(--secondary)",
                  background: "rgba(0,0,0,0.1)",
                  padding: "10px",
                  borderRadius: "8px",
                  lineHeight: "1.5",
                  marginTop: "12px",
                }}
              >
                O agente pode criar cron jobs via chat. Exemplos:{" "}
                <em>"me lembre de beber agua a cada 2 horas"</em>,{" "}
                <em>"faca uma revisao diaria as 22h"</em>.
                Suporta intervalos, cron expressions e agendamento unico.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- Section 8: Memoria ---- */}
      {nanobotEnabled && (
        <div className={styles.ExpandableSection}>
          <button
            className={styles.ExpandableHeader}
            onClick={() => toggleSection("memory")}
          >
            <span>Memoria</span>
            <ChevronRightIcon
              style={{
                height: "14px",
                width: "14px",
                transform: agentSection === "memory" ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
              }}
            />
          </button>
          {agentSection === "memory" && (
            <div className={styles.ExpandableContent}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <button
                  className={styles.Button}
                  style={{ fontSize: "11px", padding: "4px 10px" }}
                  onClick={loadMemory}
                  disabled={loadingMemory || !isNanobotActive}
                >
                  {loadingMemory ? "..." : "Carregar"}
                </button>
                <button
                  className={styles.Button}
                  style={{
                    fontSize: "11px",
                    padding: "4px 10px",
                    background: "var(--secondary-bg)",
                    color: "var(--primary)",
                  }}
                  onClick={clearMemory}
                  disabled={!isNanobotActive}
                >
                  Limpar
                </button>
              </div>
              {memory && (
                <pre
                  style={{
                    fontSize: "11px",
                    background: "rgba(0,0,0,0.2)",
                    padding: "10px",
                    borderRadius: "8px",
                    maxHeight: "200px",
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    color: "var(--secondary)",
                    lineHeight: "1.5",
                  }}
                >
                  {memory}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---- Section 9: Identidade do Agente ---- */}
      {nanobotEnabled && (
        <div className={styles.ExpandableSection}>
          <button
            className={styles.ExpandableHeader}
            onClick={() => {
              toggleSection("identity")
              if (agentSection !== "identity" && Object.keys(bootstrapFiles).length === 0 && isNanobotActive) {
                loadBootstrapFiles()
              }
            }}
          >
            <span>Identidade do Agente</span>
            <ChevronRightIcon
              style={{
                height: "14px",
                width: "14px",
                transform: agentSection === "identity" ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
              }}
            />
          </button>
          {agentSection === "identity" && (
            <div className={styles.ExpandableContent}>
              <p style={{ fontSize: "11px", color: "var(--secondary)", marginBottom: "10px", lineHeight: 1.5 }}>
                Esses arquivos definem quem o agente e, como ele se comporta e o que sabe sobre voce.
                O agente tambem pode edita-los sozinho conforme aprende.
              </p>

              {Object.keys(bootstrapFiles).length === 0 && (
                <button
                  className={styles.Button}
                  style={{ fontSize: "11px", padding: "4px 10px" }}
                  onClick={loadBootstrapFiles}
                  disabled={!isNanobotActive}
                >
                  Carregar
                </button>
              )}

              {["SOUL.md", "AGENTS.md", "USER.md"].map((filename) => {
                const content = bootstrapFiles[filename]
                if (content === undefined) return null

                const labels = {
                  "SOUL.md": { title: "Alma (SOUL.md)", desc: "Personalidade, valores e estilo de comunicacao" },
                  "AGENTS.md": { title: "Instrucoes (AGENTS.md)", desc: "Diretrizes de comportamento e uso de ferramentas" },
                  "USER.md": { title: "Perfil do Usuario (USER.md)", desc: "O que o agente sabe sobre voce" },
                }
                const label = labels[filename] || { title: filename, desc: "" }
                const isEditing = editingFile === filename

                return (
                  <div
                    key={filename}
                    style={{
                      marginBottom: "10px",
                      background: "rgba(0,0,0,0.15)",
                      borderRadius: "8px",
                      padding: "10px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--primary)" }}>{label.title}</div>
                        <div style={{ fontSize: "10px", color: "var(--secondary)", opacity: 0.7 }}>{label.desc}</div>
                      </div>
                      {!isEditing ? (
                        <button
                          className={styles.Button}
                          style={{ fontSize: "10px", padding: "3px 8px" }}
                          onClick={() => startEditing(filename)}
                        >
                          Editar
                        </button>
                      ) : (
                        <div style={{ display: "flex", gap: "4px" }}>
                          <button
                            className={styles.Button}
                            style={{ fontSize: "10px", padding: "3px 8px" }}
                            onClick={saveBootstrapFile}
                            disabled={savingBootstrap}
                          >
                            {savingBootstrap ? "..." : "Salvar"}
                          </button>
                          <button
                            className={styles.Button}
                            style={{ fontSize: "10px", padding: "3px 8px", background: "var(--secondary-bg)", color: "var(--primary)" }}
                            onClick={cancelEditing}
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </div>
                    {isEditing ? (
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        style={{
                          width: "100%",
                          minHeight: "160px",
                          fontSize: "11px",
                          background: "rgba(0,0,0,0.25)",
                          color: "var(--primary)",
                          border: "1px solid var(--border)",
                          borderRadius: "6px",
                          padding: "8px",
                          fontFamily: "'SF Mono', 'Fira Code', monospace",
                          lineHeight: 1.5,
                          resize: "vertical",
                        }}
                      />
                    ) : (
                      <pre
                        style={{
                          fontSize: "11px",
                          background: "rgba(0,0,0,0.1)",
                          padding: "8px",
                          borderRadius: "6px",
                          maxHeight: "150px",
                          overflow: "auto",
                          whiteSpace: "pre-wrap",
                          color: "var(--secondary)",
                          lineHeight: 1.5,
                        }}
                      >
                        {content || "(vazio)"}
                      </pre>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Info footer */}
      <div
        style={{
          fontSize: "11px",
          color: "var(--secondary)",
          padding: "8px 0",
          textAlign: "center",
          opacity: 0.7,
        }}
      >
        Requer Python 3.10+ instalado. Reinicie o agente apos alterar configuracoes.
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Integrations Tab — Composio Marketplace
// ---------------------------------------------------------------------------

function IntegrationsTab() {
  const { isNanobotActive } = useAIContext()

  // API key
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [hasKey, setHasKey] = useState(false)
  const [savingKey, setSavingKey] = useState(false)

  // Connections
  const [connections, setConnections] = useState([])

  // Available apps
  const [apps, setApps] = useState([])
  const [loadingApps, setLoadingApps] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // Tools info
  const [toolsInfo, setToolsInfo] = useState({ tools_by_app: {}, total: 0 })

  // Sections
  const [connectedExpanded, setConnectedExpanded] = useState(true)

  // --- Wizard state ---
  const [wizardApp, setWizardApp] = useState(null)
  const [wizardStep, setWizardStep] = useState(1)
  const [wizardProfileName, setWizardProfileName] = useState("")
  const [wizardConnectionId, setWizardConnectionId] = useState(null)
  const [wizardAuthStatus, setWizardAuthStatus] = useState(null) // null|"waiting"|"success"|"failed"
  const [wizardActions, setWizardActions] = useState([])
  const [wizardSelectedActions, setWizardSelectedActions] = useState(new Set())
  const [wizardToolSearch, setWizardToolSearch] = useState("")
  const [wizardLoading, setWizardLoading] = useState(false)
  const pollRef = useRef(null)

  // --- Data loading ---

  const loadAll = async () => {
    try {
      const keyStatus = await tipcClient.getComposioApiKeyStatus()
      setHasKey(keyStatus.hasKey)
    } catch { /* ignore */ }

    if (!isNanobotActive) return

    try {
      const conns = await tipcClient.listComposioConnections()
      setConnections(conns || [])
    } catch { /* ignore */ }

    try {
      const tools = await tipcClient.getComposioTools()
      setToolsInfo(tools || { tools_by_app: {}, total: 0 })
    } catch { /* ignore */ }
  }

  const loadApps = async () => {
    setLoadingApps(true)
    try {
      const result = await tipcClient.getComposioApps()
      setApps(result || [])
    } catch {
      setApps([])
    }
    setLoadingApps(false)
  }

  useEffect(() => {
    loadAll()
  }, [isNanobotActive])

  useEffect(() => {
    if (hasKey && isNanobotActive && apps.length === 0) {
      loadApps()
    }
  }, [hasKey, isNanobotActive])

  // --- Handlers ---

  const saveKey = async () => {
    setSavingKey(true)
    try {
      const result = await tipcClient.setComposioApiKey({ key: apiKeyInput })
      setHasKey(result.hasKey)
      if (result.hasKey) setApiKeyInput("")
    } catch { /* ignore */ }
    setSavingKey(false)
  }

  const openWizard = (appItem) => {
    setWizardApp(appItem)
    setWizardStep(1)
    setWizardProfileName(`${appItem.display_name || appItem.name} Profile`)
    setWizardConnectionId(null)
    setWizardAuthStatus(null)
    setWizardActions([])
    setWizardSelectedActions(new Set())
    setWizardToolSearch("")
    setWizardLoading(false)
  }

  const closeWizard = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    setWizardApp(null)
  }

  const handleWizardConnect = async () => {
    if (!wizardApp) return
    setWizardStep(3)
    setWizardAuthStatus("waiting")
    setWizardLoading(true)

    try {
      const { url, connectionId } = await tipcClient.initiateComposioConnection({ appName: wizardApp.name })
      setWizardConnectionId(connectionId)
      if (url) window.open(url, "_blank")

      // Poll for connection status
      pollRef.current = setInterval(async () => {
        try {
          const status = await tipcClient.getComposioConnectionStatus({ connectionId })
          if (status.status === "ACTIVE") {
            if (pollRef.current) clearInterval(pollRef.current)
            pollRef.current = null
            setWizardAuthStatus("success")
            setWizardLoading(false)
            setWizardStep(4)

            // Pre-load actions for step 5
            try {
              const actions = await tipcClient.getComposioAppActions({ appName: wizardApp.name })
              setWizardActions(actions || [])
              setWizardSelectedActions(new Set((actions || []).map((a) => a.name)))
            } catch { /* ignore */ }

            // Auto-advance to step 5 after 1.5s
            setTimeout(() => setWizardStep(5), 1500)
          } else if (status.status === "FAILED" || status.status === "ERROR") {
            if (pollRef.current) clearInterval(pollRef.current)
            pollRef.current = null
            setWizardAuthStatus("failed")
            setWizardLoading(false)
          }
        } catch { /* keep polling */ }
      }, 3000)

      // Timeout after 5 min
      setTimeout(() => {
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
          setWizardAuthStatus("failed")
          setWizardLoading(false)
        }
      }, 300_000)
    } catch {
      setWizardAuthStatus("failed")
      setWizardLoading(false)
    }
  }

  const handleSaveTools = async () => {
    if (!wizardApp) return
    setWizardLoading(true)
    try {
      await tipcClient.registerComposioTools({
        appName: wizardApp.name,
        selectedActions: [...wizardSelectedActions],
      })
      await loadAll()
      await loadApps()
      closeWizard()
    } catch {
      setWizardLoading(false)
    }
  }

  const handleDisconnect = async (connectionId, appName) => {
    try {
      await tipcClient.disconnectComposioApp({ connectionId })
      await loadAll()
    } catch { /* ignore */ }
  }

  // --- Derived ---

  const activeConnections = connections.filter((c) => c.status === "ACTIVE")
  const connectedAppNames = new Set(activeConnections.map((c) => c.appName))

  const filteredApps = searchQuery
    ? apps.filter(
        (a) =>
          (a.display_name || a.name).toLowerCase().includes(searchQuery.toLowerCase()) ||
          (a.description || "").toLowerCase().includes(searchQuery.toLowerCase())
      )
    : apps

  // --- Setup state (no key) ---

  if (!hasKey) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div>
          <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--primary)", margin: "0 0 4px" }}>
            App Integrations
          </h3>
          <p style={{ fontSize: "13px", color: "var(--secondary)", margin: 0, lineHeight: 1.5 }}>
            Conecte seus apps favoritos ao agente. Ele ganha acesso automatico como ferramentas.
          </p>
        </div>

        <div
          style={{
            background: "var(--bg-tertiary)",
            borderRadius: "12px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <label style={{ fontSize: "13px", fontWeight: 500, color: "var(--primary)" }}>
            API Key Composio
          </label>
          <p style={{ fontSize: "12px", color: "var(--secondary)", margin: 0, lineHeight: 1.5 }}>
            Crie uma conta em{" "}
            <span
              style={{ color: "var(--active)", cursor: "pointer" }}
              onClick={() => window.open("https://composio.dev", "_blank")}
            >
              composio.dev
            </span>{" "}
            e copie sua API key para comecar.
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              className={styles.Input}
              type="password"
              placeholder="cmp_..."
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              className={styles.Button}
              style={{ fontSize: "13px", padding: "8px 20px", whiteSpace: "nowrap" }}
              onClick={saveKey}
              disabled={savingKey || !apiKeyInput.trim()}
            >
              {savingKey ? "..." : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- Main marketplace view ---

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--primary)", margin: "0 0 4px" }}>
            App Integrations
          </h3>
          <p style={{ fontSize: "13px", color: "var(--secondary)", margin: 0 }}>
            Connect your favorite apps with this agent
          </p>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ position: "relative" }}>
        <SearchIcon
          style={{
            position: "absolute",
            left: "12px",
            top: "50%",
            transform: "translateY(-50%)",
            height: "14px",
            width: "14px",
            color: "var(--secondary)",
            opacity: 0.6,
          }}
        />
        <input
          className={styles.Input}
          type="text"
          placeholder="Search apps..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ paddingLeft: "36px" }}
        />
      </div>

      {/* Connected to this agent */}
      {activeConnections.length > 0 && (
        <div
          style={{
            background: "var(--bg-tertiary)",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          <button
            onClick={() => setConnectedExpanded(!connectedExpanded)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 16px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--primary)",
              fontSize: "13px",
              fontWeight: 500,
            }}
          >
            <span>
              Connected to this agent{" "}
              <span style={{ opacity: 0.5, fontWeight: 400 }}>{activeConnections.length}</span>
            </span>
            <ChevronRightIcon
              style={{
                height: "14px",
                width: "14px",
                transform: connectedExpanded ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
              }}
            />
          </button>
          {connectedExpanded && (
            <div style={{ padding: "0 16px 16px" }}>
              {activeConnections.map((conn) => {
                const appData = apps.find((a) => a.name === conn.appName)
                const appTools = toolsInfo.tools_by_app[conn.appName] || []
                return (
                  <div
                    key={conn.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      background: "var(--bg)",
                      borderRadius: "10px",
                      marginBottom: "6px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      {appData?.logo ? (
                        <img
                          src={appData.logo}
                          alt=""
                          style={{ width: "28px", height: "28px", borderRadius: "6px" }}
                          onError={(e) => { e.target.style.display = "none" }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "28px",
                            height: "28px",
                            borderRadius: "6px",
                            background: "var(--bg-tertiary)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "14px",
                          }}
                        >
                          {(conn.appName || "?")[0].toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--primary)" }}>
                          {appData?.display_name || conn.appName}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--secondary)", opacity: 0.7 }}>
                          Connected
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      {appTools.length > 0 && (
                        <span style={{ fontSize: "11px", color: "#22c55e" }}>
                          {appTools.length} tools enabled
                        </span>
                      )}
                      <button
                        onClick={() => handleDisconnect(conn.id, conn.appName)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--secondary)",
                          cursor: "pointer",
                          padding: "4px",
                          borderRadius: "4px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        title="Settings / Disconnect"
                      >
                        <SettingsIcon style={{ height: "14px", width: "14px" }} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Available Apps */}
      <div>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--primary)", marginBottom: "12px" }}>
          Available Apps
        </div>

        {loadingApps ? (
          <div style={{ textAlign: "center", padding: "20px", color: "var(--secondary)", fontSize: "13px" }}>
            Loading apps...
          </div>
        ) : filteredApps.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px", color: "var(--secondary)", fontSize: "13px" }}>
            {searchQuery ? "Nenhum app encontrado" : "Nenhum app disponivel"}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "10px",
            }}
          >
            {filteredApps.map((appItem) => {
              const isConnected = connectedAppNames.has(appItem.name)
              const isConnecting = wizardApp?.name === appItem.name
              const toolCount = (toolsInfo.tools_by_app[appItem.name] || []).length

              return (
                <div
                  key={appItem.name}
                  style={{
                    background: "var(--bg-tertiary)",
                    borderRadius: "12px",
                    padding: "16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    border: "1px solid transparent",
                    transition: "border-color 0.2s",
                  }}
                >
                  {/* Card header */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    {appItem.logo ? (
                      <img
                        src={appItem.logo}
                        alt=""
                        style={{ width: "28px", height: "28px", borderRadius: "6px" }}
                        onError={(e) => { e.target.style.display = "none" }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "28px",
                          height: "28px",
                          borderRadius: "6px",
                          background: "var(--bg)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "14px",
                          color: "var(--primary)",
                        }}
                      >
                        {(appItem.display_name || appItem.name || "?")[0].toUpperCase()}
                      </div>
                    )}
                    <span
                      style={{
                        fontSize: "11px",
                        color: isConnected ? "#22c55e" : "var(--secondary)",
                        opacity: isConnected ? 1 : 0.6,
                      }}
                    >
                      {isConnected
                        ? toolCount > 0
                          ? `${toolCount} tools`
                          : "Connected"
                        : "Not connected"}
                    </span>
                  </div>

                  {/* Card body */}
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--primary)", marginBottom: "4px" }}>
                      {appItem.display_name || appItem.name}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--secondary)",
                        lineHeight: 1.4,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        minHeight: "30px",
                      }}
                    >
                      {appItem.description || ""}
                    </div>
                  </div>

                  {/* Card action */}
                  {isConnected ? (
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#22c55e",
                        textAlign: "center",
                        padding: "6px 0",
                        fontWeight: 500,
                      }}
                    >
                      Connected
                    </div>
                  ) : (
                    <button
                      onClick={() => openWizard(appItem)}
                      disabled={isConnecting}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        padding: "7px 0",
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        color: "var(--primary)",
                        fontSize: "12px",
                        fontWeight: 500,
                        cursor: isConnecting ? "default" : "pointer",
                        opacity: isConnecting ? 0.5 : 1,
                        transition: "all 0.15s",
                      }}
                    >
                      {isConnecting ? (
                        "Connecting..."
                      ) : (
                        <>
                          <PlusIcon style={{ height: "12px", width: "12px" }} />
                          Add
                        </>
                      )}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer: API key status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "11px",
          color: "var(--secondary)",
          opacity: 0.6,
          padding: "4px 0",
        }}
      >
        <span>Composio API key configurada</span>
        <button
          onClick={async () => {
            await tipcClient.deleteComposioApiKey()
            setHasKey(false)
            setConnections([])
            setApps([])
          }}
          style={{
            background: "none",
            border: "none",
            color: "var(--secondary)",
            cursor: "pointer",
            fontSize: "11px",
            textDecoration: "underline",
            opacity: 0.7,
          }}
        >
          Remover chave
        </button>
      </div>

      {/* ---- Connection Wizard Modal ---- */}
      {wizardApp && (
        <div className={styles.wizardOverlay} onClick={(e) => { if (e.target === e.currentTarget) closeWizard() }}>
          <div className={styles.wizardContent}>
            {/* Progress dots */}
            <div className={styles.wizardProgress}>
              {[1, 2, 3, 4, 5].map((step, i) => (
                <div key={step} style={{ display: "flex", alignItems: "center", flex: i < 4 ? 1 : "none" }}>
                  <div
                    className={`${styles.wizardDot} ${wizardStep >= step ? (wizardStep > step ? styles.done : styles.active) : ""}`}
                  />
                  {i < 4 && (
                    <div className={`${styles.wizardLine} ${wizardStep > step ? styles.done : ""}`} />
                  )}
                </div>
              ))}
            </div>

            {/* Step 1: Connect & Preview */}
            {wizardStep === 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  {wizardApp.logo ? (
                    <img src={wizardApp.logo} alt="" style={{ width: "36px", height: "36px", borderRadius: "8px" }} onError={(e) => { e.target.style.display = "none" }} />
                  ) : (
                    <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "var(--bg-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", color: "var(--primary)" }}>
                      {(wizardApp.display_name || wizardApp.name || "?")[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--primary)" }}>Connect & Preview</div>
                    <div style={{ fontSize: "12px", color: "var(--secondary)" }}>{wizardApp.display_name || wizardApp.name}</div>
                  </div>
                </div>

                <div style={{ background: "var(--bg-tertiary)", borderRadius: "10px", padding: "14px" }}>
                  <div style={{ fontSize: "13px", color: "var(--primary)", fontWeight: 500, marginBottom: "6px" }}>
                    Connect to {wizardApp.display_name || wizardApp.name}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--secondary)", lineHeight: 1.5 }}>
                    {wizardApp.description || "Connect this app to give your agent access to its tools and actions."}
                  </div>
                  {activeConnections.some((c) => c.appName === wizardApp.name) && (
                    <div style={{ marginTop: "8px", fontSize: "12px", color: "#22c55e" }}>
                      Already connected. Creating a new connection will be added.
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                  <button className={styles.wizardBtnSecondary} onClick={closeWizard}>Cancel</button>
                  <button className={styles.wizardBtnPrimary} onClick={() => setWizardStep(2)}>Continue</button>
                </div>
              </div>
            )}

            {/* Step 2: Create Profile */}
            {wizardStep === 2 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  {wizardApp.logo ? (
                    <img src={wizardApp.logo} alt="" style={{ width: "36px", height: "36px", borderRadius: "8px" }} onError={(e) => { e.target.style.display = "none" }} />
                  ) : (
                    <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "var(--bg-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", color: "var(--primary)" }}>
                      {(wizardApp.display_name || wizardApp.name || "?")[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--primary)" }}>Create Profile</div>
                    <div style={{ fontSize: "12px", color: "var(--secondary)" }}>Step 2 of 5</div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label style={{ fontSize: "13px", fontWeight: 500, color: "var(--primary)" }}>Profile Name</label>
                  <input
                    className={styles.Input}
                    value={wizardProfileName}
                    onChange={(e) => setWizardProfileName(e.target.value)}
                    placeholder="Profile name"
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                  <button className={styles.wizardBtnSecondary} onClick={() => setWizardStep(1)}>Back</button>
                  <button className={styles.wizardBtnPrimary} onClick={handleWizardConnect}>Connect</button>
                </div>
              </div>
            )}

            {/* Step 3: Waiting for OAuth */}
            {wizardStep === 3 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", padding: "20px 0" }}>
                {wizardApp.logo ? (
                  <img src={wizardApp.logo} alt="" style={{ width: "48px", height: "48px", borderRadius: "10px" }} onError={(e) => { e.target.style.display = "none" }} />
                ) : (
                  <div style={{ width: "48px", height: "48px", borderRadius: "10px", background: "var(--bg-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", color: "var(--primary)" }}>
                    {(wizardApp.display_name || wizardApp.name || "?")[0].toUpperCase()}
                  </div>
                )}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--primary)", marginBottom: "8px" }}>
                    {wizardAuthStatus === "failed" ? "Authentication Failed" : "Waiting for authentication..."}
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--secondary)" }}>
                    {wizardAuthStatus === "failed"
                      ? "The authorization did not complete. Please try again."
                      : "Complete the authorization in your browser"}
                  </div>
                </div>
                {wizardAuthStatus !== "failed" && (
                  <div style={{ width: "32px", height: "32px", border: "3px solid var(--border)", borderTopColor: "var(--active)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                )}
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <button className={styles.wizardBtnSecondary} onClick={closeWizard}>
                  Cancel
                </button>
              </div>
            )}

            {/* Step 4: Success */}
            {wizardStep === 4 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "24px 0" }}>
                <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--primary)" }}>Authentication Successful</div>
                <div style={{ fontSize: "13px", color: "var(--secondary)" }}>Continue to configure tools</div>
              </div>
            )}

            {/* Step 5: Configure Tools */}
            {wizardStep === 5 && (() => {
              const filteredWizardActions = wizardToolSearch
                ? wizardActions.filter(
                    (a) =>
                      (a.display_name || a.name).toLowerCase().includes(wizardToolSearch.toLowerCase()) ||
                      (a.description || "").toLowerCase().includes(wizardToolSearch.toLowerCase())
                  )
                : wizardActions

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    {wizardApp.logo ? (
                      <img src={wizardApp.logo} alt="" style={{ width: "36px", height: "36px", borderRadius: "8px" }} onError={(e) => { e.target.style.display = "none" }} />
                    ) : (
                      <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "var(--bg-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", color: "var(--primary)" }}>
                        {(wizardApp.display_name || wizardApp.name || "?")[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--primary)" }}>
                        Configure {wizardApp.display_name || wizardApp.name} Tools
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--secondary)" }}>Select tools to add to your agent</div>
                    </div>
                  </div>

                  {/* Search + Select All / Clear */}
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                      className={styles.Input}
                      type="text"
                      placeholder="Search tools..."
                      value={wizardToolSearch}
                      onChange={(e) => setWizardToolSearch(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <button
                      className={styles.wizardBtnSecondary}
                      style={{ fontSize: "11px", padding: "6px 10px", whiteSpace: "nowrap" }}
                      onClick={() => setWizardSelectedActions(new Set(wizardActions.map((a) => a.name)))}
                    >
                      Select All
                    </button>
                    <button
                      className={styles.wizardBtnSecondary}
                      style={{ fontSize: "11px", padding: "6px 10px", whiteSpace: "nowrap" }}
                      onClick={() => setWizardSelectedActions(new Set())}
                    >
                      Clear
                    </button>
                  </div>

                  <div style={{ fontSize: "11px", color: "var(--secondary)" }}>
                    Showing {filteredWizardActions.length} of {wizardActions.length} tools
                  </div>

                  {/* Scrollable tool list */}
                  <div style={{ maxHeight: "300px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "2px" }}>
                    {filteredWizardActions.map((action) => {
                      const isSelected = wizardSelectedActions.has(action.name)
                      const params = action.parameters?.properties ? Object.keys(action.parameters.properties).length : 0
                      return (
                        <div
                          key={action.name}
                          className={`${styles.wizardToolRow} ${isSelected ? styles.selected : ""}`}
                          onClick={() => {
                            setWizardSelectedActions((prev) => {
                              const next = new Set(prev)
                              if (next.has(action.name)) next.delete(action.name)
                              else next.add(action.name)
                              return next
                            })
                          }}
                        >
                          <div className={`${styles.wizardCheckbox} ${isSelected ? styles.checked : ""}`}>
                            {isSelected && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {action.display_name || action.name}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {action.description || ""}
                            </div>
                          </div>
                          {params > 0 && (
                            <span style={{ fontSize: "10px", color: "var(--secondary)", opacity: 0.6, flexShrink: 0 }}>
                              {params} params
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Footer */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "12px", color: "var(--secondary)" }}>
                      {wizardSelectedActions.size} tool{wizardSelectedActions.size !== 1 ? "s" : ""} will be added
                    </span>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button className={styles.wizardBtnSecondary} onClick={() => setWizardStep(4)}>Back</button>
                      <button
                        className={styles.wizardBtnPrimary}
                        onClick={handleSaveTools}
                        disabled={wizardLoading || wizardSelectedActions.size === 0}
                      >
                        {wizardLoading ? "Saving..." : "Save Tools"}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

export default Settings
export const Component = Settings
