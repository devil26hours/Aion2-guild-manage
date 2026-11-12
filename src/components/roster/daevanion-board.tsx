"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, CircleAlert, Loader2, Lock, Maximize2, Minimize2, RotateCcw, Unlock, X, ZoomIn, ZoomOut } from "lucide-react";
import { SectionPanel } from "@/components/aion/section-panel";
import { useT } from "@/lib/i18n";
import {
  groupActiveEffects,
  nodeArt,
  nodeSkill,
  skillIndex,
  type ActiveSkillEffect,
  type DaevanionBoardDetail,
  type DaevanionNode,
  type SkillRef,
} from "@/lib/roster/daevanion";
import { boardKey, preloadBoards, requestBoard, useBoard, type BoardTarget } from "@/lib/roster/daevanion-store";
import type { ProfileView } from "@/lib/roster/profile-view";
import { gradeColor } from "@/lib/roster/profile-view";
import { cn, dataText } from "@/lib/utils";
import { ApiIcon } from "./api-icon";

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

/** One grid cell (px, before zoom) and the gap between cells. */
const CELL = 48;
const GAP = 6;
const PAD = 24;
const MIN_SCALE = 0.3;
const MAX_SCALE = 3;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type Board = ProfileView["boards"][number];

/**
 * Marks the fullscreen board (portaled to <body>). A host dialog uses these so a
 * click inside the fullscreen board is not "outside" and Escape closes only the
 * fullscreen board, not the dialog under it.
 */
export const BOARD_FULLSCREEN_ATTR = "data-daevanion-fullscreen";
export const isInBoardFullscreen = (target: EventTarget | null) => target instanceof Element && target.closest(`[${BOARD_FULLSCREEN_ATTR}]`) !== null;
export const isBoardFullscreenOpen = () => typeof document !== "undefined" && document.querySelector(`[${BOARD_FULLSCREEN_ATTR}]`) !== null;

/**
 * Board colour themes: only Ariel (orange) and Azphel (purple), matched by the
 * board name the API sends. Colours are the app's existing Legend orange and
 * Epic purple (lib/roster/profile-view gradeColor). Every other board keeps
 * the default theme (null).
 */
const BOARD_THEMES: Record<string, string> = { ariel: "#ef9a3c", azphel: "#a97cf2" };
const boardTheme = (name: string): string | null => BOARD_THEMES[name.trim().toLowerCase()] ?? null;

/* ------------------------------------------------------------------ */
/* Panel: board picker + visual board + active effects                 */
/* ------------------------------------------------------------------ */

/**
 * Daevanion section of the character profile. The board list comes from the
 * profile (`daevanion.boardList`); the selected board's layout is fetched by id
 * (one request per board, cached) and drawn as a CSS grid at each node's own
 * row/col. Everything shown is from the API: no node, grade, link or effect is
 * invented. Without the ids needed for the request it falls back to the list.
 */
