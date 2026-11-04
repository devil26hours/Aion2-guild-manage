"use client";


import { useT } from "@/lib/i18n";
import { useIsLeader, useMe } from "@/lib/auth/me-store";
import { useMemo, useState } from "react";
import { Check, CircleAlert, ImageDown, LayoutGrid, LayoutList, RotateCcw, Swords, X } from "lucide-react";
import { SectionPanel } from "@/components/aion/section-panel";
import { aionButtonDanger, aionButtonPrimary, aionButtonSecondary, aionDialog, aionField } from "@/components/aion/styles";
import { PageHeader } from "@/components/layout/page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toPartyMember } from "@/lib/roster/party-adapter";
import { loadRoster, useRoster } from "@/lib/roster/roster-store";
import { analyzeParty } from "@/lib/party/analysis";
import type { ExportData } from "@/lib/party/export-png";
import {
  applyAssignments,
  assignSlot,
  clearMissingMembers,
  clearPartyError,
  clearSlot,
  describePlacements,
  moveSlot,
  loadParties,
  placementsElsewhere,
  renamePreset,
  resetPartySlots,
  setPartyContentType,
  setPartyDungeon,
  setPartySize,
  setSlotRole,
  slotsLostBySize,
  usePartyState,
} from "@/lib/party/party-store";
import { DUNGEON_NAME_MAX, PARTY_CONTENT_TYPES, PARTY_SIZE_OPTIONS, type PartyContentType } from "@/lib/party/types";
import { NativeSelect } from "@/components/ui/native-select";
import { suggestFill, type Suggestion } from "@/lib/party/suggest";
import type { PartyView } from "@/lib/settings/settings-store";
import { useSettings } from "@/lib/settings/settings-store";
import { cn } from "@/lib/utils";
import { CharacterPickerDialog, type PickerTarget } from "./character-picker-dialog";
import { ExportDialog } from "./export-dialog";
import { PartyAnalysisPanel } from "./party-analysis-panel";
import { PartySlotView } from "./party-slot";
import { PresetToolbar } from "./preset-toolbar";
import { SuggestionsPanel } from "./suggestions-panel";
import { useSlotDrag } from "./use-slot-drag";

type Notice = { tone: "ok" | "warn" | "error"; text: string; id: number };

