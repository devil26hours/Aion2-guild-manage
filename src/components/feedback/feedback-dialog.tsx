"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { CircleAlert, CircleCheck, Loader2, MessageSquarePlus } from "lucide-react";
import { aionButtonPrimary, aionButtonSecondary, aionDialog, aionField } from "@/components/aion/styles";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { call } from "@/lib/client/api";
import {
  CATEGORY_HINT,
  CATEGORY_LABEL,
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  FEEDBACK_CATEGORIES,
  isCategory,
  SUBJECT_MAX,
  SUBJECT_MIN,
} from "@/lib/feedback/schema";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const labelClass = "text-3xs font-semibold tracking-[0.18em] text-brand uppercase";

/**
 * Header button that opens the feedback form. Works signed in or out; the server
 * takes the sender from the session, so the form never sends an identity.
 */
export function FeedbackButton({ className }: { className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={t("Send feedback")}
        title={t("Send feedback")}
        data-testid="feedback-button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-9 shrink-0 items-center justify-center gap-1.5 border border-steel/20 bg-surface/60 px-2.5 text-steel transition-colors outline-none",
          "hover:border-brand-muted/60 hover:text-brand-strong focus-visible:border-arcane/60 focus-visible:ring-2 focus-visible:ring-arcane/30",
          className,
        )}
      >
        <MessageSquarePlus aria-hidden className="size-4" />
        <span className="hidden text-xs font-semibold tracking-wider lg:inline">{t("Feedback")}</span>
      </button>
      <Dialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o); }}>
        <DialogContent
          className={cn(aionDialog, "max-w-lg")}
          showCloseButton={!busy}
          onEscapeKeyDown={(e) => busy && e.preventDefault()}
          onInteractOutside={(e) => busy && e.preventDefault()}
        >
          {open && <FeedbackForm onBusyChange={setBusy} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function FeedbackForm({ onBusyChange }: { onBusyChange: (busy: boolean) => void }) {
  const t = useT();
  const ids = useId();
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState(""); // honeypot, hidden from people
  const [errors, setErrors] = useState<{ category?: string; subject?: string; description?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const inFlight = useRef(false);

  function validate() {
    const next: typeof errors = {};
    if (!isCategory(category)) next.category = t("Choose a category.");
    const s = subject.trim().length;
    if (s < SUBJECT_MIN || s > SUBJECT_MAX) next.subject = t("The subject must be {min}–{max} characters.", { min: SUBJECT_MIN, max: SUBJECT_MAX });
    const d = description.trim().length;
    if (d < DESCRIPTION_MIN || d > DESCRIPTION_MAX) next.description = t("The description must be {min}–{max} characters.", { min: DESCRIPTION_MIN, max: DESCRIPTION_MAX });
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return; // ignore double clicks / repeated Enter
    setFormError(null);
    if (!validate()) return;
    inFlight.current = true;
    setSending(true);
    onBusyChange(true);
    // Path only: query strings and fragments can hold tokens, so they are never sent.
    const r = await call<{ ok: true }>("/api/feedback", {
      method: "POST",
      body: JSON.stringify({ category, subject, description, page_url: window.location.pathname, website }),
    });
    setSending(false);
    onBusyChange(false);
    if (r.ok) {
      setSent(true); // keep the guard set: this form cannot be sent twice
      return;
    }
    inFlight.current = false;
    setFormError(r.error.code === "RATE_LIMITED" || r.error.code === "FEEDBACK_DUPLICATE" || r.error.code === "INVALID_BODY" ? r.error.message : t("Could not send your feedback. Please try again later."));
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center" role="status">
        <CircleCheck aria-hidden className="size-10 text-success-text" />
        <DialogTitle className="font-heading tracking-wider text-brand-strong">{t("Thank you!")}</DialogTitle>
        <DialogDescription>{t("Your feedback was sent. We read every message.")}</DialogDescription>
        <DialogClose asChild>
          <Button type="button" className={cn(aionButtonPrimary, "mt-2")}>{t("Close")}</Button>
        </DialogClose>
      </div>
    );
  }

  const cat = isCategory(category) ? category : null;
  return (
    <form onSubmit={submit} noValidate className="grid gap-4" aria-busy={sending}>
      <DialogHeader>
        <DialogTitle className="font-heading tracking-wider text-brand-strong">{t("Send feedback")}</DialogTitle>
        <DialogDescription>{t("Report a bug, suggest a feature or tell us what you think.")}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-1.5">
        <Label htmlFor={`${ids}-category`} className={labelClass}>{t("Category")}</Label>
        <NativeSelect
          id={`${ids}-category`}
          value={category}
          disabled={sending}
          required
          aria-invalid={!!errors.category}
          aria-describedby={errors.category ? `${ids}-category-err` : undefined}
          onChange={(e) => setCategory(e.target.value)}
          className={aionField}
        >
          <option value="" disabled>{t("Select a category")}</option>
          {FEEDBACK_CATEGORIES.map((c) => (
            <option key={c} value={c}>{t(CATEGORY_LABEL[c])}</option>
          ))}
        </NativeSelect>
        {cat && <p className="text-xs text-subtle">{t(CATEGORY_HINT[cat])}</p>}
        {errors.category && <p id={`${ids}-category-err`} className="text-xs text-danger-text">{errors.category}</p>}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${ids}-subject`} className={labelClass}>{t("Subject")}</Label>
        <Input
          id={`${ids}-subject`}
          value={subject}
          maxLength={SUBJECT_MAX}
          disabled={sending}
          required
          autoComplete="off"
          aria-invalid={!!errors.subject}
          aria-describedby={errors.subject ? `${ids}-subject-err` : undefined}
          onChange={(e) => setSubject(e.target.value)}
          className={aionField}
        />
        {errors.subject && <p id={`${ids}-subject-err`} className="text-xs text-danger-text">{errors.subject}</p>}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${ids}-description`} className={labelClass}>{t("Description")}</Label>
        <Textarea
          id={`${ids}-description`}
          value={description}
          maxLength={DESCRIPTION_MAX}
          disabled={sending}
          required
          rows={6}
          aria-invalid={!!errors.description}
          aria-describedby={`${ids}-description-count${errors.description ? ` ${ids}-description-err` : ""}`}
          onChange={(e) => setDescription(e.target.value)}
          className={cn(aionField, "h-auto max-h-60 min-h-32 py-2")}
        />
        <div className="flex items-start justify-between gap-3">
          <p id={`${ids}-description-err`} className="text-xs text-danger-text">{errors.description}</p>
          <p id={`${ids}-description-count`} className="ml-auto shrink-0 text-xs text-subtle">{description.length} / {DESCRIPTION_MAX}</p>
        </div>
      </div>

      {/* Honeypot: invisible to people and assistive tech, tempting to bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      {formError && (
        <p role="alert" className="flex items-start gap-2 border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-danger-text">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {formError}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={sending} className={aionButtonSecondary}>{t("Cancel")}</Button>
        </DialogClose>
        <Button type="submit" disabled={sending} className={aionButtonPrimary}>
          {sending && <Loader2 aria-hidden className="animate-spin" />}
          {sending ? t("Sending…") : t("Send feedback")}
        </Button>
      </div>
    </form>
  );
}