export function DaevanionPanel({
  boards,
  identity,
  region,
  className,
  skills,
}: {
  boards: Board[];
  identity: { characterId: string | null; serverId: string | null };
  region?: string;
  className: string | null;
  skills: SkillRef[];
}) {
  const t = useT();
  const usable = boards.filter((b) => b.id !== null);
  const [selected, setSelected] = useState<number | null>(usable[0]?.id ?? null);
  const board = usable.find((b) => b.id === selected) ?? usable[0] ?? null;
  const target: BoardTarget | null =
    board && identity.characterId && identity.serverId
      ? { characterId: identity.characterId, serverId: identity.serverId, boardId: board.id!, ...(region ? { region } : {}) }
      : null;
  const key = target ? boardKey(target) : null;
  const targetRef = useRef(target);
  useLayoutEffect(() => {
    targetRef.current = target;
  });
  // One request when a board is shown (no-op when it is cached or loading).
  useEffect(() => {
    if (targetRef.current) requestBoard(targetRef.current);
  }, [key]);

  // Background: as soon as the profile is here, queue every other board of it, so
  // switching boards shows data at once. Deduplicated by the shared board cache
  // (cached / loading / queued boards are skipped); leaving the profile drops what
  // is still queued. One request at a time, never blocking the page.
  const allTargets: BoardTarget[] =
    identity.characterId && identity.serverId
      ? usable.map((b) => ({ characterId: identity.characterId!, serverId: identity.serverId!, boardId: b.id!, ...(region ? { region } : {}) }))
      : [];
  const allKey = allTargets.map(boardKey).join(",");
  const allRef = useRef(allTargets);
  useLayoutEffect(() => {
    allRef.current = allTargets;
  });
  useEffect(() => (allKey ? preloadBoards(allRef.current) : undefined), [allKey]);
  const entry = useBoard(key);
  const index = useMemo(() => skillIndex(skills), [skills]);

  return (
    <SectionPanel title={t("Daevanion")} icon={BookOpen} description={t("Daevanion boards from the AION2 API — pick a board to see its nodes")}>
      <div className="space-y-4" data-testid="daevanion">
        {/* One row only; more boards than fit scroll sideways (touch, trackpad or the scrollbar). */}
        <div role="tablist" aria-label={t("Daevanion boards")} className="flex snap-x gap-2 overflow-x-auto overscroll-x-contain pb-1.5" data-testid="boards">
          {boards.map((b) => {
            const active = board !== null && b.id === board.id;
            const theme = boardTheme(b.name);
            return (
              <button
                key={`${b.id}-${b.name}`}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={b.id === null}
                onClick={(e) => {
                  if (b.id === null) return;
                  setSelected(b.id);
                  e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
                }}
                data-testid="daevanion-board-tab"
                data-theme-color={theme ?? undefined}
                className={cn(
                  "flex w-40 shrink-0 snap-start items-center gap-1.5 border px-1.5 py-1 text-left sm:w-auto sm:min-w-0 sm:flex-1 sm:shrink transition-colors outline-none focus-visible:ring-2 focus-visible:ring-arcane/40",
                  theme
                    ? active
                      ? "bg-surface/50"
                      : "bg-surface/50 hover:brightness-110"
                    : active
                      ? "border-brand/60 bg-brand/[0.08]"
                      : "border-steel/15 bg-surface/50 hover:border-brand-muted/50",
                )}
                style={theme ? { borderColor: active ? theme : `${theme}80`, background: active ? `${theme}1f` : undefined } : undefined}
              >
                <ApiIcon src={b.icon} alt={b.name} size={22} color={theme ?? undefined} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-1">
                    <span
                      className={cn("truncate text-xs", active && "font-semibold", !theme && (active ? "text-brand-strong" : "text-foreground"))}
                      style={theme ? { color: dataText(theme) } : undefined}
                    >
                      {b.name}
                    </span>
                    <span className={cn("shrink-0 text-4xs tabular-nums", !theme && "text-steel")} style={theme ? { color: dataText(theme) } : undefined}>
                      {b.open ?? "—"}/{b.total ?? "—"} · {b.percent ?? "—"}%
                    </span>
                  </span>
                  <span aria-hidden className="mt-0.5 block h-1 bg-steel/10" style={theme ? { background: `${theme}26` } : undefined}>
                    <span
                      className={cn("block h-full", !theme && "bg-[image:var(--bar-gradient)]")}
                      style={{ width: `${clamp(b.percent ?? 0, 0, 100)}%`, ...(theme ? { background: `linear-gradient(90deg, ${theme}b3, ${theme})` } : {}) }}
                    />
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {!target && <p className="text-xs text-subtle">{t("The board layout can't be loaded: this stored profile has no character id, server id or board id.")}</p>}
        {target && (entry === null || entry.status === "loading") && (
          <p className="flex items-center gap-2 text-sm text-steel" role="status" data-testid="daevanion-loading">
            <Loader2 className="size-4 animate-spin" /> {t("Loading board…")}
          </p>
        )}
        {target && entry?.status === "error" && (
          <p className="flex flex-wrap items-center gap-2 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-danger-text" role="alert" data-testid="daevanion-error">
            <CircleAlert className="size-4 shrink-0" />
            <span className="flex-1">{t("Could not load this board:")} {entry.message}</span>
            <button type="button" onClick={() => requestBoard(target)} className="border border-current/40 px-2 py-0.5 text-xs hover:bg-destructive/10">
              {t("Retry")}
            </button>
          </p>
        )}
        {target && entry?.status === "ready" && board && (
          entry.detail.nodes.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-steel" data-testid="daevanion-empty">{t("The AION2 API returned no nodes for this board.")}</p>
              <ActiveEffects detail={entry.detail} index={index} stretch={false} />
            </div>
          ) : (
            // Desktop: board left, Active Effects right at the board's height. Phones: stacked.
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]" data-testid="daevanion-layout">
              <BoardView key={key} detail={entry.detail} boardName={board.name} className={className} index={index} />
              <ActiveEffects detail={entry.detail} index={index} stretch />
            </div>
          )
        )}
      </div>
    </SectionPanel>
  );
}

/* ------------------------------------------------------------------ */
/* Board view: pan / zoom / fullscreen / tooltip                       */
/* ------------------------------------------------------------------ */

type Tip = { node: DaevanionNode; x: number; y: number; pinned: boolean };

function BoardView({ detail, boardName, className, index }: { detail: DaevanionBoardDetail; boardName: string; className: string | null; index: Map<string, SkillRef> }) {
  const t = useT();
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const xf = useRef({ x: 0, y: 0, s: 1 });
  /** False until the user pans/zooms; while false the board re-fits on resize. */
  const touched = useRef(false);
  const [full, setFull] = useState(false);
  const [tip, setTip] = useState<Tip | null>(null);
  const [scalePct, setScalePct] = useState(100);

  const width = detail.cols * CELL + (detail.cols - 1) * GAP + PAD * 2;
  const height = detail.rows * CELL + (detail.rows - 1) * GAP + PAD * 2;

  const apply = useCallback(() => {
    const { x, y, s } = xf.current;
    if (content.current) content.current.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    setScalePct(Math.round(s * 100));
  }, []);

  // The initial view frames the cells that actually hold nodes (boards leave outer rows/cols
  // of the 15x15 grid empty); nodes still sit at their own row/col inside the full grid.
  const bbox = useMemo(() => {
    const rows = detail.nodes.map((n) => n.row);
    const cols = detail.nodes.map((n) => n.col);
    const cellStart = (i: number) => PAD + (i - 1) * (CELL + GAP);
    const r0 = Math.min(...rows), r1 = Math.max(...rows), c0 = Math.min(...cols), c1 = Math.max(...cols);
    const m = CELL / 2;
    return { x: cellStart(c0) - m, y: cellStart(r0) - m, w: cellStart(c1) + CELL - cellStart(c0) + 2 * m, h: cellStart(r1) + CELL - cellStart(r0) + 2 * m };
  }, [detail]);

  const fit = useCallback(() => {
    const v = viewport.current;
    if (!v) return;
    const s = clamp(Math.min(v.clientWidth / bbox.w, v.clientHeight / bbox.h), MIN_SCALE, MAX_SCALE);
    xf.current = { s, x: (v.clientWidth - bbox.w * s) / 2 - bbox.x * s, y: (v.clientHeight - bbox.h * s) / 2 - bbox.y * s };
    apply();
  }, [bbox, apply]);

  const zoomAt = useCallback(
    (px: number, py: number, factor: number) => {
      const { x, y, s } = xf.current;
      const ns = clamp(s * factor, MIN_SCALE, MAX_SCALE);
      xf.current = { s: ns, x: px - (px - x) * (ns / s), y: py - (py - y) * (ns / s) };
      touched.current = true;
      apply();
    },
    [apply],
  );

  const zoomCenter = (factor: number) => {
    const v = viewport.current;
    if (v) zoomAt(v.clientWidth / 2, v.clientHeight / 2, factor);
  };

  const reset = () => {
    touched.current = false;
    setTip(null);
    fit();
  };

  // Fit on mount, and on every resize (incl. entering/leaving fullscreen) until the user moved the board.
  useLayoutEffect(() => {
    const v = viewport.current;
    if (!v) return;
    fit();
    const ro = new ResizeObserver(() => {
      if (!touched.current) fit();
    });
    ro.observe(v);
    return () => ro.disconnect();
  }, [fit, full]);

  // Wheel zoom needs a non-passive listener to keep the page from scrolling.
  useEffect(() => {
    const v = viewport.current;
    if (!v) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = v.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    };
    v.addEventListener("wheel", onWheel, { passive: false });
    return () => v.removeEventListener("wheel", onWheel);
  }, [zoomAt, full]);

  // Fullscreen: Escape closes it, and the page behind does not scroll.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [full]);

  /* ---- pointers: one finger/mouse pans, two fingers pinch-zoom; a press without movement selects ---- */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; node: number | null; pinch: number | null }>({ moved: false, node: null, pinch: null });

  const local = (e: { clientX: number; clientY: number }) => {
    const r = viewport.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const nodeIndexAt = (target: EventTarget | null) => {
    const el = target instanceof Element ? target.closest<HTMLElement>("[data-node-index]") : null;
    return el ? Number(el.dataset.nodeIndex) : null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (pointers.current.size === 0) gesture.current = { moved: false, node: nodeIndexAt(e.target), pinch: null };
    pointers.current.set(e.pointerId, local(e));
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      gesture.current.moved = true;
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) {
      // Plain mouse hover (no button down): a tooltip that follows the pointer.
      if (e.pointerType === "mouse" && !tip?.pinned) {
        const i = nodeIndexAt(e.target);
        const p = local(e);
        setTip(i === null ? null : { node: detail.nodes[i], x: p.x, y: p.y, pinned: false });
      }
      return;
    }
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2 && gesture.current.pinch) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / gesture.current.pinch);
      gesture.current.pinch = d;
      return;
    }
    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    if (!gesture.current.moved && Math.hypot(dx, dy) < 3) return;
    gesture.current.moved = true;
    xf.current = { ...xf.current, x: xf.current.x + dx, y: xf.current.y + dy };
    touched.current = true;
    if (tip && !tip.pinned) setTip(null);
    apply();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = local(e);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 1) gesture.current.pinch = null;
    if (pointers.current.size > 0) return;
    if (gesture.current.moved) return;
    const i = gesture.current.node;
    // A tap/click on a node pins its details; on empty board space it closes them.
    setTip(i === null ? null : { node: detail.nodes[i], x: p.x, y: p.y, pinned: true });
  };

  const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
  };

  const openCount = detail.nodes.filter((n) => n.open).length;
  const grades = [...new Set(detail.nodes.map((n) => n.grade).filter((g): g is string => !!g))];

  const frame = (
    <div
      // pointer-events-auto: inside a modal dialog <body> has pointer-events: none (Radix).
      className={cn(full ? "pointer-events-auto fixed inset-0 z-[70] flex flex-col bg-background p-2 sm:p-4" : "space-y-2")}
      {...(full ? { [BOARD_FULLSCREEN_ATTR]: "" } : {})}
      role={full ? "dialog" : undefined}
      aria-modal={full || undefined}
      aria-label={full ? `${t("Daevanion")} · ${boardName}` : undefined}
      data-testid={full ? "daevanion-fullscreen" : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-xs text-steel">
          <span className="font-semibold text-foreground">{boardName}</span> · {t("{open} of {total} nodes unlocked", { open: openCount, total: detail.nodes.length })}
        </p>
        <span className="text-3xs text-subtle tabular-nums" data-testid="daevanion-zoom">{scalePct}%</span>
        <ToolButton label={t("Zoom out")} onClick={() => zoomCenter(1 / 1.25)} testId="daevanion-zoom-out"><ZoomOut className="size-3.5" /></ToolButton>
        <ToolButton label={t("Zoom in")} onClick={() => zoomCenter(1.25)} testId="daevanion-zoom-in"><ZoomIn className="size-3.5" /></ToolButton>
        <ToolButton label={t("Reset view")} onClick={reset} testId="daevanion-reset"><RotateCcw className="size-3.5" /></ToolButton>
        <ToolButton label={full ? t("Exit fullscreen") : t("Fullscreen")} onClick={() => setFull((f) => !f)} testId="daevanion-fullscreen-toggle">
          {full ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </ToolButton>
      </div>
      <div
        ref={viewport}
        className={cn(
          "relative touch-none overflow-hidden border border-steel/15 bg-[radial-gradient(ellipse_at_center,var(--surface-raised),var(--surface))] select-none",
          // Phones: a square that fits the width; larger screens: a fixed-height stage.
          full ? "min-h-0 flex-1" : "aspect-square max-h-[70vh] w-full sm:aspect-auto sm:h-[min(68vh,560px)] sm:min-h-72",
          "cursor-grab active:cursor-grabbing",
        )}
        data-testid="daevanion-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse" && !tip?.pinned) setTip(null);
        }}
      >
        <div ref={content} className="absolute top-0 left-0 origin-top-left will-change-transform" style={{ width, height }} data-testid="daevanion-content">
          <BoardGrid detail={detail} className={className} index={index} />
        </div>
        {tip && <NodeTooltip tip={tip} index={index} viewport={viewport} onClose={() => setTip(null)} />}
      </div>
      <Legend grades={grades} />
    </div>
  );

  return full ? createPortal(frame, document.body) : frame;
}

