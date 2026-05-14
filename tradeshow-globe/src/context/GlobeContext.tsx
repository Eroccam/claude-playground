import { useState, useMemo, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { TradeshowEvent, Region } from '../types.ts';
import { fetchMasterEvents } from '../api/masterEvents.ts';
import { GlobeContext } from './globeContext.ts';
import type { GlobeContextValue } from './globeContext.ts';
import { detectRegionFromTimezone } from '../utils/regions.ts';
import devEvents from '../data/devEvents.ts';

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
    if (!active) setSearchQuery('');
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
      filteredEvents: isSearchMode ? searchResults : filteredEvents,
      isSearchMode,
      searchQuery,
      searchResults,
      openCardIds,
      setSelectedRegion,
      setSelectedEventId: (id) => (id ? selectEvent(id) : clearSelectedEvent()),
      selectEventFromPin,
      closeCard,
      setSearchMode,
      setSearchQuery,
    }),
    [events, isLoading, error, selectedRegion, selectedEventId, selectedEvent, selectionNonce, isSearchMode, searchQuery, searchResults, filteredEvents, openCardIds, setSelectedRegion, selectEvent, clearSelectedEvent, selectEventFromPin, closeCard, setSearchMode],
  );

  return <GlobeContext value={value}>{children}</GlobeContext>;
}
