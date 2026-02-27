import '../pile-app.scss';
import { Suspense, useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigation } from 'react-router-dom';
import { PilesContextProvider } from 'renderer/context/PilesContext';
import { ToastsContextProvider } from 'renderer/context/ToastsContext';
import { AutoUpdateContextProvider } from 'renderer/context/AutoUpdateContext';
import { AIContextProvider } from 'renderer/context/AIContext';
import { IndexContextProvider } from 'renderer/context/IndexContext';
import { HighlightsContextProvider } from 'renderer/context/HighlightsContext';
import { TagsContextProvider } from 'renderer/context/TagsContext';
import { TimelineContextProvider } from 'renderer/context/TimelineContext';
import { LinksContextProvider } from 'renderer/context/LinksContext';

export function Component() {
  const location = useLocation();
  const navigation = useNavigation();
  const lastPathRef = useRef(location.pathname);

  // Set platform titlebar CSS variables globally
  useEffect(() => {
    if (window.electron?.isMac) {
      document.documentElement.style.setProperty('--titlebar-height', '38px');
      document.documentElement.style.setProperty('--titlebar-left', '80px');
      document.documentElement.style.setProperty('--titlebar-right', '12px');
    } else {
      document.documentElement.style.setProperty('--titlebar-height', '42px');
      document.documentElement.style.setProperty('--titlebar-left', '12px');
      document.documentElement.style.setProperty('--titlebar-right', '140px');
    }
  }, []);

  // Track if we're navigating to a DIFFERENT route (not just reloading same route)
  const isNavigating = navigation.state === 'loading' &&
    navigation.location?.pathname !== location.pathname;

  // Update last path when navigation completes
  useEffect(() => {
    if (navigation.state === 'idle') {
      lastPathRef.current = location.pathname;
    }
  }, [navigation.state, location.pathname]);

  return (
    <PilesContextProvider>
      <ToastsContextProvider>
        <AutoUpdateContextProvider>
          <AIContextProvider>
            <IndexContextProvider>
              <HighlightsContextProvider>
                <TagsContextProvider>
                  <TimelineContextProvider>
                    <LinksContextProvider>
                      <Suspense fallback={null}>
                        {/* Hide content during navigation to prevent flash */}
                        <div style={{
                          opacity: isNavigating ? 0 : 1,
                          pointerEvents: isNavigating ? 'none' : 'auto',
                          transition: 'opacity 0.05s ease-out'
                        }}>
                          <Outlet />
                        </div>
                      </Suspense>
                      <div id="dialog"></div>
                    </LinksContextProvider>
                  </TimelineContextProvider>
                </TagsContextProvider>
              </HighlightsContextProvider>
            </IndexContextProvider>
          </AIContextProvider>
        </AutoUpdateContextProvider>
      </ToastsContextProvider>
    </PilesContextProvider>
  );
}
