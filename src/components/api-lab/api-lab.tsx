"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  CircleAlert,
  Clipboard,
  ClipboardCheck,
  FlaskConical,
  Loader2,
  Send,
  ServerCog,
  Trash,
  UserCheck,
  X,
} from "lucide-react";
import { SectionPanel } from "@/components/aion/section-panel";
import { aionButtonPrimary, aionButtonSecondary, aionField } from "@/components/aion/styles";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  describeStatus,
  ENDPOINT_IDS,
  ENDPOINTS,
  validateRequest,
  type EndpointId,
  type ParamError,
  type ResponseSource,
} from "@/lib/aion2-api/endpoints";
import {
  detailString,
  isAmbiguousNameBody,
  isCharacterHitList,
  isProxyErrorBody,
  isValidationErrorBody,
  type CharacterHit,
} from "@/lib/aion2-api/types";
import { cn } from "@/lib/utils";
import { CharacterHitsTable } from "./character-hits-table";
import { JsonViewer } from "./json-viewer";

type Values = Record<string, string>;

interface LabResponse {
  endpoint: EndpointId;
  requestUrl: string;
  upstreamPath: string | null;
  status: number;
  source: ResponseSource;
  clientMs: number;
  upstreamMs: number | null;
  bytes: number;
  rawText: string;
  /** undefined when the body is not JSON */
  json: unknown;
  isJson: boolean;
}

const labelClass = "text-3xs font-semibold tracking-[0.18em] text-steel/80 uppercase";

