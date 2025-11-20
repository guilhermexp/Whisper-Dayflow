import styles from './Settings.module.scss';
import { SettingsIcon, CrossIcon, OllamaIcon, ChevronRightIcon, NotebookIcon, AudiowaveIcon, AIIcon, PlusIcon, EditIcon, TrashIcon } from 'renderer/icons';
import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import { tipcClient } from 'renderer/lib/tipc-client';
import { useAIContext } from 'renderer/context/AIContext';
import { useTranslation } from 'react-i18next';
import {
  availableThemes,
  usePilesContext,
} from 'renderer/context/PilesContext';
import AISettingTabs from './AISettingsTabs';
import TranscriptionSettingsTabs from './TranscriptionSettingsTabs';
import { useIndexContext } from 'renderer/context/IndexContext';
import {
  useConfigQuery,
  useSaveConfigMutation,
} from 'renderer/lib/query-client';
import { PREDEFINED_PROMPTS } from '../../../../../shared/data/predefined-prompts';

export default function Settings() {
  const { t } = useTranslation();
  const { regenerateEmbeddings } = useIndexContext();
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
  } = useAIContext();
  const [APIkey, setCurrentKey] = useState('');
  const { currentTheme, setTheme } = usePilesContext();
  const [mainTab, setMainTab] = useState('journal');

  // Whispo configuration hooks
  const whispoConfigQuery = useConfigQuery();
  const saveWhispoConfigMutation = useSaveConfigMutation();
  const [expandedSection, setExpandedSection] = useState(null);

  // Prompt editor states
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(null);
  const [viewingPrompt, setViewingPrompt] = useState(null);
  const [promptForm, setPromptForm] = useState({
    title: '',
    description: '',
    promptText: '',
  });

  const handleViewPrompt = (prompt) => {
    setViewingPrompt(prompt);
    setEditingPrompt(null);
    setPromptForm({
      title: prompt.title,
      description: prompt.description || '',
      promptText: prompt.promptText,
    });
    setPromptEditorOpen(true);
  };

  // OpenRouter models state
  const [openrouterModels, setOpenrouterModels] = useState([]);
  const [loadingOpenrouterModels, setLoadingOpenrouterModels] = useState(false);

  const saveWhispoConfig = (config) => {
    saveWhispoConfigMutation.mutate({
      config: {
        ...whispoConfigQuery.data,
        ...config,
      },
    });
  };

  const handleFetchOpenrouterModels = async () => {
    setLoadingOpenrouterModels(true);
    try {
      const models = await tipcClient.fetchOpenRouterModels();
      setOpenrouterModels(models.map(m => ({ id: m.id, name: m.name })));
    } catch (error) {
      console.error('Failed to fetch OpenRouter models:', error);
    } finally {
      setLoadingOpenrouterModels(false);
    }
  };

  const handleCreatePrompt = () => {
    setEditingPrompt(null);
    setPromptForm({ title: '', description: '', promptText: '' });
    setPromptEditorOpen(true);
  };

  const handleEditPrompt = (prompt) => {
    setEditingPrompt(prompt);
    setViewingPrompt(null);
    setPromptForm({
      title: prompt.title,
      description: prompt.description || '',
      promptText: prompt.promptText,
    });
    setPromptEditorOpen(true);
  };

  const handleSavePrompt = () => {
    if (!promptForm.title || !promptForm.promptText) return;

    const customPrompts = whispoConfigQuery.data?.customPrompts || [];

    if (editingPrompt) {
      // Update existing
      const updated = customPrompts.map(p =>
        p.id === editingPrompt.id
          ? { ...p, ...promptForm, updatedAt: Date.now() }
          : p
      );
      saveWhispoConfig({ customPrompts: updated });
    } else {
      // Create new
      const newPrompt = {
        id: `custom-${Date.now()}`,
        ...promptForm,
        category: 'custom',
        icon: 'i-mingcute-edit-line',
        triggerWords: [],
        useSystemInstructions: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      saveWhispoConfig({ customPrompts: [...customPrompts, newPrompt] });
    }

    setPromptEditorOpen(false);
    setEditingPrompt(null);
    setPromptForm({ title: '', description: '', promptText: '' });
  };

  const handleDeletePrompt = (promptId) => {
    const customPrompts = whispoConfigQuery.data?.customPrompts || [];
    const filtered = customPrompts.filter(p => p.id !== promptId);
    saveWhispoConfig({ customPrompts: filtered });
  };

  const retrieveKey = async () => {
    const k = await getKey();
    setCurrentKey(k);
  };

  useEffect(() => {
    retrieveKey();
  }, []);

  const handleOnChangeBaseUrl = (e) => {
    setBaseUrl(e.target.value);
  };

  const handleOnChangeModel = (e) => {
    setModel(e.target.value);
  };

  const handleOnChangeKey = (e) => {
    setCurrentKey(e.target.value);
  };

  const handleOnChangePrompt = (e) => {
    const p = e.target.value ?? '';
    setPrompt(p);
  };

  const handleSaveChanges = () => {
    if (!APIkey || APIkey == '') {
      deleteKey();
    } else {
      console.log('save key', APIkey);
      setKey(APIkey);
    }

    updateSettings(prompt);
    // regenerateEmbeddings();
  };

  const renderThemes = () => {
    return Object.keys(availableThemes).map((theme, index) => {
      const colors = availableThemes[theme];
      return (
        <button
          key={`theme-${theme}`}
          className={`${styles.theme} ${
            currentTheme == theme && styles.current
          }`}
          onClick={() => {
            setTheme(theme);
          }}
        >
          <div
            className={styles.color1}
            style={{ background: colors.primary }}
          ></div>
        </button>
      );
    });
  };
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <div className={styles.iconHolder}>
          <SettingsIcon className={styles.settingsIcon} />
        </div>
      </Dialog.Trigger>
      <Dialog.Portal container={document.getElementById('dialog')}>
        <Dialog.Overlay className={styles.DialogOverlay} />
        <Dialog.Content className={styles.DialogContent} aria-describedby={undefined}>
          <Dialog.Title className={styles.DialogTitle}>{t('settingsDialog.title')}</Dialog.Title>

          {/* Main Tabs */}
          <Tabs.Root value={mainTab} onValueChange={setMainTab} style={{ marginTop: '16px' }}>
            <Tabs.List style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <Tabs.Trigger
                value="journal"
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  background: mainTab === 'journal' ? 'var(--active)' : 'var(--bg-tertiary)',
                  color: mainTab === 'journal' ? 'var(--active-text)' : 'var(--secondary)',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                }}
              >
                <NotebookIcon style={{ height: '16px', width: '16px' }} />
                {t('settingsDialog.tabs.journal')}
              </Tabs.Trigger>
              <Tabs.Trigger
                value="whisper"
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  background: mainTab === 'whisper' ? 'var(--active)' : 'var(--bg-tertiary)',
                  color: mainTab === 'whisper' ? 'var(--active-text)' : 'var(--secondary)',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                }}
              >
                <AudiowaveIcon style={{ height: '16px', width: '16px' }} />
                {t('settingsDialog.tabs.whisper')}
              </Tabs.Trigger>
              <Tabs.Trigger
                value="enhancement"
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  background: mainTab === 'enhancement' ? 'var(--active)' : 'var(--bg-tertiary)',
                  color: mainTab === 'enhancement' ? 'var(--active-text)' : 'var(--secondary)',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                }}
              >
                <AIIcon style={{ height: '16px', width: '16px' }} />
                {t('settingsDialog.tabs.enhancement')}
              </Tabs.Trigger>
            </Tabs.List>

            {/* Journal Tab */}
            <Tabs.Content value="journal">
              <fieldset className={styles.Fieldset}>
                <label className={styles.Label}>{t('settingsDialog.journal.appearance')}</label>
                <div className={styles.themes}>{renderThemes()}</div>
              </fieldset>

              <fieldset className={styles.Fieldset}>
                <label className={styles.Label}>{t('settingsDialog.journal.selectProvider')}</label>
                <AISettingTabs APIkey={APIkey} setCurrentKey={setCurrentKey} />
              </fieldset>

              <fieldset className={styles.Fieldset}>
                <label className={styles.Label}>{t('settingsDialog.journal.aiPrompt')}</label>
                <textarea
                  className={styles.Textarea}
                  placeholder={t('settingsDialog.journal.promptPlaceholder')}
                  value={prompt}
                  onChange={handleOnChangePrompt}
                />
              </fieldset>
            </Tabs.Content>

            {/* Whisper Tab */}
            <Tabs.Content value="whisper">
              <fieldset className={styles.Fieldset}>
                <label className={styles.Label}>Transcription provider</label>
                <TranscriptionSettingsTabs />
              </fieldset>

              {/* Whispo Configuration Section */}
              {whispoConfigQuery.data && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '14px' }}>
                  {/* Recording Settings */}
                  <div style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', overflow: 'hidden' }}>
                    <button
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--primary)',
                        fontSize: '13px',
                        fontWeight: '500',
                      }}
                      onClick={() => setExpandedSection(expandedSection === 'recording' ? null : 'recording')}
                    >
                      <span>{t('settingsDialog.whisper.recording')}</span>
                      <ChevronRightIcon
                        style={{
                          height: '14px',
                          width: '14px',
                          transform: expandedSection === 'recording' ? 'rotate(90deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s ease'
                        }}
                      />
                    </button>
                    {expandedSection === 'recording' && (
                      <div style={{ padding: '0 12px 12px' }}>
                        <fieldset className={styles.Fieldset} style={{ marginTop: 0 }}>
                          <label className={styles.Label}>{t('settingsDialog.whisper.shortcut')}</label>
                          <select
                            className={styles.Input}
                            value={whispoConfigQuery.data.shortcut || 'hold-ctrl'}
                            onChange={(e) => saveWhispoConfig({ shortcut: e.target.value })}
                          >
                            <option value="hold-ctrl">{t('settingsDialog.whisper.shortcuts.holdCtrl')}</option>
                            <option value="instant-ctrl">{t('settingsDialog.whisper.shortcuts.instantCtrl')}</option>
                            <option value="fn-key">{t('settingsDialog.whisper.shortcuts.fnKey')}</option>
                            <option value="ctrl-slash">{t('settingsDialog.whisper.shortcuts.ctrlSlash')}</option>
                          </select>
                        </fieldset>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                          <input
                            type="checkbox"
                            style={{ width: 14, height: 14, cursor: 'pointer' }}
                            checked={whispoConfigQuery.data.enableAudioCues ?? true}
                            onChange={(e) => saveWhispoConfig({ enableAudioCues: e.target.checked })}
                          />
                          <span style={{ fontSize: '12px', color: 'var(--secondary)' }}>
                            {t('settingsDialog.whisper.audioCues')}
                          </span>
                        </div>
                        {window.electron?.isMac && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
                            <input
                              type="checkbox"
                              style={{ width: 14, height: 14, cursor: 'pointer' }}
                              checked={whispoConfigQuery.data.isPauseMediaEnabled ?? false}
                              onChange={(e) => saveWhispoConfig({ isPauseMediaEnabled: e.target.checked })}
                            />
                            <span style={{ fontSize: '12px', color: 'var(--secondary)' }}>
                              {t('settingsDialog.whisper.muteSystemAudio')}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* App Settings */}
                  <div style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', overflow: 'hidden' }}>
                    <button
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--primary)',
                        fontSize: '13px',
                        fontWeight: '500',
                      }}
                      onClick={() => setExpandedSection(expandedSection === 'app' ? null : 'app')}
                    >
                      <span>{t('settingsDialog.whisper.app')}</span>
                      <ChevronRightIcon
                        style={{
                          height: '14px',
                          width: '14px',
                          transform: expandedSection === 'app' ? 'rotate(90deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s ease'
                        }}
                      />
                    </button>
                    {expandedSection === 'app' && (
                      <div style={{ padding: '0 12px 12px' }}>
                        <fieldset className={styles.Fieldset} style={{ marginTop: 0 }}>
                          <label className={styles.Label}>{t('settingsDialog.whisper.language')}</label>
                          <select
                            className={styles.Input}
                            value={whispoConfigQuery.data.language || 'en-US'}
                            onChange={(e) => saveWhispoConfig({ language: e.target.value })}
                          >
                            <option value="en-US">English (US)</option>
                            <option value="pt-BR">Português (Brasil)</option>
                          </select>
                        </fieldset>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                          <input
                            type="checkbox"
                            style={{ width: 14, height: 14, cursor: 'pointer' }}
                            checked={whispoConfigQuery.data.launchOnStartup ?? false}
                            onChange={(e) => saveWhispoConfig({ launchOnStartup: e.target.checked })}
                          />
                          <span style={{ fontSize: '12px', color: 'var(--secondary)' }}>
                            {t('settingsDialog.whisper.launchOnStartup')}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
                          <input
                            type="checkbox"
                            style={{ width: 14, height: 14, cursor: 'pointer' }}
                            checked={whispoConfigQuery.data.preserveClipboard ?? true}
                            onChange={(e) => saveWhispoConfig({ preserveClipboard: e.target.checked })}
                          />
                          <span style={{ fontSize: '12px', color: 'var(--secondary)' }}>
                            {t('settingsDialog.whisper.preserveClipboard')}
                          </span>
                        </div>
                        {window.electron?.isMac && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
                            <input
                              type="checkbox"
                              style={{ width: 14, height: 14, cursor: 'pointer' }}
                              checked={whispoConfigQuery.data.hideDockIcon ?? false}
                              onChange={(e) => saveWhispoConfig({ hideDockIcon: e.target.checked })}
                            />
                            <span style={{ fontSize: '12px', color: 'var(--secondary)' }}>
                              {t('settingsDialog.whisper.hideDockIcon')}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Tabs.Content>

            {/* Enhancement Tab */}
            <Tabs.Content value="enhancement">
              {whispoConfigQuery.data && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Enable Enhancement */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--primary)' }}>{t('settingsDialog.enhancement.enableAI')}</div>
                      <div style={{ fontSize: '11px', color: 'var(--secondary)', marginTop: '2px' }}>{t('settingsDialog.enhancement.enableDesc')}</div>
                    </div>
                    <input
                      type="checkbox"
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
                      checked={whispoConfigQuery.data.enhancementEnabled ?? false}
                      onChange={(e) => saveWhispoConfig({ enhancementEnabled: e.target.checked })}
                    />
                  </div>

                  {whispoConfigQuery.data.enhancementEnabled && (
                    <>
                      {/* Enhancement Provider */}
                      <fieldset className={styles.Fieldset} style={{ marginTop: 0 }}>
                        <label className={styles.Label}>{t('settingsDialog.enhancement.provider')}</label>
                        <select
                          className={styles.Input}
                          value={whispoConfigQuery.data.enhancementProvider || 'openai'}
                          onChange={(e) => saveWhispoConfig({ enhancementProvider: e.target.value })}
                        >
                          <option value="openai">{t('providers.openai')}</option>
                          <option value="groq">{t('providers.groq')}</option>
                          <option value="gemini">{t('providers.gemini')}</option>
                          <option value="openrouter">{t('providers.openrouter')}</option>
                          <option value="custom">{t('providers.custom')}</option>
                        </select>
                      </fieldset>

                      {/* Custom Provider Settings */}
                      {whispoConfigQuery.data.enhancementProvider === 'custom' && (
                        <div style={{ padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                          <fieldset className={styles.Fieldset} style={{ marginTop: 0 }}>
                            <label className={styles.Label}>{t('settingsDialog.enhancement.customApiKey')}</label>
                            <input
                              className={styles.Input}
                              type="password"
                              value={whispoConfigQuery.data.customEnhancementApiKey || ''}
                              onChange={(e) => saveWhispoConfig({ customEnhancementApiKey: e.target.value })}
                              placeholder="sk-..."
                            />
                          </fieldset>
                          <fieldset className={styles.Fieldset}>
                            <label className={styles.Label}>{t('settingsDialog.enhancement.customBaseUrl')}</label>
                            <input
                              className={styles.Input}
                              value={whispoConfigQuery.data.customEnhancementBaseUrl || ''}
                              onChange={(e) => saveWhispoConfig({ customEnhancementBaseUrl: e.target.value })}
                              placeholder="https://api.example.com/v1"
                            />
                          </fieldset>
                          <fieldset className={styles.Fieldset}>
                            <label className={styles.Label}>{t('settingsDialog.enhancement.customModel')}</label>
                            <input
                              className={styles.Input}
                              value={whispoConfigQuery.data.customEnhancementModel || ''}
                              onChange={(e) => saveWhispoConfig({ customEnhancementModel: e.target.value })}
                              placeholder="model-name"
                            />
                          </fieldset>
                        </div>
                      )}

                      {/* OpenRouter Model Selector */}
                      {whispoConfigQuery.data.enhancementProvider === 'openrouter' && (
                        <div style={{ padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                          <label className={styles.Label}>{t('settingsDialog.enhancement.openrouterModel')}</label>
                          {openrouterModels.length === 0 ? (
                            <button
                              className={styles.Button}
                              style={{ width: '100%', marginTop: '8px' }}
                              onClick={handleFetchOpenrouterModels}
                              disabled={loadingOpenrouterModels}
                            >
                              {loadingOpenrouterModels ? t('settingsDialog.enhancement.loadingModels') : t('settingsDialog.enhancement.fetchModels')}
                            </button>
                          ) : (
                            <select
                              className={styles.Input}
                              value={whispoConfigQuery.data.openrouterModel || ''}
                              onChange={(e) => saveWhispoConfig({ openrouterModel: e.target.value })}
                            >
                              <option value="">{t('settingsDialog.enhancement.selectModel')}</option>
                              {openrouterModels.map((model) => (
                                <option key={model.id} value={model.id}>{model.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}

                      {/* Prompts */}
                      <div style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', overflow: 'hidden' }}>
                        <button
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 12px',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--primary)',
                            fontSize: '13px',
                            fontWeight: '500',
                          }}
                          onClick={() => setExpandedSection(expandedSection === 'prompts' ? null : 'prompts')}
                        >
                          <span>{t('settingsDialog.enhancement.prompts')}</span>
                          <ChevronRightIcon
                            style={{
                              height: '14px',
                              width: '14px',
                              transform: expandedSection === 'prompts' ? 'rotate(90deg)' : 'rotate(0deg)',
                              transition: 'transform 0.2s ease'
                            }}
                          />
                        </button>
                        {expandedSection === 'prompts' && (
                          <div style={{ padding: '0 12px 12px' }}>
                            {/* Predefined Prompts */}
                            <div style={{ fontSize: '10px', color: 'var(--secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Predefined</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {PREDEFINED_PROMPTS.map((prompt) => {
                                const isActive = whispoConfigQuery.data.selectedPromptId === prompt.id || (!whispoConfigQuery.data.selectedPromptId && prompt.id === 'default');
                                return (
                                  <div
                                    key={prompt.id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      padding: '8px 10px',
                                      borderRadius: '6px',
                                      background: isActive ? 'var(--active)' : 'var(--secondary-bg)',
                                      transition: 'all 0.2s ease',
                                    }}
                                  >
                                    <div
                                      style={{ flex: 1, cursor: 'pointer' }}
                                      onClick={() => saveWhispoConfig({ selectedPromptId: prompt.id })}
                                    >
                                      <div style={{ fontSize: '12px', fontWeight: '500', color: isActive ? 'var(--active-text)' : 'var(--primary)' }}>
                                        {prompt.title}
                                      </div>
                                      <div style={{ fontSize: '10px', color: 'var(--secondary)', marginTop: '2px' }}>
                                        {prompt.description}
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                      {isActive && (
                                        <span style={{ fontSize: '10px', background: 'var(--active-text)', color: 'var(--active)', padding: '2px 6px', borderRadius: '4px' }}>Active</span>
                                      )}
                                      <button
                                        style={{
                                          padding: '4px 8px',
                                          background: 'transparent',
                                          border: 'none',
                                          cursor: 'pointer',
                                          color: 'var(--secondary)',
                                          fontSize: '10px',
                                        }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleViewPrompt(prompt);
                                        }}
                                      >
                                        View
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Custom Prompts */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px', marginBottom: '6px' }}>
                              <div style={{ fontSize: '10px', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Custom</div>
                              <button
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '4px 8px',
                                  background: 'var(--active)',
                                  color: 'var(--active-text)',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '10px',
                                }}
                                onClick={handleCreatePrompt}
                              >
                                + New
                              </button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {(whispoConfigQuery.data.customPrompts || []).length === 0 ? (
                                <div style={{ fontSize: '11px', color: 'var(--secondary)', textAlign: 'center', padding: '12px' }}>
                                  No custom prompts yet
                                </div>
                              ) : (
                                (whispoConfigQuery.data.customPrompts || []).map((prompt) => (
                                  <div
                                    key={prompt.id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      padding: '8px 10px',
                                      borderRadius: '6px',
                                      background: whispoConfigQuery.data.selectedPromptId === prompt.id ? 'var(--active)' : 'var(--secondary-bg)',
                                      transition: 'all 0.2s ease',
                                    }}
                                  >
                                    <div
                                      style={{ flex: 1, cursor: 'pointer' }}
                                      onClick={() => saveWhispoConfig({ selectedPromptId: prompt.id })}
                                    >
                                      <div style={{ fontSize: '12px', fontWeight: '500', color: whispoConfigQuery.data.selectedPromptId === prompt.id ? 'var(--active-text)' : 'var(--primary)' }}>
                                        {prompt.title}
                                      </div>
                                      {prompt.description && (
                                        <div style={{ fontSize: '10px', color: 'var(--secondary)', marginTop: '2px' }}>
                                          {prompt.description}
                                        </div>
                                      )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
                                      {whispoConfigQuery.data.selectedPromptId === prompt.id && (
                                        <span style={{ fontSize: '10px', background: 'var(--active-text)', color: 'var(--active)', padding: '2px 6px', borderRadius: '4px', marginRight: '4px' }}>Active</span>
                                      )}
                                      <button
                                        style={{
                                          padding: '4px',
                                          background: 'transparent',
                                          border: 'none',
                                          cursor: 'pointer',
                                          color: 'var(--secondary)',
                                        }}
                                        onClick={() => handleEditPrompt(prompt)}
                                        title="Edit"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        style={{
                                          padding: '4px',
                                          background: 'transparent',
                                          border: 'none',
                                          cursor: 'pointer',
                                          color: 'var(--error, #ff6b6b)',
                                        }}
                                        onClick={() => handleDeletePrompt(prompt.id)}
                                        title="Delete"
                                      >
                                        Del
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
                      <div style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', overflow: 'hidden' }}>
                        <button
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 12px',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--primary)',
                            fontSize: '13px',
                            fontWeight: '500',
                          }}
                          onClick={() => setExpandedSection(expandedSection === 'context' ? null : 'context')}
                        >
                          <span>{t('settingsDialog.enhancement.contextCapture')}</span>
                          <ChevronRightIcon
                            style={{
                              height: '14px',
                              width: '14px',
                              transform: expandedSection === 'context' ? 'rotate(90deg)' : 'rotate(0deg)',
                              transition: 'transform 0.2s ease'
                            }}
                          />
                        </button>
                        {expandedSection === 'context' && (
                          <div style={{ padding: '0 12px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                              <input
                                type="checkbox"
                                style={{ width: 14, height: 14, cursor: 'pointer' }}
                                checked={whispoConfigQuery.data.useClipboardContext ?? false}
                                onChange={(e) => saveWhispoConfig({ useClipboardContext: e.target.checked })}
                              />
                              <div>
                                <span style={{ fontSize: '12px', color: 'var(--primary)' }}>{t('settingsDialog.enhancement.useClipboard')}</span>
                                <div style={{ fontSize: '10px', color: 'var(--secondary)' }}>{t('settingsDialog.enhancement.clipboardDesc')}</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                              <input
                                type="checkbox"
                                style={{ width: 14, height: 14, cursor: 'pointer' }}
                                checked={whispoConfigQuery.data.useSelectedTextContext ?? false}
                                onChange={(e) => saveWhispoConfig({ useSelectedTextContext: e.target.checked })}
                              />
                              <div>
                                <span style={{ fontSize: '12px', color: 'var(--primary)' }}>{t('settingsDialog.enhancement.useSelectedText')}</span>
                                <div style={{ fontSize: '10px', color: 'var(--secondary)' }}>{t('settingsDialog.enhancement.selectedTextDesc')}</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <input
                                type="checkbox"
                                style={{ width: 14, height: 14, cursor: 'pointer' }}
                                checked={whispoConfigQuery.data.useScreenCaptureContext ?? false}
                                onChange={(e) => saveWhispoConfig({ useScreenCaptureContext: e.target.checked })}
                              />
                              <div>
                                <span style={{ fontSize: '12px', color: 'var(--primary)' }}>{t('settingsDialog.enhancement.useScreenCapture')}</span>
                                <div style={{ fontSize: '10px', color: 'var(--secondary)' }}>{t('settingsDialog.enhancement.screenCaptureDesc')}</div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  <div style={{ fontSize: '11px', color: 'var(--secondary)', padding: '8px 0', textAlign: 'center' }}>
                    {t('settingsDialog.enhancement.description')}
                  </div>
                </div>
              )}
            </Tabs.Content>
          </Tabs.Root>

          <div
            style={{
              display: 'flex',
              marginTop: 25,
              justifyContent: 'flex-end',
            }}
          >
            <Dialog.Close asChild>
              <button className={styles.Button} onClick={handleSaveChanges}>
                {t('settingsDialog.saveChanges')}
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Close asChild>
            <button className={styles.IconButton} aria-label="Close">
              <CrossIcon />
            </button>
          </Dialog.Close>

          {/* Prompt Editor Dialog - Inside Dialog.Content for proper z-index */}
          {promptEditorOpen && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100,
            }}>
              <div style={{
                background: 'var(--bg-primary)',
                borderRadius: '12px',
                padding: '20px',
                width: '400px',
                maxWidth: '90vw',
                maxHeight: '80vh',
                overflow: 'auto',
              }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600' }}>
                  {viewingPrompt ? 'View Prompt' : editingPrompt ? 'Edit Prompt' : 'New Prompt'}
                </h3>

                <fieldset className={styles.Fieldset}>
                  <label className={styles.Label}>Title</label>
                  <input
                    className={styles.Input}
                    value={promptForm.title}
                    onChange={(e) => setPromptForm({ ...promptForm, title: e.target.value })}
                    placeholder="My Custom Prompt"
                    readOnly={!!viewingPrompt}
                    style={viewingPrompt ? { opacity: 0.8, cursor: 'default' } : {}}
                  />
                </fieldset>

                <fieldset className={styles.Fieldset}>
                  <label className={styles.Label}>Description</label>
                  <input
                    className={styles.Input}
                    value={promptForm.description}
                    onChange={(e) => setPromptForm({ ...promptForm, description: e.target.value })}
                    placeholder="Short description..."
                    readOnly={!!viewingPrompt}
                    style={viewingPrompt ? { opacity: 0.8, cursor: 'default' } : {}}
                  />
                </fieldset>

                <fieldset className={styles.Fieldset}>
                  <label className={styles.Label}>Prompt Text</label>
                  <textarea
                    className={styles.Textarea}
                    value={promptForm.promptText}
                    onChange={(e) => setPromptForm({ ...promptForm, promptText: e.target.value })}
                    placeholder="Enter the enhancement instructions..."
                    rows={8}
                    readOnly={!!viewingPrompt}
                    style={viewingPrompt ? { opacity: 0.8, cursor: 'default' } : {}}
                  />
                </fieldset>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                  {viewingPrompt ? (
                    <button
                      className={styles.Button}
                      onClick={() => {
                        setPromptEditorOpen(false);
                        setViewingPrompt(null);
                        setPromptForm({ title: '', description: '', promptText: '' });
                      }}
                    >
                      Close
                    </button>
                  ) : (
                    <>
                      <button
                        className={styles.Button}
                        style={{ background: 'var(--secondary-bg)', color: 'var(--primary)' }}
                        onClick={() => {
                          setPromptEditorOpen(false);
                          setEditingPrompt(null);
                          setPromptForm({ title: '', description: '', promptText: '' });
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        className={styles.Button}
                        onClick={handleSavePrompt}
                        disabled={!promptForm.title || !promptForm.promptText}
                      >
                        Save
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
