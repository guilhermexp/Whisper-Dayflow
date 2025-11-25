import '../pile-app.scss';
import { Outlet } from 'react-router-dom';
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
                      <Outlet />
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
