import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { tipcClient } from '@renderer/lib/tipc-client';
import { usePilesContext } from '@renderer/context/PilesContext';
import styles from './Onboarding.module.scss';

export function Component() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { createDefaultJournal, piles, isPilesLoaded } = usePilesContext();
  const [isCreating, setIsCreating] = useState(false);

  // Check accessibility permission
  const accessibilityQuery = useQuery({
    queryKey: ['onboarding-accessibility'],
    queryFn: () => tipcClient.isAccessibilityGranted(),
    refetchInterval: 1000, // Poll every second to detect when user grants permission
  });

  // Check microphone permission
  const microphoneQuery = useQuery({
    queryKey: ['onboarding-microphone'],
    queryFn: () => tipcClient.getMicrophoneStatus(),
    refetchInterval: 1000,
  });

  const isMac = window.electron?.isMac ?? true;
  const accessibilityGranted = !isMac || accessibilityQuery.data === true;
  const microphoneGranted = microphoneQuery.data === 'granted';
  const allPermissionsGranted = accessibilityGranted && microphoneGranted;

  // Handle "Get Started" button click
  const handleStart = useCallback(async () => {
    if (!allPermissionsGranted || isCreating) return;

    setIsCreating(true);

    try {
      // Create default journal
      const journalName = await createDefaultJournal();

      if (journalName) {
        // Navigate to the new journal
        navigate(`/pile/${journalName}`, { replace: true });
      } else {
        // Fallback: navigate to root (pile-redirect will handle it)
        navigate('/', { replace: true });
      }
    } catch (error) {
      console.error('[Onboarding] Failed to create default journal:', error);
      setIsCreating(false);
    }
  }, [allPermissionsGranted, isCreating, createDefaultJournal, navigate]);

  // Auto-redirect if user already has journals
  useEffect(() => {
    if (isPilesLoaded && piles && piles.length > 0) {
      navigate(`/pile/${piles[0].name}`, { replace: true });
    }
  }, [isPilesLoaded, piles, navigate]);

  // Request accessibility access (macOS)
  const handleAccessibilityClick = () => {
    tipcClient.requestAccessibilityAccess();
  };

  // Request microphone access
  const handleMicrophoneClick = async () => {
    const granted = await tipcClient.requestMicrophoneAccess();
    if (!granted) {
      tipcClient.openMicrophoneInSystemPreferences();
    }
  };

  return (
    <div className={styles.container}>
      <AnimatePresence mode="wait">
        <motion.div
          key="onboarding"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          className={styles.content}
        >
          {/* Logo and Title */}
          <div className={styles.hero}>
            <div className={styles.logoContainer}>
              <span className={styles.logoIcon}>🎙️</span>
            </div>
            <h1 className={styles.title}>{t('onboarding.title')}</h1>
            <p className={styles.subtitle}>{t('onboarding.subtitle')}</p>
            <p className={styles.description}>{t('onboarding.description')}</p>
          </div>

          {/* Permission Cards */}
          <div className={styles.permissions}>
            {/* Accessibility Card (macOS only) */}
            {isMac && (
              <motion.div
                className={`${styles.permissionCard} ${accessibilityGranted ? styles.granted : ''}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                <div className={styles.permissionInfo}>
                  <div className={styles.permissionIcon}>
                    {accessibilityGranted ? (
                      <span className={styles.checkIcon}>✓</span>
                    ) : (
                      <span className={styles.pendingIcon}>○</span>
                    )}
                  </div>
                  <div className={styles.permissionText}>
                    <h3>{t('onboarding.accessibility.title')}</h3>
                    <p>{t('onboarding.accessibility.description')}</p>
                  </div>
                </div>
                {!accessibilityGranted && (
                  <button
                    className={styles.permissionButton}
                    onClick={handleAccessibilityClick}
                  >
                    {t('onboarding.accessibility.action')}
                  </button>
                )}
                {accessibilityGranted && (
                  <span className={styles.grantedLabel}>{t('onboarding.granted')}</span>
                )}
              </motion.div>
            )}

            {/* Microphone Card */}
            <motion.div
              className={`${styles.permissionCard} ${microphoneGranted ? styles.granted : ''}`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div className={styles.permissionInfo}>
                <div className={styles.permissionIcon}>
                  {microphoneGranted ? (
                    <span className={styles.checkIcon}>✓</span>
                  ) : (
                    <span className={styles.pendingIcon}>○</span>
                  )}
                </div>
                <div className={styles.permissionText}>
                  <h3>{t('onboarding.microphone.title')}</h3>
                  <p>{t('onboarding.microphone.description')}</p>
                </div>
              </div>
              {!microphoneGranted && (
                <button
                  className={styles.permissionButton}
                  onClick={handleMicrophoneClick}
                >
                  {t('onboarding.microphone.action')}
                </button>
              )}
              {microphoneGranted && (
                <span className={styles.grantedLabel}>{t('onboarding.granted')}</span>
              )}
            </motion.div>
          </div>

          {/* Start Button */}
          <motion.div
            className={styles.actions}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <button
              className={`${styles.startButton} ${!allPermissionsGranted ? styles.disabled : ''}`}
              onClick={handleStart}
              disabled={!allPermissionsGranted || isCreating}
            >
              {isCreating ? t('onboarding.creatingJournal') : t('onboarding.start')}
              {!isCreating && <span className={styles.arrow}>→</span>}
            </button>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
