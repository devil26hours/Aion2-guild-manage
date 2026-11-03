"use client";


import { useT } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { CircleAlert, Download, ImageDown, Loader2, RotateCcw } from "lucide-react";
import { aionButtonPrimary, aionButtonSecondary, aionDialog } from "@/components/aion/styles";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  canvasToPngBlob,
  downloadBlob,
  exportSize,
  exportFileName,
  renderPartyCanvas,
  type ExportData,
} from "@/lib/party/export-png";
import { cn } from "@/lib/utils";

type State =
  | { status: "rendering" }
  | { status: "ready"; blob: Blob; url: string }
  | { status: "error"; message: string };

export function ExportDialog({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  data: Omit<ExportData, "generatedAt">;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(aionDialog, "max-w-4xl gap-4")}>
        {open && <ExportBody data={data} />}
      </DialogContent>
    </Dialog>
  );
}

function ExportBody({ data: base }: { data: Omit<ExportData, "generatedAt"> }) {
  const t = useT();
  // Timestamp is taken when the dialog opens (client-only, never prerendered).
  const [data] = useState<ExportData>(() => ({ ...base, generatedAt: new Date() }));
  const [state, setState] = useState<State>({ status: "rendering" });
  const [attempt, setAttempt] = useState(0);
  const [saved, setSaved] = useState<string | null>(null);
  const filename = exportFileName(data.partyName, data.generatedAt);
  const px = exportSize(data.slots.length);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    renderPartyCanvas(data)
      .then(canvasToPngBlob)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setState({ status: "ready", blob, url });
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ status: "error", message: e instanceof Error ? e.message : t("Unknown error") });
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // re-render only on explicit retry; `data` is captured at open time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 font-heading text-base tracking-[0.12em] text-gold-bright uppercase">
          <ImageDown className="size-4 text-gold" />
          {t("Export Party PNG")}</DialogTitle>
        <DialogDescription className="text-xs text-steel">
          {t("A dedicated")}{" "}{data.slots.length}{t("-member party card (")}{px.width}×{px.height}{t("px) sized for Discord. Only this card is exported.")}</DialogDescription>
      </DialogHeader>

      <div
        className="flex w-full items-center justify-center border border-steel/15 bg-ink/60"
        style={{ aspectRatio: `${px.width} / ${px.height}` }}
        aria-live="polite"
      >
        {state.status === "rendering" && (
          <span className="flex items-center gap-2 text-sm text-steel">
            <Loader2 className="size-4 animate-spin" /> {" "}{t("Rendering image…")}</span>
        )}
        {state.status === "error" && (
          <div className="space-y-3 p-6 text-center">
            <p className="flex items-center justify-center gap-2 text-sm text-[#f0a596]">
              <CircleAlert className="size-4" /> {" "}{t("Could not create the image:")}{" "}{state.message}
            </p>
            <Button type="button" variant="outline" className={aionButtonSecondary} onClick={() => { setState({ status: "rendering" }); setAttempt((a) => a + 1); }}>
              <RotateCcw className="size-3.5" /> {" "}{t("Try again")}</Button>
          </div>
        )}
        {state.status === "ready" && (
          // eslint-disable-next-line @next/next/no-img-element -- blob: URL preview of the generated PNG
          <img src={state.url} alt={`Party export preview: ${data.partyName}`} data-testid="export-preview" className="h-full w-full object-contain" />
        )}
      </div>

      <div className="flex flex-col-reverse items-stretch gap-2 border-t border-steel/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="truncate text-xs text-steel/70">
          {saved ? <span className="text-[#9af0b3]">{t("Saved")}{" "}{saved}</span> : <>{t("File:")}{" "}<span className="text-foreground">{filename}</span></>}
        </p>
        <div className="flex gap-2">
          <DialogClose asChild>
            <Button type="button" variant="outline" className={cn(aionButtonSecondary, "flex-1 sm:flex-none")}>{t("Close")}</Button>
          </DialogClose>
          <Button
            type="button"
            disabled={state.status !== "ready"}
            onClick={() => {
              if (state.status !== "ready") return;
              downloadBlob(state.blob, filename);
              setSaved(filename);
            }}
            className={cn(aionButtonPrimary, "flex-1 sm:flex-none")}
          >
            <Download className="size-3.5" />
            {t("Download PNG")}</Button>
        </div>
      </div>
    </>
  );
}
