"use client";

import { useId, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Search,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { ClassBadge } from "@/components/aion/class-badge";
import {
  aionButtonPrimary,
  aionButtonSecondary,
  aionDialog,
  aionField,
} from "@/components/aion/styles";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { characterKey, type CharacterData, type GuildMember } from "@/data/mock/members";
import { SERVERS, type ServerName } from "@/data/mock/servers";
import { AION_CLASSES, type AionClass } from "@/lib/aion/classes";
import { formatNumber } from "@/lib/format";
import { addMember, isInRoster } from "@/lib/members/members-store";
import { searchCharacters } from "@/lib/members/mock-character-service";
import { cn } from "@/lib/utils";

const labelClass = "text-3xs font-semibold tracking-[0.18em] text-gold/85 uppercase";

type LookupState =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "done"; results: CharacterData[] };

export function AddMemberDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (member: GuildMember) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(aionDialog, "max-w-xl gap-5")}>
        {/* Remount the form on every open so state starts fresh. */}
        {open && (
          <AddMemberForm
            onAdded={(m) => {
              onAdded(m);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddMemberForm({ onAdded }: { onAdded: (member: GuildMember) => void }) {
  const ids = useId();
  const [name, setName] = useState("");
  // Dialog content mounts on open (client-only), so reading prefs here is hydration-safe.
  const [server, setServer] = useState<ServerName>(SERVERS[0]);
  const [cls, setCls] = useState<AionClass | "">("");
  const [notes, setNotes] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const results = lookup.status === "done" ? lookup.results : [];
  const selected =
    results.find((r) => characterKey(r.character_name, r.server) === selectedKey) ?? null;

  function resetLookup() {
    setLookup({ status: "idle" });
    setSelectedKey(null);
    setAddError(null);
  }

  async function runSearch(e?: FormEvent) {
    e?.preventDefault();
    if (lookup.status === "searching") return;
    if (name.trim().length < 2) {
      setNameError("Enter at least 2 characters of the character name.");
      return;
    }
    setNameError(null);
    setAddError(null);
    setSelectedKey(null);
    setLookup({ status: "searching" });
    const found = await searchCharacters({ name, server, cls: cls || undefined });
    setLookup({ status: "done", results: found });
    // Auto-select a single available match for convenience.
    const available = found.filter((r) => !isInRoster(r.character_name, r.server));
    if (found.length === 1 && available.length === 1) {
      setSelectedKey(characterKey(found[0].character_name, found[0].server));
    }
  }

  function handleAdd() {
    if (!selected) return;
    const result = addMember(selected, notes);
    if (!result.ok) {
      setAddError(result.error);
      return;
    }
    onAdded(result.member);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 font-heading text-base tracking-[0.12em] text-gold-bright uppercase">
          <UserPlus className="size-4 text-gold" />
          Add Member
        </DialogTitle>
        <DialogDescription className="text-xs text-steel">
          Look up a character by name and server, then add them to the roster.
        </DialogDescription>
      </DialogHeader>

      {/* Lookup form */}
      <form onSubmit={runSearch} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor={`${ids}-name`} className={labelClass}>
              Character Name
            </Label>
            <Input
              id={`${ids}-name`}
              autoFocus
              autoComplete="off"
              placeholder="e.g. Kaelith"
              value={name}
              aria-invalid={!!nameError}
              aria-describedby={nameError ? `${ids}-name-err` : undefined}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
                if (lookup.status !== "idle") resetLookup();
              }}
              className={aionField}
            />
            {nameError && (
              <p id={`${ids}-name-err`} className="text-xs text-[#ef9b89]">
                {nameError}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${ids}-server`} className={labelClass}>
              Server
            </Label>
            <NativeSelect
              id={`${ids}-server`}
              value={server}
              onChange={(e) => {
                setServer(e.target.value as ServerName);
                if (lookup.status !== "idle") resetLookup();
              }}
              className={aionField}
            >
              {SERVERS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        <div className="grid items-end gap-4 sm:grid-cols-[1.4fr_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor={`${ids}-class`} className={labelClass}>
              Class <span className="font-normal tracking-normal text-steel/60 normal-case">(optional)</span>
            </Label>
            <NativeSelect
              id={`${ids}-class`}
              value={cls}
              onChange={(e) => {
                setCls(e.target.value as AionClass | "");
                if (lookup.status !== "idle") resetLookup();
              }}
              className={aionField}
            >
              <option value="">Any class</option>
              {AION_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button
            type="submit"
            variant="outline"
            disabled={lookup.status === "searching"}
            className={cn(aionButtonSecondary, "w-full text-foreground")}
          >
            {lookup.status === "searching" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Search className="size-3.5" />
            )}
            {lookup.status === "searching" ? "Searching…" : "Look Up Character"}
          </Button>
        </div>
      </form>

      {/* Results */}
      <div aria-live="polite" className="min-h-0">
        {lookup.status === "searching" && (
          <div className="space-y-2" aria-label="Searching">
            {[0, 1].map((i) => (
              <div key={i} className="h-12 animate-pulse border border-steel/10 bg-steel/[0.04]" />
            ))}
          </div>
        )}
        {lookup.status === "done" && results.length === 0 && (
          <div className="flex items-start gap-2.5 border border-steel/15 bg-ink/60 px-3 py-3 text-sm text-steel">
            <UsersRound className="mt-0.5 size-4 shrink-0 text-steel/60" />
            <span>
              No characters named “{name.trim()}” found on {server}
              {cls && ` with class ${cls}`}.
            </span>
          </div>
        )}
        {lookup.status === "done" && results.length > 0 && (
          <fieldset>
            <legend className={cn(labelClass, "mb-2")}>
              Search Results ({results.length})
            </legend>
            <div className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
              {results.map((r) => {
                const key = characterKey(r.character_name, r.server);
                const inGuild = isInRoster(r.character_name, r.server);
                const isSelected = key === selectedKey;
                return (
                  <label
                    key={key}
                    className={cn(
                      "flex items-center gap-3 border px-3 py-2.5 transition-colors",
                      inGuild
                        ? "cursor-not-allowed border-steel/10 opacity-60"
                        : "cursor-pointer border-steel/15 hover:border-gold-dim/60 hover:bg-gold/[0.03]",
                      isSelected && "border-gold/70 bg-gold/[0.07]",
                    )}
                  >
                    <input
                      type="radio"
                      name={`${ids}-result`}
                      value={key}
                      checked={isSelected}
                      disabled={inGuild}
                      onChange={() => {
                        setSelectedKey(key);
                        setAddError(null);
                      }}
                      className="sr-only"
                    />
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-full border",
                        isSelected ? "border-gold" : "border-steel/40",
                      )}
                    >
                      {isSelected && <span className="size-2 rounded-full bg-gold" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2">
                        <span className="font-medium text-foreground">{r.character_name}</span>
                        <span className="text-2xs text-steel/60">
                          {r.server} · Lv. {r.level}
                        </span>
                      </span>
                      <ClassBadge cls={r.class} className="text-2xs" />
                    </span>
                    <span className="text-right">
                      {inGuild ? (
                        <span className="border border-steel/25 px-1.5 py-0.5 text-4xs tracking-wider text-steel uppercase">
                          Already in guild
                        </span>
                      ) : (
                        <>
                          <span className="block text-sm font-semibold text-gold-bright tabular-nums">
                            {formatNumber(r.combat_power)}
                          </span>
                          <span className="block text-3xs text-steel/60 tabular-nums">
                            iLv {r.item_level}
                          </span>
                        </>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${ids}-notes`} className={labelClass}>
          Notes <span className="font-normal tracking-normal text-steel/60 normal-case">(optional)</span>
        </Label>
        <Textarea
          id={`${ids}-notes`}
          rows={2}
          maxLength={200}
          placeholder="Role preferences, alt of…, recruitment source"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={cn(aionField, "h-auto min-h-16")}
        />
      </div>

      {addError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 border border-destructive/40 border-l-2 border-l-destructive bg-destructive/10 px-3 py-2.5 text-sm text-[#f0b6aa]"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          {addError}
        </div>
      )}

      <DialogFooter className="items-center gap-2 border-t border-steel/10 pt-4 sm:justify-between">
        <p className="text-xs text-steel/70">
          {selected ? (
            <span className="inline-flex items-center gap-1.5 text-[#9af0b3]">
              <CheckCircle2 className="size-3.5" />
              {selected.character_name} ({selected.server}) selected
            </span>
          ) : (
            "Select a character from the results."
          )}
        </p>
        <div className="flex w-full gap-2 sm:w-auto">
          <DialogClose asChild>
            <Button type="button" variant="outline" className={cn(aionButtonSecondary, "flex-1 sm:flex-none")}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            onClick={handleAdd}
            disabled={!selected}
            className={cn(aionButtonPrimary, "flex-1 sm:flex-none")}
          >
            <UserPlus className="size-3.5" />
            Add to Guild
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
