import { useGlobe } from '../../context/globeContext.ts';
import { EventListItem } from './EventListItem.tsx';

export function EventList() {
  const { filteredEvents, selectedEventId, setSelectedEventId, isLoading, error, isSearchMode } = useGlobe();

  if (isLoading) {
    return (
      <div className="event-list" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
        <p>Loading events...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="event-list" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b91c1c' }}>
        <p>Unable to load events.</p>
      </div>
    );
  }

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
          showRegionBadge={isSearchMode}
          onClick={() => setSelectedEventId(event.id)}
        />
      ))}
    </div>
  );
}
