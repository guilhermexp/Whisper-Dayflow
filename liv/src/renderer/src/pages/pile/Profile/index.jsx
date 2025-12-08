import styles from './Profile.module.scss';
import layoutStyles from '../PileLayout.module.scss';
import { CrossIcon } from 'renderer/icons';
import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { usePilesContext } from 'renderer/context/PilesContext';
import Navigation from '../Navigation';

function Profile() {
  const navigate = useNavigate();
  const { currentTheme } = usePilesContext();

  const themeStyles = useMemo(
    () => (currentTheme ? `${currentTheme}Theme` : ''),
    [currentTheme]
  );

  const isMac = window.electron?.isMac ?? false;
  const osStyles = isMac ? layoutStyles.macOS : layoutStyles.windows;

  const handleClose = () => {
    navigate(-1);
  };

  return (
    <div className={`${layoutStyles.frame} ${themeStyles} ${osStyles}`}>
      <div className={layoutStyles.bg}></div>
      <div className={styles.pageContainer}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.wrapper}>
            <h1 className={styles.title}>Profile</h1>
            <button className={styles.close} aria-label="Close" onClick={handleClose}>
              <CrossIcon style={{ height: 14, width: 14 }} />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className={styles.mainContent}>
          <div className={styles.placeholder}>
            <div className={styles.icon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </div>
            <h2 className={styles.placeholderTitle}>Em Desenvolvimento</h2>
            <p className={styles.description}>
              Esta funcionalidade está sendo construída e estará disponível em breve.
            </p>
          </div>
        </div>
      </div>
      <Navigation />
    </div>
  );
}

export const Component = Profile;
export default Profile;
