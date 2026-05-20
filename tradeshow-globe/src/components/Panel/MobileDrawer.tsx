import { useState } from 'react';
import { RegionTabs } from './RegionTabs.tsx';
import { EventList } from './EventList.tsx';
import { useGlobe } from '../../context/globeContext.ts';
import './MobileDrawer.css';

export function MobileDrawer() {
  const [isMinimized, setIsMinimized] = useState(false);
  const { isSearchMode } = useGlobe();

  if (isSearchMode) return null;

  return (
    <div className={`mobile-nav-panel ${isMinimized ? 'mobile-nav-panel--minimized' : ''}`}>
      <RegionTabs
        isPaneOpen={!isMinimized}
        onPaneOpen={() => setIsMinimized(false)}
        onPaneClose={() => setIsMinimized(true)}
      />
      <div className="mobile-nav-panel__content" aria-hidden={isMinimized}>
        <EventList />
      </div>
      <div className="mobile-nav-panel__footer">
        <button
          className="mobile-nav-panel__toggle"
          type="button"
          onClick={() => setIsMinimized((value) => !value)}
          aria-label={isMinimized ? 'Expand show list panel' : 'Minimize show list panel'}
        >
          {isMinimized ? 'Expand' : 'Minimize'}
        </button>
      </div>
    </div>
  );
}
