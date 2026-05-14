import { useEffect, useRef, useState } from 'react';
import { useGlobe } from '../../context/globeContext.ts';
import type { TradeshowEvent } from '../../types.ts';
import { formatEventDateRange } from '../../utils/dates.ts';
import type { SelectedPinScreenEventDetail } from '../Globe/SelectedPinTracker.tsx';
import './ShowInfoWindow.css';

type WindowPhase = 'closed' | 'closing' | 'opening' | 'open';

interface PinPoint {
  x: number;
  y: number;
  visible: boolean;
}

const CLOSE_MS = 180;
const OPEN_MS = 260;
const CAMERA_SETTLE_MS = 760;

function EventContent({ event }: { event: TradeshowEvent }) {
  const location = [event.city, event.stateProvince, event.country]
    .filter(Boolean)
    .join(', ');

  return (
    <>
      <div className="show-info-window__title">{event.name}</div>
      <div className="show-info-window__dates">
        {formatEventDateRange(event.startDate, event.endDate)}
      </div>
      <div className="show-info-window__location">{location}</div>

      {event.imageUrl && (
        <img
          className="show-info-window__image"
          src={event.imageUrl}
          alt={event.name}
        />
      )}

      <div className="show-info-window__description">{event.description}</div>

      {event.eventUrl && (
        <a
          className="show-info-window__link"
          href={event.eventUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Visit Event Website
        </a>
      )}
    </>
  );
}

export function ShowInfoWindow() {
  const { selectedEvent, selectionNonce } = useGlobe();
  const windowRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<number[]>([]);
  const displayEventRef = useRef<TradeshowEvent | null>(null);
  const [displayEvent, setDisplayEvent] = useState<TradeshowEvent | null>(null);
  const [phase, setPhase] = useState<WindowPhase>('closed');
  const [tailReady, setTailReady] = useState(false);
  const [pinPoint, setPinPoint] = useState<PinPoint>({ x: 0, y: 0, visible: false });
  const [tailStart, setTailStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const onPinScreen = (event: Event) => {
      const detail = (event as CustomEvent<SelectedPinScreenEventDetail>).detail;
      setPinPoint(detail);
    };

    window.addEventListener('selected-pin-screen', onPinScreen);
    return () => window.removeEventListener('selected-pin-screen', onPinScreen);
  }, []);

  useEffect(() => {
    displayEventRef.current = displayEvent;
  }, [displayEvent]);

  useEffect(() => {
    const updateTailStart = () => {
      if (!windowRef.current) return;
      const rect = windowRef.current.getBoundingClientRect();
      setTailStart({
        x: rect.right - 2,
        y: rect.top + rect.height * 0.5,
      });
    };

    updateTailStart();
    window.addEventListener('resize', updateTailStart);
    return () => window.removeEventListener('resize', updateTailStart);
  }, [displayEvent, phase]);

  useEffect(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];

    const hasDisplayEvent = Boolean(displayEventRef.current);

    if (!selectedEvent) {
      timers.current.push(window.setTimeout(() => {
        setTailReady(false);
        setPhase(hasDisplayEvent ? 'closing' : 'closed');
      }, 0));
      timers.current.push(window.setTimeout(() => {
        setDisplayEvent(null);
        setPhase('closed');
      }, CLOSE_MS));
      return;
    }

    timers.current.push(window.setTimeout(() => {
      setTailReady(false);
      setPhase(hasDisplayEvent ? 'closing' : 'closed');
    }, 0));

    timers.current.push(window.setTimeout(() => {
      setDisplayEvent(selectedEvent);
      setPhase('opening');
    }, hasDisplayEvent ? CLOSE_MS : 0));

    timers.current.push(window.setTimeout(() => {
      setPhase('open');
    }, (hasDisplayEvent ? CLOSE_MS : 0) + OPEN_MS));

    timers.current.push(window.setTimeout(() => {
      setTailReady(true);
    }, (hasDisplayEvent ? CLOSE_MS : 0) + CAMERA_SETTLE_MS));

    return () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current = [];
    };
  }, [selectedEvent, selectionNonce]);

  const close = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    setTailReady(false);
    setPhase('closing');
    timers.current.push(window.setTimeout(() => {
      setDisplayEvent(null);
      setPhase('closed');
    }, CLOSE_MS));
  };

  if (!displayEvent && phase === 'closed') return null;

  const tailVisible = Boolean(displayEvent) && phase === 'open' && tailReady && pinPoint.visible;
  const tailEnd = tailVisible ? pinPoint : tailStart;
  const minX = Math.min(tailStart.x, tailEnd.x);
  const minY = Math.min(tailStart.y, tailEnd.y);
  const width = Math.max(Math.abs(tailEnd.x - tailStart.x), 1);
  const height = Math.max(Math.abs(tailEnd.y - tailStart.y), 1);
  const x1 = tailStart.x - minX;
  const y1 = tailStart.y - minY;
  const x2 = tailEnd.x - minX;
  const y2 = tailEnd.y - minY;

  return (
    <>
      <div
        ref={windowRef}
        className={`show-info-window show-info-window--${phase}`}
        aria-hidden={phase === 'closing'}
      >
        <div className="show-info-window__header">
          <div className="show-info-window__eyebrow">Show Information</div>
          <button
            className="show-info-window__close"
            type="button"
            onClick={close}
            aria-label="Close show information"
          >
            &times;
          </button>
        </div>
        {displayEvent && <EventContent event={displayEvent} />}
      </div>

      <svg
        className={`show-info-tail ${tailVisible ? 'show-info-tail--visible' : ''}`}
        style={{
          left: minX,
          top: minY,
          width,
          height,
        }}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
      >
        <line x1={x1} y1={y1} x2={x2} y2={y2} />
      </svg>
    </>
  );
}
