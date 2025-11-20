import React, { useEffect, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import styles from './AISettingTabs.module.scss';
import { useAIContext } from 'renderer/context/AIContext';
import {
  usePilesContext,
  availableThemes,
} from 'renderer/context/PilesContext';
import { CardIcon, OllamaIcon, BoxOpenIcon } from 'renderer/icons';
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
    embeddingModel,
    setEmbeddingModel,
    ollama,
    baseUrl,
    pileAIProvider,
    setPileAIProvider,
  } = useAIContext();

  const { currentTheme, setTheme } = usePilesContext();

  const handleTabChange = (newValue) => {
    setPileAIProvider(newValue);
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
      defaultValue="openai"
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
          }`}
          value="openai"
        >
          {t('settingsDialog.journal.openaiApi')}
          <BoxOpenIcon className={styles.icon} />
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
              <input
                id="openai-model"
                className={styles.input}
                onChange={handleInputChange(setModel)}
                value={model}
                placeholder="gpt-4o"
              />
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
    </Tabs.Root>
  );
}
