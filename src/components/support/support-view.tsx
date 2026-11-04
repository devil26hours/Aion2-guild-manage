"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Coffee, Copy, Landmark } from "lucide-react";
import { aionButtonPrimary } from "@/components/aion/styles";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const ACCOUNT_DISPLAY = "170-160-8758";
const ACCOUNT_DIGITS = "1701608758";
const ACCOUNT_HOLDER = "THNATSETTH SRETTCHOTIDECHA";

/** Copy with the Clipboard API; falls back to a hidden textarea where it is unavailable (insecure origin, old browsers). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Link back out of the support page; "/" sends signed-in users to the dashboard and guests to Character Lookup. */
export function SupportBackLink() {
  const t = useT();
  return (
    <Link
      href="/"
      className="flex h-9 shrink-0 items-center justify-center gap-1.5 border border-steel/20 bg-surface/60 px-2.5 text-steel transition-colors outline-none hover:border-brand-muted/60 hover:text-brand-strong focus-visible:border-arcane/60 focus-visible:ring-2 focus-visible:ring-arcane/30"
    >
      <ArrowLeft aria-hidden className="size-4" />
      <span className="text-xs font-semibold tracking-wider">{t("Back")}</span>
    </Link>
  );
}

export function SupportView() {
  const t = useT();
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    const ok = await copyText(ACCOUNT_DIGITS);
    setStatus(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), 3000);
  }

  return (
    <div className="space-y-5 text-center">
      <div className="space-y-3">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full border border-gold/50 bg-gold/10 text-gold-text">
          <Coffee aria-hidden className="size-6" />
        </span>
        <p className="text-sm leading-relaxed text-foreground">
          {t("ChumChon AION2 is a community project made with heart for AION2 players. If this website is useful and makes things easier for you, you are welcome to help cover the cost of development and running the system, entirely at your own discretion.")}
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-steel/20 bg-surface/60 p-4 text-left">
        <p className="flex items-center gap-2 text-3xs font-semibold tracking-[0.18em] text-brand uppercase">
          <Landmark aria-hidden className="size-4" />
          {t("Bank transfer")}
        </p>
        <dl className="space-y-3">
          <div>
            <dt className="text-3xs tracking-wider text-subtle uppercase">{t("Bank")}</dt>
            <dd className="text-sm font-semibold text-foreground">{t("Bank of Ayudhya (Krungsri)")}</dd>
          </div>
          <div>
            <dt className="text-3xs tracking-wider text-subtle uppercase">{t("Account holder")}</dt>
            <dd className="text-sm font-semibold text-foreground">{t(ACCOUNT_HOLDER)}</dd>
          </div>
          <div>
            <dt className="text-3xs tracking-wider text-subtle uppercase">{t("Account number")}</dt>
            <dd
              data-testid="support-account-number"
              className="font-mono text-2xl font-bold tracking-[0.12em] text-gold-text select-all sm:text-3xl"
            >
              {ACCOUNT_DISPLAY}
            </dd>
          </div>
        </dl>
        <Button
          type="button"
          onClick={() => void copy()}
          data-testid="support-copy"
          className={cn(aionButtonPrimary, "h-10 w-full gap-2")}
        >
          {status === "copied" ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          {t("Copy Account Number")}
        </Button>
        <p
          role="status"
          aria-live="polite"
          className={cn("min-h-4 text-center text-2xs", status === "failed" ? "text-danger-text" : "text-success-text")}
        >
          {status === "copied" && t("Account number copied")}
          {status === "failed" && t("Could not copy. Please select the number and copy it manually.")}
        </p>
      </div>

      <p className="text-xs leading-relaxed text-subtle">
        {t("Support is voluntary, with no special privileges or obligations. Everyone can still use the website as usual.")}
      </p>
    </div>
  );
}
