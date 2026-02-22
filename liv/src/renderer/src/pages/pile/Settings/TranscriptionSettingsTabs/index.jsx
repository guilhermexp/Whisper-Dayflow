import React, { useState, useEffect } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import * as Dialog from '@radix-ui/react-dialog';
import styles from '../AISettingsTabs/AISettingTabs.module.scss';
import { GlobeIcon, ServerIcon, ChevronRightIcon, PlusIcon, TrashIcon, CrossIcon, RefreshIcon } from 'renderer/icons';
import {
  useConfigQuery,
  useSaveConfigMutation,
  useModelsQuery,
  useDownloadModelMutation,
  useDeleteModelMutation,
  useImportModelMutation,
  useModelDownloadProgressQuery,
  useAddCustomModelMutation,
} from 'renderer/lib/query-client';
import { tipcClient } from 'renderer/lib/tipc-client';
import { useTranslation } from 'react-i18next';

export default function TranscriptionSettingsTabs() {
  const { t } = useTranslation();
  const configQuery = useConfigQuery();
  const saveConfigMutation = useSaveConfigMutation();
  const modelsQuery = useModelsQuery();
  const downloadModelMutation = useDownloadModelMutation();
  const deleteModelMutation = useDeleteModelMutation();
  const importModelMutation = useImportModelMutation();
  const addCustomModelMutation = useAddCustomModelMutation();

  const [activeTab, setActiveTab] = useState('cloud');
  const [expandedProvider, setExpandedProvider] = useState(null);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customForm, setCustomForm] = useState({
    displayName: '',
    description: '',
    endpoint: '',
    modelIdentifier: '',
    language: 'english',
    requiresApiKey: true,
  });

  // OpenRouter models state
  const [openrouterModels, setOpenrouterModels] = useState([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // Encrypted key state (read from secure store, not config.json)
  const [geminiKey, setGeminiKeyState] = useState('');
  const [groqKey, setGroqKeyState] = useState('');
  const [deepgramKey, setDeepgramKeyState] = useState('');
  const [customKey, setCustomKeyState] = useState('');

  // Load encrypted keys on mount
  useEffect(() => {
    tipcClient.getGeminiKey().then((k) => { if (k) setGeminiKeyState(k); });
    tipcClient.getGroqKey().then((k) => { if (k) setGroqKeyState(k); });
    tipcClient.getDeepgramKey().then((k) => { if (k) setDeepgramKeyState(k); });
    tipcClient.getCustomKey().then((k) => { if (k) setCustomKeyState(k); });
  }, []);

  const handleEncryptedKeyChange = (provider) => (e) => {
    const value = e.target.value;
    const ipcMap = {
      gemini: { setter: setGeminiKeyState, save: tipcClient.setGeminiKey, remove: tipcClient.deleteGeminiKey },
      groq: { setter: setGroqKeyState, save: tipcClient.setGroqKey, remove: tipcClient.deleteGroqKey },
      deepgram: { setter: setDeepgramKeyState, save: tipcClient.setDeepgramKey, remove: tipcClient.deleteDeepgramKey },
      custom: { setter: setCustomKeyState, save: tipcClient.setCustomKey, remove: tipcClient.deleteCustomKey },
    };
    const entry = ipcMap[provider];
    if (!entry) return;
    entry.setter(value);
    if (value.trim()) {
      entry.save({ secretKey: value.trim() });
    } else {
      entry.remove();
    }
  };

  // Load cached OpenRouter models on mount
  useEffect(() => {
    tipcClient.getOpenrouterModels().then((models) => {
      if (models && models.length > 0) {
        setOpenrouterModels(models);
      }
    });
  }, []);

  // Fetch OpenRouter models when provider is expanded
  useEffect(() => {
    if (expandedProvider === 'openrouter' && openrouterModels.length === 0) {
      handleFetchOpenrouterModels();
    }
  }, [expandedProvider]);

  const handleFetchOpenrouterModels = async () => {
    setIsLoadingModels(true);
    try {
      const models = await tipcClient.fetchOpenrouterModels();
      if (models && models.length > 0) {
        setOpenrouterModels(models);
      }
    } catch (error) {
      console.error('Failed to fetch OpenRouter models:', error);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleImport = async () => {
    const filePath = await tipcClient.showModelImportDialog();
    if (!filePath) return;
    importModelMutation.mutate({ filePath });
  };

  const handleAddCustomModel = () => {
    addCustomModelMutation.mutate(customForm, {
      onSuccess: () => {
        setCustomDialogOpen(false);
        setCustomForm({
          displayName: '',
          description: '',
          endpoint: '',
          modelIdentifier: '',
          language: 'english',
          requiresApiKey: true,
        });
      },
    });
  };

  const handleDeleteCustomModel = (modelId) => {
    deleteModelMutation.mutate({ modelId });
  };

  const saveConfig = (config) => {
    saveConfigMutation.mutate({
      config: {
        ...configQuery.data,
        ...config,
      },
    });
  };

  const handleTabChange = (newValue) => {
    setActiveTab(newValue);
  };

  const handleInputChange = (field) => (e) => {
    saveConfig({ [field]: e.target.value });
  };

  const handleSwitchChange = (field) => (e) => {
    saveConfig({ [field]: e.target.checked });
  };

  if (!configQuery.data) return null;

  const config = configQuery.data;
  const models = modelsQuery.data || [];
  const localModels = models.filter(
    (model) => model.provider === 'local' || model.provider === 'local-imported'
  );
  const customModels = models.filter(
    (model) => model.provider === 'custom'
  );

  // Get current model display name based on provider
  const getCurrentModelName = () => {
    const providerId = config.sttProviderId || 'openai';
    if (providerId === 'openai') return config.openaiWhisperModel || 'gpt-4o-mini-transcribe';
    if (providerId === 'groq') return config.groqWhisperModel || 'whisper-large-v3-turbo';
    if (providerId === 'deepgram') return config.deepgramModel || 'nova-3';
    if (providerId === 'gemini') return config.geminiModel || 'gemini-1.5-flash';
    if (providerId === 'openrouter') return config.openrouterModel || 'openrouter';
    if (providerId.startsWith('local:')) {
      const modelId = providerId.replace('local:', '');
      const model = localModels.find(m => m.id === modelId);
      return model?.displayName || modelId;
    }
    if (providerId.startsWith('custom:')) {
      const modelId = providerId.replace('custom:', '');
      const model = customModels.find(m => m.id === modelId);
      return model?.displayName || modelId;
    }
    return providerId;
  };

  return (
    <div>
      {/* Default STT Provider - Above tabs for prominence */}
      <div className={styles.fieldset} style={{ marginBottom: '16px' }}>
        <label className={styles.label}>{t('settingsDialog.transcription.defaultProvider')}</label>
        <select
          className={styles.input}
          value={config.sttProviderId || 'openai'}
          onChange={handleInputChange('sttProviderId')}
        >
          <option value="openai">{t('providers.openai')}</option>
          <option value="groq">{t('providers.groq')}</option>
          <option value="deepgram">{t('providers.deepgram')}</option>
          <option value="gemini">{t('providers.gemini')}</option>
          <option value="openrouter">{t('providers.openrouter')}</option>
          {localModels.filter(m => m.isDownloaded || m.provider === 'local-imported').map(model => (
            <option key={model.id} value={`local:${model.id}`}>
              Local: {model.displayName}
            </option>
          ))}
        </select>
        <div style={{
          marginTop: '6px',
          fontSize: '11px',
          color: 'var(--secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <span>{t('settingsDialog.transcription.currentModel')}:</span>
          <span style={{ color: 'var(--primary)', fontWeight: '500' }}>{getCurrentModelName()}</span>
        </div>
        {/* Inline model selector based on current provider */}
        <div style={{ marginTop: '8px' }}>
          <label className={styles.label}>{t('settingsDialog.transcription.model')}</label>
          {(() => {
            const providerId = config.sttProviderId || 'openai';
            if (providerId === 'openai') {
              return (
                <select
                  className={styles.input}
                  value={config.openaiWhisperModel || 'gpt-4o-mini-transcribe'}
                  onChange={handleInputChange('openaiWhisperModel')}
                >
                  <option value="gpt-4o-mini-transcribe">gpt-4o-mini-transcribe</option>
                  <option value="gpt-4o-transcribe">gpt-4o-transcribe</option>
                  <option value="whisper-1">whisper-1</option>
                </select>
              );
            }
            if (providerId === 'groq') {
              return (
                <select
                  className={styles.input}
                  value={config.groqWhisperModel || 'whisper-large-v3-turbo'}
                  onChange={handleInputChange('groqWhisperModel')}
                >
                  <option value="whisper-large-v3-turbo">whisper-large-v3-turbo (recomendado)</option>
                  <option value="whisper-large-v3">whisper-large-v3</option>
                  <option value="distil-whisper-large-v3-en">distil-whisper-large-v3-en (inglês)</option>
                </select>
              );
            }
            if (providerId === 'deepgram') {
              return (
                <select
                  className={styles.input}
                  value={config.deepgramModel || 'nova-3'}
                  onChange={handleInputChange('deepgramModel')}
                >
                  <option value="nova-3">nova-3 (recomendado)</option>
                  <option value="nova-2">nova-2</option>
                  <option value="nova-3-medical">nova-3-medical</option>
                </select>
              );
            }
            if (providerId === 'gemini') {
              return (
                <select
                  className={styles.input}
                  value={config.geminiModel || 'gemini-1.5-flash'}
                  onChange={handleInputChange('geminiModel')}
                >
                  <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                  <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                </select>
              );
            }
            if (providerId === 'openrouter') {
              return (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {openrouterModels.length === 0 ? (
                    <span style={{ fontSize: '12px', color: 'var(--secondary)', flex: 1 }}>
                      {isLoadingModels ? 'Carregando modelos...' : 'Nenhum modelo carregado'}
                    </span>
                  ) : (
                    <select
                      className={styles.input}
                      style={{ flex: 1 }}
                      value={config.openrouterModel || ''}
                      onChange={handleInputChange('openrouterModel')}
                    >
                      {openrouterModels.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    style={{
                      padding: '8px',
                      background: 'var(--secondary-bg)',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: isLoadingModels ? 'default' : 'pointer',
                      opacity: isLoadingModels ? 0.5 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onClick={handleFetchOpenrouterModels}
                    disabled={isLoadingModels}
                    title="Atualizar lista de modelos"
                  >
                    <RefreshIcon
                      style={{
                        height: '14px',
                        width: '14px',
                        color: 'var(--primary)',
                        animation: isLoadingModels ? 'spin 1s linear infinite' : 'none',
                      }}
                    />
                  </button>
                </div>
              );
            }
            if (providerId.startsWith('local:')) {
              const downloadable = localModels.filter(m => m.isDownloaded || m.provider === 'local-imported');
              const currentLocalId = (config.defaultLocalModel || providerId.replace('local:', ''));
              return (
                <select
                  className={styles.input}
                  value={currentLocalId}
                  onChange={(e) => saveConfig({ sttProviderId: `local:${e.target.value}`, defaultLocalModel: e.target.value })}
                >
                  {downloadable.map(m => (
                    <option key={m.id} value={m.id}>{m.displayName}</option>
                  ))}
                </select>
              );
            }
            return null;
          })()}
        </div>
      </div>

      <Tabs.Root
        className={styles.tabsRoot}
        defaultValue="cloud"
        value={activeTab}
        onValueChange={handleTabChange}
      >
        <Tabs.List className={styles.tabsList} aria-label="Transcription settings">
          <Tabs.Trigger
            className={`${styles.tabsTrigger} ${
              activeTab === 'local' ? styles.activeCenter : ''
            }`}
            value="cloud"
          >
            {t('settingsDialog.transcription.cloud')}
            <GlobeIcon className={styles.icon} />
          </Tabs.Trigger>
          <Tabs.Trigger
            className={`${styles.tabsTrigger} ${
              activeTab === 'cloud' ? styles.activeLeft : ''
            }`}
            value="local"
          >
            {t('settingsDialog.transcription.local')}
            <ServerIcon className={styles.icon} />
          </Tabs.Trigger>
        </Tabs.List>

      {/* Cloud Providers Tab */}
      <Tabs.Content className={styles.tabsContent} value="cloud">
        <div className={styles.providers}>
          <div className={styles.pitch}>
            {t('settingsDialog.transcription.cloudDesc')}
          </div>

          {/* Collapsible Providers */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {/* OpenAI */}
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
                onClick={() => setExpandedProvider(expandedProvider === 'openai' ? null : 'openai')}
              >
                <span>{t('providers.openaiWhisper')}</span>
                <ChevronRightIcon
                  style={{
                    height: '14px',
                    width: '14px',
                    transform: expandedProvider === 'openai' ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease'
                  }}
                />
              </button>
              {expandedProvider === 'openai' && (
                <div style={{ padding: '0 12px 12px' }}>
                  <div className={styles.group}>
                    <fieldset className={styles.fieldset}>
                      <label className={styles.label}>{t('settingsDialog.transcription.apiKey')}</label>
                      <input
                        className={styles.input}
                        type="password"
                        value={config.openaiApiKey || ''}
                        onChange={handleInputChange('openaiApiKey')}
                        placeholder="sk-..."
                      />
                    </fieldset>
                    <fieldset className={styles.fieldset}>
                      <label className={styles.label}>{t('settingsDialog.transcription.model')}</label>
                      <select
                        className={styles.input}
                        value={config.openaiWhisperModel || 'gpt-4o-mini-transcribe'}
                        onChange={handleInputChange('openaiWhisperModel')}
                      >
                        <option value="gpt-4o-mini-transcribe">gpt-4o-mini-transcribe</option>
                        <option value="gpt-4o-transcribe">gpt-4o-transcribe</option>
                        <option value="whisper-1">whisper-1</option>
                      </select>
                    </fieldset>
                  </div>
                </div>
              )}
            </div>

            {/* Groq */}
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
                onClick={() => setExpandedProvider(expandedProvider === 'groq' ? null : 'groq')}
              >
                <span>{t('providers.groqWhisper')}</span>
                <ChevronRightIcon
                  style={{
                    height: '14px',
                    width: '14px',
                    transform: expandedProvider === 'groq' ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease'
                  }}
                />
              </button>
              {expandedProvider === 'groq' && (
                <div style={{ padding: '0 12px 12px' }}>
                  <div className={styles.group}>
                    <fieldset className={styles.fieldset}>
                      <label className={styles.label}>{t('settingsDialog.transcription.apiKey')}</label>
                      <input
                        className={styles.input}
                        type="password"
                        value={groqKey}
                        onChange={handleEncryptedKeyChange('groq')}
                        placeholder="gsk_..."
                      />
                    </fieldset>
                    <fieldset className={styles.fieldset}>
                      <label className={styles.label}>{t('settingsDialog.transcription.model')}</label>
                      <select
                        className={styles.input}
                        value={config.groqWhisperModel || 'whisper-large-v3-turbo'}
                        onChange={handleInputChange('groqWhisperModel')}
                      >
                        <option value="whisper-large-v3-turbo">whisper-large-v3-turbo (recomendado)</option>
                        <option value="whisper-large-v3">whisper-large-v3</option>
                        <option value="distil-whisper-large-v3-en">distil-whisper-large-v3-en (inglês)</option>
                      </select>
                    </fieldset>
                  </div>
                </div>
              )}
            </div>

            {/* Deepgram */}
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
                onClick={() => setExpandedProvider(expandedProvider === 'deepgram' ? null : 'deepgram')}
              >
                <span>{t('providers.deepgram')}</span>
                <ChevronRightIcon
                  style={{
                    height: '14px',
                    width: '14px',
                    transform: expandedProvider === 'deepgram' ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease'
                  }}
                />
              </button>
              {expandedProvider === 'deepgram' && (
                <div style={{ padding: '0 12px 12px' }}>
                  <div className={styles.group}>
                    <fieldset className={styles.fieldset}>
                      <label className={styles.label}>{t('settingsDialog.transcription.apiKey')}</label>
                      <input
                        className={styles.input}
                        type="password"
                        value={deepgramKey}
                        onChange={handleEncryptedKeyChange('deepgram')}
                        placeholder="Token..."
                      />
                    </fieldset>
                    <fieldset className={styles.fieldset}>
                      <label className={styles.label}>{t('settingsDialog.transcription.model')}</label>
                      <select
                        className={styles.input}
                        value={config.deepgramModel || 'nova-3'}
                        onChange={handleInputChange('deepgramModel')}
                      >
                        <option value="nova-3">nova-3 (recomendado)</option>
                        <option value="nova-2">nova-2</option>
                        <option value="nova-3-medical">nova-3-medical</option>
                      </select>
                    </fieldset>
                  </div>
                </div>
              )}
            </div>

            {/* Gemini */}
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
                onClick={() => setExpandedProvider(expandedProvider === 'gemini' ? null : 'gemini')}
              >
                <span>{t('providers.gemini')}</span>
                <ChevronRightIcon
                  style={{
                    height: '14px',
                    width: '14px',
                    transform: expandedProvider === 'gemini' ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease'
                  }}
                />
              </button>
              {expandedProvider === 'gemini' && (
                <div style={{ padding: '0 12px 12px' }}>
                  <div className={styles.group}>
                    <fieldset className={styles.fieldset}>
                      <label className={styles.label}>{t('settingsDialog.transcription.apiKey')}</label>
                      <input
                        className={styles.input}
                        type="password"
                        value={geminiKey}
                        onChange={handleEncryptedKeyChange('gemini')}
                        placeholder="AIza..."
                      />
                    </fieldset>
                    <fieldset className={styles.fieldset}>
                      <label className={styles.label}>{t('settingsDialog.transcription.model')}</label>
                      <select
                        className={styles.input}
                        value={config.geminiModel || 'gemini-1.5-flash'}
                        onChange={handleInputChange('geminiModel')}
                      >
                        <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                        <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                      </select>
                    </fieldset>
                  </div>
                </div>
              )}
            </div>

            {/* OpenRouter */}
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
                onClick={() => setExpandedProvider(expandedProvider === 'openrouter' ? null : 'openrouter')}
              >
                <span>{t('providers.openrouter')}</span>
                <ChevronRightIcon
                  style={{
                    height: '14px',
                    width: '14px',
                    transform: expandedProvider === 'openrouter' ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease'
                  }}
                />
              </button>
              {expandedProvider === 'openrouter' && (
                <div style={{ padding: '0 12px 12px' }}>
                  <div className={styles.group}>
                    <fieldset className={styles.fieldset}>
                      <label className={styles.label}>{t('settingsDialog.transcription.apiKey')}</label>
                      <input
                        className={styles.input}
                        type="password"
                        value={config.openrouterApiKey || ''}
                        onChange={handleInputChange('openrouterApiKey')}
                        placeholder="sk-or-..."
                      />
                    </fieldset>
                    <fieldset className={styles.fieldset}>
                      <label className={styles.label}>{t('settingsDialog.transcription.model')}</label>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {openrouterModels.length === 0 ? (
                          <span style={{ fontSize: '12px', color: 'var(--secondary)', flex: 1 }}>
                            {isLoadingModels ? 'Carregando modelos...' : 'Nenhum modelo carregado'}
                          </span>
                        ) : (
                          <select
                            className={styles.input}
                            style={{ flex: 1 }}
                            value={config.openrouterModel || ''}
                            onChange={handleInputChange('openrouterModel')}
                          >
                            {openrouterModels.map((model) => (
                              <option key={model} value={model}>
                                {model}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          style={{
                            padding: '8px',
                            background: 'var(--secondary-bg)',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: isLoadingModels ? 'default' : 'pointer',
                            opacity: isLoadingModels ? 0.5 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          onClick={handleFetchOpenrouterModels}
                          disabled={isLoadingModels}
                          title="Atualizar lista de modelos"
                        >
                          <RefreshIcon
                            style={{
                              height: '14px',
                              width: '14px',
                              color: 'var(--primary)',
                              animation: isLoadingModels ? 'spin 1s linear infinite' : 'none',
                            }}
                          />
                        </button>
                      </div>
                    </fieldset>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Custom Models Section */}
          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--secondary)' }}>{t('settingsDialog.transcription.customModels')}</span>
              <Dialog.Root open={customDialogOpen} onOpenChange={setCustomDialogOpen}>
                <Dialog.Trigger asChild>
                  <button
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      background: 'var(--active)',
                      color: 'var(--active-text)',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    <PlusIcon style={{ height: '10px', width: '10px' }} />
                    {t('settingsDialog.transcription.add')}
                  </button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.5)',
                    zIndex: 1000,
                  }} />
                  <Dialog.Content aria-describedby={undefined} style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: 'var(--bg-primary)',
                    borderRadius: '12px',
                    padding: '20px',
                    width: '400px',
                    maxWidth: '90vw',
                    zIndex: 1001,
                    border: '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                      <Dialog.Title style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>
                        {t('settingsDialog.transcription.addCustomModel')}
                      </Dialog.Title>
                      <Dialog.Close asChild>
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                          <CrossIcon style={{ height: '14px', width: '14px', color: 'var(--secondary)' }} />
                        </button>
                      </Dialog.Close>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <fieldset className={styles.fieldset}>
                        <label className={styles.label}>{t('settingsDialog.transcription.displayName')}</label>
                        <input
                          className={styles.input}
                          value={customForm.displayName}
                          onChange={(e) => setCustomForm(prev => ({ ...prev, displayName: e.target.value }))}
                          placeholder="My Custom Model"
                        />
                      </fieldset>
                      <fieldset className={styles.fieldset}>
                        <label className={styles.label}>{t('settingsDialog.transcription.description')}</label>
                        <input
                          className={styles.input}
                          value={customForm.description}
                          onChange={(e) => setCustomForm(prev => ({ ...prev, description: e.target.value }))}
                          placeholder={t('settingsDialog.transcription.description')}
                        />
                      </fieldset>
                      <fieldset className={styles.fieldset}>
                        <label className={styles.label}>{t('settingsDialog.transcription.endpointUrl')}</label>
                        <input
                          className={styles.input}
                          value={customForm.endpoint}
                          onChange={(e) => setCustomForm(prev => ({ ...prev, endpoint: e.target.value }))}
                          placeholder="https://api.example.com/v1/transcriptions"
                        />
                      </fieldset>
                      <fieldset className={styles.fieldset}>
                        <label className={styles.label}>{t('settingsDialog.transcription.modelIdentifier')}</label>
                        <input
                          className={styles.input}
                          value={customForm.modelIdentifier}
                          onChange={(e) => setCustomForm(prev => ({ ...prev, modelIdentifier: e.target.value }))}
                          placeholder="whisper-1"
                        />
                      </fieldset>
                      <div className={styles.switch}>
                        <label className={styles.Label}>{t('settingsDialog.transcription.multilingual')}</label>
                        <label className={styles.switchRoot}>
                          <input
                            type="checkbox"
                            checked={customForm.language === 'multilingual'}
                            onChange={(e) => setCustomForm(prev => ({
                              ...prev,
                              language: e.target.checked ? 'multilingual' : 'english'
                            }))}
                          />
                          <span className={styles.slider}></span>
                        </label>
                      </div>
                      <div className={styles.switch}>
                        <label className={styles.Label}>{t('settingsDialog.transcription.requiresApiKey')}</label>
                        <label className={styles.switchRoot}>
                          <input
                            type="checkbox"
                            checked={customForm.requiresApiKey}
                            onChange={(e) => setCustomForm(prev => ({ ...prev, requiresApiKey: e.target.checked }))}
                          />
                          <span className={styles.slider}></span>
                        </label>
                      </div>
                      <button
                        className={styles.Button}
                        style={{ marginTop: '8px' }}
                        onClick={handleAddCustomModel}
                        disabled={!customForm.displayName || !customForm.endpoint || addCustomModelMutation.isPending}
                      >
                        {addCustomModelMutation.isPending ? t('settingsDialog.transcription.adding') : t('settingsDialog.transcription.addModel')}
                      </button>
                    </div>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            </div>

            {customModels.length === 0 ? (
              <div style={{
                padding: '12px',
                background: 'var(--bg-tertiary)',
                borderRadius: '8px',
                fontSize: '12px',
                color: 'var(--secondary)',
                textAlign: 'center',
              }}>
                {t('settingsDialog.transcription.noCustomModels')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {customModels.map((model) => (
                  <div
                    key={model.id}
                    style={{
                      padding: '10px 12px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '500' }}>{model.displayName}</div>
                        <div style={{ fontSize: '11px', color: 'var(--secondary)', marginTop: '2px' }}>
                          {model.description || model.endpoint}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          style={{
                            padding: '0 8px',
                            height: '26px',
                            fontSize: '11px',
                            background: config.sttProviderId === `custom:${model.id}` ? 'var(--active)' : 'var(--secondary-bg)',
                            color: config.sttProviderId === `custom:${model.id}` ? 'var(--active-text)' : 'var(--primary)',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                          onClick={() => saveConfig({ sttProviderId: `custom:${model.id}` })}
                        >
                          {config.sttProviderId === `custom:${model.id}` ? t('settingsDialog.transcription.active') : t('settingsDialog.transcription.use')}
                        </button>
                        <button
                          style={{
                            padding: '0 8px',
                            height: '26px',
                            fontSize: '11px',
                            background: 'var(--secondary-bg)',
                            color: 'var(--error, #ef4444)',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                          onClick={() => handleDeleteCustomModel(model.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Tabs.Content>

      {/* Local Models Tab */}
      <Tabs.Content className={styles.tabsContent} value="local">
        <div className={styles.providers}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div className={styles.pitch} style={{ margin: 0 }}>
              Manage local Whisper models for offline transcription.
            </div>
            <button
              className={styles.Button}
              style={{ padding: '0 12px', height: '28px', fontSize: '12px' }}
              onClick={handleImport}
              disabled={importModelMutation.isPending}
            >
              {importModelMutation.isPending ? 'Importing...' : 'Import Model'}
            </button>
          </div>

          {localModels.length === 0 ? (
            <div className={styles.disclaimer}>
              No local models available. Download or import models to use offline.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {localModels.map((model) => (
                <LocalModelCard
                  key={model.id}
                  model={model}
                  config={config}
                  saveConfig={saveConfig}
                  downloadModelMutation={downloadModelMutation}
                  deleteModelMutation={deleteModelMutation}
                />
              ))}
            </div>
          )}

          {/* Model Preferences */}
          <div style={{ marginTop: '16px' }}>
            <div className={styles.switch}>
              <label className={styles.Label}>
                Auto-download recommended models
              </label>
              <label className={styles.switchRoot}>
                <input
                  type="checkbox"
                  checked={config.autoDownloadRecommended ?? false}
                  onChange={handleSwitchChange('autoDownloadRecommended')}
                />
                <span className={styles.slider}></span>
              </label>
            </div>

            <div className={styles.switch}>
              <label className={styles.Label}>
                Prefer local models when available
              </label>
              <label className={styles.switchRoot}>
                <input
                  type="checkbox"
                  checked={config.preferLocalModels ?? false}
                  onChange={handleSwitchChange('preferLocalModels')}
                />
                <span className={styles.slider}></span>
              </label>
            </div>
          </div>

          <div className={styles.disclaimer}>
            Local models run entirely on your machine without internet connection.
          </div>
        </div>
      </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

// Component for displaying local model with download progress
function LocalModelCard({ model, config, saveConfig, downloadModelMutation, deleteModelMutation }) {
  const shouldPoll = model.provider === 'local' && !model.isDownloaded;
  const { data: downloadProgress } = useModelDownloadProgressQuery(
    shouldPoll ? model.id : undefined,
    {
      enabled: shouldPoll,
      refetchInterval: 750,
    }
  );

  const isDownloading = downloadProgress && downloadProgress.status === 'downloading';
  const progressPercent = downloadProgress?.progress || 0;

  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: '8px',
        background: 'var(--bg-tertiary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {model.displayName}
            {model.engine === 'sherpa' && (
              <span style={{
                fontSize: '9px',
                padding: '2px 5px',
                borderRadius: '4px',
                background: 'linear-gradient(135deg, #76b900 0%, #4a9000 100%)',
                color: 'white',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Parakeet
              </span>
            )}
            {model.size && (
              <span style={{
                fontSize: '10px',
                color: 'var(--secondary)',
                fontWeight: 'normal',
              }}>
                {model.size}
              </span>
            )}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--secondary)', marginTop: '2px' }}>
            {model.description || model.id}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {model.provider === 'local' && !model.isDownloaded ? (
            <button
              className="button"
              style={{
                padding: '0 10px',
                height: '28px',
                fontSize: '12px',
                background: 'var(--active)',
                color: 'var(--active-text)',
                border: 'none',
                borderRadius: '6px',
                cursor: isDownloading ? 'default' : 'pointer',
                opacity: isDownloading ? 0.7 : 1,
              }}
              onClick={() => !isDownloading && downloadModelMutation.mutate({ modelId: model.id })}
              disabled={isDownloading}
            >
              {isDownloading ? `${Math.round(progressPercent)}%` : 'Download'}
            </button>
          ) : (
            <>
              <button
                style={{
                  padding: '0 10px',
                  height: '28px',
                  fontSize: '12px',
                  background: config.sttProviderId === `local:${model.id}` ? 'var(--active)' : 'var(--secondary-bg)',
                  color: config.sttProviderId === `local:${model.id}` ? 'var(--active-text)' : 'var(--primary)',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
                onClick={() => saveConfig({
                  sttProviderId: `local:${model.id}`,
                  defaultLocalModel: model.id
                })}
              >
                {config.sttProviderId === `local:${model.id}` ? 'Active' : 'Use'}
              </button>
              <button
                style={{
                  padding: '0 10px',
                  height: '28px',
                  fontSize: '12px',
                  background: 'var(--secondary-bg)',
                  color: 'var(--primary)',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
                onClick={() => deleteModelMutation.mutate({ modelId: model.id })}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {isDownloading && (
        <div style={{ marginTop: '8px' }}>
          <div style={{
            height: '4px',
            background: 'var(--secondary-bg)',
            borderRadius: '2px',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${progressPercent}%`,
              background: 'var(--active)',
              borderRadius: '2px',
              transition: 'width 0.3s ease',
            }} />
          </div>
          {downloadProgress?.downloadedBytes && downloadProgress?.totalBytes && (
            <div style={{ fontSize: '10px', color: 'var(--secondary)', marginTop: '4px', textAlign: 'right' }}>
              {formatBytes(downloadProgress.downloadedBytes)} / {formatBytes(downloadProgress.totalBytes)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Helper function to format bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
