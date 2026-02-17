import React, { useEffect, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import styles from './AISettingTabs.module.scss';
import { useAIContext } from 'renderer/context/AIContext';
import { CardIcon, OllamaIcon, BoxOpenIcon, GlobeIcon, RefreshIcon } from 'renderer/icons';
import { useTranslation } from 'react-i18next';
import { tipcClient } from 'renderer/lib/tipc-client';

const resolveTabFromProvider = (provider) => {
  if (provider === 'ollama') return 'ollama';
  if (provider === 'openrouter') return 'openrouter';
  return 'openai';
};

const QUALITY_LABEL = {
  fast: 'Fastest',
  balanced: 'Recommended',
};

export default function AISettingTabs({ APIkey, setCurrentKey }) {
  const { t } = useTranslation();
  const {
    setBaseUrl,
    setOpenrouterKey,
    getOpenrouterKey,
    embeddingModel,
    setEmbeddingModel,
    ollamaBaseUrl,
    setOllamaBaseUrl,
    baseUrl,
    pileAIProvider,
    setPileAIProvider,
  } = useAIContext();

  const [openrouterAPIKey, setOpenrouterAPIKey] = useState('');
  const [selectedTab, setSelectedTab] = useState(() =>
    resolveTabFromProvider(pileAIProvider)
  );

  const [ollamaStatus, setOllamaStatus] = useState({ ok: false, error: '' });
  const [ollamaModels, setOllamaModels] = useState([]);
  const [isLoadingOllama, setIsLoadingOllama] = useState(false);
  const [pullingModel, setPullingModel] = useState('');
  const [pullProgress, setPullProgress] = useState({});


  const loadOllamaModels = async () => {
    setIsLoadingOllama(true);
    try {
      const [status, models] = await Promise.all([
        tipcClient.checkOllamaStatus({ baseUrl: ollamaBaseUrl }),
        tipcClient.listOllamaEmbeddingModels({ baseUrl: ollamaBaseUrl }),
      ]);
      setOllamaStatus(status);
      setOllamaModels(models || []);
    } catch (error) {
      setOllamaStatus({ ok: false, error: error?.message || 'Failed to connect to Ollama' });
      setOllamaModels([]);
    } finally {
      setIsLoadingOllama(false);
    }
  };

  useEffect(() => {
    getOpenrouterKey().then((key) => {
      if (key) setOpenrouterAPIKey(key);
    });
  }, [getOpenrouterKey]);

  useEffect(() => {
    if (pileAIProvider === 'ollama') {
      loadOllamaModels();
    }
  }, [pileAIProvider]);

  useEffect(() => {
    setSelectedTab((currentTab) =>
      currentTab === 'subscription' || currentTab === 'ollama'
        ? currentTab
        : resolveTabFromProvider(pileAIProvider)
    );
  }, [pileAIProvider]);

  useEffect(() => {
    if (!pullingModel) return;
    const timer = setInterval(async () => {
      try {
        const progress = await tipcClient.getOllamaPullProgress({ model: pullingModel });
        setPullProgress((prev) => ({ ...prev, [pullingModel]: progress }));

        if (progress.status === 'success' || progress.status === 'error') {
          clearInterval(timer);
          setPullingModel('');
          loadOllamaModels();
        }
      } catch {
        // Ignore transient errors during polling
      }
    }, 1200);

    return () => clearInterval(timer);
  }, [pullingModel]);

  const handleOpenrouterKeyChange = (e) => {
    const value = e.target.value;
    setOpenrouterAPIKey(value);
    setOpenrouterKey(value);
  };

  const handleTabChange = (newValue) => {
    setSelectedTab(newValue);
    if (newValue === 'subscription') return;
    // Ollama tab configures local embeddings for RAG only.
    // Chat provider remains OpenAI/OpenRouter unless explicitly changed there.
    if (newValue === 'ollama') return;
    setPileAIProvider(newValue);
  };

  const handleInputChange = (setter) => (e) => setter(e.target.value);

  const handlePullModel = async (modelName) => {
    setPullingModel(modelName);
    setPullProgress((prev) => ({
      ...prev,
      [modelName]: {
        model: modelName,
        status: 'pulling',
        percentage: 0,
      },
    }));

    try {
      await tipcClient.pullOllamaEmbeddingModel({
        model: modelName,
        baseUrl: ollamaBaseUrl,
      });
    } catch (error) {
      setPullProgress((prev) => ({
        ...prev,
        [modelName]: {
          model: modelName,
          status: 'error',
          error: error?.message || 'Pull failed',
          percentage: 0,
        },
      }));
      setPullingModel('');
    }
  };

  return (
    <Tabs.Root
      className={styles.tabsRoot}
      value={selectedTab}
      onValueChange={handleTabChange}
    >
      <Tabs.List className={styles.tabsList} aria-label="Manage your account">
        <Tabs.Trigger className={styles.tabsTrigger} value="subscription">
          {t('settingsDialog.journal.subscription')}
          <CardIcon className={styles.icon} />
        </Tabs.Trigger>
        <Tabs.Trigger className={styles.tabsTrigger} value="ollama">
          {t('settingsDialog.journal.ollamaApi')}
          <OllamaIcon className={styles.icon} />
        </Tabs.Trigger>
        <Tabs.Trigger className={styles.tabsTrigger} value="openai">
          {t('settingsDialog.journal.openaiApi')}
          <BoxOpenIcon className={styles.icon} />
        </Tabs.Trigger>
        <Tabs.Trigger className={styles.tabsTrigger} value="openrouter">
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
              <label className={styles.label} htmlFor="ollama-base-url">
                Ollama Base URL
              </label>
              <input
                id="ollama-base-url"
                className={styles.input}
                onChange={handleInputChange(setOllamaBaseUrl)}
                value={ollamaBaseUrl}
                placeholder="http://localhost:11434"
              />
            </fieldset>
          </div>

          <fieldset className={styles.fieldset}>
            <label className={styles.label} htmlFor="ollama-embedding-model">
              {t('settingsDialog.journal.embeddingModel')}
            </label>
            <select
              id="ollama-embedding-model"
              className={styles.input}
              onChange={handleInputChange(setEmbeddingModel)}
              value={embeddingModel}
            >
              {ollamaModels.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name} ({item.dimensions}d){item.installed ? ' - installed' : ''}
                </option>
              ))}
            </select>
          </fieldset>

          <div className={styles.ollamaHeader}>
            <span className={styles.disclaimer}>
              {ollamaStatus.ok ? 'Ollama conectado' : `Ollama indisponível: ${ollamaStatus.error || 'não conectado'}`}
            </span>
            <button className={styles.refreshBtn} onClick={loadOllamaModels} disabled={isLoadingOllama}>
              <RefreshIcon style={{ width: 14, height: 14 }} />
              <span>{isLoadingOllama ? 'Atualizando...' : 'Atualizar modelos'}</span>
            </button>
          </div>

          <div className={styles.ollamaModelsList}>
            {ollamaModels.map((item) => {
              const progress = pullProgress[item.name];
              const isPulling = pullingModel === item.name && progress?.status === 'pulling';

              return (
                <div key={item.name} className={styles.ollamaModelRow}>
                  <div>
                    <div className={styles.ollamaModelTitle}>{item.name}</div>
                    <div className={styles.ollamaModelMeta}>
                      {item.dimensions} dim · {item.sizeLabel} · {QUALITY_LABEL[item.quality]}
                    </div>
                    {progress?.status === 'pulling' && (
                      <div className={styles.ollamaProgress}>
                        Baixando... {progress?.percentage ?? 0}%
                      </div>
                    )}
                    {progress?.status === 'error' && (
                      <div className={styles.ollamaError}>Erro: {progress?.error}</div>
                    )}
                  </div>

                  <button
                    className={styles.downloadBtn}
                    disabled={isPulling || item.installed}
                    onClick={() => handlePullModel(item.name)}
                  >
                    {item.installed ? 'Installed' : isPulling ? 'Downloading...' : 'Download'}
                  </button>
                </div>
              );
            })}
          </div>

          <div className={styles.disclaimer}>
            Recomendação: use `qwen3-embedding:0.6b` para menor uso de CPU/RAM, ou `qwen3-embedding:4b` para melhor qualidade sem custo de API.
          </div>
        </div>
      </Tabs.Content>

      <Tabs.Content className={styles.tabsContent} value="openai">
        <div className={styles.providers}>
          <div className={styles.pitch}>
            {t('settingsDialog.journal.openaiPitch')}
          </div>

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
