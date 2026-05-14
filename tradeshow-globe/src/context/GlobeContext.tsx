import { useState, useMemo, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { TradeshowEvent, Region } from '../types.ts';
import { fetchMasterEvents } from '../api/masterEvents.ts';
import { GlobeContext } from './globeContext.ts';
import type { GlobeContextValue } from './globeContext.ts';
import { detectRegionFromTimezone } from '../utils/regions.ts';

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

  useEffect(() => {
    const controller = new AbortController();

    fetchMasterEvents(controller.signal)
      .then((masterEvents) => {
        setEvents(masterEvents.filter(isValidEvent));
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Unable to load master events');
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

  const selectEvent = useCallback((eventId: string | null) => {
    setSelectedEventId(eventId);
    if (eventId) setSelectionNonce((value) => value + 1);
  }, []);

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
      filteredEvents,
      setSelectedRegion,
      setSelectedEventId: (id) => (id ? selectEvent(id) : clearSelectedEvent()),
      selectEventFromPin,
    }),
    [events, isLoading, error, selectedRegion, selectedEventId, selectedEvent, selectionNonce, filteredEvents, setSelectedRegion, selectEvent, clearSelectedEvent, selectEventFromPin],
  );

  return <GlobeContext value={value}>{children}</GlobeContext>;
}
