"use client";


import { useT } from "@/lib/i18n";
import { ArrowLeftRight, CircleAlert, Plus, X } from "lucide-react";
import { RosterClassBadge } from "@/components/roster/roster-class-badge";
import { aionField } from "@/components/aion/styles";
import { NativeSelect } from "@/components/ui/native-select";
import { formatNumber } from "@/lib/format";
import { describePlacements, type PresetPlacement } from "@/lib/party/party-store";
import { PARTY_ROLES, ROLE_COLORS, type PartyMember, type PartyRole, type PartySlot as Slot } from "@/lib/party/types";
import { cn } from "@/lib/utils";
import { MemberAvatar } from "./member-avatar";
import { RoleBadge } from "./role-badge";

interface Props {
  index: number;
  slot: Slot;
  member: PartyMember | undefined;
  duplicate: boolean;
  /** Other presets this character is also assigned to. */
  elsewhere?: PresetPlacement[];
  view: "cards" | "list";
  onAssign: () => void;
  onRemove: () => void;
  onRole: (role: PartyRole | null) => void;
  /** Guild Members: view only (no assign/replace/remove/role). */
  readOnly?: boolean;
}

function RoleSelect({ index, value, onRole, disabled }: { index: number; value: PartyRole | null; onRole: Props["onRole"]; disabled?: boolean }) {
  const t = useT();
  return (
    <NativeSelect
      aria-label={t("Role for slot {n}", { n: index + 1 })}
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onRole((e.target.value || null) as PartyRole | null)}
      className={cn(aionField, "h-8 text-xs")}
      wrapperClassName="w-28 shrink-0"
    >
      <option value="">{t("No role")}</option>
      {PARTY_ROLES.map((r) => (
        <option key={r} value={r}>{r}</option>
      ))}
    </NativeSelect>
  );
}

const iconBtn =
  "flex size-8 shrink-0 items-center justify-center border border-steel/15 text-steel transition-colors outline-none hover:border-brand-muted/60 hover:text-brand-strong focus-visible:border-arcane/60";

