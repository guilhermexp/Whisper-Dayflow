import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePilesContext } from 'renderer/context/PilesContext';
import { tipcClient } from '@renderer/lib/tipc-client';

export function Component() {
  const navigate = useNavigate();
  const { piles, isPilesLoaded, createDefaultJournal } = usePilesContext();
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Check permissions to decide where to redirect new users
  const accessibilityQuery = useQuery({
    queryKey: ['pile-redirect-accessibility'],
    queryFn: () => tipcClient.isAccessibilityGranted(),
    staleTime: 5000,
  });

  const microphoneQuery = useQuery({
    queryKey: ['pile-redirect-microphone'],
    queryFn: () => tipcClient.getMicrophoneStatus(),
    staleTime: 5000,
  });

  const isMac = window.electron?.isMac ?? true;
  const accessibilityGranted = !isMac || accessibilityQuery.data === true;
  const microphoneGranted = microphoneQuery.data === 'granted';
  const allPermissionsGranted = accessibilityGranted && microphoneGranted;
  const permissionsLoaded = accessibilityQuery.isFetched && microphoneQuery.isFetched;

  // Auto-create journal when permissions are granted and no piles exist
  useEffect(() => {
    const shouldAutoCreate =
      isPilesLoaded &&
      permissionsLoaded &&
      allPermissionsGranted &&
      (!piles || piles.length === 0) &&
      !isCreating &&
      !createError;

    if (shouldAutoCreate) {
      console.log('[NAV DEBUG] pile-redirect: permissions granted, auto-creating journal...');
      setIsCreating(true);

      createDefaultJournal()
        .then((journalName) => {
          if (journalName) {
            console.log(`[NAV DEBUG] pile-redirect: journal created, redirecting to /pile/${journalName}`);
            navigate(`/pile/${journalName}`, { replace: true });
          } else {
            setCreateError('Failed to create journal');
          }
        })
        .catch((err) => {
          console.error('[NAV DEBUG] pile-redirect: failed to create journal', err);
          setCreateError(err.message || 'Failed to create journal');
        })
        .finally(() => {
          setIsCreating(false);
        });
    }
  }, [isPilesLoaded, permissionsLoaded, allPermissionsGranted, piles, isCreating, createError, createDefaultJournal, navigate]);

  console.log(`[NAV DEBUG] pile-redirect RENDER - isPilesLoaded: ${isPilesLoaded}, piles: ${piles?.length ?? 0}, permissions: ${allPermissionsGranted}, isCreating: ${isCreating}`);

  // Wait for piles and permissions to load
  if (!isPilesLoaded || !permissionsLoaded) {
    console.log('[NAV DEBUG] pile-redirect: waiting for data to load...');
    return null;
  }

  // Show error state if creation failed
  if (createError) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: '16px',
        color: '#fff',
        background: '#1a1a1a'
      }}>
        <p style={{ color: '#ff6b6b' }}>Erro ao criar diário: {createError}</p>
        <button
          onClick={() => {
            setCreateError(null);
            setIsCreating(false);
          }}
          style={{
            padding: '8px 16px',
            background: '#333',
            border: '1px solid #555',
            borderRadius: '6px',
            color: '#fff',
            cursor: 'pointer'
          }}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  // Show loading state while creating journal
  if (isCreating) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: '#fff',
        background: '#1a1a1a'
      }}>
        <p>Criando seu diário...</p>
      </div>
    );
  }

  // No piles exist - need onboarding
  if (!piles || piles.length === 0) {
    // Permissions not granted - show onboarding wizard
    if (!allPermissionsGranted) {
      console.log('[NAV DEBUG] pile-redirect: no piles, redirecting to /onboarding');
      return <Navigate to="/onboarding" replace />;
    }
    // Permissions granted but no piles yet - will auto-create via useEffect
    return null;
  }

  // Redirect to first pile
  console.log(`[NAV DEBUG] pile-redirect: redirecting to /pile/${piles[0].name}`);
  return <Navigate to={`/pile/${piles[0].name}`} replace />;
}
