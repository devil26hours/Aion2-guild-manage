"use client";

import { Fragment, useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * Minimal JSON syntax highlighter (no dependency was available in the
 * project). Tokenizes already-formatted JSON text; it never parses or
 * changes values, so what you see is the response text.
 */

const TOKEN = /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}[\],])/g;
/** Above this size, highlighting is skipped to keep the page responsive. */
const HIGHLIGHT_LIMIT = 400_000;

function highlight(text: string) {
  const out: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const [whole, str, colon, bool, nul, num, punct] = m;
    if (str !== undefined) {
      out.push(
        <span key={i++} className={colon ? "text-[#cfe3ff]" : "text-[#9af0b3]"}>
          {str}
        </span>,
      );
      if (colon) out.push(<span key={i++} className="text-steel/60">{colon}</span>);
    } else if (bool !== undefined) out.push(<span key={i++} className="text-[#d9a2ff]">{bool}</span>);
    else if (nul !== undefined) out.push(<span key={i++} className="text-steel/60 italic">{nul}</span>);
    else if (num !== undefined) out.push(<span key={i++} className="text-gold-bright">{num}</span>);
    else if (punct !== undefined) out.push(<span key={i++} className="text-steel/50">{punct}</span>);
    else out.push(whole);
    last = idx + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function JsonViewer({ text, className }: { text: string; className?: string }) {
  const nodes = useMemo(() => (text.length <= HIGHLIGHT_LIMIT ? highlight(text) : null), [text]);
  return (
    <div className={cn("relative overflow-auto border border-steel/12 bg-[#060910]", className)}>
      <pre data-testid="json-viewer" className="min-w-max p-3 font-mono text-xs leading-relaxed text-foreground/90">
        {nodes ? nodes.map((n, i) => <Fragment key={i}>{n}</Fragment>) : text}
      </pre>
      {!nodes && (
        <p className="sticky bottom-0 left-0 border-t border-steel/12 bg-ink px-3 py-1 text-3xs text-steel/60">
          Large response — syntax highlighting disabled.
        </p>
      )}
    </div>
  );
}
