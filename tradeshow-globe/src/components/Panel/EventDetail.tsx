import { useGlobe } from '../../context/GlobeContext.tsx';
import { formatEventDateRange } from '../../utils/dates.ts';

export function EventDetail() {
  const { selectedEvent, setSelectedEventId } = useGlobe();

  if (!selectedEvent) return null;

  const location = [selectedEvent.city, selectedEvent.stateProvince, selectedEvent.country]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="event-detail">
      <div className="event-detail__header">
        <div>
          <div className="event-detail__name">{selectedEvent.name}</div>
          <div className="event-detail__dates">
            {formatEventDateRange(selectedEvent.startDate, selectedEvent.endDate)}
          </div>
          <div className="event-detail__location">{location}</div>
        </div>
        <button
          className="event-detail__close"
          onClick={() => setSelectedEventId(null)}
          aria-label="Close detail"
        >
          &times;
        </button>
      </div>

      {selectedEvent.imageUrl && (
        <img
          className="event-detail__image"
          src={selectedEvent.imageUrl}
          alt={selectedEvent.name}
        />
      )}

      <div className="event-detail__description">{selectedEvent.description}</div>

      {selectedEvent.eventUrl && (
        <a
          className="event-detail__link"
          href={selectedEvent.eventUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Visit Event Website
        </a>
      )}
    </div>
  );
}
