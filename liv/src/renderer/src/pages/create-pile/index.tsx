import { useState, useMemo } from 'react';
import styles from './CreatePile.module.scss';
import layoutStyles from '../pile/PileLayout.module.scss';
import { TrashIcon, CrossIcon } from 'renderer/icons';
import { Link, useNavigate } from 'react-router-dom';
import { usePilesContext } from 'renderer/context/PilesContext';
import { useTranslation } from 'react-i18next';
import Navigation from '../pile/Navigation';
import { tipcClient } from 'renderer/lib/tipc-client';
const pilesList = ['Users/uj/Personal', 'Users/uj/Startup', 'Users/uj/School'];

export function Component() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { createPile, piles, currentTheme, currentPile } = usePilesContext();
  const [folderExists, setFolderExists] = useState(false);
  const [name, setName] = useState('');
  const [path, setPath] = useState('');

  const themeStyles = useMemo(
    () => (currentTheme ? `${currentTheme}Theme` : ""),
    [currentTheme]
  );
  const osStyles = useMemo(
    () => (window.electron.isMac ? layoutStyles.mac : layoutStyles.win),
    []
  );

  const homePath = useMemo(() => {
    if (currentPile?.name) return `/pile/${currentPile.name}`;
    if (piles && piles.length > 0) return `/pile/${piles[0].name}`;
    return "/create-pile";
  }, [currentPile?.name, piles]);

  const handleNameChange = (e: any) => {
    setName(e.target.value);
  };

  const handleClick = async () => {
    const selectedPath = await tipcClient.selectDirectory();
    if (selectedPath) setPath(selectedPath);
  };

  const handleSubmit = () => {
    if (!path) return;
    if (!name) return;

    createPile(name, path);
    navigate('/pile/' + name);
  };

  const renderPiles = () => {
    return pilesList.map((pile) => {
      const name = pile.split(/[/\\]/).pop();
      return (
        <div className={styles.pile} key={pile}>
          <div className={styles.left}>
            <div className={styles.name}>{name}</div>
            <div className={styles.src}>/Users/uj/Documents</div>
          </div>
          <div className={styles.right}>
            <TrashIcon className={styles.icon} />

            <div className={styles.button}>Open</div>
          </div>
        </div>
      );
    });
  };

  return (
    <div className={`${layoutStyles.frame} ${themeStyles} ${osStyles}`}>
      <div className={layoutStyles.bg}></div>

      <div className={styles.pageContainer}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.wrapper}>
            <div className={styles.DialogTitle}>
              <span>{t("createPile.title")}</span>
            </div>
            <div
              className={styles.close}
              onClick={() => navigate("/")}
              title={t("common.close")}
            >
              <CrossIcon style={{ height: 14, width: 14 }} />
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className={styles.mainContent}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.name}>{t("createPile.header")}</div>
            </div>

            <div className={styles.form}>
              <div className={styles.input}>
                <div className={styles.des}>
                  <label>{t("createPile.pileName")}</label>
                  {t("createPile.pileNameDesc")}
                </div>
                <input
                  type="text"
                  placeholder={t("createPile.pileNamePlaceholder")}
                  value={name}
                  onChange={handleNameChange}
                />
              </div>
              <div className={styles.input}>
                <div className={styles.des}>
                  <label>{t("createPile.location")}</label>
                  {t("createPile.locationDesc")}
                </div>

                <button onClick={handleClick}>
                  {path ? path : t("createPile.chooseLocation")}
                </button>
              </div>
            </div>
            <div className={styles.buttons}>
              <Link to={homePath} className={styles.back}>
                ← {t("common.back")}
              </Link>
              <div className={styles.button} onClick={handleSubmit}>
                {t("createPile.create")}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Navigation />
    </div>
  );
}
