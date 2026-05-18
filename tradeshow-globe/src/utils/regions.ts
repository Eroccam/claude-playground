import type { Region } from '../types.ts';

/**
 * Detect a default region based on the user's timezone.
 */
export function detectRegionFromTimezone(): Region {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz.startsWith('America') || tz.startsWith('US') || tz.startsWith('Pacific/Honolulu')) {
      return 'US';
    }
    if (
      tz.startsWith('Europe') ||
      tz.startsWith('Africa') ||
      tz.startsWith('Atlantic') ||
      tz.startsWith('Asia/Istanbul') ||
      tz.startsWith('Asia/Dubai') ||
      tz.startsWith('Asia/Riyadh') ||
      tz.startsWith('Asia/Jerusalem')
    ) {
      return 'EMEA';
    }
    if (
      tz.startsWith('Asia') ||
      tz.startsWith('Australia') ||
      tz.startsWith('Pacific') ||
      tz.startsWith('Indian')
    ) {
      return 'APAC';
    }
  } catch {
    // Intl not available
  }
  return 'US';
}

/** Bright colors for selected region */
export const REGION_COLORS: Record<Region, string> = {
  US: '#e63946',
  EMEA: '#9b5de5',
  APAC: '#06d6a0',
};

/** Bright perimeter colors for the selected region coastline */
export const REGION_COASTLINE_COLORS: Record<Region, string> = {
  US: '#ff6f7f',
  EMEA: '#f0b3ff',
  APAC: '#9affea',
};

/** Base colors: always visible, but intentionally understated */
export const REGION_BASE_COLORS: Record<Region, string> = {
  US: '#722230',
  EMEA: '#39215c',
  APAC: '#0b2a22',
};
