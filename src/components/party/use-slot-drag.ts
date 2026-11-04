"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface SlotDragState {
  from: number;
  /** Slot currently under the pointer (null when outside the list). */
  over: number | null;
  x: number;
  y: number;
}

/** Controls inside a card that must keep their own click/focus behaviour. */
const INTERACTIVE = "button, a, input, select, textarea, label, [role='button'], [data-no-drag]";
const MOUSE_DRAG_PX = 5;
/** Touch/pen: hold this long without moving to pick a card up (a quick swipe still scrolls). */
const HOLD_MS = 250;
const HOLD_SLOP_PX = 8;
const EDGE_PX = 64;

/**
 * Pointer-events drag for the party slot list (mouse, touch and pen). Slots are found via
 * their `data-slot-index` attribute. Calls `onDrop(from, to)` when released over another slot.
 */
export function useSlotDrag({ enabled, onDrop }: { enabled: boolean; onDrop: (from: number, to: number) => void }) {
  const [drag, setDrag] = useState<SlotDragState | null>(null);
  const onDropRef = useRef(onDrop);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onDropRef.current = onDrop;
  });
  useEffect(() => () => stopRef.current?.(), []);
  useEffect(() => {
    if (!enabled) stopRef.current?.();
  }, [enabled]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent, index: number) => {
      if (!enabled || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
      if ((e.target as Element).closest(INTERACTIVE)) return;
      stopRef.current?.();

      const id = e.pointerId;
      const startX = e.clientX;
      const startY = e.clientY;
      const touch = e.pointerType !== "mouse";
      let active = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let lastUserSelect = "";

      const slotAt = (x: number, y: number) => {
        const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-slot-index]");
        const n = el ? Number(el.dataset.slotIndex) : NaN;
        return Number.isInteger(n) ? n : null;
      };

      const begin = (x: number, y: number) => {
        active = true;
        lastUserSelect = document.body.style.userSelect;
        document.body.style.userSelect = "none";
        window.getSelection()?.removeAllRanges();
        if (touch) navigator.vibrate?.(10);
        setDrag({ from: index, over: index, x, y });
      };

      const stop = () => {
        clearTimeout(timer);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("keydown", key);
        window.removeEventListener("touchmove", block);
        window.removeEventListener("contextmenu", menu);
        if (active) document.body.style.userSelect = lastUserSelect;
        active = false;
        setDrag(null);
        stopRef.current = null;
      };

      function move(ev: PointerEvent) {
        if (ev.pointerId !== id) return;
        if (!active) {
          const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
          if (touch) {
            if (dist > HOLD_SLOP_PX) stop(); // the user is scrolling
            return;
          }
          if (dist < MOUSE_DRAG_PX) return;
          begin(ev.clientX, ev.clientY);
        }
        setDrag({ from: index, over: slotAt(ev.clientX, ev.clientY), x: ev.clientX, y: ev.clientY });
        if (ev.clientY < EDGE_PX) window.scrollBy(0, -12);
        else if (ev.clientY > window.innerHeight - EDGE_PX) window.scrollBy(0, 12);
      }
      function up(ev: PointerEvent) {
        if (ev.pointerId !== id) return;
        const to = active ? slotAt(ev.clientX, ev.clientY) : null;
        stop();
        if (to !== null && to !== index) onDropRef.current(index, to);
      }
      function cancel(ev: PointerEvent) {
        if (ev.pointerId === id) stop();
      }
      function key(ev: KeyboardEvent) {
        if (ev.key === "Escape") stop();
      }
      // Once a card is picked up, keep the page from scrolling under the finger.
      function block(ev: TouchEvent) {
        if (active && ev.cancelable) ev.preventDefault();
      }
      function menu(ev: Event) {
        if (active || touch) ev.preventDefault();
      }

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      window.addEventListener("keydown", key);
      window.addEventListener("touchmove", block, { passive: false });
      window.addEventListener("contextmenu", menu);
      stopRef.current = stop;
      if (touch) timer = setTimeout(() => begin(startX, startY), HOLD_MS);
    },
    [enabled],
  );

  return { drag, onPointerDown };
}
