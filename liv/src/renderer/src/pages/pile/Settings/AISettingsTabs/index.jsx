import React, { useEffect, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import styles from './AISettingTabs.module.scss';
import { useAIContext } from 'renderer/context/AIContext';
import {
  usePilesContext,
  availableThemes,
} from 'renderer/context/PilesContext';
import { CardIcon, OllamaIcon, BoxOpenIcon, GlobeIcon, RefreshIcon } from 'renderer/icons';
import { useIndexContext } from 'renderer/context/IndexContext';
import { useTranslation } from 'react-i18next';

export default function AISettingTabs({ APIkey, setCurrentKey }) {
  const { t } = useTranslation();
  const {
    prompt,
    setPrompt,
    updateSettings,
    setBaseUrl,
    getKey,
    setKey,
    deleteKey,
    model,
    setModel,
    openrouterModel,
    setOpenrouterModel,
    setOpenrouterKey,
    getOpenrouterKey,
    embeddingModel,
    setEmbeddingModel,
    ollama,
    baseUrl,
    pileAIProvider,
    setPileAIProvider,
  } = useAIContext();

  const [openrouterAPIKey, setOpenrouterAPIKey] = useState('');

  // OpenRouter models state
  const [openrouterModels, setOpenrouterModels] = useState([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // Load OpenRouter key on mount
  useEffect(() => {
    getOpenrouterKey().then((key) => {
      if (key) setOpenrouterAPIKey(key);
    });
  }, [getOpenrouterKey]);

  // Load cached OpenRouter models on mount
  useEffect(() => {
    window.electron.ipc.invoke('get-openrouter-models').then((models) => {
      if (models && models.length > 0) {
        setOpenrouterModels(models);
      }
    });
  }, []);

  // Fetch OpenRouter models when provider is selected
  useEffect(() => {
    if (pileAIProvider === 'openrouter' && openrouterModels.length === 0) {
      handleFetchOpenrouterModels();
    }
  }, [pileAIProvider]);

  const handleFetchOpenrouterModels = async () => {
    setIsLoadingModels(true);
    try {
      const models = await window.electron.ipc.invoke('fetch-openrouter-models');
      if (models && models.length > 0) {
        setOpenrouterModels(models);
      }
    } catch (error) {
      console.error('Failed to fetch OpenRouter models:', error);
    } finally {
      setIsLoadingModels(false);
    }
  };

  // Save OpenRouter key when it changes
  const handleOpenrouterKeyChange = (e) => {
    const value = e.target.value;
    setOpenrouterAPIKey(value);
    setOpenrouterKey(value);
  };

  const { currentTheme, setTheme } = usePilesContext();

  const handleTabChange = (newValue) => {
    const provider = newValue === 'subscription' ? 'openrouter' : newValue;
    setPileAIProvider(provider);
  };

  const handleInputChange = (setter) => (e) => setter(e.target.value);

  const renderThemes = () => {
    return Object.entries(availableThemes).map(([theme, colors]) => (
      <button
        key={`theme-${theme}`}
        className={`${styles.theme} ${
          currentTheme === theme ? styles.current : ''
        }`}
        onClick={() => setTheme(theme)}
      >
        <div
          className={styles.color1}
          style={{ background: colors.primary }}
        ></div>
      </button>
    ));
  };

  return (
    <Tabs.Root
      className={styles.tabsRoot}
      defaultValue="openrouter"
      value={pileAIProvider}
      onValueChange={handleTabChange}
    >
      <Tabs.List className={styles.tabsList} aria-label="Manage your account">
        <Tabs.Trigger
          className={`${styles.tabsTrigger} ${
            pileAIProvider === 'ollama' ? styles.activeCenter : ''
          } ${pileAIProvider === 'openai' ? styles.activeRight : ''}`}
          value="subscription"
        >
          {t('settingsDialog.journal.subscription')}
          <CardIcon className={styles.icon} />
        </Tabs.Trigger>
        <Tabs.Trigger
          className={`${styles.tabsTrigger} ${
            pileAIProvider === 'subscription' ? styles.activeLeft : ''
          } ${pileAIProvider === 'openai' ? styles.activeRight : ''}`}
          value="ollama"
        >
          {t('settingsDialog.journal.ollamaApi')}
          <OllamaIcon className={styles.icon} />
        </Tabs.Trigger>
        <Tabs.Trigger
          className={`${styles.tabsTrigger} ${
            pileAIProvider === 'ollama' ? styles.activeCenter : ''
          } ${pileAIProvider === 'openrouter' ? styles.activeLeft : ''}`}
          value="openai"
        >
          {t('settingsDialog.journal.openaiApi')}
          <BoxOpenIcon className={styles.icon} />
        </Tabs.Trigger>
        <Tabs.Trigger
          className={`${styles.tabsTrigger} ${
            pileAIProvider === 'openai' ? styles.activeLeft : ''
          }`}
          value="openrouter"
        >
          OpenRouter
          <GlobeIcon className={styles.icon} />
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content className={styles.tabsContent} value="subscription">
        <div className={styles.providers}>
          <div className={styles.pitch}>
            {t('settingsDialog.journal.subscriptionPitch')}
          </div>
          <div>
            <div className={styles.pro}>
              <div className={styles.left}>
                <div className={styles.price}>{t('settingsDialog.journal.subscriptionPrice')}</div>
              </div>
              <div className={styles.right}>
                <div className={styles.subscribe}>{t('settingsDialog.journal.comingSoon')}</div>
              </div>
            </div>
            <div className={styles.disclaimer}>
              {t('settingsDialog.journal.subscriptionDisclaimer')}
            </div>
          </div>
        </div>
      </Tabs.Content>

      <Tabs.Content className={styles.tabsContent} value="ollama">
        <div className={styles.providers}>
          <div className={styles.pitch}>
            {t('settingsDialog.journal.ollamaPitch')}
          </div>

          <div className={styles.group}>
            <fieldset className={styles.fieldset}>
              <label className={styles.label} htmlFor="ollama-model">
                {t('settingsDialog.journal.model')}
              </label>
              <input
                id="ollama-model"
                className={styles.input}
                onChange={handleInputChange(setModel)}
                value={model}
                defaultValue="llama3.1:70b"
                placeholder="llama3.1:70b"
              />
            </fieldset>
            <fieldset className={styles.fieldset}>
              <label className={styles.label} htmlFor="ollama-embedding-model">
                {t('settingsDialog.journal.embeddingModel')}
              </label>
              <input
                id="ollama-embedding-model"
                className={styles.input}
                onChange={handleInputChange(setEmbeddingModel)}
                value={embeddingModel}
                defaultValue="mxbai-embed-large"
                placeholder="mxbai-embed-large"
                disabled
              />
            </fieldset>
          </div>

          <div className={styles.disclaimer}>
            {t('settingsDialog.journal.ollamaDisclaimer')}
          </div>
        </div>
      </Tabs.Content>

      <Tabs.Content className={styles.tabsContent} value="openai">
        <div className={styles.providers}>
          <div className={styles.pitch}>
            {t('settingsDialog.journal.openaiPitch')}
          </div>

          <div className={styles.group}>
            <fieldset className={styles.fieldset}>
              <label className={styles.label} htmlFor="openai-base-url">
                {t('settingsDialog.journal.baseUrl')}
              </label>
              <input
                id="openai-base-url"
                className={styles.input}
                onChange={handleInputChange(setBaseUrl)}
                value={baseUrl}
                placeholder="https://api.openai.com/v1"
              />
            </fieldset>
            <fieldset className={styles.fieldset}>
              <label className={styles.label} htmlFor="openai-model">
                {t('settingsDialog.journal.model')}
              </label>
              <select
                id="openai-model"
                className={styles.input}
                onChange={handleInputChange(setModel)}
                value={model || 'gpt-5.3'}
              >
                <option value="gpt-5.3">gpt-5.3</option>
                <option value="gpt-5.1">gpt-5.1</option>
                <option value="gpt-5">gpt-5</option>
                <option value="gpt-5-mini">gpt-5-mini</option>
                <option value="gpt-4o">gpt-4o</option>
              </select>
            </fieldset>
          </div>
          <fieldset className={styles.fieldset}>
            <label className={styles.label} htmlFor="openai-api-key">
              {t('settingsDialog.journal.openaiApiKey')}
            </label>
            <input
              id="openai-api-key"
              className={styles.input}
              onChange={handleInputChange(setCurrentKey)}
              value={APIkey}
              placeholder={t('settingsDialog.journal.openaiKeyPlaceholder')}
            />
          </fieldset>
          <div className={styles.disclaimer}>
            {t('settingsDialog.journal.openaiDisclaimer')}
          </div>
        </div>
      </Tabs.Content>

      <Tabs.Content className={styles.tabsContent} value="openrouter">
        <div className={styles.providers}>
          <div className={styles.pitch}>
            Use OpenRouter to access multiple AI providers with a single API key.
          </div>

          <fieldset className={styles.fieldset}>
            <label className={styles.label} htmlFor="openrouter-model">
              {t('settingsDialog.journal.model')}
            </label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {openrouterModels.length === 0 ? (
                <span style={{ fontSize: '12px', color: 'var(--secondary)', flex: 1 }}>
                  {isLoadingModels ? 'Carregando modelos...' : 'Nenhum modelo carregado'}
                </span>
              ) : (
                <select
                  id="openrouter-model"
                  className={styles.input}
                  style={{ flex: 1 }}
                  onChange={handleInputChange(setOpenrouterModel)}
                  value={openrouterModel || ''}
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
          <fieldset className={styles.fieldset}>
            <label className={styles.label} htmlFor="openrouter-api-key">
              OpenRouter API Key
            </label>
            <input
              id="openrouter-api-key"
              className={styles.input}
              type="password"
              onChange={handleOpenrouterKeyChange}
              value={openrouterAPIKey}
              placeholder="sk-or-..."
            />
          </fieldset>
          <div className={styles.disclaimer}>
            Get your API key at openrouter.ai/keys
          </div>
        </div>
      </Tabs.Content>
    </Tabs.Root>
  );
}
