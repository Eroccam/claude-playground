import { useState, useMemo, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { TradeshowEvent, Region } from '../types.ts';
import { fetchMasterEvents } from '../api/masterEvents.ts';
import { GlobeContext } from './globeContext.ts';
import type { GlobeContextValue } from './globeContext.ts';
import { detectRegionFromTimezone } from '../utils/regions.ts';
import devEvents from '../data/devEvents.ts';

const MONTH_COUNT = 12;
const CURRENT_MONTH = new Date().getMonth();

function isValidEvent(e: TradeshowEvent): boolean {
  return (
    typeof e.lat === 'number' &&
    typeof e.lng === 'number' &&
    isFinite(e.lat) &&
    isFinite(e.lng)
  );
}

export function GlobeProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<TradeshowEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegionRaw] = useState<Region>(detectRegionFromTimezone);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectionNonce, setSelectionNonce] = useState(0);
  const [openCardIds, setOpenCardIds] = useState<string[]>([]);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCalendarMode, setIsCalendarMode] = useState(false);
  const [calendarMonth, setCalendarMonthRaw] = useState(CURRENT_MONTH);
  const [calendarDay, setCalendarDay] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetchMasterEvents(controller.signal)
      .then((masterEvents) => {
        const allEvents = import.meta.env.DEV
          ? [...masterEvents, ...devEvents]
          : masterEvents;
        setEvents(allEvents.filter(isValidEvent));
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (import.meta.env.DEV) {
          setEvents(devEvents.filter(isValidEvent));
        } else {
          setError(err instanceof Error ? err.message : 'Unable to load master events');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, []);

  const setSelectedRegion = useCallback((region: Region) => {
    setSelectedRegionRaw(region);
    setSelectedEventId(null);
  }, []);

  const setSearchMode = useCallback((active: boolean) => {
    setIsSearchMode(active);
    if (active) {
      setIsCalendarMode(false);
      setCalendarDay(null);
    }
    if (!active) setSearchQuery('');
  }, []);

  const setCalendarMode = useCallback((active: boolean) => {
    setIsCalendarMode(active);
    setSelectedEventId(null);
    if (active) {
      setIsSearchMode(false);
      setSearchQuery('');
    } else {
      setCalendarDay(null);
      setOpenCardIds([]);
    }
  }, []);

  const setCalendarMonth = useCallback((month: number) => {
    const nextMonth = ((month % MONTH_COUNT) + MONTH_COUNT) % MONTH_COUNT;
    setCalendarMonthRaw(nextMonth);
    setCalendarDay(null);
  }, []);

  const closeCard = useCallback((eventId: string) => {
    setOpenCardIds((prev) => prev.filter((id) => id !== eventId));
  }, []);

  const selectEvent = useCallback((eventId: string | null) => {
    setSelectedEventId(eventId);
    const event = events.find((item) => item.id === eventId);
    if (event) setSelectedRegionRaw(event.region);
    if (eventId) {
      setSelectionNonce((value) => value + 1);
      setOpenCardIds((prev) => {
        if (prev.includes(eventId)) return prev;
        const trimmed = prev.length >= 3 ? prev.slice(1) : prev;
        return [...trimmed, eventId];
      });
    }
  }, [events]);

  const clearSelectedEvent = useCallback(() => {
    setSelectedEventId(null);
  }, []);

  const selectEventFromPin = useCallback((eventId: string, eventRegion: Region) => {
    // Switch region without clearing selection — batched by React
    setSelectedRegionRaw(eventRegion);
    selectEvent(eventId);
  }, [selectEvent]);

  const filteredEvents = useMemo(
    () =>
      events
        .filter((e) => e.region === selectedRegion)
        .sort((a, b) => {
          const dateCompare = (a.startDate || '9999-12-31').localeCompare(b.startDate || '9999-12-31');
          if (dateCompare !== 0) return dateCompare;
          return a.name.localeCompare(b.name);
        }),
    [events, selectedRegion],
  );

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matches = query
      ? events.filter((event) => {
          const location = [event.city, event.stateProvince, event.country]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return event.name.toLowerCase().includes(query) || location.includes(query);
        })
      : events;

    return [...matches].sort((a, b) => {
      const dateCompare = (a.startDate || '9999-12-31').localeCompare(b.startDate || '9999-12-31');
      if (dateCompare !== 0) return dateCompare;
      return a.name.localeCompare(b.name);
    });
  }, [events, searchQuery]);

  const calendarMonthResults = useMemo(() => {
    const monthStart = new Date(2026, calendarMonth, 1);
    const monthEnd = new Date(2026, calendarMonth + 1, 0);

    return events
      .filter((event) => {
        const start = new Date(`${event.startDate}T00:00:00`);
        const end = new Date(`${(event.endDate || event.startDate)}T00:00:00`);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
        return start <= monthEnd && end >= monthStart;
      })
      .sort((a, b) => {
        const dateCompare = (a.startDate || '9999-12-31').localeCompare(b.startDate || '9999-12-31');
        if (dateCompare !== 0) return dateCompare;
        return a.name.localeCompare(b.name);
      });
  }, [events, calendarMonth]);

  const calendarResults = useMemo(() => {
    if (!calendarDay) return calendarMonthResults;
    const selectedDay = new Date(`${calendarDay}T00:00:00`);
    return calendarMonthResults.filter((event) => {
      const start = new Date(`${event.startDate}T00:00:00`);
      const end = new Date(`${(event.endDate || event.startDate)}T00:00:00`);
      return start <= selectedDay && end >= selectedDay;
    });
  }, [calendarDay, calendarMonthResults]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const value = useMemo<GlobeContextValue>(
    () => ({
      events,
      isLoading,
      error,
      selectedRegion,
      selectedEventId,
      selectedEvent,
      selectionNonce,
      filteredEvents: isCalendarMode ? calendarResults : isSearchMode ? searchResults : filteredEvents,
      isSearchMode,
      isCalendarMode,
      searchQuery,
      searchResults,
      calendarMonth,
      calendarDay,
      calendarResults,
      highlightedEvents: isCalendarMode ? calendarMonthResults : searchResults,
      openCardIds,
      setSelectedRegion,
      setSelectedEventId: (id) => (id ? selectEvent(id) : clearSelectedEvent()),
      selectEventFromPin,
      closeCard,
      setSearchMode,
      setSearchQuery,
      setCalendarMode,
      setCalendarMonth,
      setCalendarDay,
    }),
    [events, isLoading, error, selectedRegion, selectedEventId, selectedEvent, selectionNonce, isSearchMode, isCalendarMode, searchQuery, searchResults, calendarMonth, calendarDay, calendarResults, calendarMonthResults, filteredEvents, openCardIds, setSelectedRegion, selectEvent, clearSelectedEvent, selectEventFromPin, closeCard, setSearchMode, setCalendarMode, setCalendarMonth],
  );

  return <GlobeContext value={value}>{children}</GlobeContext>;
}