export function PartySlotView({ index, slot, member, duplicate, elsewhere = [], view, onAssign, onRemove, onRole, readOnly = false }: Props) {
  const t = useT();
  const missing = !!slot.member_id && !member;
  const roleColor = slot.role ? ROLE_COLORS[slot.role] : null;

  /* ------------------------------ empty ------------------------------ */
  if (!slot.member_id) {
    return (
      <div
        data-slot-index={index}
        data-state="empty"
        className={cn(
          "group flex items-center gap-3 border border-dashed border-steel/20 bg-surface/30 transition-colors hover:border-brand-muted/50",
          view === "cards" ? "min-h-[6.5rem] p-3" : "px-3 py-2",
        )}
      >
        <span className="flex size-7 shrink-0 items-center justify-center border border-steel/20 text-xs font-bold text-subtle tabular-nums">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-subtle">{t("Empty slot")}</p>
          {slot.role && <RoleBadge role={slot.role} className="mt-1" />}
        </div>
        {!readOnly && (
        <button type="button" onClick={onAssign} className={cn(iconBtn, "w-auto gap-1.5 px-2.5 text-xs")} aria-label={t("Assign character to slot {n}", { n: index + 1 })}>
          <Plus className="size-3.5" />
          {t("Assign")}</button>
        )}
      </div>
    );
  }

  /* ----------------------------- filled ------------------------------ */
  const name = member?.character_name ?? t("Unknown character");
  return (
    <div
      data-slot-index={index}
      data-state={missing ? "missing" : "filled"}
      className={cn(
        "relative border bg-gradient-to-br from-surface-raised to-surface transition-colors",
        missing || duplicate ? "border-destructive/50" : "border-steel/15 hover:border-brand-muted/50",
        view === "cards" ? "p-3" : "px-3 py-2",
      )}
      style={roleColor && !missing ? { boxShadow: `inset 3px 0 0 ${roleColor}` } : undefined}
    >
      <div className={cn("flex gap-3", view === "cards" ? "items-start" : "flex-wrap items-center")}>
        <span className="flex size-7 shrink-0 items-center justify-center border border-brand-muted/50 bg-brand/10 text-xs font-bold text-brand-strong tabular-nums">
          {index + 1}
        </span>

        {member && (
          <MemberAvatar
            key={member.id}
            src={member.profile_image}
            name={name}
            className={member.class_name}
            size={view === "cards" ? 44 : 32}
          />
        )}

        <div className="min-w-0 flex-1">
          {member ? (
            <>
              <p className="truncate font-medium text-foreground" title={member.server_name ? `${name} · ${member.server_name}` : name}>
                {name}
              </p>
              {member.comment && (
                <p
                  data-testid="slot-comment"
                  title={member.comment}
                  className={cn(
                    "text-xs break-words text-info-text italic",
                    view === "cards" ? "line-clamp-2" : "truncate",
                  )}
                >
                  “{member.comment}”
                </p>
              )}
            </>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-danger-text">
              <CircleAlert className="size-3.5" /> {" "}{t("Removed from roster")}</p>
          )}
          {member && (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
              <RosterClassBadge className={member.class_name} />
              <span className="text-steel">Lv. {member.level ?? "—"}</span>
            </div>
          )}
          {duplicate && <p className="mt-1 text-2xs text-danger-text">{t("Assigned more than once")}</p>}
          {member && elsewhere.length > 0 && (
            <p data-testid="slot-elsewhere" className="mt-1 flex items-center gap-1 text-2xs text-warning-text">
              <CircleAlert aria-hidden className="size-3 shrink-0" />
              {t("Also in")}{" "}{describePlacements(elsewhere)}
            </p>
          )}
        </div>

        {member && view === "list" && (
          <div className="flex gap-4 text-xs tabular-nums">
            <span><span className="text-subtle">CP </span><span className="font-semibold text-brand-strong">{member.combat_power !== null ? formatNumber(member.combat_power) : "—"}</span></span>
            <span><span className="text-subtle">iLv </span><span className="text-foreground">{member.item_level ?? "—"}</span></span>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          {view === "list" && (readOnly ? <RoleBadge role={slot.role} /> : <RoleSelect index={index} value={slot.role} onRole={onRole} disabled={missing} />)}
          {!readOnly && (<>
          <button type="button" onClick={onAssign} className={iconBtn} aria-label={t("Replace character in slot {n}", { n: index + 1 })} title={t("Replace")}>
            <ArrowLeftRight className="size-3.5" />
          </button>
          <button type="button" onClick={onRemove} className={cn(iconBtn, "hover:border-destructive/60 hover:text-danger-text")} aria-label={t("Remove {name} from slot {n}", { name, n: index + 1 })} title={t("Remove")}>
            <X className="size-3.5" />
          </button>
          </>)}
        </div>
      </div>

      {member && view === "cards" && (
        <div className="mt-3 flex items-end justify-between gap-2 border-t border-steel/10 pt-2.5">
          <dl className="flex gap-4 text-xs tabular-nums">
            <div>
              <dt className="text-4xs tracking-[0.14em] text-subtle uppercase">CP</dt>
              <dd className="font-semibold text-brand-strong">{member.combat_power !== null ? formatNumber(member.combat_power) : "—"}</dd>
            </div>
            <div>
              <dt className="text-4xs tracking-[0.14em] text-subtle uppercase">{t("Item Lv.")}</dt>
              <dd className="font-semibold text-foreground">{member.item_level ?? "—"}</dd>
            </div>
          </dl>
          {readOnly ? <RoleBadge role={slot.role} /> : <RoleSelect index={index} value={slot.role} onRole={onRole} />}
        </div>
      )}
      {member && slot.role === null && (
        <p className="mt-1.5 text-3xs text-subtle">
          {t("Guild role:")}{" "}{member.role ?? t("not set")}
        </p>
      )}
    </div>
  );
}
