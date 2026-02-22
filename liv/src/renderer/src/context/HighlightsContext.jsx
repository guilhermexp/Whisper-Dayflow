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

export const HighlightsContext = createContext();

export const HighlightsContextProvider = ({ children }) => {
  const { currentPile, getCurrentPilePath } = usePilesContext();
  const [open, setOpen] = useState(false);
  const [highlights, setHighlights] = useState(new Map());

  const openHighlights = (e) => {
    setOpen(true);
  };

  const onOpenChange = (open) => {
    setOpen(open);
  };

  useEffect(() => {
    if (currentPile) {
      loadHighlights(getCurrentPilePath());
    }
  }, [currentPile]);

  const loadHighlights = useCallback(async (pilePath) => {
    const newHighlights = await tipcClient.highlightsLoad({ pilePath });
    const newMap = new Map(newHighlights);
    setHighlights(newMap);
  }, []);

  const refreshHighlights = useCallback(async () => {
    const newHighlights = await tipcClient.highlightsGet();
    const newMap = new Map(newHighlights);
    setHighlights(newMap);
  }, []);

  const createHighlight = useCallback(async (highlight) => {
    tipcClient
      .highlightsCreate({ highlight })
      .then((highlights) => {
        setHighlights(highlights);
      });
  }, []);

  const deleteHighlight = useCallback(async (highlight) => {
    tipcClient
      .highlightsDelete({ highlight })
      .then((highlights) => {
        setHighlights(highlights);
      });
  }, []);

  const updateHighlight = (highlight, content) => {};

  const highlightsContextValue = {
    open,
    openHighlights,
    onOpenChange,
    highlights,
    refreshHighlights,
    createHighlight,
    deleteHighlight,
  };

  return (
    <HighlightsContext.Provider value={highlightsContextValue}>
      {children}
    </HighlightsContext.Provider>
  );
};

export const useHighlightsContext = () => useContext(HighlightsContext);
