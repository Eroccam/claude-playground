import { useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { useGlobe } from '../../context/globeContext.ts';
import { REGION_COLORS } from '../../utils/regions.ts';
import type { Region, TradeshowEvent } from '../../types.ts';
import { EventList } from '../Panel/EventList.tsx';
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
const REGION_KEY_ORDER: Region[] = ['US', 'EMEA', 'APAC'];
const CALENDAR_RESULTS_GAP = 16;
const DAY_CELL_DEFAULT_HEIGHT = 42;
const DAY_NUMBER_CLEARANCE = 20;
const INDICATOR_SLOT_HEIGHT = 6;
const INDICATOR_GAP = 0;
const INDICATOR_EDGE_PADDING = 6;
const DAYS_PER_WEEK = 7;

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

function eventSortKey(event: TradeshowEvent): string {
  return `${event.startDate}|${event.endDate || event.startDate}|${event.name}`;
}

function minimumCellHeight(indicatorCount: number): number {
  if (indicatorCount <= 1) return DAY_CELL_DEFAULT_HEIGHT;
  return Math.max(
    DAY_CELL_DEFAULT_HEIGHT,
    DAY_NUMBER_CLEARANCE
      + INDICATOR_EDGE_PADDING
      + indicatorCount * INDICATOR_SLOT_HEIGHT
      + (indicatorCount - 1) * INDICATOR_GAP,
  );
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
    const gridEnd = addDays(monthEnd, 6 - monthEnd.getDay());
    const dayCount = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86400000) + 1;
    return Array.from({ length: dayCount }, (_, index) => addDays(gridStart, index));
  }, [monthEnd, monthStart]);

  const rowLayouts = useMemo(() => {
    const weekCount = Math.ceil(cells.length / DAYS_PER_WEEK);
    return Array.from({ length: weekCount }, (_, rowIndex) => {
      const rowCells = cells.slice(rowIndex * DAYS_PER_WEEK, rowIndex * DAYS_PER_WEEK + DAYS_PER_WEEK);
      const rowStart = rowCells[0];
      const rowEnd = rowCells[rowCells.length - 1];
      const rowEvents = monthEvents
        .filter((event) => {
          const start = parseEventDate(event.startDate);
          const end = parseEventDate(event.endDate || event.startDate);
          if (!start || !end) return false;
          return start <= rowEnd && end >= rowStart && rowCells.some((day) => (
            day.getMonth() === calendarMonth && eventSpansDay(event, day)
          ));
        })
        .sort((a, b) => eventSortKey(a).localeCompare(eventSortKey(b)));
      const slots = new Map<string, number>();
      const usedSlots = new Set<number>();

      for (const event of rowEvents) {
        let slot = 0;
        while (usedSlots.has(slot)) slot += 1;
        slots.set(event.id, slot);
        usedSlots.add(slot);
      }

      const slotCount = usedSlots.size > 0 ? Math.max(...usedSlots) + 1 : 0;
      return {
        height: minimumCellHeight(slotCount),
        slots,
      };
    });
  }, [calendarMonth, cells, monthEvents]);

  return (
    <div className="calendar-panel-shell">
      <div className="calendar-region-key" aria-label="Region color key">
        {REGION_KEY_ORDER.map((region) => (
          <div key={region} className="calendar-region-key__item">
            <span
              className="calendar-region-key__dot"
              style={{ '--region-key-color': REGION_COLORS[region] } as CSSProperties}
              aria-hidden="true"
            />
            <span>{region}</span>
          </div>
        ))}
      </div>
      <div className="calendar-panel" aria-label={`${MONTH_NAMES[calendarMonth]} calendar`}>
        <div className="calendar-panel__weekdays">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label}>{label}</div>
          ))}
        </div>
        <div className="calendar-panel__grid">
          {cells.map((day, index) => {
            const rowLayout = rowLayouts[Math.floor(index / DAYS_PER_WEEK)];
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
                style={{ minHeight: rowLayout.height } as CSSProperties}
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
                <span className="calendar-day__indicators" aria-hidden="true">
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
                          '--indicator-slot': rowLayout.slots.get(event.id) ?? 0,
                        } as CSSProperties}
                      />
                    );
                  })}
                  {singleDayEvents.map((event) => (
                    <span
                      key={`${event.id}-${key}`}
                      className="calendar-day__dot"
                      style={{
                        '--event-color': REGION_COLORS[event.region],
                        '--indicator-slot': rowLayout.slots.get(event.id) ?? 0,
                      } as CSSProperties}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function SearchModeControls({ onExpandPanel, onCollapsePanel }: SearchModeControlsProps) {
  const shellRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || !isCalendarMode) {
      document.documentElement.style.removeProperty('--calendar-results-top');
      return;
    }

    const updateResultsTop = () => {
      const rect = shell.getBoundingClientRect();
      document.documentElement.style.setProperty(
        '--calendar-results-top',
        `${Math.ceil(rect.bottom + CALENDAR_RESULTS_GAP)}px`,
      );
    };

    updateResultsTop();
    const observer = new ResizeObserver(updateResultsTop);
    observer.observe(shell);
    window.addEventListener('resize', updateResultsTop);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateResultsTop);
      document.documentElement.style.removeProperty('--calendar-results-top');
    };
  }, [isCalendarMode, calendarMonth]);

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
    <div className="search-mode-shell" ref={shellRef}>
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
      <div className={`mobile-search-shell ${isSearchMode ? 'mobile-search-shell--open' : ''}`}>
        {isSearchMode ? (
          <div className="mobile-search-bar">
            <input
              className="mobile-search-bar__input"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shows by title or location"
              aria-label="Search shows"
              autoFocus
            />
            <button
              className="mobile-search-button active"
              type="button"
              onClick={handleSearchIconClick}
              aria-label="Exit search mode"
              aria-pressed={isSearchMode}
            >
              <SearchIcon />
            </button>
          </div>
        ) : (
          <button
            className="mobile-search-button"
            type="button"
            onClick={handleSearchIconClick}
            aria-label="Enter search mode"
            aria-pressed={isSearchMode}
          >
            <SearchIcon />
          </button>
        )}
        {isSearchMode && (
          <div className="mobile-search-results">
            <EventList />
          </div>
        )}
      </div>
    </div>
  );
}
