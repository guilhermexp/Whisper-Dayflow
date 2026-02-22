import {
  useState,
  createContext,
  useContext,
  useEffect,
  useCallback,
} from 'react';
import { useLocation } from 'react-router-dom';
import { usePilesContext } from './PilesContext';
import { tipcClient } from 'renderer/lib/tipc-client';

export const IndexContext = createContext();

export const IndexContextProvider = ({ children }) => {
  const { currentPile, getCurrentPilePath } = usePilesContext();
  const [filters, setFilters] = useState();
  const [searchOpen, setSearchOpen] = useState(false);
  const [index, setIndex] = useState(new Map());
  const [latestThreads, setLatestThreads] = useState([]);

  useEffect(() => {
    if (currentPile) {
      loadIndex(getCurrentPilePath());
      loadLatestThreads();
    }
  }, [currentPile]);

  const loadIndex = useCallback(async (pilePath) => {
    const newIndex = await tipcClient.indexLoad({ pilePath });
    const newMap = new Map(newIndex);
    setIndex(newMap);
  }, []);

  const refreshIndex = useCallback(async () => {
    const newIndex = await tipcClient.indexGet();
    const newMap = new Map(newIndex);
    setIndex(newMap);
  }, []);

  const prependIndex = useCallback((key, value) => {
    console.log('prepend index', key, value)
    setIndex((prevIndex) => {
      const newIndex = new Map([[key, value], ...prevIndex]);
      return newIndex;
    });
  }, []);

  const addIndex = useCallback(
    async (newEntryPath, parentPath = null) => {
      console.time('index-add-time');
      const pilePath = getCurrentPilePath();

      await tipcClient
      .indexAdd({ filePath: newEntryPath })
      .then((index) => {
        // setIndex(index);
        loadLatestThreads();
      });
      console.timeEnd('index-add-time');
    },
    [currentPile]
  );

  const regenerateEmbeddings = () => {
    tipcClient.indexRegenerateEmbeddings();
  };

  const getThreadsAsText = useCallback(async (filePaths) => {
    return tipcClient.indexGetThreadsAsText({ filePaths });
  }, []);

  const updateIndex = useCallback(async (filePath, data) => {
    tipcClient.indexUpdate({ filePath, data }).then((index) => {
      setIndex(index);
      loadLatestThreads();
    });
  }, []);

  const removeIndex = useCallback(async (filePath) => {
    tipcClient.indexRemove({ filePath }).then((index) => {
      setIndex(index);
    });
  }, []);

  const search = useCallback(async (query) => {
    return tipcClient.indexSearch({ query });
  }, []);

  const vectorSearch = useCallback(async (query, topN = 50) => {
    return tipcClient.indexVectorSearch({ query, topN });
  }, []);

  const loadLatestThreads = useCallback(async (count = 10) => {
    const items = await search('');
    const latest = items.slice(0, count);

    const entryFilePaths = latest.map((entry) => entry.ref);
    const latestThreadsAsText = await getThreadsAsText(entryFilePaths);
    const normalizedThreads = (latestThreadsAsText || [])
      .map((thread) => (typeof thread === 'string' ? thread.trim() : ''))
      .filter(Boolean);

    setLatestThreads(normalizedThreads);
  }, [search, getThreadsAsText]);

  const indexContextValue = {
    index,
    refreshIndex,
    addIndex,
    removeIndex,
    updateIndex,
    search,
    searchOpen,
    setSearchOpen,
    vectorSearch,
    getThreadsAsText,
    latestThreads,
    regenerateEmbeddings,
    prependIndex
  };

  return (
    <IndexContext.Provider value={indexContextValue}>
      {children}
    </IndexContext.Provider>
  );
};

export const useIndexContext = () => useContext(IndexContext);
