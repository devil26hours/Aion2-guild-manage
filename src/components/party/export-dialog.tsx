"use client";


import { useT } from "@/lib/i18n";
import { useState } from "react";
import { PngExportDialog, PngExportPreview } from "@/components/aion/png-export-dialog";
import {
  canvasToPngBlob,
  exportSize,
  exportFileName,
  renderPartyCanvas,
  type ExportData,
} from "@/lib/party/export-png";

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
    <PngExportDialog open={open} onOpenChange={onOpenChange}>
      <ExportBody data={data} />
    </PngExportDialog>
  );
}

function ExportBody({ data: base }: { data: Omit<ExportData, "generatedAt"> }) {
  const t = useT();
  // Timestamp is taken when the dialog opens (client-only, never prerendered).
  const [data] = useState<ExportData>(() => ({ ...base, generatedAt: new Date() }));
  const px = exportSize(data.slots.length);

  return (
    <PngExportPreview
      title={t("Export Party PNG")}
      description={<>{t("A dedicated")}{" "}{data.slots.length}{t("-member party card (")}{px.width}×{px.height}{t("px) sized for Discord. Only this card is exported.")}</>}
      width={px.width}
      height={px.height}
      filename={exportFileName(data.partyName, data.generatedAt)}
      previewAlt={`Party export preview: ${data.partyName}`}
      render={() => renderPartyCanvas(data).then(canvasToPngBlob).then((blob) => ({ blob }))}
    />
  );
}
