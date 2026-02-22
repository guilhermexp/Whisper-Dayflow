import { useState, useCallback, useEffect } from 'react';
import { tipcClient } from 'renderer/lib/tipc-client';

export function useElectronStore(key, initialValue) {
  const [storedValue, setStoredValue] = useState(initialValue);

  useEffect(() => {
    tipcClient.getSetting({ key }).then((value) => {
      if (value !== undefined) setStoredValue(value);
    });
  }, [key]);

  const setValue = useCallback(
    (value) => {
      const newValue = value instanceof Function ? value(storedValue) : value;
      setStoredValue(newValue);
      tipcClient.setSetting({ key, value: newValue });
    },
    [key, storedValue]
  );

  return [storedValue, setValue];
}
