"use client";


import { useT } from "@/lib/i18n";
import { useMemo, useState } from "react";
import { CircleAlert, MessageSquareText, RotateCcw, Search, UserCheck, UserPlus } from "lucide-react";
import { RosterClassBadge } from "@/components/roster/roster-class-badge";
import { aionButtonPrimary, aionButtonSecondary, aionDialog, aionField } from "@/components/aion/styles";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { formatNumber } from "@/lib/format";
import { UNKNOWN_CLASS } from "@/lib/party/analysis";
import { suggestedRole } from "@/lib/roster/party-adapter";
import { describePlacements, type PresetPlacement } from "@/lib/party/party-store";
import { PARTY_ROLES, type PartyMember, type PartyRole, type PartySlot } from "@/lib/party/types";
import { cn } from "@/lib/utils";
import { RoleBadge } from "./role-badge";

const labelClass = "text-3xs font-semibold tracking-[0.18em] text-subtle uppercase";

type RangeKey = "minCp" | "maxCp" | "minIl" | "maxIl";
const EMPTY_RANGE: Record<RangeKey, string> = { minCp: "", maxCp: "", minIl: "", maxIl: "" };
const RANGE_FIELDS: { key: RangeKey; label: string; placeholder: string }[] = [
  { key: "minCp", label: "Min CP", placeholder: "0" },
  { key: "maxCp", label: "Max CP", placeholder: "Any" },
  { key: "minIl", label: "Min Item Lv.", placeholder: "0" },
  { key: "maxIl", label: "Max Item Lv.", placeholder: "Any" },
];

/** Empty field = no bound. */
function parseBound(raw: string): number | null {
  return raw === "" ? null : Number(raw);
}

export interface PickerTarget {
  index: number;
  current: PartySlot;
}

export function CharacterPickerDialog({
  target,
  roster,
  slots,
  elsewhere,
  onClose,
  onAssign,
}: {
  target: PickerTarget | null;
  roster: PartyMember[];
  slots: PartySlot[];
  /** Other presets each character is already assigned to (warning only). */
  elsewhere: Map<string, PresetPlacement[]>;
  onClose: () => void;
  onAssign: (member: PartyMember, role: PartyRole | null) => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn(aionDialog, "max-w-3xl gap-4")}>
        {target && <Picker target={target} roster={roster} slots={slots} elsewhere={elsewhere} onAssign={onAssign} />}
      </DialogContent>
    </Dialog>
  );
}

