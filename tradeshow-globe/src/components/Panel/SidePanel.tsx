import { useGlobe } from '../../context/globeContext.ts';
import { RegionTabs } from './RegionTabs.tsx';
import { EventList } from './EventList.tsx';
import { EventDetail } from './EventDetail.tsx';
import './Panel.css';

export function SidePanel() {
  const { selectedEvent } = useGlobe();

  return (
    <>
      <RegionTabs />
      {selectedEvent ? <EventDetail /> : <EventList />}
    </>
  );
}
