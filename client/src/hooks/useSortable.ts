import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Drag-to-reorder for lists and grids that works the same with a mouse, a
 * pen or a finger. HTML5 drag-and-drop never fires for touch, so this is
 * built on pointer events instead:
 *
 * - A drag handle (`handleProps`) starts dragging straight away.
 * - Anywhere else on an item (`itemProps`), a mouse starts dragging once it
 *   moves a few pixels, and a finger after a short press and hold, so normal
 *   swipes still scroll the page.
 *
 * Every item needs `itemProps(index)` (which sets `data-sort-index`), and the
 * list container needs `containerRef` so the browser can be told not to
 * scroll while a finger is dragging. Listeners live on `window` because the
 * dragged element is moved around the DOM as the order changes, which drops
 * any pointer capture it had.
 */

const HOLD_MS = 280;
const TOUCH_SLOP = 10;
const MOUSE_SLOP = 5;
const EDGE = 72;
const MAX_SCROLL = 14; // px per frame

interface Options {
  count: number;
  /** Move the item at `from` to `to`. Called repeatedly while dragging. */
  onMove: (from: number, to: number) => void;
  onStart?: (index: number) => void;
  onEnd?: (moved: boolean) => void;
}

export function useSortable({ count, onMove, onStart, onEnd }: Options) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const state = useRef<{ index: number; moved: boolean; x: number; y: number } | null>(null);
  const pending = useRef<{ timer?: number; cleanup: () => void } | null>(null);
  const callbacks = useRef({ onMove, onStart, onEnd, count });
  callbacks.current = { onMove, onStart, onEnd, count };

  const hitTest = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-sort-index]");
    if (!el || !containerRef.current?.contains(el)) return null;
    const i = Number(el.dataset.sortIndex);
    return Number.isInteger(i) && i >= 0 && i < callbacks.current.count ? i : null;
  };

  const end = useCallback(() => {
    const s = state.current;
    if (!s) return;
    state.current = null;
    setDragIndex(null);
    callbacks.current.onEnd?.(s.moved);
    if (s.moved) {
      // The press that ended a drag is not also a tap on the item under it.
      // Only clicks inside the list are ignored, so buttons elsewhere respond at once.
      const list = containerRef.current;
      const swallow = (e: Event) => {
        if (!list?.contains(e.target as Node)) return;
        e.stopPropagation();
        e.preventDefault();
        window.removeEventListener("click", swallow, { capture: true });
      };
      window.addEventListener("click", swallow, { capture: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 400);
    }
  }, []);

  const begin = useCallback((index: number, x: number, y: number) => {
    state.current = { index, moved: false, x, y };
    setDragIndex(index);
    callbacks.current.onStart?.(index);
  }, []);

  // While dragging: follow the pointer, swap items, and scroll near the edges.
  useEffect(() => {
    if (dragIndex === null) return;
    let frame = 0;
    const update = () => {
      const s = state.current;
      if (!s) return;
      const over = hitTest(s.x, s.y);
      if (over !== null && over !== s.index) {
        callbacks.current.onMove(s.index, over);
        s.index = over;
        s.moved = true;
        setDragIndex(over);
      }
    };
    const tick = () => {
      const s = state.current;
      if (!s) return;
      // Scroll while the pointer is near the top or bottom edge, but only
      // while more of the list is hidden in that direction.
      const list = containerRef.current?.getBoundingClientRect();
      const depth = s.y < EDGE ? s.y - EDGE : s.y > window.innerHeight - EDGE ? s.y - (window.innerHeight - EDGE) : 0;
      const more = !list ? false : depth < 0 ? list.top < EDGE : list.bottom > window.innerHeight - EDGE;
      if (depth && more) {
        window.scrollBy(0, Math.max(-MAX_SCROLL, Math.min(MAX_SCROLL, depth / 4)));
        update();
      }
      frame = requestAnimationFrame(tick);
    };
    const onMovePointer = (e: PointerEvent) => {
      const s = state.current;
      if (!s) return;
      s.x = e.clientX;
      s.y = e.clientY;
      update();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") end(); };
    window.addEventListener("pointermove", onMovePointer);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("keydown", onKey);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMovePointer);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("keydown", onKey);
    };
    // Re-subscribing on every index change is unnecessary; only start/stop matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragIndex === null, end]);

  // Touch scrolling can only be cancelled by a listener that existed when the
  // finger went down, so this one is always attached and blocks only during a drag.
  const setContainer = useCallback((el: HTMLElement | null) => {
    const block = (e: Event) => { if (state.current) e.preventDefault(); };
    const blockMenu = (e: Event) => { if (state.current) e.preventDefault(); };
    if (containerRef.current) {
      const prev = containerRef.current as HTMLElement & { __sortCleanup?: () => void };
      prev.__sortCleanup?.();
    }
    containerRef.current = el;
    if (!el) return;
    el.addEventListener("touchmove", block, { passive: false });
    el.addEventListener("contextmenu", blockMenu);
    (el as HTMLElement & { __sortCleanup?: () => void }).__sortCleanup = () => {
      el.removeEventListener("touchmove", block);
      el.removeEventListener("contextmenu", blockMenu);
    };
  }, []);

  const cancelPending = () => {
    pending.current?.cleanup();
    pending.current = null;
  };

  const handleProps = (index: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      cancelPending();
      begin(index, e.clientX, e.clientY);
    },
    // Keyboard: focus the handle and use the arrow keys.
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
      const to = index + (step ?? 0);
      if (!step || to < 0 || to >= callbacks.current.count) return;
      e.preventDefault();
      const handle = e.currentTarget;
      callbacks.current.onStart?.(index);
      callbacks.current.onMove(index, to);
      callbacks.current.onEnd?.(true);
      // Keep focus on the same item's handle after it moves.
      requestAnimationFrame(() => containerRef.current?.querySelector<HTMLElement>(`[data-sort-index="${to}"] [data-sort-handle]`)?.focus() ?? handle.focus());
    },
    style: { touchAction: "none" as const, cursor: dragIndex === null ? "grab" : "grabbing" },
    "data-sort-handle": "",
  });

  const itemProps = (index: number) => ({
    "data-sort-index": index,
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0 || state.current) return;
      if ((e.target as HTMLElement).closest("input, select, textarea, [contenteditable], [data-no-drag]")) return;
      cancelPending();
      const startX = e.clientX, startY = e.clientY;
      const touch = e.pointerType !== "mouse";
      const onMovePointer = (ev: PointerEvent) => {
        const far = Math.hypot(ev.clientX - startX, ev.clientY - startY);
        if (touch) {
          if (far > TOUCH_SLOP) cancelPending(); // a swipe: let the page scroll
        } else if (far > MOUSE_SLOP) {
          cancelPending();
          begin(index, ev.clientX, ev.clientY);
        }
      };
      const cleanup = () => {
        if (pending.current?.timer) clearTimeout(pending.current.timer);
        window.removeEventListener("pointermove", onMovePointer);
        window.removeEventListener("pointerup", cancelPending);
        window.removeEventListener("pointercancel", cancelPending);
      };
      pending.current = { cleanup };
      if (touch) {
        pending.current.timer = window.setTimeout(() => {
          cancelPending();
          navigator.vibrate?.(12);
          begin(index, startX, startY);
        }, HOLD_MS);
      }
      window.addEventListener("pointermove", onMovePointer);
      window.addEventListener("pointerup", cancelPending);
      window.addEventListener("pointercancel", cancelPending);
    },
  });

  useEffect(() => () => cancelPending(), []);

  return { dragIndex, isDragging: dragIndex !== null, containerRef: setContainer, handleProps, itemProps };
}