function Picker({
  target,
  roster,
  slots,
  elsewhere,
  onAssign,
}: {
  target: PickerTarget;
  roster: PartyMember[];
  slots: PartySlot[];
  elsewhere: Map<string, PresetPlacement[]>;
  onAssign: (member: PartyMember, role: PartyRole | null) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [commentQuery, setCommentQuery] = useState("");
  const [cls, setCls] = useState<string>("all");
  const [role, setRole] = useState<PartyRole | "all">(target.current.role ?? "all");
  const [sort, setSort] = useState<"cp" | "il">("cp");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Optional range filters (raw digit strings so fields can be empty).
  const [range, setRange] = useState<Record<RangeKey, string>>(EMPTY_RANGE);
  const bounds = {
    minCp: parseBound(range.minCp),
    maxCp: parseBound(range.maxCp),
    minIl: parseBound(range.minIl),
    maxIl: parseBound(range.maxIl),
  };
  const cpInvalid = bounds.minCp !== null && bounds.maxCp !== null && bounds.minCp > bounds.maxCp;
  const ilInvalid = bounds.minIl !== null && bounds.maxIl !== null && bounds.minIl > bounds.maxIl;
  const rangeInvalid = cpInvalid || ilInvalid;
  const filtersActive =
    query.trim() !== "" ||
    commentQuery.trim() !== "" ||
    cls !== "all" || role !== "all" || Object.values(range).some((v) => v !== "");

  function clearFilters() {
    setQuery("");
    setCommentQuery("");
    setCls("all");
    setRole("all");
    setRange(EMPTY_RANGE);
  }

  const slotOf = useMemo(() => {
    const m = new Map<string, number>();
    slots.forEach((s, i) => s.member_id && m.set(s.member_id, i));
    return m;
  }, [slots]);

  const { minCp, maxCp, minIl, maxIl } = bounds;
  // Class options come from the real roster (API class names).
  const classOptions = useMemo(
    () => [...new Set(roster.map((m) => m.class_name ?? UNKNOWN_CLASS))].sort((a, b) => a.localeCompare(b)),
    [roster],
  );
  // A bound only matches members whose value is known.
  const inRange = (v: number | null, min: number | null, max: number | null) =>
    (min === null && max === null) || (v !== null && (min === null || v >= min) && (max === null || v <= max));
  const list = useMemo(() => {
    // An invalid range (min > max) matches nothing; the form shows why.
    if (rangeInvalid) return [];
    const q = query.trim().toLowerCase();
    const cq = commentQuery.trim().toLowerCase();
    return roster
      .filter(
        (m) =>
          (!q || m.character_name.toLowerCase().includes(q)) &&
          (!cq || m.comment.toLowerCase().includes(cq)) &&
          (cls === "all" || (m.class_name ?? UNKNOWN_CLASS) === cls) &&
          (role === "all" || suggestedRole(m) === role) &&
          inRange(m.combat_power, minCp, maxCp) &&
          inRange(m.item_level, minIl, maxIl),
      )
      .sort((a, b) => {
        const cp = (b.combat_power ?? -1) - (a.combat_power ?? -1);
        const il = (b.item_level ?? -1) - (a.item_level ?? -1);
        return sort === "cp" ? cp || il : il || cp;
      });
  }, [roster, query, commentQuery, cls, role, sort, minCp, maxCp, minIl, maxIl, rangeInvalid]);

  const selected = roster.find((m) => m.id === selectedId) ?? null;
  const selectedSlot = selected ? slotOf.get(selected.id) : undefined;
  const blocked = selected !== null && selectedSlot !== undefined && selectedSlot !== target.index;
  const assignRole = target.current.role ?? (selected ? suggestedRole(selected) : null);
  const selectedElsewhere = selected ? (elsewhere.get(selected.id) ?? []) : [];

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 font-heading text-base tracking-[0.12em] text-brand-strong uppercase">
          <UserPlus className="size-4 text-brand" />
          {target.current.member_id ? t("Replace") : t("Assign")} {" "}{t("— Slot")}{" "}{target.index + 1}
        </DialogTitle>
        <DialogDescription className="text-xs text-steel">
          {t("Characters already in this party are marked and cannot be added twice. Characters in another preset are flagged.")}</DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="pk-q" className={labelClass}>{t("Search")}</Label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
            <Input id="pk-q" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Character name…")} className={cn(aionField, "pl-8")} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pk-comment" className={labelClass}>{t("Comment")}</Label>
          <div className="relative">
            <MessageSquareText aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
            <Input id="pk-comment" value={commentQuery} onChange={(e) => setCommentQuery(e.target.value)} placeholder={t("Search comments…")} className={cn(aionField, "pl-8")} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pk-class" className={labelClass}>{t("Class")}</Label>
          <NativeSelect id="pk-class" value={cls} onChange={(e) => setCls(e.target.value)} className={aionField}>
            <option value="all">{t("All classes")}</option>
            {classOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pk-role" className={labelClass}>{t("Role")}</Label>
          <NativeSelect id="pk-role" value={role} onChange={(e) => setRole(e.target.value as PartyRole | "all")} className={aionField}>
            <option value="all">{t("All roles")}</option>
            {PARTY_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </NativeSelect>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {RANGE_FIELDS.map(({ key, label, placeholder }) => {
          const invalid = key.endsWith("Cp") ? cpInvalid : ilInvalid;
          return (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`pk-${key}`} className={labelClass}>{t(label)}</Label>
              <Input
                id={`pk-${key}`}
                inputMode="numeric"
                placeholder={t(placeholder)}
                value={range[key]}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? "pk-range-error" : undefined}
                onChange={(e) => setRange((r) => ({ ...r, [key]: e.target.value.replace(/[^\d]/g, "").slice(0, 6) }))}
                className={cn(aionField, "tabular-nums")}
              />
            </div>
          );
        })}
      </div>
      {rangeInvalid && (
        <p id="pk-range-error" role="alert" className="-mt-1 text-xs text-danger-text">
          {[cpInvalid && t("Min CP is greater than Max CP"), ilInvalid && t("Min Item Level is greater than Max Item Level")]
            .filter(Boolean)
            .join(" · ")}
          {t(". Adjust the range to see results.")}</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-steel">
        <div className="flex items-center gap-3">
          <span aria-live="polite">{list.length} characters</span>
          <Button
            type="button"
            variant="outline"
            onClick={clearFilters}
            disabled={!filtersActive}
            className={cn(aionButtonSecondary, "h-8")}
          >
            <RotateCcw className="size-3.5" />
            {t("Clear Filters")}</Button>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="pk-sort" className={labelClass}>{t("Sort")}</Label>
          <NativeSelect id="pk-sort" value={sort} onChange={(e) => setSort(e.target.value as "cp" | "il")} className={cn(aionField, "h-8 text-xs")} wrapperClassName="w-36">
            <option value="cp">{t("Combat Power")}</option>
            <option value="il">{t("Item Level")}</option>
          </NativeSelect>
        </div>
      </div>
      <p className="-mt-2 text-3xs text-subtle">{t("Role filter uses each member's guild role (set on the Members page); you can assign any role per party.")}</p>

      <div className="grid min-h-0 gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <ul className="max-h-80 divide-y divide-steel/[0.07] overflow-y-auto border border-steel/10" role="listbox" aria-label={t("Characters")}>
          {list.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-steel">
              {rangeInvalid ? t("Fix the range filters to see characters.") : t("No characters match.")}
            </li>
          )}
          {list.map((m) => {
            const inSlot = slotOf.get(m.id);
            const here = inSlot === target.index;
            const other = elsewhere.get(m.id) ?? [];
            return (
              <li key={m.id} role="option" aria-selected={m.id === selectedId}>
                <button
                  type="button"
                  onClick={() => setSelectedId(m.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors outline-none hover:bg-surface-hover focus-visible:bg-arcane/[0.08]",
                    m.id === selectedId && "bg-brand/[0.08] shadow-[inset_2px_0_0_var(--brand)]",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {m.character_name}
                      {m.comment && <span className="ml-1.5 text-xs font-normal text-subtle italic">· {m.comment}</span>}
                    </span>
                    <RosterClassBadge className={m.class_name} wrapperClassName="text-2xs" />
                    {other.length > 0 && (
                      <span
                        data-testid="picker-elsewhere-badge"
                        title={t("Also in: {list}", { list: describePlacements(other) })}
                        className="mt-0.5 flex max-w-full items-center gap-1 truncate text-3xs text-warning-text"
                      >
                        <CircleAlert aria-hidden className="size-3 shrink-0" />
                        {t("In")}{" "}{other[0].presetName}
                        {other.length > 1 ? ` +${other.length - 1}` : ""}
                      </span>
                    )}
                  </span>
                  <span className="text-right text-xs tabular-nums">
                    <span className="block font-semibold text-brand-strong">{m.combat_power !== null ? formatNumber(m.combat_power) : "—"}</span>
                    <span className="block text-subtle">iLv {m.item_level ?? "—"}</span>
                  </span>
                  {inSlot !== undefined && (
                    <span className={cn("shrink-0 border px-1 text-5xs font-semibold tracking-wider uppercase", here ? "border-brand/50 text-brand" : "border-steel/30 text-steel")}>
                      {here ? t("This slot") : `Slot ${inSlot + 1}`}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {/* Overview */}
        <div className="border border-steel/10 bg-surface/50 p-3">
          {!selected ? (
            <p className="py-10 text-center text-sm text-steel">{t("Select a character to see an overview.")}</p>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="font-heading text-lg tracking-wide text-brand-strong">{selected.character_name}</p>
                <p className="text-xs text-steel">{selected.server_name ?? "—"} {" "}{t("· Lv.")}{" "}{selected.level ?? "—"}</p>
                {selected.comment && <p className="mt-0.5 text-xs text-foreground/80 italic">“{selected.comment}”</p>}
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <RosterClassBadge className={selected.class_name} withIcon />
                  <RoleBadge role={assignRole} />
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs tabular-nums">
                {[
                  ["Combat Power", selected.combat_power !== null ? formatNumber(selected.combat_power) : "—"],
                  ["Item Level", selected.item_level !== null ? String(selected.item_level) : "—"],
                  ["Level", selected.level !== null ? String(selected.level) : "—"],
                  ["Guild Role", selected.role ?? t("Not set")],
                ].map(([k, v]) => (
                  <div key={k} className="border border-steel/10 px-2 py-1.5">
                    <dt className="text-4xs tracking-[0.14em] text-subtle uppercase">{t(k)}</dt>
                    <dd className="font-semibold text-foreground">{v}</dd>
                  </div>
                ))}
              </dl>
              {selectedElsewhere.length > 0 && (
                <p
                  role="status"
                  data-testid="picker-elsewhere"
                  className="flex items-start gap-2 border border-warning/35 border-l-2 border-l-warning bg-warning/[0.07] px-2.5 py-2 text-xs text-warning-text"
                >
                  <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    {selected.character_name} {" "}{t("is already in another preset:")}{" "}<span className="font-semibold">{describePlacements(selectedElsewhere)}</span>{t(". Make sure you are not planning the same player twice.")}</span>
                </p>
              )}
              {blocked && (
                <p className="text-xs text-danger-text">{t("Already assigned to slot")}{" "}{selectedSlot! + 1}{t(". Remove it there first.")}</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-steel/10 pt-4 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button type="button" variant="outline" className={aionButtonSecondary}>{t("Cancel")}</Button>
        </DialogClose>
        <Button
          type="button"
          disabled={!selected || blocked || selectedSlot === target.index}
          onClick={() => selected && onAssign(selected, assignRole)}
          className={aionButtonPrimary}
        >
          <UserCheck className="size-3.5" />
          {t("Assign to Slot")}{" "}{target.index + 1}
        </Button>
      </div>
    </>
  );
}
