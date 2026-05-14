import { useState } from 'react';
import { RegionTabs } from './RegionTabs.tsx';
import { EventList } from './EventList.tsx';
import './MobileDrawer.css';

export function MobileDrawer() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mobile-drawer-overlay">
      <div className={`mobile-drawer ${open ? 'open' : 'closed'}`}>
        <div
          className="mobile-drawer__handle-area"
          onClick={() => setOpen(!open)}
        >
          <div className="mobile-drawer__handle" />
          <span className="mobile-drawer__label">
            {open ? 'Close' : 'View Events'}
          </span>
        </div>
        <div className="mobile-drawer__content">
          <RegionTabs />
          <EventList />
        </div>
      </div>
    </div>
  );
}
