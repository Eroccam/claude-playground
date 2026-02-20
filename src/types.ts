export type Region = 'US' | 'EMEA' | 'APAC';

export type AttendanceType = 'Exhibition' | 'Walking';

export interface TradeshowEvent {
  id: string;
  name: string;
  region: Region;
  city: string;
  stateProvince: string;
  country: string;
  lat: number;
  lng: number;
  startDate: string;
  endDate: string;
  description: string;
  attendanceType: AttendanceType;
  imageUrl?: string;
  eventUrl?: string;
}
