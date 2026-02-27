import { useGlobe } from '../../context/GlobeContext.tsx';
import { EventListItem } from './EventListItem.tsx';

export function EventList() {
  const { filteredEvents, selectedEventId, setSelectedEventId } = useGlobe();

  if (filteredEvents.length === 0) {
    return (
      <div className="event-list" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
        <p>No events in this region.</p>
      </div>
    );
  }

  return (
    <div className="event-list">
      {filteredEvents.map((event) => (
        <EventListItem
          key={event.id}
          event={event}
          isSelected={event.id === selectedEventId}
          onClick={() => setSelectedEventId(event.id)}
        />
      ))}
    </div>
  );
}
