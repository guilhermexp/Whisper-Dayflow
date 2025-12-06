import styles from './InputBar.module.scss';
import {
  SettingsIcon,
  CrossIcon,
  ReflectIcon,
  RefreshIcon,
  DiscIcon,
  DownloadIcon,
  FlameIcon,
  InfoIcon,
  SearchIcon,
  Search2Icon,
} from 'renderer/icons';
import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAIContext } from 'renderer/context/AIContext';
import { useTranslation } from 'react-i18next';
import {
  availableThemes,
  usePilesContext,
} from 'renderer/context/PilesContext';
import TextareaAutosize from 'react-textarea-autosize';
import useIPCListener from 'renderer/hooks/useIPCListener';
import Waiting from '../../Toasts/Toast/Loaders/Waiting';
import Thinking from '../../Toasts/Toast/Loaders/Thinking';

const prompts = [
  'Pose me any riddle or wonderment you wish',
  'You may consult this mind on any matter, mysterious or mundane',
];

let randomPrompt = () => prompts[Math.floor(Math.random() * prompts.length)];

export default function InputBar({
  value,
  onChange,
  close,
  querying = false,
  onSubmit,
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const statusFromMain = useIPCListener('vector-index', '');
  const [setupRun, setSetupRun] = useState(false);
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState({
    type: 'loading',
    message: t('search.loadingIndex'),
  });

  useEffect(() => {
    if (statusFromMain) {
      setStatus(statusFromMain.type);
      setMessage(statusFromMain);

      const timer = setTimeout(() => {
        setStatus('');
      }, 3000);

      return () => {
        clearTimeout(timer);
      };
    }
  }, [statusFromMain]);

  // Setup sequence for the vector store
  const setup = async () => {
    // 1. Get the vector store

    setStatus('');
    // 2. Initialize the vector store
    // 3. If the index is empty and there are more than 1 entires
  };

  const handleKeyPress = (event) => {
    if (event.key === 'Enter') {
      onSubmit();
      event.preventDefault();
      return false;
    }
  };

  useEffect(() => {
    if (setupRun) return;
    setup();
    setSetupRun(true);
  }, [setupRun]);

  const renderIcon = (status) => {
    switch (status) {
      case 'loading':
        return <Waiting className={styles.waiting} />;
      case 'querying':
        return <Waiting className={styles.waiting} />;
      case 'indexing':
        return <Waiting className={styles.waiting} />;
      case 'done':
        return <InfoIcon className={styles.reflectIcon} />;
      default:
        return <SearchIcon className={styles.reflectIcon} />;
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
        <div className={styles.bar}>
          <input
            value={value}
            onChange={onChange}
            className={styles.textarea}
            onKeyDown={handleKeyPress}
            placeholder={t('search.placeholder')}
          />
        </div>
        <div className={styles.buttons}>
          <button
            className={`${styles.ask} ${querying && styles.processing}`}
            onClick={onSubmit}
            disabled={querying}
          >
            {querying ? (
              <Thinking className={styles.spinner} />
            ) : (
              <Search2Icon className={styles.icon} />
            )}
          </button>
          <button className={styles.close} aria-label="Close search" onClick={() => navigate(-1)}>
            <CrossIcon className={styles.icon} />
          </button>
        </div>
      </div>
    </div>
  );
}
