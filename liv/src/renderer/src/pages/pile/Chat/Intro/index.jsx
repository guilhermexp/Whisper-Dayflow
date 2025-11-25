import { OpenBookIcon } from 'renderer/icons';
import styles from './Intro.module.scss';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

const Intro = () => {
  const { t } = useTranslation();

  return (
    <AnimatePresence>
      <motion.div
        key="intro"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{
          delay: 0.3,
          type: 'spring',
          stiffness: 50,
          duration: 1,
          scale: { duration: 0.5 },
        }}
        className={styles.intro}
      >
        <div className={styles.intro}>
          <OpenBookIcon className={styles.icon} />
          <div className={styles.title}>
            {t('chat.intro.title')}
          </div>
          <div className={styles.line}></div>
          <div className={styles.des}>
            {t('chat.intro.description')}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default Intro;