export function PartyBuilder() {
  const t = useT();
  // Real, persisted guild roster (Supabase via /api/roster).
  const rosterState = useRoster();
  const roster = useMemo(() => rosterState.members.map(toPartyMember), [rosterState.members]);
  const rosterReady = rosterState.status === "ready";
  const { presets, activeId, status: partyStatus, error: partyError } = usePartyState();
  const partiesReady = partyStatus === "ready";
  // Guild Members can view parties and export PNGs; editing is leader-only (server-enforced).
  const isLeader = useIsLeader();
  const meReady = useMe().status === "ready";
  const readOnly = !isLeader;
  const { guild, prefs } = useSettings();
  const preset = presets.find((p) => p.id === activeId) ?? presets[0];

  const [viewOverride, setViewOverride] = useState<PartyView | null>(null);
  const view = viewOverride ?? prefs.partyView;
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [suggestions, setSuggestions] = useState<{ presetId: string; items: Suggestion[] } | null>(null);
  const [editingName, setEditingName] = useState<{ presetId: string; value: string } | null>(null);
  const [editingDungeon, setEditingDungeon] = useState<{ presetId: string; value: string; initial: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  /** Pending shrink that would remove assigned characters (needs confirmation). */
  const [pendingSize, setPendingSize] = useState<{ presetId: string; size: number; lost: number[] } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const byId = useMemo(() => new Map(roster.map((m) => [m.id, m])), [roster]);
  const analysis = useMemo(() => analyzeParty(preset, byId), [preset, byId]);
  const dupSet = new Set(analysis.duplicateIds);
  // Characters that are also planned in other presets (warning only).
  const elsewhere = useMemo(() => placementsElsewhere(presets, preset.id), [presets, preset.id]);
  const activeSuggestions = suggestions?.presetId === preset.id ? suggestions.items : null;

  const say = (text: string, tone: Notice["tone"] = "ok") => setNotice({ text, tone, id: Date.now() });
  const size = preset.slots.length;

  const { drag, onPointerDown: onSlotPointerDown } = useSlotDrag({
    enabled: !readOnly && !picker,
    onDrop: (from, to) => {
      const a = preset.slots[from];
      const b = preset.slots[to];
      if (!a || !b) return;
      moveSlot(preset.id, from, to);
      setSuggestions(null);
      const nameOf = (id: string | null) => (id ? (byId.get(id)?.character_name ?? t("Character")) : null);
      const first = nameOf(a.member_id);
      const second = nameOf(b.member_id);
      if (first && second) say(t("Swapped {a} (slot {from}) with {b} (slot {to}).", { a: first, b: second, from: from + 1, to: to + 1 }));
      else if (first) say(t("{name} moved to slot {slot}.", { name: first, slot: to + 1 }));
      else if (second) say(t("{name} moved to slot {slot}.", { name: second, slot: from + 1 }));
    },
  });
  const dragName = drag ? (preset.slots[drag.from]?.member_id ? byId.get(preset.slots[drag.from].member_id!)?.character_name : null) : null;

  function applySize(n: number) {
    setPartySize(preset.id, n);
    setSuggestions(null);
    say(t("Party size set to {n} members.", { n }));
  }

  function requestSize(n: number) {
    if (n === size) return;
    const lost = slotsLostBySize(preset, n);
    if (lost.length) setPendingSize({ presetId: preset.id, size: n, lost });
    else applySize(n);
  }

  const exportData: Omit<ExportData, "generatedAt"> = {
    partyName: preset.name,
    contentType: preset.content_type ?? null,
    dungeonName: preset.dungeon_name ?? null,
    guildName: guild.name,
    server: guild.server,
    slots: preset.slots.map((s, index) => {
      const m = s.member_id ? byId.get(s.member_id) : undefined;
      return {
        index,
        name: m?.character_name ?? null,
        className: m?.class_name ?? null,
        level: m?.level ?? null,
        role: s.role,
        cp: m?.combat_power ?? null,
        itemLevel: m?.item_level ?? null,
        portraitUrl: m?.profile_image ? `/api/roster/members/${encodeURIComponent(m.id)}/portrait` : null,
      };
    }),
    totalCp: analysis.totalCp,
    averageCp: analysis.averageCp,
    averageItemLevel: analysis.averageItemLevel,
  };

  function commitName() {
    if (!editingName) return;
    const v = editingName.value.trim();
    if (v && v !== preset.name) {
      renamePreset(editingName.presetId, v);
      say(t("Renamed to “{name}”.", { name: v.slice(0, 40) }));
    }
    setEditingName(null);
  }

  function commitDungeon() {
    if (!editingDungeon) return;
    const v = editingDungeon.value.trim();
    // Compare with the value at focus time: a reload may have brought in a newer one since.
    if (!readOnly && v !== editingDungeon.initial) setPartyDungeon(editingDungeon.presetId, v || null);
    setEditingDungeon(null);
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow={`${guild.name} · Raid Planning`}
        title={t("Party Builder")}
        description={t("Compose parties of 2–10 members from the guild roster and save them as presets.")}
        actions={
          <Button type="button" onClick={() => setExportOpen(true)} className={cn(aionButtonPrimary, "h-10 px-4")}>
            <ImageDown className="size-4" />
            {t("Export PNG")}</Button>
        }
      />

      <div className="mb-4 border border-steel/12 bg-surface-raised/70 p-4 sm:mb-6">
        <PresetToolbar
          presets={presets}
          active={preset}
          onRenameRequest={() => {
            setEditingName({ presetId: preset.id, value: preset.name });
            const el = document.getElementById("party-name") as HTMLInputElement | null;
            el?.focus();
            el?.select();
          }}
          onNotice={(msg) => say(msg)}
          readOnly={readOnly}
        />
        {meReady && readOnly && (
          <p data-testid="read-only-notice" className="mt-3 text-xs text-info-text">{t("Read-only view. Only the Guild Leader can change parties. You can still view presets and export PNGs.")}</p>
        )}
      </div>

      <div aria-live="polite" className="empty:hidden">
        {notice && (
          <div
            key={notice.id}
            className={cn(
              "aion-enter mb-4 flex items-center gap-2.5 border border-l-2 px-3 py-2 text-sm",
              notice.tone === "ok" && "border-success/25 border-l-success bg-success/[0.07] text-success-text",
              notice.tone === "warn" && "border-warning/35 border-l-warning bg-warning/[0.07] text-warning-text",
              notice.tone === "error" && "border-destructive/40 border-l-destructive bg-destructive/10 text-danger-text",
            )}
            data-testid="party-notice"
            data-tone={notice.tone}
          >
            {notice.tone === "ok" ? <Check className="size-4 shrink-0" /> : <CircleAlert className="size-4 shrink-0" />}
            <span className="flex-1">{notice.text}</span>
            <button type="button" aria-label={t("Dismiss")} onClick={() => setNotice(null)} className="opacity-70 hover:opacity-100">
              <X className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {partyError && partiesReady && (
        <p role="alert" data-testid="party-sync-error" className="mb-4 flex items-center gap-2 border border-destructive/40 border-l-2 border-l-destructive bg-destructive/10 px-3 py-2 text-sm text-danger-text">
          <CircleAlert className="size-4 shrink-0" />
          <span className="flex-1">{partyError} {" "}{t("The latest saved presets were re-loaded from the server.")}</span>
          <button type="button" aria-label={t("Dismiss")} onClick={clearPartyError} className="opacity-70 hover:opacity-100">
            <X className="size-3.5" />
          </button>
        </p>
      )}

      {/* Wait for the persisted roster AND the shared presets before analysing
          slots, so saved assignments are never flagged as "removed" while loading. */}
      {!rosterReady || !partiesReady ? (
        <div className="border border-steel/12 bg-surface-raised/70 px-4 py-10 text-center" data-testid="roster-gate">
          {rosterState.status === "error" || partyStatus === "error" ? (
            <div className="space-y-3">
              <p className="text-sm text-danger-text">
                {rosterState.status === "error" ? t("Could not load the guild roster: {msg}", { msg: rosterState.error }) : t("Could not load party presets: {msg}", { msg: partyError })}
              </p>
              <Button
                type="button"
                variant="outline"
                className={aionButtonSecondary}
                onClick={() => { if (rosterState.status === "error") void loadRoster(); if (partyStatus === "error") void loadParties(); }}
              >
                <RotateCcw className="size-3.5" /> {" "}{t("Retry")}</Button>
            </div>
          ) : (
            <p className="text-sm text-steel">{rosterReady ? t("Loading party presets…") : t("Loading guild roster…")}</p>
          )}
        </div>
      ) : (
      <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <SectionPanel
          title={preset.name}
          description={t("{n} / {size} slots filled", { n: analysis.filled.length + analysis.missingSlots.length, size })}
          icon={Swords}
          action={
            <div role="radiogroup" aria-label={t("Party view")} className="flex shrink-0 border border-steel/15">
              {(
                [
                  ["cards", "Cards", LayoutGrid],
                  ["list", "List", LayoutList],
                ] as const
              ).map(([k, label, Icon]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={view === k}
                  onClick={() => setViewOverride(k)}
                  className={cn("flex items-center gap-1.5 px-2.5 py-1 text-xs", view === k ? "bg-brand/15 text-brand-strong" : "text-steel hover:text-foreground")}
                >
                  <Icon className="size-3.5" />
                  <span className="hidden sm:inline">{t(label)}</span>
                </button>
              ))}
            </div>
          }
        >
          {/* Name editing + reset */}
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1">
              <label htmlFor="party-name" className="mb-1.5 block text-3xs font-semibold tracking-[0.18em] text-subtle uppercase">
                {t("Party name")}</label>
              <Input
                id="party-name"
                maxLength={40}
                readOnly={readOnly}
                value={editingName?.presetId === preset.id ? editingName.value : preset.name}
                onFocus={() => !editingName && setEditingName({ presetId: preset.id, value: preset.name })}
                onChange={(e) => setEditingName({ presetId: preset.id, value: e.target.value })}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitName();
                  }
                  if (e.key === "Escape") setEditingName(null);
                }}
                className={aionField}
              />
            </div>
            <div className="w-36 shrink-0">
              <label htmlFor="party-size" className="mb-1.5 block text-3xs font-semibold tracking-[0.18em] text-subtle uppercase">
                {t("Party size")}</label>
              <NativeSelect
                id="party-size"
                value={size}
                disabled={readOnly}
                onChange={(e) => requestSize(Number(e.target.value))}
                className={aionField}
              >
                {PARTY_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {t("{n} members", { n })}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {!readOnly && analysis.missingSlots.length > 0 && (
              <Button
                type="button"
                variant="outline"
                className={aionButtonSecondary}
                onClick={() => {
                  clearMissingMembers(preset.id, new Set(byId.keys()));
                  say(t("Cleared characters that are no longer in the roster."));
                }}
              >
                {t("Clear removed")}</Button>
            )}
            {!readOnly && (
            <Button type="button" variant="outline" className={aionButtonSecondary} onClick={() => setConfirmReset(true)}>
              <RotateCcw className="size-3.5" /> {" "}{t("Reset Party")}</Button>
            )}
          </div>

          {/* Content category + dungeon name (independent of each other) */}
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1">
              <label htmlFor="party-type" className="mb-1.5 block text-3xs font-semibold tracking-[0.18em] text-subtle uppercase">
                {t("Type")}</label>
              <NativeSelect
                id="party-type"
                value={preset.content_type ?? ""}
                disabled={readOnly}
                onChange={(e) => setPartyContentType(preset.id, (e.target.value || null) as PartyContentType | null)}
                className={aionField}
              >
                <option value="">{t("Not set")}</option>
                {PARTY_CONTENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(type)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="min-w-[12rem] flex-1">
              <label htmlFor="party-dungeon" className="mb-1.5 block text-3xs font-semibold tracking-[0.18em] text-subtle uppercase">
                {t("Dungeon")}</label>
              <Input
                id="party-dungeon"
                maxLength={DUNGEON_NAME_MAX}
                readOnly={readOnly}
                value={editingDungeon?.presetId === preset.id ? editingDungeon.value : (preset.dungeon_name ?? "")}
                onFocus={() => !editingDungeon && setEditingDungeon({ presetId: preset.id, value: preset.dungeon_name ?? "", initial: preset.dungeon_name ?? "" })}
                onChange={(e) => setEditingDungeon({ presetId: preset.id, value: e.target.value, initial: editingDungeon?.presetId === preset.id ? editingDungeon.initial : (preset.dungeon_name ?? "") })}
                onBlur={commitDungeon}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitDungeon();
                  }
                  if (e.key === "Escape") setEditingDungeon(null);
                }}
                className={aionField}
              />
            </div>
          </div>

          <ol
            data-testid="party-slots"
            className={cn("grid gap-2.5", view === "cards" ? "sm:grid-cols-2" : "grid-cols-1")}
            aria-label={t("Party slots")}
          >
            {preset.slots.map((s, i) => (
              <li key={i}>
                <PartySlotView
                  readOnly={readOnly}
                  index={i}
                  slot={s}
                  member={s.member_id ? byId.get(s.member_id) : undefined}
                  duplicate={!!s.member_id && dupSet.has(s.member_id)}
                  elsewhere={s.member_id ? elsewhere.get(s.member_id) : undefined}
                  view={view}
                  onDragPointerDown={(e) => onSlotPointerDown(e, i)}
                  dragRole={
                    !drag ? undefined
                    : drag.from === i ? "source"
                    : drag.over === i ? (s.member_id ? "swap" : "move")
                    : undefined
                  }
                  onAssign={() => setPicker({ index: i, current: s })}
                  onRemove={() => {
                    const name = s.member_id ? byId.get(s.member_id)?.character_name : null;
                    clearSlot(preset.id, i);
                    say(t("{name} removed from slot {slot}.", { name: name ?? t("Character"), slot: i + 1 }));
                  }}
                  onRole={(role) => setSlotRole(preset.id, i, role)}
                />
              </li>
            ))}
          </ol>
          {drag && (
            <div
              aria-hidden
              data-testid="drag-ghost"
              className="pointer-events-none fixed z-50 border border-brand/60 bg-surface-raised px-3 py-1.5 text-xs font-semibold text-brand-strong shadow-lg"
              style={{ left: drag.x + 12, top: drag.y + 12 }}
            >
              {dragName ?? t("Empty slot")} · {drag.from + 1}{drag.over !== null && drag.over !== drag.from ? ` → ${drag.over + 1}` : ""}
            </div>
          )}
        </SectionPanel>

        <div className="space-y-4 sm:space-y-6">
          <PartyAnalysisPanel analysis={analysis} />
          {!readOnly && (
          <SuggestionsPanel
            key={preset.id}
            size={size}
            emptyCount={analysis.emptyCount}
            suggestions={activeSuggestions}
            onGenerate={() => setSuggestions({ presetId: preset.id, items: suggestFill(preset, roster) })}
            onDismiss={() => setSuggestions(null)}
            onAccept={(items) => {
              applyAssignments(preset.id, items.map((s) => ({ index: s.index, memberId: s.member.id, role: s.role })));
              setSuggestions(null);
              const also = items.filter((s) => elsewhere.has(s.member.id)).map((s) => s.member.character_name);
              say(
                t("Applied {n} suggestions.", { n: items.length }) + (also.length ? " " + t("Already in another preset: {list}.", { list: also.join(", ") }) : ""),
                also.length ? "warn" : "ok",
              );
            }}
          />
          )}
        </div>
      </div>
      )}

      <CharacterPickerDialog
        target={picker}
        roster={roster}
        slots={preset.slots}
        elsewhere={elsewhere}
        onClose={() => setPicker(null)}
        onAssign={(member, role) => {
          if (!picker) return;
          const r = assignSlot(preset.id, picker.index, member.id, role);
          if (r.ok) {
            const other = elsewhere.get(member.id);
            if (other?.length)
              say(t("{name} assigned to slot {slot} — note: this player is also in {list}.", { name: member.character_name, slot: picker.index + 1, list: describePlacements(other) }), "warn");
            else say(t("{name} assigned to slot {slot}.", { name: member.character_name, slot: picker.index + 1 }));
            setPicker(null);
          } else say(r.error, "error");
        }}
      />

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent className={cn(aionDialog, "border-destructive/40")}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-base tracking-[0.1em] text-foreground uppercase">{t("Reset Party")}</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-steel">
              {t("Empty all")}{" "}{size} {" "}{t("slots of")}{" "}<span className="font-semibold text-foreground">{preset.name}</span>{t("? The preset and its size are kept.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={cn(buttonVariants({ variant: "outline" }), aionButtonSecondary)}>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants(), aionButtonDanger)}
              onClick={() => {
                resetPartySlots(preset.id);
                say("Party reset — all slots are empty.");
              }}
            >
              {t("Reset")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingSize !== null} onOpenChange={(o) => !o && setPendingSize(null)}>
        <AlertDialogContent className={cn(aionDialog, "border-destructive/40")}>
          {pendingSize && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="font-heading text-base tracking-[0.1em] text-foreground uppercase">
                  {t("Reduce Party Size")}</AlertDialogTitle>
                <AlertDialogDescription className="text-sm text-steel">
                  {t("Shrinking to")}{" "}{pendingSize.size} {" "}{t("members removes slots")}{" "}{pendingSize.size + 1}–{size}{t(". These assigned characters will be taken out of the party (they stay in the roster):")}</AlertDialogDescription>
              </AlertDialogHeader>
              <ul className="space-y-1 text-sm" data-testid="size-lost">
                {pendingSize.lost.map((i) => {
                  const id = preset.slots[i]?.member_id;
                  return (
                    <li key={i} className="flex items-center gap-2 border border-steel/12 bg-surface/50 px-2.5 py-1.5">
                      <span className="text-xs text-steel tabular-nums">{t("Slot")}{" "}{i + 1}</span>
                      <span className="font-medium text-foreground">
                        {(id && byId.get(id)?.character_name) ?? t("Removed character")}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <AlertDialogFooter>
                <AlertDialogCancel className={cn(buttonVariants({ variant: "outline" }), aionButtonSecondary)}>{t("Cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  className={cn(buttonVariants(), aionButtonDanger)}
                  onClick={() => {
                    if (pendingSize.presetId === preset.id) applySize(pendingSize.size);
                  }}
                >
                  {t("Reduce to")}{" "}{pendingSize.size}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} data={exportData} />
    </div>
  );
}
