import { createContext, useContext } from 'react';
import type { TradeshowEvent, Region } from '../types.ts';

export interface GlobeContextValue {
  events: TradeshowEvent[];
  isLoading: boolean;
  error: string | null;
  selectedRegion: Region;
  selectedEventId: string | null;
  selectedEvent: TradeshowEvent | null;
  filteredEvents: TradeshowEvent[];
  setSelectedRegion: (region: Region) => void;
  setSelectedEventId: (id: string | null) => void;
  selectEventFromPin: (eventId: string, eventRegion: Region) => void;
}

export const GlobeContext = createContext<GlobeContextValue | null>(null);

export function useGlobe(): GlobeContextValue {
  const ctx = useContext(GlobeContext);
  if (!ctx) throw new Error('useGlobe must be used within GlobeProvider');
  return ctx;
}