function ToolButton({ label, onClick, children, testId }: { label: string; onClick: () => void; children: React.ReactNode; testId: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-testid={testId}
      className="inline-flex size-8 items-center justify-center border border-steel/20 text-steel transition-colors outline-none hover:border-brand-muted/60 hover:text-brand-strong focus-visible:ring-2 focus-visible:ring-arcane/40"
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Grid (memoised: panning/zooming never re-renders the nodes)         */
/* ------------------------------------------------------------------ */

const BoardGrid = memo(function BoardGrid({ detail, className, index }: { detail: DaevanionBoardDetail; className: string | null; index: Map<string, SkillRef> }) {
  const t = useT();
  return (
    <div
      className="grid"
      style={{
        padding: PAD,
        gap: GAP,
        gridTemplateColumns: `repeat(${detail.cols}, ${CELL}px)`,
        gridTemplateRows: `repeat(${detail.rows}, ${CELL}px)`,
      }}
      data-testid="daevanion-grid"
    >
      {detail.nodes.map((n, i) => {
        const skill = nodeSkill(n, index);
        const status = n.open ? t("Unlocked") : t("Locked");
        return (
          <div
            key={n.id ?? `${n.row}-${n.col}`}
            data-node-index={i}
            data-testid="daevanion-node"
            data-open={n.open ? "1" : "0"}
            data-type={n.type}
            data-grade={n.grade ?? ""}
            role="img"
            aria-label={`${n.name || n.type} · ${n.grade ?? ""} · ${status}`}
            className="relative"
            style={{ gridRow: n.row, gridColumn: n.col }}
          >
            <NodeArt node={n} className={className} skill={skill} />
          </div>
        );
      })}
    </div>
  );
});

function NodeArt({ node, className, skill }: { node: DaevanionNode; className: string | null; skill: SkillRef | null }) {
  const [artOk, setArtOk] = useState(true);
  const [skillOk, setSkillOk] = useState(true);
  const src = nodeArt(node, className);
  const color = gradeColor(node.grade);
  // Locked nodes: the closed artwork, dimmed. Unlocked: the "_open" artwork with a grade-coloured glow.
  const state = node.open ? "" : "opacity-45 saturate-50";
  return (
    <>
      {src && artOk ? (
        // eslint-disable-next-line @next/next/no-img-element -- NCSOFT CDN board art
        <img
          src={src}
          alt=""
          draggable={false}
          referrerPolicy="no-referrer"
          onError={() => setArtOk(false)}
          className={cn("pointer-events-none size-full object-contain", state)}
          style={node.open ? { filter: `drop-shadow(0 0 6px ${color}aa)` } : undefined}
        />
      ) : (
        <span
          aria-hidden
          className={cn("block size-full rotate-45 scale-[0.72] border-2 bg-surface", state)}
          style={{ borderColor: node.open ? color : `${color}66`, boxShadow: node.open ? `0 0 8px ${color}88` : undefined }}
        />
      )}
      {skill?.icon && skillOk && (
        // eslint-disable-next-line @next/next/no-img-element -- skill icon URL from the profile's skill.skillList
        <img
          src={skill.icon}
          alt=""
          draggable={false}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setSkillOk(false)}
          data-testid="daevanion-node-skill"
          className={cn("pointer-events-none absolute inset-[24%] size-[52%] rounded-full object-cover", !node.open && "opacity-50 grayscale")}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Tooltip                                                             */
/* ------------------------------------------------------------------ */

function NodeTooltip({ tip, index, viewport, onClose }: { tip: Tip; index: Map<string, SkillRef>; viewport: React.RefObject<HTMLDivElement | null>; onClose: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: tip.x + 14, top: tip.y + 14 });
  const n = tip.node;
  const skill = nodeSkill(n, index);
  const color = gradeColor(n.grade);
  // Keep the box inside the board viewport (flip left/up near the edges).
  useLayoutEffect(() => {
    const v = viewport.current;
    const el = ref.current;
    if (!v || !el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = tip.x + 14;
    let top = tip.y + 14;
    if (left + w > v.clientWidth - 6) left = Math.max(6, tip.x - 14 - w);
    if (top + h > v.clientHeight - 6) top = Math.max(6, tip.y - 14 - h);
    setPos({ left, top });
  }, [tip, viewport]);
  return (
    <div
      ref={ref}
      role={tip.pinned ? "dialog" : "tooltip"}
      aria-label={n.name || n.type}
      data-testid={tip.pinned ? "daevanion-tooltip-pinned" : "daevanion-tooltip"}
      className={cn("absolute z-10 w-64 border bg-gradient-to-b from-surface-raised to-surface p-3 text-left shadow-[var(--float-shadow)]", tip.pinned ? "pointer-events-auto" : "pointer-events-none")}
      style={{ left: pos.left, top: pos.top, borderColor: `${color}99` }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-2">
        {skill?.icon && <ApiIcon src={skill.icon} alt={skill.name} size={32} color={color} />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color: dataText(color) }}>{n.name || n.type}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-3xs text-subtle">
            {n.grade && <span>{n.grade}</span>}
            <span>{n.type === "SkillLevel" ? t("Skill node") : n.type === "Stat" ? t("Stat node") : n.type === "Start" ? t("Start node") : n.type}</span>
            <span className={cn("inline-flex items-center gap-0.5", n.open ? "text-success-text" : "text-steel")}>
              {n.open ? <Unlock className="size-3" /> : <Lock className="size-3" />}
              {n.open ? t("Unlocked") : t("Locked")}
            </span>
          </p>
        </div>
        {tip.pinned && (
          <button type="button" onClick={onClose} aria-label={t("Close")} className="text-steel hover:text-foreground">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {n.effects.length > 0 ? (
        <ul className="mt-2 space-y-0.5 border-t border-steel/15 pt-2 text-xs text-foreground" data-testid="daevanion-tooltip-effects">
          {n.effects.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      ) : (
        <p className="mt-2 border-t border-steel/15 pt-2 text-3xs text-subtle">{t("The API lists no effect for this node.")}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Legend + active effects                                             */
/* ------------------------------------------------------------------ */

function Legend({ grades }: { grades: string[] }) {
  const t = useT();
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-3xs text-subtle" aria-label={t("Legend")}>
      {grades.map((g) => (
        <li key={g} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rotate-45 border" style={{ borderColor: gradeColor(g), background: `${gradeColor(g)}55` }} />
          {g}
        </li>
      ))}
      <li className="inline-flex items-center gap-1"><Unlock className="size-3 text-success-text" /> {t("Unlocked: bright artwork")}</li>
      <li className="inline-flex items-center gap-1"><Lock className="size-3" /> {t("Locked: dimmed")}</li>
      <li>{t("Drag to pan · wheel or pinch to zoom · tap a node for details")}</li>
    </ul>
  );
}

/**
 * Active Effects of the selected board, from the API's own lists
 * (openSkillEffectList / openStatEffectList — verified equal to the sums of the
 * unlocked nodes' effects). The count is the number of rows shown.
 * `stretch`: fill the grid row next to the board (desktop) and scroll inside.
 */
function ActiveEffects({ detail, index, stretch }: { detail: DaevanionBoardDetail; index: Map<string, SkillRef>; stretch: boolean }) {
  const t = useT();
  const groups = useMemo(() => groupActiveEffects(detail, index), [detail, index]);
  const total = groups.skill.length + groups.passive.length + groups.stats.length;
  return (
    <aside className="relative border border-steel/15 bg-surface/50" aria-label={t("Active Effects")} data-testid="daevanion-effects">
      {/* Desktop + stretch: the content is taken out of flow, so the row height comes from the board and the list scrolls. */}
      <div className={cn("flex flex-col", stretch && "lg:absolute lg:inset-0")}>
      <header className="flex items-center justify-between gap-2 border-b border-steel/15 bg-[image:var(--panel-header)] px-3 py-2.5">
        <h3 className="font-heading text-xs font-semibold tracking-[0.14em] text-brand-strong uppercase" data-testid="daevanion-effects-title">
          {t("Active Effects")} <span className="text-gold-text tabular-nums">({total})</span>
        </h3>
      </header>
      <div className={cn("max-h-[28rem] space-y-4 overflow-y-auto overscroll-contain p-3", stretch && "lg:max-h-none lg:min-h-0 lg:flex-1")} data-testid="daevanion-effects-scroll">
        {total === 0 && <p className="text-xs text-subtle" data-testid="daevanion-effects-none">{t("No effects are active on this board yet.")}</p>}
        {groups.skill.length > 0 && (
          <EffectGroup title={t("Skill Upgrades")} count={groups.skill.length} testId="daevanion-effects-skill">
            {groups.skill.map((e, i) => <SkillEffectRow key={i} e={e} />)}
          </EffectGroup>
        )}
        {groups.passive.length > 0 && (
          <EffectGroup title={t("Passive Upgrades")} count={groups.passive.length} testId="daevanion-effects-passive">
            {groups.passive.map((e, i) => <SkillEffectRow key={i} e={e} />)}
          </EffectGroup>
        )}
        {groups.stats.length > 0 && (
          <EffectGroup title={t("Stat Bonuses")} count={groups.stats.length} testId="daevanion-effects-stats">
            {groups.stats.map((d, i) => <StatEffectRow key={i} desc={d} />)}
          </EffectGroup>
        )}
      </div>
      </div>
    </aside>
  );
}

function EffectGroup({ title, count, testId, children }: { title: string; count: number; testId: string; children: React.ReactNode }) {
  return (
    <section data-testid={testId}>
      <h4 className="mb-1.5 flex items-center justify-between border-b border-steel/12 pb-1 text-4xs font-semibold tracking-[0.24em] text-brand uppercase">
        {title} <span className="text-subtle tabular-nums">{count}</span>
      </h4>
      <ul className="space-y-1">{children}</ul>
    </section>
  );
}

function SkillEffectRow({ e }: { e: ActiveSkillEffect }) {
  return (
    <li className="flex items-center gap-2.5 py-0.5 text-[0.8125rem]" title={e.desc} data-desc={e.desc}>
      <ApiIcon src={e.icon} alt={e.skill ?? e.desc} size={30} />
      <span className="min-w-0 flex-1 truncate text-foreground">
        {e.skill ?? e.desc}
        {e.amount && <span className="ml-1.5 font-semibold text-gold-text tabular-nums">{e.amount}</span>}
      </span>
    </li>
  );
}

/** "Cooldown Reduction +3%" → name left, value right (display only; unparsed text is shown whole). */
function StatEffectRow({ desc }: { desc: string }) {
  const m = /^(.+?)\s+([+-]\d+(?:\.\d+)?%?)$/.exec(desc);
  return (
    <li className="flex items-baseline justify-between gap-3 py-0.5 text-[0.8125rem]" data-desc={desc}>
      <span className="min-w-0 truncate text-foreground">{m ? m[1] : desc}</span>
      {m && <span className="shrink-0 font-semibold text-gold-text tabular-nums">{m[2]}</span>}
    </li>
  );
}
