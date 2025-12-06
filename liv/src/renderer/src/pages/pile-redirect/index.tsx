import { Navigate } from 'react-router-dom';
import { usePilesContext } from 'renderer/context/PilesContext';

export function Component() {
  const { piles, isPilesLoaded } = usePilesContext();

  console.log(`[NAV DEBUG] pile-redirect RENDER - isPilesLoaded: ${isPilesLoaded}, piles: ${piles?.length ?? 0}`);

  // Wait for piles to load - render nothing
  if (!isPilesLoaded) {
    console.log('[NAV DEBUG] pile-redirect: waiting for piles to load...');
    return null;
  }

  // No piles exist - redirect to create
  if (!piles || piles.length === 0) {
    console.log('[NAV DEBUG] pile-redirect: no piles, redirecting to /create-pile');
    return <Navigate to="/create-pile" replace />;
  }

  // Redirect to first pile
  console.log(`[NAV DEBUG] pile-redirect: redirecting to /pile/${piles[0].name}`);
  return <Navigate to={`/pile/${piles[0].name}`} replace />;
}
