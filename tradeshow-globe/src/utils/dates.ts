import { format, isBefore, parseISO, isSameDay } from 'date-fns';

/**
 * Format an event date range in EST.
 * "23–26 March 2026" (multi-day) or "23 March 2026" (single-day)
 */
export function formatEventDateRange(startDate: string, endDate: string): string {
  const start = parseISO(startDate);
  const end = parseISO(endDate);

  if (isSameDay(start, end)) {
    return format(start, 'd MMMM yyyy');
  }

  const startMonth = format(start, 'MMMM');
  const endMonth = format(end, 'MMMM');
  const startDay = format(start, 'd');
  const endDay = format(end, 'd');
  const year = format(end, 'yyyy');

  if (startMonth === endMonth) {
    return `${startDay}–${endDay} ${startMonth} ${year}`;
  }

  return `${startDay} ${startMonth} – ${endDay} ${endMonth} ${year}`;
}

/**
 * Check whether an event's endDate is in the past.
 */
export function isPastEvent(endDate: string): boolean {
  return isBefore(parseISO(endDate), new Date());
}