const TONE: Record<"ok" | "warn" | "error", string> = {
  ok: "border-[#7ee79e]/40 bg-[#7ee79e]/10 text-[#9af0b3]",
  warn: "border-[#e0b04a]/40 bg-[#e0b04a]/10 text-[#f0cf86]",
  error: "border-destructive/50 bg-destructive/15 text-[#f6c2b6]",
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function ApiLab() {
  const [endpoint, setEndpoint] = useState<EndpointId>("character-search");
  const [values, setValues] = useState<Values>({ name: "", region: "", server: "", board: "" });
  const [fieldErrors, setFieldErrors] = useState<ParamError[]>([]);
  const [selected, setSelected] = useState<CharacterHit | null>(null);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<LabResponse | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [view, setView] = useState<"pretty" | "raw">("pretty");
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const [hint, setHint] = useState<string | null>(null);
  const inFlight = useRef(false);

  const def = ENDPOINTS[endpoint];
  const paramsFor = (id: EndpointId, v: Values) =>
    Object.fromEntries(ENDPOINTS[id].params.map((p) => [p.name, v[p.name] ?? ""]).filter(([, x]) => x !== ""));

  const preview = (() => {
    const r = validateRequest(endpoint, paramsFor(endpoint, values));
    if (!r.ok) return def.path;
    const q = new URLSearchParams(r.query).toString();
    return `${r.path}${q ? `?${q}` : ""}`;
  })();

  function setValue(name: string, v: string) {
    setValues((s) => ({ ...s, [name]: v }));
    setFieldErrors((e) => e.filter((x) => x.param !== name));
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (inFlight.current) return; // one request at a time, never auto-retried
    const params = paramsFor(endpoint, values);
    const check = validateRequest(endpoint, params);
    if (!check.ok) {
      setFieldErrors(check.errors);
      return;
    }
    setFieldErrors([]);
    setNetworkError(null);
    setHint(null);
    setCopy("idle");
    inFlight.current = true;
    setLoading(true);
    const requestUrl = `/api/aion2/${endpoint}${Object.keys(params).length ? `?${new URLSearchParams(params)}` : ""}`;
    const t0 = performance.now();
    try {
      const res = await fetch(requestUrl, { headers: { accept: "application/json" }, cache: "no-store" });
      const rawText = await res.text();
      const clientMs = Math.round(performance.now() - t0);
      let json: unknown = undefined;
      let isJson = false;
      try {
        json = JSON.parse(rawText);
        isJson = true;
      } catch {
        /* not JSON — shown as text */
      }
      const up = res.headers.get("x-aion2-upstream-duration-ms");
      setResponse({
        endpoint,
        requestUrl,
        upstreamPath: res.headers.get("x-aion2-upstream-path"),
        status: res.status,
        source: res.headers.get("x-aion2-source") === "upstream" ? "upstream" : "proxy",
        clientMs,
        upstreamMs: up ? Number(up) : null,
        bytes: new TextEncoder().encode(rawText).length,
        rawText,
        json,
        isJson,
      });
    } catch {
      setNetworkError("Could not reach the Next.js API route. Is the app server running?");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  function selectCharacter(hit: CharacterHit, nextEndpoint: EndpointId | null) {
    setSelected(hit);
    setValues((s) => ({ ...s, name: hit.name, server: hit.server_id }));
    setFieldErrors([]);
    if (nextEndpoint) setEndpoint(nextEndpoint);
    setHint(
      nextEndpoint
        ? `Selected ${hit.name} on ${hit.server_name ?? hit.server_id} (${hit.server_id}). Name and server filled in — press Send Request.`
        : `Server set to ${hit.server_name ?? hit.server_id} (${hit.server_id}). Press Send Request to try again.`,
    );
  }

  function pickBoard(id: string) {
    setValues((s) => ({ ...s, board: id }));
    setEndpoint("character-daevanion-board");
    setHint(`Board ${id} selected — press Send Request to load its nodes.`);
  }

  async function copyJson() {
    if (!response) return;
    const text = response.isJson && view === "pretty" ? JSON.stringify(response.json, null, 2) : response.rawText;
    try {
      await navigator.clipboard.writeText(text);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  function clearResponse() {
    setResponse(null);
    setNetworkError(null);
    setCopy("idle");
  }

  const status = response ? describeStatus(response.status, response.source) : null;
  const displayText = response
    ? response.isJson && view === "pretty"
      ? JSON.stringify(response.json, null, 2)
      : response.rawText
    : "";

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="Developer Tools · Isolated"
        title="AION2 API Lab"
        description="Manually test the unofficial AION2 API through a restricted server-side proxy. Responses are shown exactly as returned."
      />

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        {/* ---------------------------- request ---------------------------- */}
        <div className="space-y-4 sm:space-y-6">
          <SectionPanel title="Request" icon={FlaskConical} description="Choose an endpoint and fill its parameters">
            <form onSubmit={send} noValidate className="space-y-4">
              <fieldset>
                <legend className={cn(labelClass, "mb-2")}>Endpoint</legend>
                <div role="radiogroup" aria-label="Endpoint" className="space-y-1.5">
                  {ENDPOINT_IDS.map((id) => {
                    const d = ENDPOINTS[id];
                    const on = id === endpoint;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        data-endpoint={id}
                        onClick={() => {
                          setEndpoint(id);
                          setFieldErrors([]);
                          setHint(null);
                        }}
                        className={cn(
                          "flex w-full items-start gap-2.5 border px-3 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-arcane/40",
                          on ? "border-gold/60 bg-gold/[0.08]" : "border-steel/12 hover:border-gold-dim/50 hover:bg-white/[0.02]",
                        )}
                      >
                        <span className="mt-0.5 shrink-0 border border-arcane/40 bg-arcane/10 px-1 font-mono text-4xs font-bold text-arcane">
                          {d.method}
                        </span>
                        <span className="min-w-0">
                          <span className={cn("block text-sm", on ? "text-gold-bright" : "text-foreground")}>{d.label}</span>
                          <span className="block truncate font-mono text-2xs text-steel/70">{d.path}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <p className="text-xs text-steel">{def.summary}</p>

              {def.params.length === 0 ? (
                <p className="border border-steel/12 bg-ink/50 px-3 py-2 text-xs text-steel">This endpoint takes no parameters.</p>
              ) : (
                <div className="space-y-3">
                  {def.params.map((p) => {
                    const err = fieldErrors.find((x) => x.param === p.name);
                    const id = `lab-${p.name}`;
                    return (
                      <div key={p.name} className="space-y-1.5">
                        <Label htmlFor={id} className={labelClass}>
                          {p.label}
                          <span className="ml-1.5 font-mono font-normal tracking-normal text-steel/50 normal-case">
                            {p.in}:{p.name}
                            {p.required ? " · required" : " · optional"}
                          </span>
                        </Label>
                        {p.kind === "select" ? (
                          <NativeSelect id={id} value={values[p.name] ?? ""} onChange={(e) => setValue(p.name, e.target.value)} className={aionField}>
                            <option value="">{p.name === "region" ? "All regions" : "Default"}</option>
                            {p.options?.map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </NativeSelect>
                        ) : (
                          <Input
                            id={id}
                            value={values[p.name] ?? ""}
                            placeholder={p.placeholder}
                            maxLength={64}
                            autoComplete="off"
                            aria-invalid={!!err}
                            aria-describedby={err ? `${id}-err` : undefined}
                            onChange={(e) => setValue(p.name, e.target.value)}
                            className={aionField}
                          />
                        )}
                        {err ? (
                          <p id={`${id}-err`} className="text-xs text-[#ef9b89]">{err.message}</p>
                        ) : (
                          p.help && <p className="text-2xs text-steel/55">{p.help}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="border border-steel/12 bg-[#060910] px-3 py-2">
                <p className="text-4xs tracking-[0.16em] text-steel/60 uppercase">Upstream request</p>
                <p className="mt-0.5 font-mono text-xs break-all text-foreground/85" data-testid="request-preview">
                  GET {preview}
                </p>
              </div>

              {hint && (
                <p className="border-l-2 border-arcane bg-arcane/[0.07] px-3 py-2 text-xs text-[#cfe3ff]" role="status">
                  {hint}
                </p>
              )}

              <Button type="submit" disabled={loading} className={cn(aionButtonPrimary, "h-10 w-full")}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {loading ? "Sending…" : "Send Request"}
              </Button>
            </form>
          </SectionPanel>

          <SectionPanel title="Selected Character" icon={UserCheck}>
            {selected ? (
              <div className="flex items-start justify-between gap-3" data-testid="selected-character">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <dt className="text-steel/60">Name</dt>
                  <dd className="font-medium text-foreground">{selected.name}</dd>
                  <dt className="text-steel/60">Server</dt>
                  <dd className="text-foreground">{selected.server_name ?? "—"} <span className="font-mono text-steel">({selected.server_id})</span></dd>
                  <dt className="text-steel/60">Region</dt>
                  <dd className="text-foreground uppercase">{selected.region}</dd>
                  <dt className="text-steel/60">Level</dt>
                  <dd className="text-foreground">{selected.level ?? "—"}</dd>
                </dl>
                <button
                  type="button"
                  aria-label="Clear selected character"
                  onClick={() => setSelected(null)}
                  className="p-1 text-steel/60 hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <p className="text-xs text-steel">Search for a character and select a result to fill name and server automatically.</p>
            )}
          </SectionPanel>
        </div>

        {/* ---------------------------- response --------------------------- */}
        <SectionPanel
          title="Response"
          icon={ServerCog}
          description={response ? `${ENDPOINTS[response.endpoint].label}` : "No request sent yet"}
          className="min-w-0"
          action={
            <div className="flex shrink-0 gap-1.5">
              <Button type="button" variant="outline" disabled={!response} onClick={copyJson} className={cn(aionButtonSecondary, "h-8")}>
                {copy === "copied" ? <ClipboardCheck className="size-3.5" /> : <Clipboard className="size-3.5" />}
                {copy === "copied" ? "Copied" : copy === "failed" ? "Copy failed" : "Copy JSON"}
              </Button>
              <Button type="button" variant="outline" disabled={!response && !networkError} onClick={clearResponse} className={cn(aionButtonSecondary, "h-8")}>
                <Trash className="size-3.5" />
                Clear
              </Button>
            </div>
          }
        >
          <div aria-live="polite" className="space-y-4">
            {loading && (
              <p className="flex items-center gap-2 text-sm text-steel">
                <Loader2 className="size-4 animate-spin" /> Waiting for the API… (upstream calls can take a few seconds)
              </p>
            )}

            {networkError && (
              <p className="flex items-start gap-2 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-[#f6c2b6]">
                <CircleAlert className="mt-0.5 size-4 shrink-0" /> {networkError}
              </p>
            )}

            {!response && !loading && !networkError && (
              <p className="py-10 text-center text-sm text-steel">Send a request to see the status, timing and raw JSON here.</p>
            )}

            {response && status && (
              <>
                {/* status strip */}
                <div className="flex flex-wrap items-center gap-2" data-testid="response-status">
                  <span className={cn("border px-2 py-0.5 font-mono text-sm font-bold tabular-nums", TONE[status.tone])} data-status={response.status}>
                    {response.status}
                  </span>
                  <span className="text-sm text-foreground">{status.label}</span>
                  <span className="border border-steel/20 px-1.5 text-4xs tracking-[0.14em] text-steel uppercase" data-source={response.source}>
                    {response.source === "upstream" ? "from API" : "from proxy"}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4" data-testid="response-meta">
                  <div className="border border-steel/10 bg-ink/50 px-2.5 py-1.5">
                    <dt className="text-4xs tracking-[0.14em] text-steel/60 uppercase">Total time</dt>
                    <dd className="font-semibold text-foreground tabular-nums">{response.clientMs} ms</dd>
                  </div>
                  <div className="border border-steel/10 bg-ink/50 px-2.5 py-1.5">
                    <dt className="text-4xs tracking-[0.14em] text-steel/60 uppercase">Upstream time</dt>
                    <dd className="font-semibold text-foreground tabular-nums">{response.upstreamMs !== null ? `${response.upstreamMs} ms` : "—"}</dd>
                  </div>
                  <div className="border border-steel/10 bg-ink/50 px-2.5 py-1.5">
                    <dt className="text-4xs tracking-[0.14em] text-steel/60 uppercase">Size</dt>
                    <dd className="font-semibold text-foreground tabular-nums">{response.bytes.toLocaleString("en-US")} B</dd>
                  </div>
                  <div className="border border-steel/10 bg-ink/50 px-2.5 py-1.5">
                    <dt className="text-4xs tracking-[0.14em] text-steel/60 uppercase">Items</dt>
                    <dd className="font-semibold text-foreground tabular-nums">
                      {Array.isArray(response.json) ? response.json.length : isObj(response.json) ? `${Object.keys(response.json).length} keys` : "—"}
                    </dd>
                  </div>
                </dl>
                <p className="font-mono text-2xs break-all text-steel/70">
                  {response.requestUrl}
                  {response.upstreamPath && <span className="text-steel/50"> → upstream {response.upstreamPath}</span>}
                </p>

                <ResultHelpers response={response} selectedId={selected?.character_id ?? null} onSelect={selectCharacter} onBoard={pickBoard} />

                {/* raw body */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <h3 className={labelClass}>Response body {response.isJson ? "(JSON)" : "(text)"}</h3>
                    {response.isJson && (
                      <div role="radiogroup" aria-label="Body view" className="flex border border-steel/15">
                        {(["pretty", "raw"] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            role="radio"
                            aria-checked={view === v}
                            onClick={() => setView(v)}
                            className={cn("px-2 py-0.5 text-xs capitalize", view === v ? "bg-gold/15 text-gold-bright" : "text-steel hover:text-foreground")}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <JsonViewer text={displayText} className="max-h-[36rem]" />
                  <p className="mt-1 text-3xs text-steel/55">
                    Pretty view re-indents the JSON without changing keys, order or values. Raw view is the body exactly as received.
                  </p>
                </div>
              </>
            )}
          </div>
        </SectionPanel>
      </div>
    </div>
  );
}

/* ---------------------- status-specific helpers ---------------------- */

function ResultHelpers({
  response,
  selectedId,
  onSelect,
  onBoard,
}: {
  response: LabResponse;
  selectedId: string | null;
  onSelect: (hit: CharacterHit, next: EndpointId | null) => void;
  onBoard: (id: string) => void;
}) {
  const { status, json, endpoint, source } = response;

  if (source === "proxy" && isProxyErrorBody(json)) {
    return (
      <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-[#f6c2b6]" role="alert">
        <p className="flex items-center gap-2 font-medium">
          <CircleAlert className="size-4" /> {json.proxy_error.message}
        </p>
        {json.proxy_error.errors && (
          <ul className="mt-1 list-disc pl-6 text-xs">
            {json.proxy_error.errors.map((e, i) => (
              <li key={i}>
                <span className="font-mono">{e.param}</span>: {e.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (status === 409 && isAmbiguousNameBody(json)) {
    return (
      <div className="space-y-2" data-testid="conflict-panel">
        <p className="border border-[#e0b04a]/35 bg-[#e0b04a]/[0.07] px-3 py-2 text-sm text-[#f0dca8]" role="alert">
          {json.candidates.length} characters share this name. Choose the right server, then send the request again.
        </p>
        <CharacterHitsTable hits={json.candidates} selectedId={selectedId} onSelect={(h) => onSelect(h, null)} actionLabel="Use this server" testId="candidates-table" />
      </div>
    );
  }

  if (status === 422 && isValidationErrorBody(json)) {
    return (
      <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-[#f6c2b6]" role="alert">
        <p className="font-medium">The API rejected the parameters:</p>
        <ul className="mt-1 list-disc pl-6 text-xs">
          {json.detail.map((d, i) => (
            <li key={i}>
              <span className="font-mono">{d.loc.join(".")}</span>: {d.msg}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const detail = detailString(json);
  if (status >= 400 && detail) {
    const tone = status === 404 ? "border-[#e0b04a]/35 bg-[#e0b04a]/[0.07] text-[#f0dca8]" : "border-destructive/40 bg-destructive/10 text-[#f6c2b6]";
    const lead =
      status === 404
        ? "Character not found."
        : status === 502
          ? "Upstream API error."
          : status === 503
            ? "Upstream rate limiting or blocking — wait before trying again."
            : `HTTP ${status}.`;
    return (
      <p className={cn("border px-3 py-2 text-sm", tone)} role="alert" data-testid="error-detail">
        <span className="font-medium">{lead}</span> {detail}
      </p>
    );
  }

  if (status === 200 && endpoint === "character-search" && isCharacterHitList(json)) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-steel">
          {json.length} result{json.length === 1 ? "" : "s"}. Names are not unique — check the server before selecting.
        </p>
        <CharacterHitsTable hits={json} selectedId={selectedId} onSelect={(h) => onSelect(h, "character-profile")} testId="search-results" />
      </div>
    );
  }

  if (status === 200 && endpoint === "character-profile" && isObj(json)) {
    return (
      <div>
        <p className="mb-1.5 text-3xs font-semibold tracking-[0.18em] text-steel/80 uppercase">Top-level keys in this response</p>
        <ul className="flex flex-wrap gap-1.5" data-testid="profile-keys">
          {Object.entries(json).map(([k, v]) => (
            <li key={k} className="border border-steel/15 px-2 py-0.5 font-mono text-xs text-foreground/85">
              {k}
              <span className="text-steel/50">
                {Array.isArray(v) ? ` [${v.length}]` : isObj(v) ? ` {${Object.keys(v).join(", ")}}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (status === 200 && endpoint === "character-daevanion" && Array.isArray(json)) {
    // Documented board fields: id, name, openNodeCount, totalNodeCount, openPercent.
    const boards = json.filter(isObj);
    return (
      <div className="relative overflow-x-auto border border-steel/12">
        <table className="w-full min-w-[30rem] text-sm" data-testid="boards-table">
          <thead>
            <tr className="border-b border-steel/10 text-left text-3xs tracking-[0.16em] text-steel/70 uppercase">
              <th className="py-2 pr-3 pl-3 font-medium">id</th>
              <th className="px-3 py-2 font-medium">name</th>
              <th className="px-3 py-2 text-right font-medium">openNodeCount / totalNodeCount</th>
              <th className="px-3 py-2 text-right font-medium">openPercent</th>
              <th className="py-2 pr-3 pl-3"><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {boards.map((b, i) => (
              <tr key={String(b.id ?? i)} className="border-b border-steel/[0.06] last:border-0">
                <td className="py-1.5 pr-3 pl-3 font-mono text-xs text-steel">{String(b.id ?? "—")}</td>
                <td className="px-3 py-1.5 text-foreground">{String(b.name ?? "—")}</td>
                <td className="px-3 py-1.5 text-right text-steel tabular-nums">
                  {String(b.openNodeCount ?? "—")} / {String(b.totalNodeCount ?? "—")}
                </td>
                <td className="px-3 py-1.5 text-right text-foreground tabular-nums">{b.openPercent !== undefined ? `${String(b.openPercent)}%` : "—"}</td>
                <td className="py-1.5 pr-3 pl-3 text-right">
                  {b.id !== undefined && (
                    <button
                      type="button"
                      onClick={() => onBoard(String(b.id))}
                      className="border border-steel/20 px-2 py-0.5 text-xs text-steel hover:border-gold-dim/60 hover:text-gold-bright"
                    >
                      Open board
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
}
