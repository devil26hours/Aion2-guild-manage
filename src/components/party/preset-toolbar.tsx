"use client";


import { useT } from "@/lib/i18n";
import { useState } from "react";
import { Copy, Pencil, Plus, Trash } from "lucide-react";
import { aionButtonDanger, aionButtonSecondary, aionDialog, aionField } from "@/components/aion/styles";
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
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { createPreset, deletePreset, duplicatePreset, setActivePreset } from "@/lib/party/party-store";
import type { PartyPreset } from "@/lib/party/types";
import { cn } from "@/lib/utils";

export function PresetToolbar({
  presets,
  active,
  onRenameRequest,
  onNotice,
  readOnly = false,
}: {
  presets: PartyPreset[];
  active: PartyPreset;
  onRenameRequest: () => void;
  onNotice: (text: string) => void;
  readOnly?: boolean;
}) {
  const t = useT();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const btn = cn(aionButtonSecondary, "h-9");

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[12rem] flex-1 space-y-1.5 sm:max-w-xs">
        <Label htmlFor="preset-select" className="text-3xs font-semibold tracking-[0.18em] text-steel/80 uppercase">
          {t("Preset (")}{presets.length})
        </Label>
        <NativeSelect id="preset-select" value={active.id} onChange={(e) => setActivePreset(e.target.value)} className={aionField}>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.slots.filter((s) => s.member_id).length}/{p.slots.length}
            </option>
          ))}
        </NativeSelect>
      </div>
      {!readOnly && (<>
      <Button type="button" variant="outline" className={btn} onClick={() => { createPreset(); onNotice(t("New party preset created.")); }}>
        <Plus className="size-3.5" /> {" "}{t("New")}</Button>
      <Button type="button" variant="outline" className={btn} onClick={onRenameRequest}>
        <Pencil className="size-3.5" /> {" "}{t("Rename")}</Button>
      <Button type="button" variant="outline" className={btn} onClick={() => { duplicatePreset(active.id); onNotice(t("Duplicated “{name}”.", { name: active.name })); }}>
        <Copy className="size-3.5" /> {" "}{t("Duplicate")}</Button>
      <Button
        type="button"
        variant="outline"
        className={cn(btn, "hover:border-destructive/60 hover:text-[#f0a596]")}
        disabled={presets.length <= 1}
        title={presets.length <= 1 ? t("At least one preset is required") : undefined}
        onClick={() => setConfirmDelete(true)}
      >
        <Trash className="size-3.5" /> {" "}{t("Delete")}</Button>
      </>)}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className={cn(aionDialog, "border-destructive/40")}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-base tracking-[0.1em] text-foreground uppercase">{t("Delete Preset")}</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-steel">
              {t("Delete")}{" "}<span className="font-semibold text-foreground">{active.name}</span>{t("? Its slot assignments will be lost. Characters stay in the roster.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={cn(buttonVariants({ variant: "outline" }), aionButtonSecondary)}>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants(), aionButtonDanger)}
              onClick={() => { const name = active.name; if (deletePreset(active.id)) onNotice(t("Deleted “{name}”.", { name })); }}
            >
              {t("Delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
