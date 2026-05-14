import { RegionTabs } from './RegionTabs.tsx';
import { EventList } from './EventList.tsx';
import './Panel.css';

interface SidePanelProps {
  isMinimized: boolean;
  onMinimize: () => void;
  onExpand: () => void;
}

export function SidePanel({ isMinimized, onMinimize, onExpand }: SidePanelProps) {
  return (
    <>
      <RegionTabs onTabSelect={onExpand} />
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
