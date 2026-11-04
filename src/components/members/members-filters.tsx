"use client";

import { RotateCcw, Search, X } from "lucide-react";
import { aionButtonSecondary, aionField } from "@/components/aion/styles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { SERVERS, type ServerName } from "@/data/mock/servers";
import { AION_CLASSES, type AionClass } from "@/lib/aion/classes";
import {
  getCpBounds,
  hasActiveFilters,
  SORT_LABELS,
  type MemberFilters,
  type SortDir,
  type SortKey,
} from "@/lib/members/filter-members";
import { cn } from "@/lib/utils";

const labelClass =
  "text-3xs font-semibold tracking-[0.18em] text-subtle uppercase";

const SORT_OPTIONS: { value: `${SortKey}:${SortDir}`; label: string }[] = (
  ["combat_power", "item_level", "level"] as SortKey[]
).flatMap((key) => [
  { value: `${key}:desc` as const, label: `${SORT_LABELS[key]}: High → Low` },
  { value: `${key}:asc` as const, label: `${SORT_LABELS[key]}: Low → High` },
]);

export function MembersFilters({
  filters,
  onChange,
  onReset,
  resultCount,
  totalCount,
  defaults,
}: {
  filters: MemberFilters;
  onChange: (patch: Partial<MemberFilters>) => void;
  onReset: () => void;
  resultCount: number;
  totalCount: number;
  /** Filters considered "unchanged" (includes the preferred sort). */
  defaults?: MemberFilters;
}) {
  const { min, max } = getCpBounds(filters);
  const rangeInvalid = min !== null && max !== null && min > max;
  const active = hasActiveFilters(filters, defaults);

  const cpInput = (key: "minCp" | "maxCp", label: string, placeholder: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`f-${key}`} className={labelClass}>
        {label}
      </Label>
      <Input
        id={`f-${key}`}
        inputMode="numeric"
        placeholder={placeholder}
        value={filters[key]}
        aria-invalid={rangeInvalid || undefined}
        onChange={(e) => onChange({ [key]: e.target.value.replace(/[^\d]/g, "") })}
        className={cn(aionField, "tabular-nums")}
      />
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-[minmax(12rem,1.6fr)_1fr_1fr_0.8fr_0.8fr_1.4fr]">
        {/* Search */}
        <div className="col-span-2 space-y-1.5 md:col-span-4 xl:col-span-1">
          <Label htmlFor="f-query" className={labelClass}>
            Search
          </Label>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle"
            />
            <Input
              id="f-query"
              type="search"
              placeholder="Character name…"
              value={filters.query}
              onChange={(e) => onChange({ query: e.target.value })}
              className={cn(aionField, "pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden")}
            />
            {filters.query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => onChange({ query: "" })}
                className="absolute top-1/2 right-2 -translate-y-1/2 p-0.5 text-subtle hover:text-brand-strong"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="f-class" className={labelClass}>
            Class
          </Label>
          <NativeSelect
            id="f-class"
            value={filters.cls}
            onChange={(e) => onChange({ cls: e.target.value as AionClass | "all" })}
            className={aionField}
          >
            <option value="all">All classes</option>
            {AION_CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="f-server" className={labelClass}>
            Server
          </Label>
          <NativeSelect
            id="f-server"
            value={filters.server}
            onChange={(e) => onChange({ server: e.target.value as ServerName | "all" })}
            className={aionField}
          >
            <option value="all">All servers</option>
            {SERVERS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>
        </div>

        {cpInput("minCp", "Min CP", "0")}
        {cpInput("maxCp", "Max CP", "Any")}

        <div className="col-span-2 space-y-1.5 md:col-span-4 xl:col-span-1">
          <Label htmlFor="f-sort" className={labelClass}>
            Sort by
          </Label>
          <NativeSelect
            id="f-sort"
            value={`${filters.sortKey}:${filters.sortDir}`}
            onChange={(e) => {
              const [sortKey, sortDir] = e.target.value.split(":") as [SortKey, SortDir];
              onChange({ sortKey, sortDir });
            }}
            className={aionField}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-steel" aria-live="polite">
          Showing{" "}
          <span className="font-semibold text-foreground tabular-nums">{resultCount}</span> of{" "}
          <span className="tabular-nums">{totalCount}</span> members
          {rangeInvalid && (
            <span className="ml-2 text-danger-text">· Min CP is greater than Max CP</span>
          )}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={onReset}
          disabled={!active}
          className={cn(aionButtonSecondary, "h-8")}
        >
          <RotateCcw className="size-3.5" />
          Reset Filters
        </Button>
      </div>
    </div>
  );
}
