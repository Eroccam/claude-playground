import { RegionTabs } from './RegionTabs.tsx';
import { EventList } from './EventList.tsx';
import './Panel.css';
import { useGlobe } from '../../context/globeContext.ts';

interface SidePanelProps {
  isMinimized: boolean;
  onMinimize: () => void;
  onExpand: () => void;
}

export function SidePanel({ isMinimized, onMinimize, onExpand }: SidePanelProps) {
  const { isSearchMode, isCalendarMode } = useGlobe();
  const showResults = isSearchMode || isCalendarMode;

  return (
    <>
      {showResults ? (
        <div className="searched-header" onClick={onExpand}>Results</div>
      ) : (
        <RegionTabs
          isPaneOpen={!isMinimized}
          onPaneOpen={onExpand}
          onPaneClose={onMinimize}
        />
      )}
      <div className="side-panel__content" aria-hidden={isMinimized}>
        <div className="side-panel__body">
          <EventList />
        </div>
        <div className="side-panel__footer">
          <button
            className="side-panel__minimize"
            type="button"
            onClick={onMinimize}
            aria-label="Minimize show list panel"
          >
            Minimize
          </button>
        </div>
      </div>
    </>
  );
}
