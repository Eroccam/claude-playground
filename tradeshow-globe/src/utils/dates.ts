import { format, isBefore, parseISO, isSameDay } from 'date-fns';

function parseValidDate(date: string): Date | null {
  if (!date) return null;
  const parsed = parseISO(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Format an event date range in EST.
 * "23–26 March 2026" (multi-day) or "23 March 2026" (single-day)
 */
export function formatEventDateRange(startDate: string, endDate: string): string {
  const start = parseValidDate(startDate);
  const end = parseValidDate(endDate) ?? start;

  if (!start || !end) return 'Date TBC';

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
  const end = parseValidDate(endDate);
  return end ? isBefore(end, new Date()) : false;
}
