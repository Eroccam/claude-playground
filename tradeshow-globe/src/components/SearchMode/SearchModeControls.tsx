import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useGlobe } from '../../context/globeContext.ts';
import { REGION_COLORS } from '../../utils/regions.ts';
import type { TradeshowEvent } from '../../types.ts';
import './SearchModeControls.css';

interface SearchModeControlsProps {
  onExpandPanel?: () => void;
  onCollapsePanel?: () => void;
}

const CALENDAR_YEAR = 2026;
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="6" width="14" height="14" rx="2" />
      <path d="M8 4v4M16 4v4M5 10h14" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseEventDate(value: string): Date | null {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function eventSpansDay(event: TradeshowEvent, day: Date): boolean {
  const start = parseEventDate(event.startDate);
  const end = parseEventDate(event.endDate || event.startDate);
  if (!start || !end) return false;
  return start <= day && end >= day;
}

interface CalendarGridProps {
  onExpandPanel?: () => void;
}

function CalendarGrid({ onExpandPanel }: CalendarGridProps) {
  const {
    events,
    calendarMonth,
    calendarDay,
    setCalendarDay,
  } = useGlobe();

  const monthStart = useMemo(() => new Date(CALENDAR_YEAR, calendarMonth, 1), [calendarMonth]);
  const monthEnd = useMemo(() => new Date(CALENDAR_YEAR, calendarMonth + 1, 0), [calendarMonth]);

  const monthEvents = useMemo(
    () => events.filter((event) => {
      const start = parseEventDate(event.startDate);
      const end = parseEventDate(event.endDate || event.startDate);
      if (!start || !end) return false;
      return start <= monthEnd && end >= monthStart;
    }),
    [events, monthEnd, monthStart],
  );

  const cells = useMemo(() => {
    const gridStart = addDays(monthStart, -monthStart.getDay());
    return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  }, [monthStart]);

  const multiDayEvents = useMemo(
    () => monthEvents.filter((event) => event.startDate !== (event.endDate || event.startDate)),
    [monthEvents],
  );
  const lineRows = useMemo(() => new Map(multiDayEvents.map((event, index) => [event.id, index % 4])), [multiDayEvents]);

  return (
    <div className="calendar-panel" aria-label={`${MONTH_NAMES[calendarMonth]} calendar`}>
      <div className="calendar-panel__weekdays">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>
      <div className="calendar-panel__grid">
        {cells.map((day) => {
          const key = dateKey(day);
          const inMonth = day.getMonth() === calendarMonth;
          const isSelected = calendarDay === key;
          const dayEvents = monthEvents.filter((event) => inMonth && eventSpansDay(event, day));
          const rangeEvents = dayEvents.filter((event) => event.startDate !== (event.endDate || event.startDate));
          const singleDayEvents = dayEvents.filter((event) => event.startDate === (event.endDate || event.startDate));

          return (
            <button
              key={key}
              className={`calendar-day ${inMonth ? '' : 'calendar-day--muted'} ${isSelected ? 'calendar-day--selected' : ''}`}
              type="button"
              onClick={() => {
                if (!inMonth) return;
                setCalendarDay(isSelected ? null : key);
                onExpandPanel?.();
              }}
              tabIndex={inMonth ? 0 : -1}
              aria-pressed={isSelected}
              aria-label={`${MONTH_NAMES[day.getMonth()]} ${day.getDate()}`}
            >
              <span className="calendar-day__number">{day.getDate()}</span>
              <span className="calendar-day__lines" aria-hidden="true">
                {rangeEvents.map((event) => {
                  const start = parseEventDate(event.startDate);
                  const end = parseEventDate(event.endDate || event.startDate);
                  const startsHere = start ? dateKey(start) === key : false;
                  const endsHere = end ? dateKey(end) === key : false;
                  return (
                    <span
                      key={event.id}
                      className={`calendar-day__line ${startsHere ? 'calendar-day__line--start' : ''} ${endsHere ? 'calendar-day__line--end' : ''}`}
                      style={{
                        '--event-color': REGION_COLORS[event.region],
                        '--line-row': lineRows.get(event.id) ?? 0,
                      } as CSSProperties}
                    />
                  );
                })}
              </span>
              <span className="calendar-day__dots" aria-hidden="true">
                {singleDayEvents.slice(0, 5).map((event) => (
                  <span
                    key={`${event.id}-${key}`}
                    className="calendar-day__dot"
                    style={{ '--event-color': REGION_COLORS[event.region] } as CSSProperties}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SearchModeControls({ onExpandPanel, onCollapsePanel }: SearchModeControlsProps) {
  const {
    isSearchMode,
    isCalendarMode,
    searchQuery,
    calendarMonth,
    setSearchMode,
    setSearchQuery,
    setCalendarMode,
    setCalendarMonth,
    setCalendarDay,
    setSelectedEventId,
  } = useGlobe();

  const handleSearchIconClick = () => {
    const nextActive = !isSearchMode;
    setSearchMode(nextActive);
    if (nextActive) {
      onExpandPanel?.();
    } else {
      setSelectedEventId(null);
      onCollapsePanel?.();
    }
  };

  const handleCalendarIconClick = () => {
    const nextActive = !isCalendarMode;
    setCalendarMode(nextActive);
    if (nextActive) {
      onExpandPanel?.();
    } else {
      onCollapsePanel?.();
    }
  };

  return (
    <div className="search-mode-shell">
      <div
        className={`search-mode-pill ${isSearchMode ? 'search-mode-pill--expanded' : ''} ${isCalendarMode ? 'search-mode-pill--calendar' : ''}`}
        aria-label="Search and calendar controls"
      >
        <button
          className={`search-mode-pill__icon-btn ${isSearchMode ? 'active' : ''}`}
          type="button"
          onClick={handleSearchIconClick}
          aria-label={isSearchMode ? 'Exit search mode' : 'Enter search mode'}
          aria-pressed={isSearchMode}
        >
          <SearchIcon />
        </button>
        {isCalendarMode ? (
          <div className="search-mode-pill__month" aria-label="Selected month">
            <button
              className="search-mode-pill__month-btn"
              type="button"
              onClick={() => setCalendarMonth(calendarMonth - 1)}
              aria-label="Previous month"
            >
              <ChevronLeftIcon />
            </button>
            <button
              className="search-mode-pill__month-label"
              type="button"
              onClick={() => setCalendarDay(null)}
              aria-label="Clear day selection"
            >
              {MONTH_NAMES[calendarMonth]}
            </button>
            <button
              className="search-mode-pill__month-btn"
              type="button"
              onClick={() => setCalendarMonth(calendarMonth + 1)}
              aria-label="Next month"
            >
              <ChevronRightIcon />
            </button>
          </div>
        ) : (
          <input
            className="search-mode-pill__input"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClick={() => onExpandPanel?.()}
            placeholder="Search shows by title or location"
            aria-label="Search shows"
            tabIndex={isSearchMode ? 0 : -1}
          />
        )}
        <button
          className={`search-mode-pill__icon-btn ${isCalendarMode ? 'active' : ''}`}
          type="button"
          onClick={handleCalendarIconClick}
          aria-label={isCalendarMode ? 'Exit calendar mode' : 'Enter calendar mode'}
          aria-pressed={isCalendarMode}
        >
          <CalendarIcon />
        </button>
      </div>
      {isCalendarMode && <CalendarGrid onExpandPanel={onExpandPanel} />}
    </div>
  );
}
