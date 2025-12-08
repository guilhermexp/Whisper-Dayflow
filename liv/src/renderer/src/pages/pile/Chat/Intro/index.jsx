import styles from './Intro.module.scss';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

const Intro = ({ onSuggestionClick }) => {
  const { t } = useTranslation();

  const suggestions = [
    t('chat.intro.suggestion1'),
    t('chat.intro.suggestion2'),
    t('chat.intro.suggestion3'),
  ];

  return (
    <AnimatePresence>
      <motion.div
        key="intro"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{
          duration: 0.5,
          ease: [0.25, 0.46, 0.45, 0.94],
        }}
        className={styles.intro}
      >
        {/* Visual preview cards like reference */}
        <div className={styles.contextPreview}>
          <div className={styles.contextCard}>
            <div className={styles.cardLine} />
            <div className={styles.cardLine} />
            <div className={styles.cardLine} />
            <div className={styles.cardLine} />
          </div>
          <div className={styles.contextCard}>
            <div className={styles.cardLine} />
            <div className={styles.cardLine} />
            <div className={styles.cardLine} />
          </div>
          <div className={styles.contextCard}>
            <div className={styles.cardLine} />
            <div className={styles.cardLine} />
            <div className={styles.cardLine} />
            <div className={styles.cardLine} />
          </div>
        </div>

        {/* Elegant headline */}
        <div className={styles.headline}>
          <span className={styles.title}>{t('chat.intro.titlePart1')}</span>
          <span className={styles.titleAccent}>{t('chat.intro.titlePart2')}</span>
        </div>

        <p className={styles.subtitle}>
          {t('chat.intro.description')}
        </p>

        {/* Quick suggestion pills */}
        {onSuggestionClick && (
          <div className={styles.suggestions}>
            {suggestions.map((suggestion, index) => (
              <motion.button
                key={index}
                className={styles.suggestion}
                onClick={() => onSuggestionClick(suggestion)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {suggestion}
              </motion.button>
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default Intro;
