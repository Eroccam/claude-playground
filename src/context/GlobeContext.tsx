import { createContext, useContext, useState, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { TradeshowEvent, Region } from '../types.ts';
import eventsData from '../data/events.json';
import { detectRegionFromTimezone } from '../utils/regions.ts';

interface GlobeContextValue {
  events: TradeshowEvent[];
  selectedRegion: Region;
  selectedEventId: string | null;
  selectedEvent: TradeshowEvent | null;
  filteredEvents: TradeshowEvent[];
  setSelectedRegion: (region: Region) => void;
  setSelectedEventId: (id: string | null) => void;
  /** Pin click: switches region if needed, then selects event (no race condition). */
  selectEventFromPin: (eventId: string, eventRegion: Region) => void;
}

const GlobeContext = createContext<GlobeContextValue | null>(null);

function isValidEvent(e: TradeshowEvent): boolean {
  return (
    typeof e.lat === 'number' &&
    typeof e.lng === 'number' &&
    isFinite(e.lat) &&
    isFinite(e.lng)
  );
}

const allEvents = (eventsData as TradeshowEvent[]).filter(isValidEvent);

export function GlobeProvider({ children }: { children: ReactNode }) {
  const [selectedRegion, setSelectedRegionRaw] = useState<Region>(detectRegionFromTimezone);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const setSelectedRegion = useCallback((region: Region) => {
    setSelectedRegionRaw(region);
    setSelectedEventId(null);
  }, []);

  const selectEventFromPin = useCallback((eventId: string, eventRegion: Region) => {
    // Switch region without clearing selection — batched by React
    setSelectedRegionRaw(eventRegion);
    setSelectedEventId(eventId);
  }, []);

  const filteredEvents = useMemo(
    () =>
      allEvents
        .filter((e) => e.region === selectedRegion)
        .sort((a, b) => {
          const dateCompare = a.startDate.localeCompare(b.startDate);
          if (dateCompare !== 0) return dateCompare;
          return a.name.localeCompare(b.name);
        }),
    [selectedRegion],
  );

  const selectedEvent = useMemo(
    () => allEvents.find((e) => e.id === selectedEventId) ?? null,
    [selectedEventId],
  );

  const value = useMemo<GlobeContextValue>(
    () => ({
      events: allEvents,
      selectedRegion,
      selectedEventId,
      selectedEvent,
      filteredEvents,
      setSelectedRegion,
      setSelectedEventId,
      selectEventFromPin,
    }),
    [selectedRegion, selectedEventId, selectedEvent, filteredEvents, setSelectedRegion, selectEventFromPin],
  );

  return <GlobeContext value={value}>{children}</GlobeContext>;
}

export function useGlobe(): GlobeContextValue {
  const ctx = useContext(GlobeContext);
  if (!ctx) throw new Error('useGlobe must be used within GlobeProvider');
  return ctx;
}
