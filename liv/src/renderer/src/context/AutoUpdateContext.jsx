import React, { useState, createContext, useEffect, useContext } from 'react';
import { useToastsContext } from './ToastsContext';
import { rendererHandlers, tipcClient } from 'renderer/lib/tipc-client';

export const AutoUpdateContext = createContext();

export const AutoUpdateContextProvider = ({ children }) => {
  const { addNotification, removeNotification } = useToastsContext();

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [updateError, setUpdateError] = useState(null);
  const [updateNotAvailable, setUpdateNotAvailable] = useState(false);

  const handleUpdateAvailable = () => {
    addNotification({
      id: 'auto-update',
      type: 'waiting',
      message: 'Update downloaded and ready to install',
      dismissTime: 5000,
    });

    setUpdateAvailable(true);
    setUpdateDownloaded(true);
  };

  useEffect(() => {
    const unlisten = rendererHandlers.updateAvailable.listen(handleUpdateAvailable);

    return () => {
      unlisten();
    };
  }, []);

  const restartAndUpdate = () => {
    tipcClient.quitAndInstall();
  };

  const autoUpdateContextValue = {
    updateAvailable,
    updateDownloaded,
    updateError,
    updateNotAvailable,
    restartAndUpdate,
  };

  return (
    <AutoUpdateContext.Provider value={autoUpdateContextValue}>
      {children}
    </AutoUpdateContext.Provider>
  );
};

export const useAutoUpdateContext = () => useContext(AutoUpdateContext);
