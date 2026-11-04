"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crown, CircleAlert, Loader2, LogOut } from "lucide-react";
import { aionButtonDanger, aionButtonSecondary, aionDialog } from "@/components/aion/styles";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsLeader } from "@/lib/auth/me-store";
import { call } from "@/lib/client/api";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Candidate {
  user_id: string;
  name: string | null;
  class_name: string | null;
  joined_at: string;
}
type Loaded = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; candidates: Candidate[] };

/**
 * Settings → Leave Guild. A Member confirms and leaves; a Guild Leader must first pick a successor from
 * their own guild, then confirm. The server decides the role, the guild and who is eligible; this
 * component only collects the choice.
 */
export function LeaveGuild() {
  const t = useT();
  const isLeader = useIsLeader();
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3" data-testid="leave-guild">
      <p className="text-sm text-steel">
        {isLeader
          ? t("You lead this guild. To leave, choose a member to take over as Guild Leader first.")
          : t("Leaving removes your access to this guild and its features. You can join a guild again later with its join code.")}
      </p>
      <Button type="button" variant="outline" className={aionButtonDanger} onClick={() => setOpen(true)} data-testid="leave-guild-open">
        <LogOut aria-hidden /> {t("Leave Guild")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={cn(aionDialog, "max-h-[90dvh] max-w-md overflow-y-auto")}>
          {open && <LeaveFlow isLeader={isLeader} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LeaveFlow({ isLeader }: { isLeader: boolean }) {
  const t = useT();
  const [loaded, setLoaded] = useState<Loaded>(isLeader ? { status: "loading" } : { status: "ready", candidates: [] });
  const [picked, setPicked] = useState<string | null>(null);
  const [step, setStep] = useState<"pick" | "confirm">(isLeader ? "pick" : "confirm");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    setLoaded({ status: "loading" });
    const r = await call<{ role: string; candidates: Candidate[] }>("/api/guild/leave");
    setLoaded(r.ok ? { status: "ready", candidates: r.data.candidates } : { status: "error", message: r.error.message });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch the eligible successors when the dialog opens
    if (isLeader) void load();
  }, [isLeader, load]);

  const candidates = loaded.status === "ready" ? loaded.candidates : [];
  const chosen = candidates.find((c) => c.user_id === picked) ?? null;
  const nameOf = (c: Candidate) => c.name ?? t("Unnamed member");

  async function leave() {
    if (inFlight.current) return;
    if (isLeader && !chosen) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const r = await call<{ ok: true }>("/api/guild/leave", { method: "POST", body: JSON.stringify(isLeader ? { new_leader_id: chosen!.user_id } : {}) });
    if (r.ok) {
      // Hard navigation: drops every cached guild-only state; the proxy sends a guild-less account to guild setup.
      window.location.replace("/guild-setup");
      return;
    }
    inFlight.current = false;
    setBusy(false);
    setError(r.error.message);
    // The list may have changed (member left, suspended, promoted): reload it and re-pick.
    if (isLeader) {
      setPicked(null);
      setStep("pick");
      void load();
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 font-heading tracking-wider text-brand-strong">
          <LogOut aria-hidden className="size-4 text-destructive" />
          {isLeader && step === "pick" ? t("Choose a new Guild Leader") : t("Leave this guild?")}
        </DialogTitle>
        <DialogDescription>
          {isLeader
            ? step === "pick"
              ? t("Leadership is transferred to the member you choose, then you leave the guild.")
              : t("Review before you leave. This cannot be undone.")
            : t("Review before you leave. This cannot be undone.")}
        </DialogDescription>
      </DialogHeader>

      {isLeader && step === "pick" && (
        <>
          {loaded.status === "loading" && <p role="status" className="flex items-center gap-2 text-sm text-steel"><Loader2 aria-hidden className="size-4 animate-spin" /> {t("Loading…")}</p>}
          {loaded.status === "error" && (
            <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-danger-text">
              <CircleAlert aria-hidden className="size-4 shrink-0" /> <span>{loaded.message}</span>
              <Button type="button" variant="outline" className={aionButtonSecondary} onClick={() => void load()}>{t("Retry")}</Button>
            </div>
          )}
          {loaded.status === "ready" && candidates.length === 0 && (
            <p role="status" className="border border-steel/15 bg-surface/60 p-3 text-sm text-steel">{t("There is no other member who can take over. You cannot leave until another member has joined the guild.")}</p>
          )}
          {candidates.length > 0 && (
            <fieldset className="grid max-h-64 gap-1.5 overflow-y-auto">
              <legend className="sr-only">{t("Eligible members")}</legend>
              {candidates.map((c) => (
                <label
                  key={c.user_id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 border px-3 py-2 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-arcane/40",
                    picked === c.user_id ? "border-brand/60 bg-brand/10 text-foreground" : "border-steel/15 bg-surface/60 text-steel hover:border-brand-muted/50",
                  )}
                >
                  <input type="radio" name="new-leader" className="accent-[var(--brand)]" checked={picked === c.user_id} onChange={() => setPicked(c.user_id)} />
                  <span className="min-w-0 flex-1 truncate font-medium">{nameOf(c)}</span>
                  {c.class_name && <span className="shrink-0 text-xs text-subtle">{c.class_name}</span>}
                </label>
              ))}
            </fieldset>
          )}
        </>
      )}

      {step === "confirm" && (
        <div className="grid gap-3 text-sm">
          {isLeader && chosen && (
            <p className="flex items-start gap-2 border border-gold/40 bg-gold/10 p-3 text-foreground" data-testid="leave-guild-successor">
              <Crown aria-hidden className="mt-0.5 size-4 shrink-0 text-gold-text" />
              <span>{t("{name} will become the new Guild Leader.", { name: nameOf(chosen) })}</span>
            </p>
          )}
          <ul className="grid list-disc gap-1.5 pl-5 text-steel">
            <li>{t("You lose access to this guild's roster, party builder and other guild features.")}</li>
            <li>{t("Your character is removed from the guild roster, including its saved history here.")}</li>
            {isLeader && <li>{t("You lose the Guild Leader role.")}</li>}
            <li>{t("Everyone else in the guild is notified.")}</li>
          </ul>
        </div>
      )}

      {error && <p role="alert" className="flex items-start gap-2 text-sm text-danger-text"><CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" /> {error}</p>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <DialogClose asChild><Button type="button" variant="outline" disabled={busy} className={aionButtonSecondary}>{t("Cancel")}</Button></DialogClose>
        {isLeader && step === "pick" ? (
          <Button type="button" disabled={!chosen} onClick={() => setStep("confirm")} className={aionButtonDanger} data-testid="leave-guild-continue">
            {t("Continue")}
          </Button>
        ) : (
          <>
            {isLeader && <Button type="button" variant="outline" disabled={busy} onClick={() => setStep("pick")} className={aionButtonSecondary}>{t("Back")}</Button>}
            <Button type="button" disabled={busy || (isLeader && !chosen)} onClick={() => void leave()} className={aionButtonDanger} data-testid="leave-guild-confirm">
              {busy ? <Loader2 aria-hidden className="animate-spin" /> : <LogOut aria-hidden />}
              {isLeader ? t("Transfer leadership and leave") : t("Leave Guild")}
            </Button>
          </>
        )}
      </div>
    </>
  );
}
