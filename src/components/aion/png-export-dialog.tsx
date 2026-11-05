"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CircleAlert, Download, ImageDown, Loader2, RotateCcw } from "lucide-react";
import { aionButtonPrimary, aionButtonSecondary, aionDialog } from "@/components/aion/styles";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";
import { downloadBlob } from "@/lib/party/export-png";
import { cn } from "@/lib/utils";

type State =
  | { status: "rendering" }
  | { status: "ready"; blob: Blob; url: string; notice: string | null }
  | { status: "error"; message: string };

/** Dialog shell shared by the Party Builder and Character Lookup PNG exports; its content only mounts while open. */
export function PngExportDialog({ open, onOpenChange, children }: { open: boolean; onOpenChange: (o: boolean) => void; children: ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(aionDialog, "max-w-4xl gap-4")}>{open && children}</DialogContent>
    </Dialog>
  );
}

/**
 * Renders the image once on mount, previews that exact blob, and downloads that same blob: the image is never
 * re-rendered between preview and save. `render` is captured at mount; only "Try again" runs it again.
 */
export function PngExportPreview({
  title,
  description,
  width,
  height,
  filename,
  previewAlt,
  saveOnce = false,
  render,
}: {
  title: string;
  description: ReactNode;
  width: number;
  height: number;
  filename: string;
  previewAlt: string;
  /** Disable the download button after a save, so repeated clicks can't produce duplicate files. */
  saveOnce?: boolean;
  render: () => Promise<{ blob: Blob; notice?: string | null }>;
}) {
  const t = useT();
  const [state, setState] = useState<State>({ status: "rendering" });
  const [attempt, setAttempt] = useState(0);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    render()
      .then(({ blob, notice }) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setState({ status: "ready", blob, url, notice: notice ?? null });
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ status: "error", message: e instanceof Error ? e.message : t("Unknown error") });
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // re-render only on explicit retry; `render` is captured at open time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 font-heading text-base tracking-[0.12em] text-brand-strong uppercase">
          <ImageDown className="size-4 text-brand" />
          {title}
        </DialogTitle>
        <DialogDescription className="text-xs text-steel">{description}</DialogDescription>
      </DialogHeader>

      <div
        className="flex w-full items-center justify-center border border-steel/15 bg-surface/60"
        style={{ aspectRatio: `${width} / ${height}` }}
        aria-live="polite"
      >
        {state.status === "rendering" && (
          <span className="flex items-center gap-2 text-sm text-steel">
            <Loader2 className="size-4 animate-spin" /> {" "}{t("Rendering image…")}</span>
        )}
        {state.status === "error" && (
          <div className="space-y-3 p-6 text-center">
            <p className="flex items-center justify-center gap-2 text-sm text-danger-text" role="alert">
              <CircleAlert className="size-4" /> {" "}{t("Could not create the image:")}{" "}{state.message}
            </p>
            <Button type="button" variant="outline" className={aionButtonSecondary} onClick={() => { setState({ status: "rendering" }); setAttempt((a) => a + 1); }}>
              <RotateCcw className="size-3.5" /> {" "}{t("Try again")}</Button>
          </div>
        )}
        {state.status === "ready" && (
          // eslint-disable-next-line @next/next/no-img-element -- blob: URL preview of the generated PNG
          <img src={state.url} alt={previewAlt} data-testid="export-preview" className="h-full w-full object-contain" />
        )}
      </div>

      {state.status === "ready" && state.notice && <p className="text-xs text-steel" role="status" data-testid="export-notice">{state.notice}</p>}

      <div className="flex flex-col-reverse items-stretch gap-2 border-t border-steel/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="truncate text-xs text-subtle">
          {saved ? <span className="text-success-text">{t("Saved")}{" "}{saved}</span> : <>{t("File:")}{" "}<span className="text-foreground">{filename}</span></>}
        </p>
        <div className="flex gap-2">
          <DialogClose asChild>
            <Button type="button" variant="outline" className={cn(aionButtonSecondary, "flex-1 sm:flex-none")}>{t("Close")}</Button>
          </DialogClose>
          <Button
            type="button"
            disabled={state.status !== "ready" || (saveOnce && saved !== null)}
            onClick={() => {
              if (state.status !== "ready") return;
              downloadBlob(state.blob, filename);
              setSaved(filename);
            }}
            data-testid="export-download"
            className={cn(aionButtonPrimary, "flex-1 sm:flex-none")}
          >
            <Download className="size-3.5" />
            {t("Download PNG")}</Button>
        </div>
      </div>
    </>
  );
}
