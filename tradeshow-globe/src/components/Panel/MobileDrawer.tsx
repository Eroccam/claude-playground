import { useState } from 'react';
import { RegionTabs } from './RegionTabs.tsx';
import { EventList } from './EventList.tsx';
import { EventDetail } from './EventDetail.tsx';
import { useGlobe } from '../../context/GlobeContext.tsx';
import './MobileDrawer.css';

export function MobileDrawer() {
  const [open, setOpen] = useState(false);
  const { selectedEvent } = useGlobe();

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
          {selectedEvent ? <EventDetail /> : <EventList />}
        </div>
      </div>
    </div>
  );
}
