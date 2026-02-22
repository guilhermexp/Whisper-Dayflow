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

export const TagsContext = createContext();

export const TagsContextProvider = ({ children }) => {
  const { currentPile, getCurrentPilePath } = usePilesContext();
  const [tags, setTags] = useState(new Map());

  useEffect(() => {
    if (currentPile) {
      loadTags(getCurrentPilePath());
    }
  }, [currentPile]);

  const loadTags = useCallback(async (pilePath) => {
    const newTags = await tipcClient.tagsLoad({ pilePath });
    const newMap = new Map(newTags);
    setTags(newMap);
  }, []);

  const refreshTags = useCallback(async () => {
    const newTags = await tipcClient.tagsGet();
    const newMap = new Map(newTags);
    setTags(newMap);
  }, []);

  const syncTags = useCallback(async (filePath) => {
    tipcClient.tagsSync({ filePath }).then((tags) => {
      setTags(tags);
    });
  }, []);

  const addTag = useCallback(async (tag, filePath) => {
    tipcClient.tagsAdd({ tag, filePath }).then((tags) => {
      setTags(tags);
    });
  }, []);

  const removeTag = useCallback(async (tag, filePath) => {
    tipcClient
      .tagsRemove({ tag, filePath })
      .then((tags) => {
        setTags(tags);
      });
  }, []);

  const tagsContextValue = { tags, refreshTags, addTag, removeTag };

  return (
    <TagsContext.Provider value={tagsContextValue}>
      {children}
    </TagsContext.Provider>
  );
};

export const useTagsContext = () => useContext(TagsContext);
