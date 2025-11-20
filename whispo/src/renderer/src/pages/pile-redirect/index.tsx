import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';

export function Component() {
  const [redirect, setRedirect] = useState<string | null>(null);

  useEffect(() => {
    const loadPiles = async () => {
      const configFilePath = window.electron.getConfigPath();

      // Check if piles config exists
      if (!window.electron.existsSync(configFilePath)) {
        // No config file, redirect to create pile
        setRedirect('/create-pile');
        return;
      }

      // Read piles from config
      await window.electron.readFile(configFilePath, (err: any, data: string) => {
        if (err) {
          setRedirect('/create-pile');
          return;
        }

        try {
          const piles = JSON.parse(data);

          if (!piles || piles.length === 0) {
            // No piles exist, redirect to create pile
            setRedirect('/create-pile');
          } else {
            // Redirect to first pile
            setRedirect(`/pile/${piles[0].name}`);
          }
        } catch (e) {
          setRedirect('/create-pile');
        }
      });
    };

    loadPiles();
  }, []);

  if (!redirect) {
    return <div>Loading...</div>;
  }

  return <Navigate to={redirect} replace />;
}
