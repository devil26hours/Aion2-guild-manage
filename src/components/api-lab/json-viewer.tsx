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
        <span key={i++} className={colon ? "text-info-text" : "text-success-text"}>
          {str}
        </span>,
      );
      if (colon) out.push(<span key={i++} className="text-subtle">{colon}</span>);
    } else if (bool !== undefined) out.push(<span key={i++} className="text-mystic-text">{bool}</span>);
    else if (nul !== undefined) out.push(<span key={i++} className="text-subtle italic">{nul}</span>);
    else if (num !== undefined) out.push(<span key={i++} className="text-brand-strong">{num}</span>);
    else if (punct !== undefined) out.push(<span key={i++} className="text-subtle">{punct}</span>);
    else out.push(whole);
    last = idx + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function JsonViewer({ text, className }: { text: string; className?: string }) {
  const nodes = useMemo(() => (text.length <= HIGHLIGHT_LIMIT ? highlight(text) : null), [text]);
  return (
    <div className={cn("relative overflow-auto border border-steel/12 bg-surface-sunken", className)}>
      <pre data-testid="json-viewer" className="min-w-max p-3 font-mono text-xs leading-relaxed text-foreground/90">
        {nodes ? nodes.map((n, i) => <Fragment key={i}>{n}</Fragment>) : text}
      </pre>
      {!nodes && (
        <p className="sticky bottom-0 left-0 border-t border-steel/12 bg-surface px-3 py-1 text-3xs text-subtle">
          Large response — syntax highlighting disabled.
        </p>
      )}
    </div>
  );
}
