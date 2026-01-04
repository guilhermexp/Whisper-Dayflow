import {
  useState,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { tipcClient } from 'renderer/lib/tipc-client';

export const availableThemes = {
  light: { primary: '#ddd', secondary: '#fff' },
  blue: { primary: '#a4d5ff', secondary: '#fff' },
  purple: { primary: '#d014e1', secondary: '#fff' },
  yellow: { primary: '#ff9634', secondary: '#fff' },
  green: { primary: '#22ff00', secondary: '#fff' },
  liquid: { primary: '#000000', secondary: '#1a1a1a' },
};

export const PilesContext = createContext();

export const PilesContextProvider = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [currentPile, setCurrentPile] = useState(null);
  const [piles, setPiles] = useState([]);
  const [isPilesLoaded, setIsPilesLoaded] = useState(false);
  const [isCreatingDefault, setIsCreatingDefault] = useState(false);

  // Initialize config file (only once on mount)
  useEffect(() => {
    getConfig();
  }, []);

  // Set the current pile based on the url
  useEffect(() => {
    if (!location.pathname) return;

    // If on a pile route, set currentPile from URL
    if (location.pathname.startsWith('/pile/')) {
      const rawPileName = location.pathname.split(/[/\\]/).pop();
      // Decode URL-encoded characters (e.g., %20 -> space, %C3%A1 -> á)
      const currentPileName = decodeURIComponent(rawPileName);
      changeCurrentPile(currentPileName);
      return;
    }

    // If on other routes (settings, dashboard, etc.) and no pile selected,
    // auto-select the first pile so theme and other pile-specific features work
    if (!currentPile && piles && piles.length > 0) {
      console.log('[PilesContext] Auto-selecting first pile:', piles[0].name);
      setCurrentPile(piles[0]);
    }
  }, [location.pathname, piles, currentPile]);

  const getConfig = async () => {
    const configFilePath = window.electron.getConfigPath();

    // Setup new piles.json if doesn't exist,
    // or read in the existing
    if (!window.electron.existsSync(configFilePath)) {
      window.electron.writeFile(configFilePath, JSON.stringify([]), (err) => {
        if (err) {
          setIsPilesLoaded(true);
          return;
        }
        setPiles([]);
        setIsPilesLoaded(true);
      });
      return;
    }

    await window.electron.readFile(configFilePath, (err, data) => {
      if (!err) {
        try {
          const jsonData = JSON.parse(data);
          setPiles(jsonData);
        } catch (_parseErr) {
          // keep piles empty on parse errors
        }
      }
      setIsPilesLoaded(true);
    });
  };

  const getCurrentPilePath = (appendPath = '') => {
    if (!currentPile) return;
    const pile = piles.find((p) => p.name == currentPile.name);
    const path = window.electron.joinPath(pile.path, appendPath);
    return path;
  };

  const writeConfig = async (piles) => {
    if (!piles) return;
    const configFilePath = window.electron.getConfigPath();
    window.electron.writeFile(configFilePath, JSON.stringify(piles), (err) => {
      if (err) {
        console.error('Error writing to config');
        return;
      }
    });
  };

  const createPile = (name = '', selectedPath = null) => {
    if (name == '' && selectedPath == null) return;

    let path = selectedPath;

    if (piles.find((p) => p.name == name)) {
      return;
    }

    // If selected directory is not empty, create a new directory
    if (!window.electron.isDirEmpty(selectedPath)) {
      path = window.electron.joinPath(selectedPath, name);
      window.electron.mkdir(path);
    }

    const newPiles = [{ name, path }, ...piles];
    setPiles(newPiles);
    writeConfig(newPiles);

    return name;
  };

  /**
   * Create a default journal automatically for new users.
   * Creates "Meu Diário" in ~/Documents/Liv/
   * Returns the journal name on success, null on failure.
   */
  const createDefaultJournal = useCallback(async () => {
    // Prevent double creation
    if (isCreatingDefault) {
      console.log('[PilesContext] Already creating default journal, skipping...');
      return null;
    }

    // Don't create if piles already exist
    if (piles && piles.length > 0) {
      console.log('[PilesContext] Piles already exist, skipping default creation');
      return piles[0].name;
    }

    setIsCreatingDefault(true);

    try {
      // Get documents path from main process
      const documentsPath = await tipcClient.getDocumentsPath();
      const journalName = 'Meu Diário';
      const livFolder = window.electron.joinPath(documentsPath, 'Liv');
      const journalPath = window.electron.joinPath(livFolder, journalName);

      console.log('[PilesContext] Creating default journal at:', journalPath);

      // Create the Liv folder if it doesn't exist
      if (!window.electron.existsSync(livFolder)) {
        await window.electron.mkdir(livFolder);
      }

      // Create the journal folder
      if (!window.electron.existsSync(journalPath)) {
        await window.electron.mkdir(journalPath);
      }

      // Add to piles list
      const newPiles = [{ name: journalName, path: journalPath }];
      setPiles(newPiles);
      await writeConfig(newPiles);

      console.log('[PilesContext] Default journal created successfully:', journalName);

      // Return journal name - caller is responsible for navigation
      return journalName;
    } catch (error) {
      console.error('[PilesContext] Failed to create default journal:', error);
      return null;
    } finally {
      setIsCreatingDefault(false);
    }
  }, [piles, isCreatingDefault]);

  const changeCurrentPile = (name) => {
    if (!piles || piles.length == 0) return;
    // Don't change if current pile is already the correct one
    if (currentPile && currentPile.name === name) return;
    const pile = piles.find((p) => p.name == name);
    setCurrentPile(pile);
  };

  // This does not delete the actual folder
  // User can do that if they actually want to.
  const deletePile = (name) => {
    if (!piles || piles.length == 0) return;
    const newPiles = piles.filter((p) => p.name != name);
    setPiles(newPiles);
    writeConfig(newPiles);
  };

  // Update current pile
  const updateCurrentPile = (newPile) => {
    if (!currentPile || !piles) return;
    const newPiles = piles.map((pile) => {
      if (pile.path === currentPile.path) {
        return newPile;
      }
      return pile;
    });
    setPiles(newPiles);
    writeConfig(newPiles);
    setCurrentPile(newPile);
  };

  // THEMES
  const currentTheme = useMemo(() => {
    return currentPile?.theme ?? 'light';
  }, [currentPile]);

  const setTheme = useCallback(
    (theme = 'light') => {
      if (!currentPile) {
        console.warn('[PilesContext] setTheme called but currentPile is null');
        return;
      }
      const valid = Object.keys(availableThemes);
      if (!valid.includes(theme)) return;
      const _pile = { ...currentPile, theme: theme };
      updateCurrentPile(_pile);
    },
    [currentPile]
  );

  const pilesContextValue = {
    piles,
    isPilesLoaded,
    getCurrentPilePath,
    createPile,
    createDefaultJournal,
    currentPile,
    deletePile,
    currentTheme,
    setTheme,
    updateCurrentPile,
  };

  return (
    <PilesContext.Provider value={pilesContextValue}>
      {children}
    </PilesContext.Provider>
  );
};

export const usePilesContext = () => useContext(PilesContext);
