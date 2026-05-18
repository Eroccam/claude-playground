import { createContext, useContext } from 'react';
import type { TradeshowEvent, Region } from '../types.ts';

export interface GlobeContextValue {
  events: TradeshowEvent[];
  isLoading: boolean;
  error: string | null;
  selectedRegion: Region;
  selectedEventId: string | null;
  selectedEvent: TradeshowEvent | null;
  selectionNonce: number;
  filteredEvents: TradeshowEvent[];
  isSearchMode: boolean;
  isCalendarMode: boolean;
  searchQuery: string;
  searchResults: TradeshowEvent[];
  calendarMonth: number;
  calendarDay: string | null;
  calendarResults: TradeshowEvent[];
  highlightedEvents: TradeshowEvent[];
  openCardIds: string[];
  setSelectedRegion: (region: Region) => void;
  setSelectedEventId: (id: string | null) => void;
  selectEventFromPin: (eventId: string, eventRegion: Region) => void;
  closeCard: (eventId: string) => void;
  setSearchMode: (active: boolean) => void;
  setSearchQuery: (query: string) => void;
  setCalendarMode: (active: boolean) => void;
  setCalendarMonth: (month: number) => void;
  setCalendarDay: (day: string | null) => void;
}

export const GlobeContext = createContext<GlobeContextValue | null>(null);

export function useGlobe(): GlobeContextValue {
  const ctx = useContext(GlobeContext);
  if (!ctx) throw new Error('useGlobe must be used within GlobeProvider');
  return ctx;
}
