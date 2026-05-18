import { useEffect, useRef, useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { useGlobe } from '../../context/globeContext.ts';
import type { TradeshowEvent } from '../../types.ts';
import { formatEventDateRange } from '../../utils/dates.ts';
import type { SelectedPinScreenEventDetail } from '../Globe/SelectedPinTracker.tsx';
import './ShowInfoCards.css';

// ── Constants ────────────────────────────────────────────────────────────────

const CARD_GAP = 10;
const MAX_CARDS = 3;
const OPEN_MS = 260;
const CLOSE_MS = 200;
const CAMERA_SETTLE_MS = 760;

type CardPhase = 'entering' | 'open' | 'leaving';

interface PinData {
  pinX: number;
  pinY: number;
  pinVisible: boolean;
  tailOriginX: number;
  tailOriginY: number;
}

interface DragState {
  eventId: string;
  startMouseY: number;
  startCardTop: number;
  currentMouseY: number;
}

function getFreeSlot(slots: Map<string, number>): number {
  const occupied = new Set(slots.values());
  for (let i = 0; i < MAX_CARDS; i++) {
    if (!occupied.has(i)) return i;
  }
  return 0;
}

function streamPath(pinX: number, pinY: number, cardX: number, cardY: number): string {
  return `M ${pinX} ${pinY} L ${cardX} ${cardY}`;
}

// ── Card content ─────────────────────────────────────────────────────────────

function CardBody({ event }: { event: TradeshowEvent }) {
  return (
    <>
      {event.imageUrl && (
        <img
          className="show-info-card__image"
          src={event.imageUrl}
          alt={event.name}
        />
      )}
      <div className="show-info-card__description">{event.description}</div>
      {event.eventUrl && (
        <a
          className="show-info-card__link"
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

// ── Main component ────────────────────────────────────────────────────────────

export function ShowInfoCards() {
  const { events, openCardIds, selectedEventId, selectionNonce, closeCard } = useGlobe();

  // Insertion order (for eviction tracking)
  const [cardOrder, setCardOrder] = useState<string[]>([]);
  // Visual slot index per card (0=top, 1=mid, 2=bottom) — independent of insertion order
  const [cardSlots, setCardSlots] = useState<Map<string, number>>(new Map());
  // Phase per card
  const [cardPhases, setCardPhases] = useState<Record<string, CardPhase>>({});
  // Cards whose tail is ready to show
  const [tailReadyIds, setTailReadyIds] = useState<Set<string>>(new Set());
  // Pin/tail position data per card
  const [pinData, setPinData] = useState<Map<string, PinData>>(new Map());
  // Briefly flashing card (re-selected)
  const [flashCardId, setFlashCardId] = useState<string | null>(null);
  // Drag state
  const [dragState, setDragState] = useState<DragState | null>(null);
  // Column height (measured)
  const [columnHeight, setColumnHeight] = useState(0);

  const columnRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const tailTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const phaseTimers = useRef<number[]>([]);
  const prevOpenCardIdsRef = useRef<string[]>([]);
  const openCardIdsChangedRef = useRef(false);
  const dragStateRef = useRef<DragState | null>(null);
  const cardSlotsRef = useRef<Map<string, number>>(new Map());

  // Keep refs in sync
  dragStateRef.current = dragState;
  cardSlotsRef.current = cardSlots;

  // ── Column height ───────────────────────────────────────────────────────────

  useEffect(() => {
    const el = columnRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setColumnHeight(entries[0].contentRect.height);
    });
    ro.observe(el);
    setColumnHeight(el.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, []);

  const slotHeight = columnHeight > 0
    ? Math.floor((columnHeight - (MAX_CARDS - 1) * CARD_GAP) / MAX_CARDS)
    : 240;

  // ── Tail arm/disarm ─────────────────────────────────────────────────────────

  const armTailTimer = useCallback((eventId: string) => {
    const existing = tailTimers.current.get(eventId);
    if (existing !== undefined) clearTimeout(existing);
    setTailReadyIds((prev) => {
      const next = new Set(prev);
      next.delete(eventId);
      return next;
    });
    const t = setTimeout(() => {
      setTailReadyIds((prev) => new Set([...prev, eventId]));
    }, CAMERA_SETTLE_MS);
    tailTimers.current.set(eventId, t);
  }, []);

  const clearTailTimer = useCallback((eventId: string) => {
    const t = tailTimers.current.get(eventId);
    if (t !== undefined) clearTimeout(t);
    tailTimers.current.delete(eventId);
    setTailReadyIds((prev) => {
      const next = new Set(prev);
      next.delete(eventId);
      return next;
    });
  }, []);

  // ── Card lifecycle (openCardIds changes) ────────────────────────────────────

  useEffect(() => {
    const prev = prevOpenCardIdsRef.current;
    const added = openCardIds.filter((id) => !prev.includes(id));
    const removed = prev.filter((id) => !openCardIds.includes(id));
    openCardIdsChangedRef.current = added.length > 0 || removed.length > 0;

    const isEviction = removed.length > 0 && added.length > 0;

    if (isEviction) {
      // Instant removal of evicted card, animated entry of new card
      setCardOrder((order) => [
        ...order.filter((id) => !removed.includes(id)),
        ...added,
      ]);
      setCardSlots((slots) => {
        const next = new Map(slots);
        for (const id of removed) next.delete(id);
        for (const id of added) next.set(id, getFreeSlot(next));
        return next;
      });
      setCardPhases((phases) => {
        const next = { ...phases };
        for (const id of removed) delete next[id];
        for (const id of added) next[id] = 'entering';
        return next;
      });
      for (const id of removed) clearTailTimer(id);
      const t = window.setTimeout(() => {
        setCardPhases((phases) => {
          const next = { ...phases };
          for (const id of added) {
            if (next[id] === 'entering') next[id] = 'open';
          }
          return next;
        });
      }, OPEN_MS);
      phaseTimers.current.push(t);
    } else {
      for (const id of removed) {
        setCardPhases((phases) => ({ ...phases, [id]: 'leaving' }));
        clearTailTimer(id);
        const t = window.setTimeout(() => {
          setCardOrder((order) => order.filter((cid) => cid !== id));
          setCardSlots((slots) => {
            const next = new Map(slots);
            next.delete(id);
            return next;
          });
          setCardPhases((phases) => {
            const next = { ...phases };
            delete next[id];
            return next;
          });
          setPinData((m) => {
            const next = new Map(m);
            next.delete(id);
            return next;
          });
        }, CLOSE_MS);
        phaseTimers.current.push(t);
      }
      for (const id of added) {
        setCardOrder((order) => [...order, id]);
        setCardSlots((slots) => {
          const next = new Map(slots);
          next.set(id, getFreeSlot(next));
          return next;
        });
        setCardPhases((phases) => ({ ...phases, [id]: 'entering' }));
        const t = window.setTimeout(() => {
          setCardPhases((phases) => {
            const next = { ...phases };
            if (next[id] === 'entering') next[id] = 'open';
            return next;
          });
        }, OPEN_MS);
        phaseTimers.current.push(t);
      }
    }

    prevOpenCardIdsRef.current = openCardIds;
  }, [openCardIds, clearTailTimer]);

  // ── Camera spin / tail timer / flash ────────────────────────────────────────

  useEffect(() => {
    if (!selectedEventId) return;
    if (!openCardIds.includes(selectedEventId)) return;

    // Arm tail timer for the newly targeted card
    armTailTimer(selectedEventId);

    // Flash only when re-selecting an already-open card (openCardIds didn't change)
    if (!openCardIdsChangedRef.current) {
      setFlashCardId(selectedEventId);
      const t = window.setTimeout(() => setFlashCardId(null), 700);
      return () => window.clearTimeout(t);
    }
  }, [selectionNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset the change flag after both effects in the same render have run
  useEffect(() => {
    openCardIdsChangedRef.current = false;
  });

  // ── Pin position tracking ───────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: Event) => {
      const { eventId, x, y, visible } = (e as CustomEvent<SelectedPinScreenEventDetail>).detail;
      const cardEl = cardRefs.current.get(eventId);
      let tailOriginX = 0;
      let tailOriginY = 0;
      if (cardEl) {
        const rect = cardEl.getBoundingClientRect();
        tailOriginX = rect.right - 2;
        tailOriginY = rect.top + rect.height * 0.5;
      }
      setPinData((prev) => {
        const next = new Map(prev);
        next.set(eventId, { pinX: x, pinY: y, pinVisible: visible, tailOriginX, tailOriginY });
        return next;
      });
    };
    window.addEventListener('selected-pin-screen', handler);
    return () => window.removeEventListener('selected-pin-screen', handler);
  }, []);

  // ── Drag ────────────────────────────────────────────────────────────────────

  const handleDragStart = useCallback((eventId: string, e: React.MouseEvent) => {
    e.preventDefault();
    const slotIdx = cardSlotsRef.current.get(eventId) ?? 0;
    const startCardTop = slotIdx * (slotHeight + CARD_GAP);
    const state: DragState = {
      eventId,
      startMouseY: e.clientY,
      startCardTop,
      currentMouseY: e.clientY,
    };
    setDragState(state);
    dragStateRef.current = state;
  }, [slotHeight]);

  const isDragging = dragState !== null;

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: MouseEvent) => {
      const ds = dragStateRef.current;
      if (!ds) return;

      const updated = { ...ds, currentMouseY: e.clientY };
      dragStateRef.current = updated;
      setDragState(updated);

      const rawTop = ds.startCardTop + (e.clientY - ds.startMouseY);
      const clampedTop = Math.max(0, Math.min((MAX_CARDS - 1) * (slotHeight + CARD_GAP), rawTop));
      const draggedCenter = clampedTop + slotHeight / 2;
      const targetSlot = Math.max(0, Math.min(MAX_CARDS - 1, Math.round(draggedCenter / (slotHeight + CARD_GAP))));

      setCardSlots((prev) => {
        const currentSlot = prev.get(ds.eventId) ?? 0;
        if (targetSlot === currentSlot) return prev;
        const next = new Map(prev);
        // If another card occupies the target slot, swap it to the current slot
        const swapEntry = [...prev.entries()].find(([id, slot]) => slot === targetSlot && id !== ds.eventId);
        if (swapEntry) next.set(swapEntry[0], currentSlot);
        next.set(ds.eventId, targetSlot);
        return next;
      });
    };

    const onUp = () => {
      setDragState(null);
      dragStateRef.current = null;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, slotHeight]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup on unmount ──────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      phaseTimers.current.forEach(clearTimeout);
      tailTimers.current.forEach(clearTimeout);
    };
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  const getDraggedTop = () => {
    if (!dragState) return 0;
    const raw = dragState.startCardTop + (dragState.currentMouseY - dragState.startMouseY);
    return Math.max(0, Math.min((MAX_CARDS - 1) * (slotHeight + CARD_GAP), raw));
  };

  return (
    <>
      <div ref={columnRef} className="show-info-column">
        {cardOrder.map((eventId) => {
          const event = events.find((e) => e.id === eventId);
          if (!event) return null;
          const phase = cardPhases[eventId] ?? 'open';
          const isBeingDragged = dragState?.eventId === eventId;
          const isFlashing = flashCardId === eventId;

          const slotIdx = cardSlots.get(eventId) ?? 0;
          const cardTop = isBeingDragged ? getDraggedTop() : slotIdx * (slotHeight + CARD_GAP);

          const style: CSSProperties = {
            top: cardTop,
            maxHeight: slotHeight,
            zIndex: isBeingDragged ? 20 : 10,
            transition: isBeingDragged
              ? 'opacity 0.22s ease'
              : `top 0.2s ease, opacity 0.22s ease, transform 0.26s ease, border-color 0.25s ease, box-shadow 0.25s ease`,
          };

          const classNames = [
            'show-info-card',
            `show-info-card--${phase}`,
            isBeingDragged ? 'show-info-card--dragging' : '',
            isFlashing ? 'show-info-card--flash' : '',
          ].filter(Boolean).join(' ');

          const location = [event.city, event.stateProvince, event.country]
            .filter(Boolean)
            .join(', ');

          return (
            <div
              key={eventId}
              ref={(el) => {
                if (el) cardRefs.current.set(eventId, el);
                else cardRefs.current.delete(eventId);
              }}
              className={classNames}
              style={style}
            >
              {/* Drag handle wraps header + static */}
              <div
                className="show-info-card__drag-handle"
                onMouseDown={(e) => handleDragStart(eventId, e)}
              >
                <div className="show-info-card__header">
                  <div className="show-info-card__eyebrow">Show Information</div>
                  <button
                    className="show-info-card__close"
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => closeCard(eventId)}
                    aria-label="Close show information"
                  >
                    &times;
                  </button>
                </div>
                <div className="show-info-card__static">
                  <div className="show-info-card__title">{event.name}</div>
                  <div className="show-info-card__dates">
                    {formatEventDateRange(event.startDate, event.endDate)}
                  </div>
                  <div className="show-info-card__location">{location}</div>
                </div>
              </div>

              {/* Scrollable body */}
              <div
                className="show-info-card__body"
                onWheel={(e) => e.stopPropagation()}
              >
                <CardBody event={event} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Signal stream overlay */}
      <svg className="show-info-tails" aria-hidden="true">
        {cardOrder.map((eventId) => {
          const phase = cardPhases[eventId] ?? 'open';
          if (phase === 'leaving' || phase === 'entering') return null;
          const data = pinData.get(eventId);
          if (!data) return null;
          const isReady = tailReadyIds.has(eventId);
          const tailVisible = isReady && data.pinVisible && data.tailOriginX > 0;
          const path = streamPath(
            data.pinX,
            data.pinY,
            tailVisible ? data.tailOriginX : data.pinX,
            tailVisible ? data.tailOriginY : data.pinY,
          );
          return (
            <g
              key={eventId}
              className={`show-info-stream ${tailVisible ? 'show-info-stream--visible' : ''}`}
            >
              <path className="show-info-stream__glow" d={path} />
              <path className="show-info-stream__arc show-info-stream__arc--slow" d={path} />
              <path className="show-info-stream__arc show-info-stream__arc--mid" d={path} />
              <path className="show-info-stream__arc show-info-stream__arc--fast" d={path} />
            </g>
          );
        })}
      </svg>
    </>
  );
}
