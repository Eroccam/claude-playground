import type { CSSProperties } from 'react';
import type { TradeshowEvent } from '../../types.ts';
import { formatEventDateRange, isPastEvent } from '../../utils/dates.ts';
import { REGION_COLORS } from '../../utils/regions.ts';

interface EventListItemProps {
  event: TradeshowEvent;
  isSelected: boolean;
  showRegionBadge?: boolean;
  onClick: () => void;
}

function formatLocation(event: TradeshowEvent): string {
  const parts = [event.city];
  if (event.stateProvince) parts.push(event.stateProvince);
  parts.push(event.country);
  return parts.join(', ');
}

export function EventListItem({ event, isSelected, showRegionBadge = false, onClick }: EventListItemProps) {
  const past = isPastEvent(event.endDate);
  const classes = [
    'event-list-item',
    isSelected ? 'selected' : '',
    past ? 'past' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} onClick={onClick}>
      <div className="event-list-item__row">
        <div className="event-list-item__left">
          <div className="event-list-item__name">{event.name}</div>
          <div className="event-list-item__date">
            {formatEventDateRange(event.startDate, event.endDate)}
          </div>
          <div className="event-list-item__location">
            {formatLocation(event)}
          </div>
        </div>
        <div className="event-list-item__right">
          {showRegionBadge && (
            <span
              className="event-list-item__badge event-list-item__badge--region"
              style={{ '--region-color': REGION_COLORS[event.region] } as CSSProperties}
            >
              {event.region}
            </span>
          )}
          <span className={`event-list-item__badge event-list-item__badge--${event.attendanceType.toLowerCase()}`}>
            {event.attendanceType}
          </span>
        </div>
      </div>
    </div>
  );
}
