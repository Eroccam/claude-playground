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
  const { isSearchMode } = useGlobe();

  return (
    <>
      {isSearchMode ? (
        <div className="searched-header">Searched</div>
      ) : (
        <RegionTabs onTabSelect={onExpand} />
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
